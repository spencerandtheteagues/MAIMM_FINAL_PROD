Render deployment quick commands

Prerequisites
- Service ID: srv-d33qf7umcj7s73ajfi7g
- API Key: use the Render API key configured in your environment (do not commit keys)

Pin service to a branch (e.g., PR validation branch)
PATCH:
  curl -sS -X PATCH \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    -H "Content-Type: application/json" \
    https://api.render.com/v1/services/srv-d33qf7umcj7s73ajfi7g \
    -d '{"branch":"devin/1758335424-oauth-theme-fixes"}'

Trigger deploy
POST:
  curl -sS -X POST \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    "https://api.render.com/v1/services/srv-d33qf7umcj7s73ajfi7g/deploys" \
    -d '{}'

Check latest deploy status
GET:
  curl -sS \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    "https://api.render.com/v1/services/srv-d33qf7umcj7s73ajfi7g/deploys?limit=1"

Switch service back to main (after validation)
PATCH:
  curl -sS -X PATCH \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    -H "Content-Type: application/json" \
    https://api.render.com/v1/services/srv-d33qf7umcj7s73ajfi7g \
    -d '{"branch":"main"}'
POST:
  curl -sS -X POST \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    "https://api.render.com/v1/services/srv-d33qf7umcj7s73ajfi7g/deploys" \
    -d '{}'

Live site
- https://myaimediamgr.onrender.com

Notes
- Ensure the app does not rely on localhost-only APIs when deployed.
- Migrations are intentionally disabled until auth/trial flow is fully validated live.
