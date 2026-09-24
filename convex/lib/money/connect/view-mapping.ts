import type { Doc } from '../../../_generated/dataModel'

export function refusedConnect(code: string, retryable: boolean, correlationRef?: string) {
  return {
    kind: 'refused' as const,
    code,
    retryable,
    ...(correlationRef === undefined ? {} : { correlationRef }),
  }
}

export function payoutAccountView(row: Doc<'moneyPayoutAccounts'>) {
  return {
    businessId: row.businessId,
    currency: row.currency,
    exponent: row.exponent,
    stripeAccountId: row.stripeAccountId,
    state: row.state,
    detailsSubmitted: row.detailsSubmitted,
    recipientCapabilityActive: row.recipientCapabilityActive,
    requirementsDigest: row.requirementsDigest,
    ...(row.providerObjectDigest === undefined
      ? {}
      : { providerObjectDigest: row.providerObjectDigest }),
    ...(row.lastStripePayloadDigest === undefined
      ? {}
      : { lastStripePayloadDigest: row.lastStripePayloadDigest }),
    ...(row.providerObjectVersion === undefined
      ? {}
      : { providerObjectVersion: row.providerObjectVersion }),
    ...(row.lastStripeObservedAt === undefined
      ? {}
      : { lastStripeObservedAt: row.lastStripeObservedAt }),
    ...(row.version === undefined ? {} : { version: row.version }),
    ...(row.lastStripeEventId === undefined
      ? {}
      : { lastStripeEventId: row.lastStripeEventId }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function connectAccountCommandView(row: Doc<'moneyConnectAccountCommands'>) {
  return {
    commandRef: row.commandRef,
    businessId: row.businessId,
    currency: row.currency,
    exponent: row.exponent,
    idempotencyKey: row.idempotencyKey,
    inputDigest: row.inputDigest,
    providerRequestDigest: row.providerRequestDigest,
    providerRecoveryDeadlineAt: row.providerRecoveryDeadlineAt,
    recoveryLeaseGeneration: row.recoveryLeaseGeneration,
    ...(row.recoveryLeaseOwner === undefined ? {} : { recoveryLeaseOwner: row.recoveryLeaseOwner }),
    ...(row.recoveryLeaseExpiresAt === undefined ? {} : { recoveryLeaseExpiresAt: row.recoveryLeaseExpiresAt }),
    state: row.state,
    ...(row.stripeAccountId === undefined ? {} : { stripeAccountId: row.stripeAccountId }),
    ...(row.providerEvidenceRef === undefined ? {} : { providerEvidenceRef: row.providerEvidenceRef }),
    ...(row.failureCode === undefined ? {} : { failureCode: row.failureCode }),
    ...(row.failureRetryable === undefined ? {} : { failureRetryable: row.failureRetryable }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
