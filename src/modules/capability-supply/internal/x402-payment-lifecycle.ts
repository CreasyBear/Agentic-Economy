import type { ExactAmount } from '@/modules/money/public'
import type { X402SettlementEvidence } from './x402-payment-signer'

export type X402PaymentAuthorizationIdentity = Readonly<{
  paymentIdentifier: string
  challengeDigest: string
  attemptRef: string
  effectGeneration: number
  paymentAmount: ExactAmount
}>

export type X402PreparedAuthorization = Readonly<{
  custodyRef: string
  authorizationDigest: string
}>

export type X402PaymentAttemptEvent = Readonly<{
  paymentIdentifier: string
  attemptRef: string
  challengeDigest: string
  scheme: string
  network: string
  asset: string
  payTo: string
  amount: ExactAmount
  providerEndpoint: string
  custodyRef: string
  authorizationDigest: string
  settlementEvidence?: X402SettlementEvidence
}>

export type StoredX402Request = Readonly<{
  paymentIdentifier: string
  challengeDigest: string
  attemptRef: string
  effectGeneration: number
  credentialRef: string
  providerEndpoint: string
  scheme: string
  network: string
  asset: string
  payTo: string
  amountUnits: string
  currency: string
  exponent: number
  requestFingerprint?: string
}>

export function parseStoredX402Request(
  material: Readonly<Record<string, unknown>>,
): StoredX402Request | undefined {
  if (
    typeof material.paymentIdentifier !== 'string'
    || typeof material.challengeDigest !== 'string'
    || typeof material.attemptRef !== 'string'
    || typeof material.effectGeneration !== 'number'
    || typeof material.credentialRef !== 'string'
    || typeof material.providerEndpoint !== 'string'
    || typeof material.scheme !== 'string'
    || typeof material.network !== 'string'
    || typeof material.asset !== 'string'
    || typeof material.payTo !== 'string'
    || typeof material.amountUnits !== 'string'
    || typeof material.currency !== 'string'
    || typeof material.exponent !== 'number'
  ) return undefined

  return {
    paymentIdentifier: material.paymentIdentifier,
    challengeDigest: material.challengeDigest,
    attemptRef: material.attemptRef,
    effectGeneration: material.effectGeneration,
    credentialRef: material.credentialRef,
    providerEndpoint: material.providerEndpoint,
    scheme: material.scheme,
    network: material.network,
    asset: material.asset,
    payTo: material.payTo,
    amountUnits: material.amountUnits,
    currency: material.currency,
    exponent: material.exponent,
    ...(typeof material.requestFingerprint === 'string'
      ? { requestFingerprint: material.requestFingerprint }
      : {}),
  }
}

export function buildX402AttemptObservation(
  event: X402PaymentAttemptEvent,
  state: 'observed' | 'reconciliation_required',
  evidenceRefs: readonly string[],
): Readonly<{
  paymentIdentifier: string
  attemptRef: string
  effectGeneration: number
  challengeDigest: string
  scheme: string
  network: string
  asset: string
  payTo: string
  amountUnits: string
  currency: string
  exponent: number
  providerEndpoint: string
  custodyRef: string
  authorizationDigest: string
  state: 'observed' | 'reconciliation_required'
  evidenceRefs: readonly string[]
  settlementStatus?: 'settled' | 'not_settled' | 'unknown'
  settlementDigest?: string
}> {
  return {
    paymentIdentifier: event.paymentIdentifier,
    attemptRef: event.attemptRef,
    effectGeneration: 1, // standard default if omitted or can be passed
    challengeDigest: event.challengeDigest,
    scheme: event.scheme,
    network: event.network,
    asset: event.asset,
    payTo: event.payTo,
    amountUnits: event.amount.units,
    currency: event.amount.currency,
    exponent: event.amount.exponent,
    providerEndpoint: event.providerEndpoint,
    custodyRef: event.custodyRef,
    authorizationDigest: event.authorizationDigest,
    state,
    evidenceRefs,
    ...(event.settlementEvidence === undefined
      ? {}
      : {
          settlementStatus:
            event.settlementEvidence.kind === 'not_submitted'
              ? ('not_settled' as const)
              : event.settlementEvidence.kind,
          ...(event.settlementEvidence.kind !== 'not_submitted' && event.settlementEvidence.digest !== undefined
            ? { settlementDigest: event.settlementEvidence.digest }
            : {}),
        }),
  }
}

export type ClaimX402SigningSlotResult =
  | { kind: 'claimed' }
  | { kind: 'stored'; signatureHeader: string }
  | { kind: 'pending' }

export async function claimX402SigningSlot<TMaterial>(options: {
  claim: () => Promise<
    | { kind: 'claimed' }
    | { kind: 'stored'; [key: string]: unknown }
    | { kind: 'pending' }
  >
  readMaterial: () => Promise<TMaterial | null>
  hasStoredSignature: (material: TMaterial | null) => boolean
  signAndCommit: (material: TMaterial, isClaimWinner: boolean) => Promise<string | undefined>
  pollIntervalMs?: number
  timeoutMs?: number
}): Promise<string | undefined> {
  const claim = await options.claim()
  if (claim.kind === 'stored') {
    const converged = await options.readMaterial()
    if (converged === null) throw new Error('x402_payment_reconciliation_required')
    return await options.signAndCommit(converged, false)
  }
  if (claim.kind === 'pending') {
    const pollInterval = options.pollIntervalMs ?? 25
    const timeout = options.timeoutMs ?? 1000
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const converged = await options.readMaterial()
      if (options.hasStoredSignature(converged)) {
        return await options.signAndCommit(converged as TMaterial, false)
      }
      if (converged === null) {
        throw new Error('x402_payment_reconciliation_required')
      }
      await new Promise<void>((resolve) => setTimeout(resolve, pollInterval))
    }
    throw new Error('x402_payment_reconciliation_required')
  }

  const claimedMaterial = await options.readMaterial()
  if (claimedMaterial === null) throw new Error('x402_payment_reconciliation_required')
  return await options.signAndCommit(claimedMaterial, true)
}
