Acceptance Tests Plan

Scopes covered:
1. Email signup verification
2. Google OAuth dynamic callback
3. Lite Trial (7d, no card) gating and expiry lock
4. Pro Trial (14d, $1) via Checkout and webhook grant
5. Subscriptions lifecycle and credit refresh/suspension/cancellation
6. Credits enforcement with admin bypass
7. Referrals attribution and rewards on trigger, self-ref block
8. Sequential Campaign Generator behavior
9. Pricing truthiness and admin-only matrix endpoint
10. Platform connects scaffolding and token handling
11. Compliance and security endpoints and headers

High-level test cases:
- Email signup flow:
  - Request code, verify wrong/expired fails, correct marks emailVerified
- Google login:
  - Callback built from APP_URL; first login with no trial/plan leads to /trial-selection
- Lite Trial:
  - Selecting Lite grants credits, blocks campaigns/video during trial, locks app after 7 days if unpaid
- Pro Trial:
  - Selecting Pro with trial=true opens Stripe Checkout; webhook grants trial and credits; locks after 14 days if unpaid
- Subscriptions:
  - Checkout starts subscription; invoice.payment_succeeded refreshes credits
  - past_due/unpaid suspends; subscription.deleted sets status=none
- Credits:
  - Creation features visible; server enforces credits; non-negative; admins unlimited
- Referrals:
  - /r/&lt;code&gt; or ?ref= sets cookie; signup attribution; pro_trial trigger awards both sides once; block self-ref
- Campaigns:
  - Create 14-post campaign; posts appear sequentially with jitter; retries on 429/5xx; Approval Queue updates; caption above media
- Pricing truthiness:
  - Admin-only plan→feature matrix matches UI; creation features not plan-gated
- Platform connects:
  - Missing keys returns 501 {needsKeys:true}; with keys OAuth completes; tokens encrypted; disconnect deletes tokens
- Compliance & security:
  - /privacy, /terms, /data-deletion; delete account & data works
  - CSP/CORS/HSTS present; Stripe signatures verified; OAuth state checked; rate limits active
  - /health and /ready return 200

Artifacts to be added:
- playwright tests under tests/acceptance/*
- test users and fixtures
- CI job to run headless
