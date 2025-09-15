This document will collect masked findings from pre-fix scans (HEAD and history), post-fix scans (HEAD), and post-rewrite scans (history).

Artifacts (to be generated and committed with masked/redacted content):
- Pre-fix scans
  - docs/pre-fix-gitleaks.sarif
  - docs/pre-fix-gitleaks.json
  - docs/pre-fix-gitleaks-worktree.json
- Post-fix scans
  - docs/post-fix-gitleaks.sarif
  - docs/post-fix-gitleaks.json
  - docs/post-fix-gitleaks-worktree.json
- Post-rewrite scans
  - docs/post-rewrite-gitleaks.sarif
  - docs/post-rewrite-gitleaks.json

Notes:
- Only masked outputs will be committed. Verified true positives must be rotated at providers immediately after history rewrite.
- False positives and mitigations should be noted below.

False positives and mitigations:
- TBD

This document will collect masked findings from pre-fix scans (HEAD and history), post-fix scans (HEAD), and post-rewrite scans (history).
We will use gitleaks and trufflehog with redaction and only-verified flags where possible.

Sections:
- Pre-fix scan summary (masked)
- Post-fix scan summary (masked)
- Post-rewrite scan summary (masked)
- Notes on false positives and mitigations
