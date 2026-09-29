# HJ GROUPS Cashfree payment setup

The website uses Cashfree hosted web checkout with the existing server (`server.mjs`) and existing `purchases` entitlement table.

## Server-only environment variables

Set these in the Voroa web service environment:

- `CASHFREE_CLIENT_ID`
- `CASHFREE_CLIENT_SECRET`
- `CASHFREE_ENVIRONMENT` = `sandbox` for testing or `production` for live payments
- `HJ_PUBLIC_BASE_URL` = `https://hj-groups-website.getvoroa.com`
- `SUPABASE_SERVICE_ROLE_KEY` (already required by the server)

Never prefix Cashfree secrets with `VITE_`, never commit them, and never put them in browser/localStorage settings.

## Admin Settings

In HJ GROUPS Admin → Management & Settings → Payments:

1. Provider: Cashfree
2. Currency: INR
3. Set `Story Lifetime` to the real amount you want to charge.
4. Keep Payments disabled until the Cashfree merchant is activated and server credentials are configured.
5. `Payment secret is configured in server environment` is only an admin UI marker; it does not create or store the secret.

The current backend intentionally supports the existing `story_lifetime` purchase path first. It reuses `public.purchases` and grants lifetime story access only after server-side Cashfree verification.

## Flow

1. Authenticated user selects a Premium story.
2. Server reads the price from Admin Settings; the browser cannot choose the amount.
3. Server creates a Cashfree order and stores a `payment_orders` record.
4. Browser receives only the Cashfree `payment_session_id`.
5. Cashfree hosted checkout handles payment details.
6. Cashfree webhook signature is verified against the raw body.
7. Server fetches Cashfree payments for the order and verifies SUCCESS, amount and currency.
8. Only then the server upserts the existing `purchases` row.
9. Browser return/status checks can only ask the server for the verified status; they cannot grant access directly.

Cashfree's current web checkout documentation confirms the backend Create Order → payment session ID → JS checkout pattern and server-side payment-status lookup. Webhook verification uses `x-webhook-signature` and `x-webhook-timestamp` with the raw request body.

## Before production

- Complete Cashfree merchant activation/KYC.
- Confirm the current eligible pricing/0% offer in the Cashfree merchant dashboard.
- Add the server-only environment variables.
- Configure Cashfree webhook/notify URL through the order flow.
- Test in Sandbox.
- Run real production payment with a small amount and verify the resulting `purchases` row.
- Only then enable production payments.