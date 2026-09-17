import { type Infer } from 'convex/values'

import { degradeBackend } from '../../src/lib/observability/degrade-backend'
import { canonicalDigest, isCanonicalDigest } from '../../src/modules/common/canonical-digest'
import { containsForbiddenSignatureKey } from '../../src/modules/common/forbidden-signature-key'
import { isRecord } from '../../src/modules/common/is-record'
import { stableStringify } from '../../src/modules/common/stable-hash'
import type { StableHashValue } from '../../src/modules/common/stable-hash'
import { parseBoundedJson } from '../../src/modules/common/bounded-json'

import { x402PaymentProfileForEnvironment } from '@/modules/capability-supply/public'

import {
  paymentAuthorizationValidBeforePattern,
  paymentSigningIdempotencyKeyPattern,
  type AttemptRow,
  type EventArgs,
  type PrepareArgs,
  type RecordObservationArgs,
  type ReconcileArgs,
  x402PaymentAuthorizationStored,
} from './x402-payment-attempt-schema'

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

export function isPaymentSigningIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && paymentSigningIdempotencyKeyPattern.test(value)
}

export function paymentAuthorizationExpiryFromValidBefore(
  validBefore: unknown,
): Readonly<{
  paymentAuthorizationValidBefore: string
  paymentAuthorizationExpiresAt: number
}> | undefined {
  if (typeof validBefore !== 'string' || !paymentAuthorizationValidBeforePattern.test(validBefore)) {
    return undefined
  }
  let seconds: bigint
  try {
    seconds = BigInt(validBefore)
  } catch (cause) {
    return degradeBackend(cause, undefined, {
      site: 'paymentAuthorizationExpiryFromValidBefore',
      reason: 'invalid_response',
    })
  }
  if (seconds <= 0n) return undefined
  const milliseconds = seconds * 1000n
  const expiresAt = Number(milliseconds)
  if (
    !Number.isFinite(expiresAt)
    || !Number.isSafeInteger(expiresAt)
    || expiresAt <= 0
  ) return undefined
  try {
    return BigInt(expiresAt) === milliseconds
      ? { paymentAuthorizationValidBefore: validBefore, paymentAuthorizationExpiresAt: expiresAt }
      : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, {
      site: 'paymentAuthorizationExpiryFromValidBefore',
      reason: 'invalid_response',
    })
  }
}

export function paymentAuthorizationExpiryValid(
  validBefore: unknown,
  expiresAt: unknown,
): boolean {
  const expected = paymentAuthorizationExpiryFromValidBefore(validBefore)
  return expected !== undefined && expected.paymentAuthorizationExpiresAt === expiresAt
}

export function paymentAuthorizationExpiryFromMaterial(
  value: unknown,
): Readonly<{
  paymentAuthorizationValidBefore: string
  paymentAuthorizationExpiresAt: number
}> | undefined {
  if (!isRecord(value) || !isRecord(value.authorization) || !isRecord(value.typedData)) {
    return undefined
  }
  const message = value.typedData.message
  if (!isRecord(message)) return undefined
  const expiry = paymentAuthorizationExpiryFromValidBefore(message.validBefore)
  return expiry !== undefined && value.authorization.validBefore === expiry.paymentAuthorizationValidBefore
    ? expiry
    : undefined
}

export function canonicalUnsignedMaterialJson(value: unknown): string | undefined {
  if (containsForbiddenSignatureKey(value)) return undefined
  try {
    const json = stableStringify(value as StableHashValue)
    return canonicalDigest(value) === canonicalDigest(JSON.parse(json)) ? json : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, {
      site: 'canonicalUnsignedMaterialJson',
      reason: 'invalid_response',
    })
  }
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

export function storedAuthorization(
  row: AttemptRow,
): Infer<typeof x402PaymentAuthorizationStored> | undefined {
  if (
    row.paymentUnsignedMaterialJson === undefined
    || row.paymentUnsignedMaterialDigest === undefined
    || row.paymentSigningIdempotencyKey === undefined
    || row.paymentSignatureDigest === undefined
    || row.paymentPayer === undefined
    || row.paymentNonce === undefined
    || row.paymentAuthorizationValidBefore === undefined
    || row.paymentAuthorizationExpiresAt === undefined
    || row.requestFingerprint === undefined
    || !isPaymentSigningIdempotencyKey(row.paymentSigningIdempotencyKey)
    || !paymentAuthorizationExpiryValid(
      row.paymentAuthorizationValidBefore,
      row.paymentAuthorizationExpiresAt,
    )
  ) return undefined
  return {
    paymentUnsignedMaterialJson: row.paymentUnsignedMaterialJson,
    paymentUnsignedMaterialDigest: row.paymentUnsignedMaterialDigest,
    paymentSigningIdempotencyKey: row.paymentSigningIdempotencyKey,
    paymentSignatureDigest: row.paymentSignatureDigest,
    paymentPayer: row.paymentPayer,
    paymentNonce: row.paymentNonce,
    paymentAuthorizationValidBefore: row.paymentAuthorizationValidBefore,
    paymentAuthorizationExpiresAt: row.paymentAuthorizationExpiresAt,
    requestFingerprint: row.requestFingerprint,
  }
}

const MAX_QUARANTINED_OUTPUT_BYTES = 512 * 1024

type QuarantinedOutput = Readonly<{
  responseDigest: string
  outputJson: string
}>

export function quarantinedOutputFromArgs(args: RecordObservationArgs): QuarantinedOutput | undefined {
  const responseDigest = args.quarantinedResponseDigest
  const outputJson = args.quarantinedOutputJson
  if ((responseDigest === undefined) !== (outputJson === undefined)) {
    throw new Error('x402_payment_quarantined_output_invalid')
  }
  if (responseDigest === undefined || outputJson === undefined) return undefined
  if (
    args.settlementStatus !== 'unknown'
    || !isCanonicalDigest(responseDigest)
    || new TextEncoder().encode(outputJson).byteLength
      > MAX_QUARANTINED_OUTPUT_BYTES
  ) throw new Error('x402_payment_quarantined_output_invalid')
  const parsed = parseBoundedJson(outputJson)
  if (
    parsed === undefined
    || JSON.stringify(parsed) !== outputJson
  ) throw new Error('x402_payment_quarantined_output_invalid')
  return {
    responseDigest,
    outputJson,
  }
}

export function quarantinedOutputFromRow(
  row: Readonly<{
    quarantinedResponseDigest?: string
    quarantinedOutputJson?: string
  }>,
): QuarantinedOutput | undefined {
  const responseDigest = row.quarantinedResponseDigest
  const outputJson = row.quarantinedOutputJson
  if ((responseDigest === undefined) !== (outputJson === undefined)) {
    throw new Error('x402_payment_quarantined_output_conflict')
  }
  if (responseDigest === undefined || outputJson === undefined) return undefined
  return {
    responseDigest,
    outputJson,
  }
}

export function sameQuarantinedOutput(
  left: QuarantinedOutput | undefined,
  right: QuarantinedOutput | undefined,
): boolean {
  return left?.responseDigest === right?.responseDigest
    && left?.outputJson === right?.outputJson
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
