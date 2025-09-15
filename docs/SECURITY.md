# Security Hardening Summary

Headers and Network:
- Enforce HTTPS; HSTS enabled in production.
- Strict CORS: ALLOWED_ORIGINS only.
- helmet() with strict CSP (script-src self plus needed CDNs with integrity), frameguard, noSniff.
- Rate limits on auth, verification/email codes, generation endpoints, and Stripe webhook.

Auth and Sessions:
- OAuth state verification (PKCE when supported).
- Session cookies: secure, httpOnly, sameSite=strict.
- No secrets in code; all via environment variables.

Webhooks and Payments:
- Stripe webhook mounted before JSON parsing; verify signature with raw body.
- Checkout metadata includes purpose and userId for idempotent handling.

Input Validation:
- Validate all request bodies and params (zod).
- Reject oversize payloads (set body size limits).

Data Protection:
- Encrypt third-party tokens at rest.
- Redact sensitive values from logs.
- Maintain an audit log for key user actions.

Operational:
- Health (/health) and readiness (/ready) endpoints are fast and non-sensitive.
- Secrets rotation checklist: see docs/SECURITY_ROTATION_CHECKLIST.md.
- History rewrite plan: see docs/HISTORY_REWRITE_PLAN.md.

Testing:
- Acceptance tests verify OAuth, trials, subscriptions, credits gating, referrals, sequential campaigns, platform connects stubs, legal pages, and security controls (CSP/CORS/Stripe signatures/rate limits).
