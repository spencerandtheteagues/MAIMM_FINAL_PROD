export type PlanKey = 'starter' | 'pro' | 'enterprise';

export type NonCreditFeatureKey =
  | 'multiAccountPosting'
  | 'teamSeats'
  | 'analyticsLevel'
  | 'brandLibraryTier'
  | 'apiAccess'
  | 'sso'
  | 'rolesPermissions'
  | 'auditLogs'
  | 'prioritySupport';

export type PlanFeatures = Record<PlanKey, Partial<Record<NonCreditFeatureKey, any>>>;

export const planFeatures: PlanFeatures = {
  starter: {
    multiAccountPosting: false,
    teamSeats: 1,
    analyticsLevel: 'basic',
    brandLibraryTier: 'basic',
    apiAccess: false,
    sso: false,
    rolesPermissions: false,
    auditLogs: false,
    prioritySupport: false,
  },
  pro: {
    multiAccountPosting: true,
    teamSeats: 5,
    analyticsLevel: 'standard',
    brandLibraryTier: 'standard',
    apiAccess: true,
    sso: false,
    rolesPermissions: true,
    auditLogs: true,
    prioritySupport: true,
  },
  enterprise: {
    multiAccountPosting: true,
    teamSeats: 'unlimited',
    analyticsLevel: 'advanced',
    brandLibraryTier: 'advanced',
    apiAccess: true,
    sso: true,
    rolesPermissions: true,
    auditLogs: true,
    prioritySupport: 'priority',
  },
};

export function hasEntitlement(plan: PlanKey, feature: NonCreditFeatureKey) {
  const features = planFeatures[plan] || {};
  const val = features[feature];
  if (typeof val === 'boolean') return val;
  return val != null;
}
