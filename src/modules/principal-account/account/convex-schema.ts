import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const accountLifecycleValue = v.union(
  v.literal('pending_activation'),
  v.literal('active'),
  v.literal('suspended'),
  v.literal('closed'),
)

export const ownershipLifecycleValue = v.union(v.literal('active'), v.literal('ended'))
export const membershipLifecycleValue = v.union(v.literal('active'), v.literal('ended'))
export const recoveryParticipantApprovalLifecycleValue = v.union(v.literal('verified'), v.literal('revoked'))
export const successionAuthorizationLifecycleValue = v.union(v.literal('active'), v.literal('consumed'))
export const ownershipChangeKindValue = v.union(
  v.literal('creation'),
  v.literal('transfer'),
  v.literal('succession'),
)

export const recoveryPolicyValue = v.union(
  v.object({ kind: v.literal('no_transfer'), revision: v.number() }),
  v.object({
    kind: v.literal('threshold'),
    threshold: v.number(),
    participantCount: v.number(),
    delayMs: v.number(),
    freezeRequired: v.literal(true),
    revision: v.number(),
  }),
)

export const accountActionContextValue = v.object({
  actorPrincipalRef: v.string(),
  activeAccountRef: v.string(),
  correlationRef: v.string(),
  idempotencyRef: v.string(),
})

export const attributionTouchValue = v.object({
  source: v.optional(v.string()),
  medium: v.optional(v.string()),
  campaign: v.optional(v.string()),
  content: v.optional(v.string()),
  term: v.optional(v.string()),
  referrer: v.optional(v.string()),
  landingPath: v.optional(v.string()),
  clickId: v.optional(v.string()),
  at: v.number(),
})

export const accountValue = v.object({
  accountRef: v.string(),
  displayName: v.string(),
  lifecycle: accountLifecycleValue,
  recoveryPolicy: recoveryPolicyValue,
  creationActorPrincipalRef: v.string(),
  creationIdempotencyRef: v.string(),
  initialOwnershipRef: v.string(),
  currentOwnershipRef: v.string(),
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastAction: accountActionContextValue,
  firstTouch: v.optional(attributionTouchValue),
  lastTouch: v.optional(attributionTouchValue),
})

export const accountOwnershipValue = v.object({
  ownershipRef: v.string(),
  accountRef: v.string(),
  ownerPrincipalRef: v.string(),
  lifecycle: ownershipLifecycleValue,
  changeKind: ownershipChangeKindValue,
  revision: v.number(),
  createdAt: v.number(),
  createdBy: accountActionContextValue,
  predecessorOwnershipRef: v.optional(v.string()),
  successionAuthorizationRef: v.optional(v.string()),
  endedAt: v.optional(v.number()),
  endedBy: v.optional(accountActionContextValue),
  successorOwnershipRef: v.optional(v.string()),
})

export const membershipValue = v.object({
  membershipRef: v.string(),
  accountRef: v.string(),
  memberPrincipalRef: v.string(),
  role: v.optional(v.union(v.literal('org:admin'), v.literal('org:member'))),
  lifecycle: membershipLifecycleValue,
  revision: v.number(),
  createdAt: v.number(),
  createdBy: accountActionContextValue,
  endedAt: v.optional(v.number()),
  endedBy: v.optional(accountActionContextValue),
})


export const accountSecurityPolicyValue = v.object({
  accountRef: v.string(),
  requireMfaForMembers: v.boolean(),
  revision: v.number(),
  updatedAt: v.number(),
  lastCorrelationRef: v.string(),
})

export const lowCreditThresholdCentsValue = v.union(
  v.literal(1000),
  v.literal(2500),
  v.literal(5000),
)

export const usageAlertPolicyInputValue = v.object({enabled:v.boolean(),failurePercent:v.number(),minimumCalls:v.number(),spendWarningPercent:v.number()})
export const usageAlertPolicyValue=usageAlertPolicyInputValue.extend({authorityRevisionAccount:v.number()})

export const userNotificationPreferenceValue = v.object({
  principalRef: v.string(),
  accountRef: v.string(),
  lowCreditBalance: v.boolean(),
  lowCreditThresholdCents: lowCreditThresholdCentsValue,
  spendCapWarning: v.boolean(),
  callFailureSpike: v.boolean(),
  invoiceReady: v.boolean(),
  teamMembershipChanged: v.boolean(),
  agentApprovalRequested: v.optional(v.boolean()),
  stalledStepEmails: v.optional(v.boolean()),
  revision: v.number(),
  updatedAt: v.number(),
  lastCorrelationRef: v.string(),
  deliveryEmail: v.optional(v.string()),
  usageAlertPolicy:v.optional(usageAlertPolicyValue),
})

export const notificationEventKindValue = v.union(
  v.literal('low_credit_balance'),
  v.literal('spend_cap_warning'),
  v.literal('spend_cap_exceeded'),
  v.literal('call_failure_spike'),
  v.literal('invoice_ready'),
  v.literal('team_membership_changed'),
  v.literal('agent_approval_requested'),
  v.literal('stalled_not_funded'),
  v.literal('stalled_no_agent'),
  v.literal('stalled_never_called'),
  v.literal('funding_receipt'),
  v.literal('funding_failed'),
  v.literal('task_refunded'),
  v.literal('task_stuck'),
  v.literal('credit_exhausted'),
  v.literal('welcome'),
  v.literal('key_issued'),
  v.literal('key_revoked'),
  v.literal('account_paused'),
  v.literal('account_restored'),
  v.literal('role_changed'),
  v.literal('email_changed'),
  v.literal('data_request_received'),
  v.literal('provider_submitted'),
  v.literal('provider_decision'),
  v.literal('provider_live'),
  v.literal('provider_first_paid'),
  v.literal('provider_payout'),
  v.literal('provider_payout_failed'),
  v.literal('provider_weekly'),
  v.literal('provider_offboarded'),
  v.literal('provider_offboarding_blocked'),
  v.literal('deletion_requested'),
  v.literal('deletion_completed'),
  v.literal('first_call_done'),
  v.literal('week_one_wrap'),
  v.literal('auto_topup_failed'),
  v.literal('card_changed'),
  v.literal('first_call_failed'),
  v.literal('deletion_final_reminder'),
  v.literal('operator_exception'),
)

export const notificationStreamValue = v.union(
  v.literal('transactional'),
  v.literal('alert'),
  v.literal('lifecycle'),
  v.literal('operator'),
)

// Ranked: a webhook may only move a delivery to a strictly higher rank. Equal rank never overwrites.
export const notificationDeliveryStateValue = v.union(
  v.literal('pending'),
  v.literal('sent'),
  v.literal('delivered'),
  v.literal('bounced'),
  v.literal('complained'),
  v.literal('failed'),
  v.literal('suppressed'),
)

export const notificationDeliveryStateRank = {
  pending: 0,
  failed: 0,
  suppressed: 0,
  sent: 1,
  delivered: 2,
  bounced: 3,
  complained: 3,
} as const

export const notificationDeliveryValue = v.object({
  deliveryRef: v.string(),
  recipientPrincipalRef: v.string(),
  accountRef: v.string(),
  eventKind: notificationEventKindValue,
  stream: v.optional(notificationStreamValue),
  required: v.optional(v.boolean()),
  sourceEventRef: v.string(),
  /** Spam Act 2003 (Cth) s18 basis for lifecycle mail: express (the owner opted in) or inferred (the account relationship). */
  consentBasis: v.optional(v.union(v.literal('express'), v.literal('inferred'))),
  /** email_changed only: the prior primary address, from the Clerk webhook, so the notice also reaches the old inbox. Unknown means new address only. */
  previousAddress: v.optional(v.string()),
  previousAddressUnknown: v.optional(v.boolean()),
  usageEvidenceJson:v.optional(v.string()),
  preferenceRevision:v.optional(v.number()),
  authorityRevisionAccount:v.optional(v.number()),
  state: notificationDeliveryStateValue,
  suppressCode: v.optional(v.string()),
  vendorMessageId: v.optional(v.string()),
  vendorCode: v.optional(v.string()),
  lastFailureCode: v.optional(v.string()),
  lastEventAt: v.optional(v.number()),
  /** First Resend open and click. Directional only: Apple Mail Privacy Protection inflates opens, so no state moves on them. */
  openedAt: v.optional(v.number()),
  clickedAt: v.optional(v.number()),
  workId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const emailSuppressionValue = v.object({
  addressHash: v.string(),
  domain: v.string(),
  reason: v.union(v.literal('hard_bounce'), v.literal('complaint')),
  sourceDeliveryRef: v.string(),
  createdAt: v.number(),
})

export const emailWebhookEventValue = v.object({
  svixId: v.string(),
  receivedAt: v.number(),
})

export const principalNotificationEmailValue = v.object({
  principalRef: v.string(),
  email: v.string(),
  revision: v.number(),
  observedAt: v.number(),
  sourceRef: v.string(),
})

export const accountExternalOrganizationBindingValue = v.object({
  bindingRef: v.string(),
  accountRef: v.string(),
  providerNamespace: v.literal('clerk/organization'),
  providerIdentifier: v.string(),
  lifecycle: v.union(v.literal('active'), v.literal('revoked')),
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const verifiedRecoveryParticipantApprovalValue = v.object({
  approvalRef: v.string(),
  accountRef: v.string(),
  participantPrincipalRef: v.string(),
  incumbentOwnerPrincipalRef: v.string(),
  successorOwnerPrincipalRef: v.string(),
  recoveryPolicyRevision: v.number(),
  frozenAccountRevision: v.number(),
  frozenAt: v.number(),
  verifiedAt: v.number(),
  expiresAt: v.number(),
  verificationRef: v.string(),
  lifecycle: recoveryParticipantApprovalLifecycleValue,
  createdAt: v.number(),
  createdBy: accountActionContextValue,
})

export const successionAuthorizationValue = v.object({
  authorizationRef: v.string(),
  accountRef: v.string(),
  incumbentOwnerPrincipalRef: v.string(),
  successorOwnerPrincipalRef: v.string(),
  recoveryPolicyRevision: v.number(),
  frozenAccountRevision: v.number(),
  frozenAt: v.number(),
  availableAt: v.number(),
  authorizedAt: v.number(),
  expiresAt: v.number(),
  verifiedParticipantCount: v.number(),
  lifecycle: successionAuthorizationLifecycleValue,
  revision: v.number(),
  createdAt: v.number(),
  createdBy: accountActionContextValue,
  consumedAt: v.optional(v.number()),
  consumedBy: v.optional(accountActionContextValue),
  successorOwnershipRef: v.optional(v.string()),
})

export const successionAuthorizationParticipantValue = v.object({
  authorizationRef: v.string(),
  accountRef: v.string(),
  approvalRef: v.string(),
  participantPrincipalRef: v.string(),
  verificationRef: v.string(),
  verifiedAt: v.number(),
  recoveryPolicyRevision: v.number(),
  frozenAccountRevision: v.number(),
  createdAt: v.number(),
  createdBy: accountActionContextValue,
})

export const accountTables = {
  accounts: defineTable(accountValue)
    .searchIndex('search_displayName', { searchField: 'displayName' })
    .index('by_accountRef', ['accountRef'])
    .index('by_creationActorPrincipalRef_and_creationIdempotencyRef', ['creationActorPrincipalRef', 'creationIdempotencyRef'])
    .index('by_lifecycle_and_updatedAt', ['lifecycle', 'updatedAt'])
    .index('by_lastAction_actorPrincipalRef_and_lifecycle', ['lastAction.actorPrincipalRef', 'lifecycle']),
  accountOwnerships: defineTable(accountOwnershipValue)
    .index('by_ownershipRef', ['ownershipRef'])
    .index('by_accountRef_and_lifecycle', ['accountRef', 'lifecycle'])
    .index('by_ownerPrincipalRef_and_lifecycle', ['ownerPrincipalRef', 'lifecycle'])
    .index('by_accountRef_and_ownerPrincipalRef_and_lifecycle', ['accountRef', 'ownerPrincipalRef', 'lifecycle']),
  memberships: defineTable(membershipValue)
    .index('by_membershipRef', ['membershipRef'])
    .index('by_accountRef_and_lifecycle', ['accountRef', 'lifecycle'])
    .index('by_memberPrincipalRef_and_lifecycle', ['memberPrincipalRef', 'lifecycle'])
    .index('by_accountRef_and_memberPrincipalRef_and_lifecycle', ['accountRef', 'memberPrincipalRef', 'lifecycle']),
  accountExternalOrganizationBindings: defineTable(accountExternalOrganizationBindingValue)
    .index('by_providerNamespace_and_providerIdentifier', ['providerNamespace', 'providerIdentifier'])
    .index('by_accountRef_and_lifecycle', ['accountRef', 'lifecycle']),
  accountSecurityPolicies: defineTable(accountSecurityPolicyValue)
    .index('by_accountRef', ['accountRef']),
  accountIntents: defineTable({
    accountRef: v.string(),
    text: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_accountRef', ['accountRef']),
  userNotificationPreferences: defineTable(userNotificationPreferenceValue)
    .index('by_principalRef_and_accountRef', ['principalRef', 'accountRef'])
    .index('by_accountRef', ['accountRef']),
  notificationDeliveries: defineTable(notificationDeliveryValue)
    .index('by_deliveryRef', ['deliveryRef'])
    .index('by_recipient_account_event_source', [
      'recipientPrincipalRef',
      'accountRef',
      'eventKind',
      'sourceEventRef',
    ])
    .index('by_accountRef_and_createdAt', ['accountRef', 'createdAt'])
    .index('by_vendorMessageId', ['vendorMessageId'])
    .index('by_state_and_updatedAt', ['state', 'updatedAt']),
  principalNotificationEmails: defineTable(principalNotificationEmailValue)
    .index('by_principalRef', ['principalRef']),
  emailSuppressions: defineTable(emailSuppressionValue)
    .index('by_addressHash', ['addressHash'])
    .index('by_createdAt', ['createdAt']),
  emailWebhookEvents: defineTable(emailWebhookEventValue)
    .index('by_svixId', ['svixId']),
} as const
