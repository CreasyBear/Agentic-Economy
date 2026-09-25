import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import type { StableHashValue } from '../../../../src/modules/common/stable-hash'

import { x402PaymentProfileForEnvironment } from '@/modules/capability-supply/public'

import {
  type AttemptRow,
  type EventArgs,
  type PrepareArgs,
  type ReconcileArgs,
} from './contracts'

export function x402PaymentEnvironmentFenceValid(
  input: Readonly<{
    aeEnvironment: unknown
    scheme: string
    network: string
    asset: string
  }>,
): boolean {
  const profile = x402PaymentProfileForEnvironment(input.aeEnvironment)
  if (profile === undefined) return false
  return profile.scheme === input.scheme
    && profile.network === input.network
    && profile.asset.toLowerCase() === input.asset.toLowerCase()
}

export function assertX402PaymentEnvironmentFence(
  input: Readonly<{
    aeEnvironment: unknown
    scheme: string
    network: string
    asset: string
  }>,
): void {
  if (!x402PaymentEnvironmentFenceValid(input)) {
    throw new Error('x402_payment_environment_fence_violated')
  }
}

export function expectedCustodyGenerationMatches(
  row: AttemptRow,
  expected: number | undefined,
): boolean {
  const managedFields = [
    row.custodyBudgetRef,
    row.custodyGeneration,
    row.custodyDailyMaximumUnits,
  ]
  const managedCount = managedFields.filter((value) => value !== undefined).length
  if (managedCount === 0) return expected === undefined
  return managedCount === managedFields.length
    && expected !== undefined
    && expected === row.custodyGeneration
}

export function eventAttributionValid(row: AttemptRow, args: EventArgs): boolean {
  return (
    row.dispatchRef === args.dispatchRef
    && row.attemptRef === args.attemptRef
    && row.effectGeneration === args.effectGeneration
    && row.paymentIdentifier === args.paymentIdentifier
    && row.challengeDigest === args.challengeDigest
    && row.scheme === args.scheme
    && row.network === args.network
    && row.asset === args.asset
    && row.payTo === args.payTo
    && row.amountUnits === args.amountUnits
    && row.currency === args.currency
    && row.exponent === args.exponent
    && row.providerEndpoint === args.providerEndpoint
    && row.authorizationDigest === args.authorizationDigest
  )
}

export function managedCustodyPolicyValid(
  args: Pick<
    PrepareArgs,
    'custodyBudgetRef' | 'custodyGeneration' | 'custodyDailyMaximumUnits'
  >,
): boolean {
  const fields = [
    args.custodyBudgetRef,
    args.custodyGeneration,
    args.custodyDailyMaximumUnits,
  ]
  const supplied = fields.filter((value) => value !== undefined).length
  if (supplied === 0) return true
  if (supplied !== fields.length) return false
  return (
    typeof args.custodyBudgetRef === 'string'
    && args.custodyBudgetRef.trim().length > 0
    && typeof args.custodyGeneration === 'number'
    && Number.isSafeInteger(args.custodyGeneration)
    && args.custodyGeneration > 0
    && typeof args.custodyDailyMaximumUnits === 'string'
    && /^[1-9][0-9]*$/.test(args.custodyDailyMaximumUnits)
  )
}

export function assertManagedCustodyPolicy(
  args: Pick<
    PrepareArgs,
    'custodyBudgetRef' | 'custodyGeneration' | 'custodyDailyMaximumUnits'
  >,
): void {
  if (!managedCustodyPolicyValid(args)) {
    throw new Error('x402_payment_custody_policy_invalid')
  }
}

export function prepareAttributionMatches(row: AttemptRow, args: PrepareArgs): boolean {
  return (
    row.dispatchRef === args.dispatchRef
    && row.attemptRef === args.attemptRef
    && row.effectGeneration === args.effectGeneration
    && row.toolRef === args.toolRef
    && row.inputDigest === args.inputDigest
    && row.paymentIdentifier === args.paymentIdentifier
    && row.operationKeyDigest === args.operationKeyDigest
    && row.challengeDigest === args.challengeDigest
    && row.challengeJson === args.challengeJson
    && row.selectedRequirementJson === args.selectedRequirementJson
    && row.providerEndpoint === args.providerEndpoint
    && row.credentialRef === args.credentialRef
    && row.scheme === args.scheme
    && row.network === args.network
    && row.asset === args.asset
    && row.payTo === args.payTo
    && row.amountUnits === args.amountUnits
    && row.currency === args.currency
    && row.exponent === args.exponent
    && (row.reservationRef ?? undefined) === args.reservationRef
    && (row.requestFingerprint ?? undefined) === args.requestFingerprint
    && (row.custodyBudgetRef ?? undefined) === args.custodyBudgetRef
    && (row.custodyGeneration ?? undefined) === args.custodyGeneration
    && (row.custodyDailyMaximumUnits ?? undefined) === args.custodyDailyMaximumUnits
  )
}

export function x402CustodyRefDigest(
  args: Pick<
    PrepareArgs,
    'dispatchRef' | 'attemptRef' | 'effectGeneration' | 'paymentIdentifier' | 'challengeDigest'
  >,
): string {
  return canonicalDigest({
    kind: 'ae.x402.custody:v1',
    dispatchRef: args.dispatchRef,
    attemptRef: args.attemptRef,
    effectGeneration: args.effectGeneration,
    paymentIdentifier: args.paymentIdentifier,
    challengeDigest: args.challengeDigest,
  } as StableHashValue)
}

export function x402PaymentIdentityDigest(
  args: Pick<
    PrepareArgs,
    | 'paymentIdentifier'
    | 'challengeDigest'
    | 'selectedRequirementJson'
    | 'credentialRef'
    | 'reservationRef'
    | 'requestFingerprint'
    | 'custodyBudgetRef'
    | 'custodyGeneration'
    | 'custodyDailyMaximumUnits'
  >,
): string {
  return canonicalDigest({
    kind: 'ae.x402.payment-identity:v1',
    paymentIdentifier: args.paymentIdentifier,
    challengeDigest: args.challengeDigest,
    selectedRequirementJson: args.selectedRequirementJson,
    credentialRef: args.credentialRef,
    reservationRef: args.reservationRef ?? null,
    requestFingerprint: args.requestFingerprint ?? null,
    custodyBudgetRef: args.custodyBudgetRef ?? null,
    custodyGeneration: args.custodyGeneration ?? null,
    custodyDailyMaximumUnits: args.custodyDailyMaximumUnits ?? null,
  } as StableHashValue)
}

export function x402AuthorizationDigest(
  paymentIdentityDigest: string,
  credentialRef: string,
): string {
  return canonicalDigest({
    kind: 'ae.x402.authorization:v1',
    paymentIdentityDigest,
    credentialRef,
  } as StableHashValue)
}

export function reconciliationMismatch(
  row: AttemptRow,
  args: ReconcileArgs,
): string | undefined {
  return row.dispatchRef !== args.dispatchRef
    ? 'dispatch_ref'
    : row.toolRef !== args.toolRef
      ? 'tool_ref'
      : row.inputDigest !== args.inputDigest
          ? 'input_digest'
          : row.reservationRef !== args.reservationRef
            ? 'reservation_ref'
            : row.paymentIdentifier !== args.paymentIdentifier
              ? 'payment_identifier'
              : row.challengeDigest !== args.challengeDigest
                ? 'challenge_digest'
                : row.amountUnits !== args.amountUnits
                  ? 'amount_units'
                  : row.currency !== args.currency
                    ? 'currency'
                    : row.exponent !== args.exponent
                      ? 'exponent'
                      : row.transportObservationDigest !== args.transportObservationDigest
                        ? 'transport_observation_digest'
                        : row.transportRequestDigest !== args.transportRequestDigest
                          ? 'transport_request_digest'
                          : row.paymentObservationDigest !== args.paymentObservationDigest
                            ? 'payment_observation_digest'
                            : row.settlementStatus !== undefined
                              && row.settlementStatus !== 'unknown'
                              && row.settlementStatus !== args.settlementStatus
                              ? 'settlement_status'
                              : row.state !== 'observed' && row.state !== 'reconciliation_required'
                                ? 'attempt_state'
                                : undefined
}
