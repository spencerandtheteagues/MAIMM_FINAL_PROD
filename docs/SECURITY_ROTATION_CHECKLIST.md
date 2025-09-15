Rotation checklist (do not commit any live secrets)

Providers to rotate immediately after history purge:
- Stripe
  - Secret key (STRIPE_SECRET_KEY)
  - Webhook secret (STRIPE_WEBHOOK_SECRET)
  - Verify all dashboard webhooks now point to: ${APP_URL}/api/stripe/webhook
- Google Cloud (OAuth)
  - Regenerate client secret
  - Ensure Authorized redirect URI: ${APP_URL}/api/auth/google/callback
  - Add both onrender.com and custom domain to Authorized origins
- Render
  - Update all environment variables with rotated values
  - Redeploy from clean history
- Neon Postgres
  - Rotate database password/user or generate a new role
  - Update DATABASE_URL on Render
- Email provider (Resend/SendGrid)
  - Rotate API key
  - Ensure verified sender/domain
- Any other third parties (X, Facebook, LinkedIn, TikTok)
  - Rotate app secrets if present
  - Reissue tokens as needed

Post-rotation steps:
- Re-run secret scanners (gitleaks, trufflehog) on HEAD and full history
- Audit logs for suspicious use of old keys
- Invalidate old webhooks/tokens where possible
- Confirm CSP/CORS and HSTS are enabled in production
- Confirm /health and /ready respond 200
