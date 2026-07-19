import Stripe from "stripe";

const COURSE_SLUG = "intermedio-martes";

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
      success_url: `${env.SITE_URL}/pago/confirmado/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.SITE_URL}/pago/cancelado/`,
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

  try {
    const event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object;
      console.log(
        JSON.stringify({
          event: "reservation_paid",
          stripe_event_id: event.id,
          checkout_session_id: session.id,
          payment_status: session.payment_status,
          amount_total: session.amount_total,
          currency: session.currency,
          customer_email: session.customer_details?.email,
          customer_name: session.customer_details?.name,
          customer_phone: session.customer_details?.phone,
          course_slug: session.metadata?.course_slug,
        }),
      );
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error(JSON.stringify({ event: "invalid_webhook", error: errorMessage(error) }));
    return Response.json({ error: "Invalid webhook signature" }, { status: 400 });
  }
}

function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
