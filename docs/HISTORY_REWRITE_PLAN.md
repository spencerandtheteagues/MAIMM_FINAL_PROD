# History Rewrite Plan (Secrets Purge)

Approved by: @spencerandtheteagues

Objective: Permanently remove previously committed secrets from the entire git history, then rotate all affected keys. This document lists the exact steps and guardrails.

Important:
- Coordinate a short maintenance window.
- All collaborators must close local work and re-clone after the rewrite.
- We will re-scan the new history to ensure 0 findings.

Tools:
- git-filter-repo (preferred)
- Alternatively: BFG Repo-Cleaner

Targets to purge across all commits (examples; actual patterns come from scans):
- .env, .env.local, .env.*.local
- Any .env.* files
- Database URLs (postgres://…)
- Stripe keys (sk_live…, whsec_…)
- Google OAuth secrets (CLIENT_SECRET)
- Email provider API keys
- Any private keys (-----BEGIN … PRIVATE KEY-----)

1) Install git-filter-repo (maintainer-recommended)
pip install git-filter-repo

2) Create a backup clone
git clone --mirror https://github.com/spencerandtheteagues/MAIMM_FINAL_PROD.git MAIMM_FINAL_PROD-mirror.backup

3) Work in a fresh local clone (or bare)
git clone --mirror https://github.com/spencerandtheteagues/MAIMM_FINAL_PROD.git
cd MAIMM_FINAL_PROD.git

4) Build redaction rules
- From pre-fix scan artifacts, enumerate offending paths and patterns.
- Example command to drop files entirely across history:
git filter-repo --path .env --path .env.local --path-glob ".env.*" --invert-paths

- Example to replace secrets inline via regex (repeat for each pattern):
git filter-repo --replace-text replacements.txt
Where replacements.txt contains masked substitutions, e.g.:
regex:sk_live_[0-9A-Za-z]+==>STRIPE_SECRET_REDACTED
regex:whsec_[0-9A-Za-z]+==>STRIPE_WEBHOOK_REDACTED
regex:AIza[0-9A-Za-z_-]+==>GOOGLE_API_KEY_REDACTED
regex:postgres://[^\s'"]+==>DATABASE_URL_REDACTED

Note: Build a comprehensive replacements.txt from the scan reports.

5) Run the filter
git filter-repo --replace-text ../replacements.txt --force
git filter-repo --path .env --path .env.local --path-glob ".env.*" --invert-paths --force

6) Verify locally
- Ensure repo builds and runs from new history.
- Run scanners on full history:
gitleaks detect -v
trufflehog git file://. --since-commit $(git rev-list --max-parents=0 HEAD) --only-verified

7) Force push to origin (per approval)
git push --force --all
git push --force --tags

8) Post-rewrite actions
- Invalidate and rotate secrets at providers:
  - Stripe: secret key, webhook secret
  - Google OAuth: client secret
  - Email provider (Resend/SendGrid): API key
  - Neon Postgres: rotate password / create new role; update DATABASE_URL
  - Any platform app secrets (Facebook/X/LinkedIn/TikTok)
- Update Render env vars to rotated values and redeploy.
- Notify all collaborators to re-clone:
git clone https://github.com/spencerandtheteagues/MAIMM_FINAL_PROD.git

9) Final verification
- Re-run scanners on HEAD and full history; confirm 0 verified findings.
- Validate application build and basic flows.
