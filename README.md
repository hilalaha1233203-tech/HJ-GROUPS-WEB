# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

<!-- Production reader verification -->

<!-- final black-screen hardening verification trigger -->

<!-- runtime black-screen verification -->

<!-- final startup verification -->

<!-- startup root hardening -->

<!-- final first-paint isolation deployment -->


## Temporary shortener unlock

HJ GROUPS supports a server-side temporary unlock flow for content that explicitly includes the "ads" access type. The existing access-control and secure-media layers remain in place.

Required server environment variables:

- AROLINKS_API_TOKEN
- EARN4LINK_API_TOKEN
- HJ_PUBLIC_BASE_URL
- UNLOCK_TOKEN_SECRET
- SUPABASE_SERVICE_ROLE_KEY

These values must never be exposed through VITE_ variables or committed to Git.

The Admin Settings page controls the shortener toggle, primary/fallback provider, and unlock duration (default 360 minutes / 6 hours). A permanent shortener link is stored per content item and reused. Provider failure automatically falls through the configured provider chain.

The provider itself does not expose a completion webhook to HJ GROUPS, so arrival at /unlock/<type>/<id> is treated only as the ad-flow completion signal. HJ GROUPS still requires the server-side one-time unlock context and an authenticated completion request before writing the temporary entitlement.

The provider request code is isolated behind a common adapter contract. Keep the feature disabled until the current AroLinks/Earn4Link account-side Developer API endpoint and response format are confirmed for the publisher account; the public provider pages currently expose an API feature but do not provide a stable public API schema in the documentation available to this repository.
