Render + Neon Deployment Steps

Prereqs:
- APP_URL initial: https://&lt;render-app&gt;.onrender.com
- Neon Postgres DATABASE_URL created

Steps:
1) Create Render Blueprint deployment using render.yaml
2) Set environment variables (see render.yaml keys)
3) First deploy:
   - Open shell
   - npx drizzle-kit push
   - npm run seed:admins
4) Stripe:
   - Create recurring prices (Starter/Pro/Enterprise)
   - Create one-time $1 price (STRIPE_PRO_TRIAL_PRODUCT)
   - Add webhook: POST ${APP_URL}/api/stripe/webhook with listed events
   - Set STRIPE_WEBHOOK_SECRET
5) Google OAuth:
   - Authorized origins: ${APP_URL} and https://myaimediamgr.com
   - Redirect URI: ${APP_URL}/api/auth/google/callback for both domains
6) Email:
   - Provider API key set; verified sender/domain
7) Domain:
   - Add custom domain myaimediamgr.com (+ www) in Render
   - DNS: apex ALIAS/ANAME → Render target; www CNAME → target
   - After TLS green: set APP_URL=https://myaimediamgr.com and redeploy
8) Post-deploy checks:
   - /health and /ready 200
   - OAuth, trials, subscriptions, referrals, campaigns flow
   - CSP/CORS/HSTS headers correct
