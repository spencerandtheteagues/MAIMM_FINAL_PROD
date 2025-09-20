Live validation checklist (PR #4)

What’s fixed
- Unauthenticated visits to "/" render landing page.
- Pricing / Start Free Trial route to /trial-selection and render.
- Trial enforcement is API-only; no black JSON page.
- Two-phase OAuth: pending_oauth cookie created at callback for new users; user finalized on POST /api/trial/select.
- Existing/admin users route to dashboard or safe returnTo.
- Lite trial posts to /api/trial/select; paid plans route to checkout.
- Rate limiter no longer triggers /api/user 429 storms.
- Theme initializes early and persists without flicker.

To verify on live (Render)
1) Visit root (/) unauthenticated → Landing page visible.
2) Click Pricing or Start Free Trial → /trial-selection renders and stays.
3) From /trial-selection unauthenticated → /auth?return=/trial-selection.
4) Complete Google OAuth as a new user → redirect to /trial-selection.
5) Click “Start Lite Trial” → account finalized → redirected to “/”.
6) Existing user login → lands on “/” or safe returnTo.
7) Try all five plan buttons:
   - Lite → activates and goes to app
   - Other four → redirect to Stripe checkout
8) Toggle theme and refresh → persists with no flicker.
9) Validate network: /api/user returns 200 when logged in; no 401/429 loops.

CI
- Failing checks are due to GitHub billing lock; see docs/CI_NOTES.md for details and next steps.

Render ops
- See docs/RENDER_DEPLOY.md for pinning service to branch, deploying, and switching back to main.
