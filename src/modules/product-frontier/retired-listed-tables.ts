/**
 * Founder-authorized listed-schema cut 89 → 60. Inquiry 12, money kernel,
 * invoke/delivery, Answer/harness, catalog/supply live path, registry search
 * documents, disputes, and external-run stay. These 29 are unlisted; leftover
 * documents are dashboard-deleted / empty-imported, not paginate-deleted.
 */
export const RETIRED_LISTED_TABLES = [
  'businessContexts',
  'claims',
  'capabilitySupplySourceDrafts',
  'capabilityCallEvents',
  'demandSignals',
  'searchGapRecords',
  'searchGapBusinessRecords',
  'discoveryManifests',
  'discoveryManifestAttempts',
  'auditEvents',
  'operatorControls',
  'funnelEvents',
  'ownerActivationState',
  'ownerNotificationPreferences',
  'notificationDispatches',
  'notificationDispatchAttempts',
  'notificationWebhookEvents',
  'suppressionRules',
  'adminMemberships',
  'adminMembershipAuditEvents',
  'claimFingerprints',
  'moneyFreeTierCounters',
  'registryProjectionItems',
  'registryProjectionAttempts',
  'indexStatus',
  'agentAccessOAuthClients',
  'agentAccessOAuthGrants',
  'moneyConnectAccountCommands',
  'businessSupplyProjectionSnapshots',
] as const

export type RetiredListedTable = (typeof RETIRED_LISTED_TABLES)[number]
