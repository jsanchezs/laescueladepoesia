# La Escuela de Poesía

Web estática de La Escuela de Poesía de Miguel Sánchez Santamaría.

## Desarrollo

```bash
pnpm install
pnpm dev
```

La primera landing está disponible en `/courses/intermediate-tuesday/`.

## Comandos

| Comando | Acción |
| --- | --- |
| `pnpm dev` | Inicia el servidor local |
| `pnpm check` | Valida Astro y TypeScript |
| `pnpm build` | Genera la web estática en `dist/` |
| `pnpm preview` | Previsualiza el build de producción |

Los datos de cada curso viven en `src/content/courses/` y las páginas se generan mediante la ruta dinámica `src/pages/courses/[slug].astro`.

## Despliegue

La web se publica automáticamente en GitHub Pages cuando se fusionan cambios en `main`:

`https://jsanchezs.github.io/laescueladepoesia/`

El repositorio debe tener seleccionada la opción **Settings → Pages → Source → GitHub Actions**.

## Worker de pagos

El Worker de Cloudflare crea sesiones de Stripe Checkout y procesa los webhooks
de pago. Cuando una reserva del curso queda pagada, también crea o actualiza el
contacto correspondiente en Brevo CRM y lo añade a una lista operativa.

Esta integración no envía correos y no modifica el consentimiento ni el estado
de suscripción de marketing del contacto.

Además de las credenciales de Stripe, el Worker necesita estos secretos:

- BREVO_API_KEY: clave API de Brevo.
- BREVO_LIST_ID: identificador numérico de la lista operativa de reservas.

Configúralos en Cloudflare antes de desplegar. La sincronización usa el correo
como identificador y habilita la actualización del contacto existente, por lo
que los reintentos del webhook no crean contactos duplicados. Si Brevo no
responde correctamente, Stripe podrá volver a intentar el webhook.
