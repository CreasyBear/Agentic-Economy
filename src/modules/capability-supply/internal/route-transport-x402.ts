import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { cancelResponseBody } from '@/lib/server/bounded-request-body'
import type { ExactAmount } from '@/modules/money/public'
import {
  readX402PaymentPayerAndNonce,
  readX402PaymentResponseHeader,
  type X402SettlementEvidence,
  type X402SettlementResponse,
} from './x402-payment-signer'
import {
  verifyX402SignedReceipt,
} from './x402-offer-receipt'
import type {
  ProviderConnectionAuthorityValidationResult,
  RouteTransportInvocation,
  RouteTransportRuntime,
} from './route-transport-invoke'
import {
  decodeX402Challenge,
  prepareX402PaymentMaterial,
  type X402Challenge,
} from './route-transport-x402-payment'
import {
  refused,
  unknown,
  type RouteTransportObservation,
} from './route-transport-observation'
import {
  callHeaders,
  containsSensitiveValue,
  errorName,
  isProviderRouteTransportAuthority,
  normalizeJsonResponse,
  optionalHeader,
  outboundSensitiveValues,
  providerAuthorityFailure,
  toHeaderRecord,
} from './route-transport-http-json'

export type {
  X402SettlementEvidence,
  X402SettlementResponse,
  X402SettlementStatus,
} from './x402-payment-signer'

export type X402PaymentSignatureRequest = Readonly<{
  challenge: X402Challenge
  /** Opaque server-only payer credential locator; resolve it only at signing. */
  credential: string
  paymentIdentifier: string
  selectedRequirement: X402Challenge['accepts'][number]
}>

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

export type X402RouteTransportRuntime = RouteTransportRuntime &
  Readonly<{
    prepareX402PaymentAuthorization: (
      request: X402PaymentSignatureRequest & X402PaymentAuthorizationIdentity,
    ) => Promise<X402PreparedAuthorization | undefined>
    readX402PaymentAuthorization: (
      prepared: X402PreparedAuthorization,
    ) => Promise<string | undefined>
    /** Restores custody material by the persisted opaque digest after process loss. */
    readX402PaymentAuthorizationByDigest: (
      prepared: X402PreparedAuthorization,
    ) => Promise<string | undefined>
    beforeX402PaymentAuthorizationRead?: () => Promise<boolean>
    markX402PaymentPossiblySubmitted: (
      event: X402PaymentAttemptEvent,
    ) => Promise<void> | void
  }>

export type X402Configuration = Readonly<{
  method: 'GET' | 'POST'
  query?: readonly Readonly<{
    inputPointer: string
    parameter: string
    required?: boolean
    style?: 'form'
    explode?: boolean
  }>[]
  requestTimeoutMs: number
  scheme: 'exact'
  network: string
  currency: string
  routeAmountExponent: number
  assetAmountExponent: number
  asset: string
  payTo: string
  paymentRequiredJson: string
}>

export async function invokeX402(
  endpoint: URL,
  configuration: X402Configuration,
  invocation: RouteTransportInvocation,
  requestDigest: string,
  runtime: X402RouteTransportRuntime,
  preparedTarget: URL | undefined,
): Promise<RouteTransportObservation> {
  const target = preparedTarget
  if (target === undefined)
    return refused('x402', requestDigest, false, 'input_invalid')
  const headers = callHeaders(invocation, undefined)
  const authorityFailure = await validateX402ProviderAuthority(invocation, runtime)
  if (authorityFailure !== undefined) {
    return refused('x402', requestDigest, false, authorityFailure)
  }
  const materialResult = await prepareX402PaymentMaterial(
    endpoint,
    configuration,
    invocation,
    requestDigest,
    runtime,
    target,
  )
  if (materialResult.kind === 'refused') return materialResult.observation
  const {
    challenge,
    requirement,
    paymentChallengeDigest,
    paymentAmount,
    paymentCredentialRef,
    authorizationIdentity,
    verifiedOffer,
  } = materialResult.material
  let preparedAuthorization: X402PreparedAuthorization | undefined
  try {
    preparedAuthorization = await runtime.prepareX402PaymentAuthorization({
      challenge,
      credential: paymentCredentialRef,
      selectedRequirement: requirement,
      ...authorizationIdentity,
    })
  } catch {
    preparedAuthorization = undefined
  }
  if (preparedAuthorization === undefined) {
    return {
      ...refused('x402', requestDigest, false, 'payment_signature_unavailable'),
      paymentChallengeDigest,
      paymentAuthorizationStatus: 'not_created',
      paymentSubmissionStatus: 'not_submitted',
      settlementEvidence: { kind: 'not_submitted' },
    }
  }
  if (runtime.beforeX402PaymentAuthorizationRead !== undefined) {
    let fencePassed = false
    try {
      fencePassed = await runtime.beforeX402PaymentAuthorizationRead()
    } catch {
      fencePassed = false
    }
    if (!fencePassed) {
      return {
        ...refused('x402', requestDigest, false, 'payment_submission_fence_failed'),
        paymentChallengeDigest,
        paymentAuthorizationStatus: 'created',
        paymentSubmissionStatus: 'not_submitted',
        settlementEvidence: { kind: 'not_submitted' },
      }
    }
  }
  const paymentSignature = await runtime.readX402PaymentAuthorization(
    preparedAuthorization,
  )
  if (paymentSignature === undefined || paymentSignature.length === 0) {
    return {
      ...refused('x402', requestDigest, false, 'payment_signature_unavailable'),
      paymentChallengeDigest,
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'not_submitted',
      settlementEvidence: { kind: 'not_submitted' },
      ...(verifiedOffer === undefined
        ? {}
        : { providerOfferDigest: verifiedOffer.offerDigest }),
    }
  }
  const paymentIdentity =
    verifiedOffer === undefined
      ? undefined
      : readX402PaymentPayerAndNonce(paymentSignature)
  if (verifiedOffer !== undefined && paymentIdentity === undefined) {
    return {
      ...refused('x402', requestDigest, false, 'payment_offer_invalid'),
      paymentChallengeDigest,
      providerOfferDigest: verifiedOffer.offerDigest,
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'not_submitted',
      settlementEvidence: { kind: 'not_submitted' },
    }
  }
  const offerEvidence =
    verifiedOffer === undefined
      ? {}
      : { providerOfferDigest: verifiedOffer.offerDigest }
  const sensitiveValues = outboundSensitiveValues(
    invocation,
    undefined,
    paymentSignature,
  )
  const paymentEvent: X402PaymentAttemptEvent = {
    paymentIdentifier: invocation.authority.operationKeyDigest,
    attemptRef: invocation.authority.attemptRef,
    challengeDigest: paymentChallengeDigest,
    scheme: requirement.scheme,
    network: requirement.network,
    asset: requirement.asset,
    payTo: requirement.payTo,
    amount: paymentAmount,
    providerEndpoint: target.href,
    custodyRef: preparedAuthorization.custodyRef,
    authorizationDigest: preparedAuthorization.authorizationDigest,
  }
  const preSendAuthorityFailure = await validateX402ProviderAuthority(
    invocation,
    runtime,
  )
  if (preSendAuthorityFailure !== undefined) {
    return {
      ...refused('x402', requestDigest, false, preSendAuthorityFailure),
      paymentChallengeDigest,
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'not_submitted',
      settlementEvidence: { kind: 'not_submitted' },
      ...offerEvidence,
    }
  }
  const markX402PaymentPossiblySubmitted =
    runtime.markX402PaymentPossiblySubmitted
  const observeX402PaymentAttempt = runtime.observeX402PaymentAttempt
  if (markX402PaymentPossiblySubmitted === undefined) {
    return {
      ...refused(
        'x402',
        requestDigest,
        false,
        'payment_submission_fence_unavailable',
      ),
      paymentChallengeDigest,
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'not_submitted',
      settlementEvidence: { kind: 'not_submitted' },
      ...offerEvidence,
    }
  }
  try {
    const markerResult: unknown = await markX402PaymentPossiblySubmitted(paymentEvent)
    if (markerResult === false) {
      return {
        ...refused(
          'x402',
          requestDigest,
          false,
          'payment_submission_fence_failed',
        ),
        paymentChallengeDigest,
        paymentAuthorizationStatus: 'created',
        paymentSubmissionStatus: 'not_submitted',
        settlementEvidence: { kind: 'not_submitted' },
        ...offerEvidence,
      }
    }
  } catch {
    return {
      ...refused(
        'x402',
        requestDigest,
        false,
        'payment_submission_fence_failed',
      ),
      paymentChallengeDigest,
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'not_submitted',
      settlementEvidence: { kind: 'not_submitted' },
      ...offerEvidence,
    }
  }
  try {
    const paid = await runtime.send(target, {
      method: configuration.method,
      redirect: 'manual',
      signal: AbortSignal.timeout(configuration.requestTimeoutMs),
      headers: { ...headers, 'Payment-Signature': paymentSignature },
      ...(configuration.method === 'POST'
        ? { body: invocation.inputJson }
        : {}),
    })
    if (paid.status === 402) {
      await cancelResponseBody(paid)
      const returnedChallenge = decodeX402Challenge(
        paid.headers.get('payment-required'),
      )
      const returnedChallengeDigest = returnedChallenge === undefined
        ? undefined
        : canonicalDigest(returnedChallenge as StableHashValue)
      const challengeMatches = returnedChallengeDigest === paymentChallengeDigest
      const failureCode = challengeMatches
        ? 'payment_required_after_submission'
        : 'payment_provider_requirement_stale'
      const evidenceRefs = [
        paymentChallengeDigest,
        ...(returnedChallengeDigest === undefined ? [] : [returnedChallengeDigest]),
      ]
      const settlementEvidence: X402SettlementEvidence = {
        kind: 'unknown',
        reason: failureCode,
        ...(returnedChallengeDigest === undefined
          ? {}
          : { digest: returnedChallengeDigest }),
      }
      if (observeX402PaymentAttempt !== undefined) {
        await observeX402PaymentAttempt({
          ...paymentEvent,
          settlementEvidence,
          state: 'reconciliation_required',
          evidenceRefs,
        })
      }
      return {
        ...unknown('x402', requestDigest, true, failureCode),
        paymentChallengeDigest,
        ...offerEvidence,
        queryReleaseStatus: 'released',
        paymentAuthorizationStatus: 'created',
        paymentSubmissionStatus: 'observed',
        settlementEvidence,
        quoteDeliveryStatus: 'unknown',
      }
    }
    const normalized = await normalizeJsonResponse(
      'x402',
      paid,
      requestDigest,
      true,
      undefined,
      undefined,
      sensitiveValues,
    )
    const paidHeaders = toHeaderRecord(paid)
    const paymentProof = optionalHeader(
      paidHeaders,
      'payment-response',
      'paymentProof',
    )
    const providerReceiptHeader = optionalHeader(
      paidHeaders,
      'provider-receipt',
      'providerReceipt',
    )
    const paymentOutputContainsSensitive =
      containsSensitiveValue(paymentProof, sensitiveValues) ||
      containsSensitiveValue(providerReceiptHeader, sensitiveValues)
    const providerReceipt =
      verifiedOffer === undefined ? providerReceiptHeader : {}
    const settlement = paymentOutputContainsSensitive
      ? { status: 'unknown' as const, failureCode: 'response_output_invalid' }
      : await x402SettlementCheck(
          paymentProof.paymentProof,
          requirement,
          paymentSignature,
          authorizationIdentity,
          runtime.verifyX402Settlement,
        )
    const evidenceRefs = paymentOutputContainsSensitive
      ? []
      : [
          ...(verifiedOffer === undefined ? [] : [verifiedOffer.offerDigest]),
          ...(paymentProof.paymentProof === undefined
            ? []
            : [canonicalDigest(paymentProof.paymentProof)]),
          ...(providerReceipt.providerReceipt === undefined
            ? []
            : [canonicalDigest(providerReceipt.providerReceipt)]),
        ]
    if (observeX402PaymentAttempt !== undefined) {
      await observeX402PaymentAttempt({
        ...paymentEvent,
        settlementEvidence:
          settlement.status === 'unknown'
            ? {
                kind: 'unknown',
                reason:
                  settlement.failureCode ?? 'payment_settlement_unknown',
                ...(settlement.response === undefined
                  ? {}
                  : { response: settlement.response }),
                ...(settlement.digest === undefined
                  ? {}
                  : { digest: settlement.digest }),
              }
            : {
                kind: settlement.status,
                response: settlement.response,
                digest: settlement.digest,
              },
        state:
          settlement.status === 'unknown'
            ? 'reconciliation_required'
            : settlement.status,
        evidenceRefs,
      })
    }
    if (paymentOutputContainsSensitive) {
      return {
        ...unknown('x402', requestDigest, true, 'response_output_invalid'),
        paymentChallengeDigest,
        ...offerEvidence,
        queryReleaseStatus: 'released',
        paymentAuthorizationStatus: 'created',
        paymentSubmissionStatus: 'observed',
        settlementEvidence: {
          kind: 'unknown',
          reason: 'response_output_invalid',
        },
        quoteDeliveryStatus: 'unknown',
      }
    }
    if (settlement.status === 'unknown') {
      return {
        ...unknown(
          'x402',
          requestDigest,
          true,
          settlement.failureCode ?? 'payment_settlement_unknown',
        ),
        paymentChallengeDigest,
        queryReleaseStatus: 'released',
        paymentAuthorizationStatus: 'created',
        paymentSubmissionStatus: 'observed',
        settlementEvidence: {
          kind: 'unknown',
          reason: settlement.failureCode ?? 'payment_settlement_unknown',
          ...(settlement.response === undefined
            ? {}
            : { response: settlement.response }),
          ...(settlement.digest === undefined
            ? {}
            : { digest: settlement.digest }),
        },
        quoteDeliveryStatus: 'unknown',
        ...paymentProof,
        ...providerReceipt,
        ...offerEvidence,
      }
    }
    if (settlement.status === 'not_settled') {
      return {
        ...normalized,
        disposition: 'refused',
        failureCode: 'payment_not_settled',
        paymentChallengeDigest,
        ...offerEvidence,
        queryReleaseStatus: 'released',
        paymentAuthorizationStatus: 'created',
        paymentSubmissionStatus: 'observed',
        settlementEvidence: {
          kind: 'not_settled',
          response: settlement.response,
          digest: settlement.digest,
        },
        quoteDeliveryStatus: 'not_delivered',
        ...paymentProof,
        ...providerReceipt,
        ...offerEvidence,
      }
    }
    if (verifiedOffer !== undefined) {
      const receiptVerification = await verifyX402SignedReceipt({
        response: new Response(null, { headers: toHeaderRecord(paid) }),
        offer: verifiedOffer,
        payer: paymentIdentity!.payer,
        nowSeconds: Math.floor(Date.now() / 1_000),
      })
      if (receiptVerification.kind !== 'verified') {
        const { outputJson: _outputJson, ...withoutOutput } = normalized
        return {
          ...withoutOutput,
          disposition: 'refused',
          failureCode: 'provider_receipt_invalid',
          paymentChallengeDigest,
          providerOfferDigest: verifiedOffer.offerDigest,
          queryReleaseStatus: 'released',
          paymentAuthorizationStatus: 'created',
          paymentSubmissionStatus: 'observed',
          settlementEvidence: {
            kind: 'settled',
            response: settlement.response,
            digest: settlement.digest,
          },
          quoteDeliveryStatus: 'not_delivered',
          ...paymentProof,
        }
      }
      return {
        ...normalized,
        paymentChallengeDigest,
        providerOfferDigest: verifiedOffer.offerDigest,
        queryReleaseStatus: 'released',
        paymentAuthorizationStatus: 'created',
        paymentSubmissionStatus: 'observed',
        settlementEvidence: {
          kind: 'settled',
          response: settlement.response,
          digest: settlement.digest,
        },
        quoteDeliveryStatus:
          normalized.outputJson === undefined ? 'unknown' : 'delivered',
        ...paymentProof,
        providerReceipt: receiptVerification.serializedReceipt,
      }
    }
    return {
      ...normalized,
      paymentChallengeDigest,
      queryReleaseStatus: 'released',
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'observed',
      settlementEvidence: {
        kind: 'settled',
        response: settlement.response,
        digest: settlement.digest,
      },
      quoteDeliveryStatus:
        normalized.outputJson === undefined ? 'unknown' : 'delivered',
      ...paymentProof,
      ...providerReceipt,
    }
  } catch (error) {
    if (observeX402PaymentAttempt !== undefined) {
      await observeX402PaymentAttempt({
        ...paymentEvent,
        settlementEvidence: {
          kind: 'unknown',
          reason: `network_${errorName(error)}`,
        },
        state: 'reconciliation_required',
        evidenceRefs: [],
      })
    }
    return {
      ...unknown('x402', requestDigest, true, `network_${errorName(error)}`),
      paymentChallengeDigest,
      ...offerEvidence,
      queryReleaseStatus: 'released',
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'possibly_submitted',
      settlementEvidence: {
        kind: 'unknown',
        reason: `network_${errorName(error)}`,
      },
      quoteDeliveryStatus: 'unknown',
    }
  }
}

async function validateX402ProviderAuthority(
  invocation: RouteTransportInvocation,
  runtime: RouteTransportRuntime,
): Promise<string | undefined> {
  if (invocation.binding.authority.kind !== 'provider_connection')
    return undefined
  const validateProviderConnectionAuthority =
    runtime.validateProviderConnectionAuthority
  if (validateProviderConnectionAuthority === undefined)
    return 'connection_authority_validator_unavailable'
  const authority = invocation.authority
  if (!isProviderRouteTransportAuthority(authority))
    return 'connection_authority_snapshot_invalid'
  let validation: ProviderConnectionAuthorityValidationResult
  try {
    validation = await validateProviderConnectionAuthority({
      connectionRef: invocation.binding.authority.connectionRef,
      providerRef: invocation.binding.authority.providerRef,
      adapterId: invocation.binding.adapterId,
      authorityGeneration: authority.authorityGeneration,
      authorityDigest: authority.authorityDigest,
      ...(authority.leaseRef === undefined
        ? {}
        : {
            leaseRef: authority.leaseRef,
            invocationRef: authority.invocationRef,
            operationRef: authority.operationRef,
            grantedScopes: authority.grantedScopes,
            grantedResources: authority.grantedResources,
            readinessValidUntil: authority.readinessValidUntil,
            ...(authority.readinessDigest === undefined
              ? {}
              : { readinessDigest: authority.readinessDigest }),
          }),
    })
  } catch {
    return 'connection_authority_validation_failed'
  }
  return validation.kind === 'valid'
    ? undefined
    : providerAuthorityFailure(validation.reason)
}

type X402SettlementCheck =
  | Readonly<{
      status: 'settled' | 'not_settled'
      response: X402SettlementResponse
      digest: string
    }>
  | Readonly<{
      status: 'unknown'
      response?: X402SettlementResponse
      digest?: string
      failureCode: string
    }>

async function x402SettlementCheck(
  paymentProof: string | undefined,
  requirement: X402Challenge['accepts'][number],
  paymentSignature: string,
  authorizationIdentity: Readonly<{
    paymentIdentifier: string
    challengeDigest: string
  }>,
  verifySettlement: RouteTransportRuntime['verifyX402Settlement'],
): Promise<X402SettlementCheck> {
  if (paymentProof === undefined)
    return { status: 'unknown', failureCode: 'payment_settlement_missing' }
  const response = readX402PaymentResponseHeader(paymentProof)
  if (response === undefined)
    return { status: 'unknown', failureCode: 'payment_settlement_malformed' }
  const digest = canonicalDigest(response as StableHashValue)
  if (
    response.network !== requirement.network
    || (response.amount !== undefined && response.amount !== requirement.amount)
  )
    return {
      status: 'unknown',
      response,
      digest,
      failureCode: 'payment_settlement_mismatch',
    }
  let verified = false
  try {
    verified = verifySettlement === undefined
      ? false
      : await verifySettlement({
          response,
          requirement,
          paymentSignature,
          ...authorizationIdentity,
        })
  } catch {
    verified = false
  }
  if (!verified) {
    return {
      status: 'unknown',
      response,
      digest,
      failureCode: 'payment_settlement_unverified',
    }
  }
  return {
    status: response.success ? 'settled' : 'not_settled',
    response,
    digest,
  }
}
