import Stripe from "stripe";

const COURSE_SLUG = "intermediate-tuesday";
const BREVO_CONTACTS_URL = "https://api.brevo.com/v3/contacts";
const BREVO_REQUEST_TIMEOUT_MS = 10_000;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    if (request.method === "POST" && url.pathname === "/checkout") {
      return createCheckoutSession(request, env);
    }

    if (request.method === "POST" && url.pathname === "/webhook") {
      return handleStripeWebhook(request, env);
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function createCheckoutSession(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  const allowedOrigins = new Set(env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()));

  if (!origin || !allowedOrigins.has(origin)) {
    return Response.json({ error: "Origin not allowed" }, { status: 403 });
  }

  try {
    const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "es",
      line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
      customer_creation: "always",
      phone_number_collection: { enabled: true },
      success_url: `${env.SITE_URL}/payment/success/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.SITE_URL}/payment/canceled/`,
      metadata: {
        course_slug: COURSE_SLUG,
        stripe_product_id: env.STRIPE_PRODUCT_ID,
        payment_purpose: "deposit",
      },
      payment_intent_data: {
        description: "Señal · Grupo intermedio de poesía",
        metadata: {
          course_slug: COURSE_SLUG,
          payment_purpose: "deposit",
        },
      },
    });

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL");
    }

    return Response.redirect(session.url, 303);
  } catch (error) {
    console.error(JSON.stringify({ event: "checkout_session_error", error: errorMessage(error) }));
    return Response.json(
      { error: "No se ha podido iniciar el pago. Inténtalo de nuevo." },
      { status: 502 },
    );
  }
}

async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  const signature = request.headers.get("Stripe-Signature");

  if (!signature) {
    return Response.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  const payload = await request.text();
  const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (error) {
    console.error(JSON.stringify({ event: "invalid_webhook", error: errorMessage(error) }));
    return Response.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return Response.json({ received: true });
  }

  const session = event.data.object;
  const isCourseReservation =
    session.metadata?.course_slug === COURSE_SLUG &&
    session.metadata?.payment_purpose === "deposit";

  if (!isCourseReservation) {
    console.log(
      JSON.stringify({
        event: "brevo_contact_skipped",
        stripe_event_id: event.id,
        checkout_session_id: session.id,
        reason: "unrelated_checkout_session",
      }),
    );
    return Response.json({ received: true });
  }

  if (session.payment_status !== "paid") {
    console.log(
      JSON.stringify({
        event: "brevo_contact_skipped",
        stripe_event_id: event.id,
        checkout_session_id: session.id,
        reason: "payment_not_paid",
        payment_status: session.payment_status,
      }),
    );
    return Response.json({ received: true });
  }

  const email = session.customer_details?.email?.trim();

  if (!email) {
    console.warn(
      JSON.stringify({
        event: "brevo_contact_skipped",
        stripe_event_id: event.id,
        checkout_session_id: session.id,
        reason: "customer_email_missing",
      }),
    );
    return Response.json({ received: true });
  }

  try {
    await syncBrevoContact(email, session.customer_details?.name, env);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "brevo_contact_sync_failed",
        stripe_event_id: event.id,
        checkout_session_id: session.id,
        error: errorMessage(error),
      }),
    );
    return Response.json({ error: "Could not sync CRM contact" }, { status: 502 });
  }

  console.log(
    JSON.stringify({
      event: "reservation_contact_synced",
      stripe_event_id: event.id,
      checkout_session_id: session.id,
      course_slug: session.metadata?.course_slug,
    }),
  );

  return Response.json({ received: true });
}

async function syncBrevoContact(
  email: string,
  customerName: string | null | undefined,
  env: Env,
): Promise<void> {
  const listId = parseBrevoListId(env.BREVO_LIST_ID);
  const name = customerName?.trim();

  const response = await fetch(BREVO_CONTACTS_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      email,
      listIds: [listId],
      updateEnabled: true,
      ...(name ? { attributes: { FIRSTNAME: name } } : {}),
    }),
    signal: AbortSignal.timeout(BREVO_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error("Brevo API returned HTTP " + response.status);
  }
}

function parseBrevoListId(value: string): number {
  const listId = Number(value);

  if (!Number.isSafeInteger(listId) || listId <= 0) {
    throw new Error("BREVO_LIST_ID must be a positive integer");
  }

  return listId;
}

function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
