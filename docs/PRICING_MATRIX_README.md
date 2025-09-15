Pricing Matrix and Entitlements

- Non-credit features are defined in config/plan-features.ts and enforced server-side via requireEntitlement(featureKey).
- Credit-based creation (content_generation, brainstorm, campaigns) is never plan-gated; server enforces via credits only.
- Admin-only endpoint should expose the plan→feature matrix for UI truthiness checks.

To update:
- Edit config/plan-features.ts mappings for starter/pro/enterprise.
- Keep creation features visible in UI; show upsell/CTA when credits are insufficient instead of hiding features.
