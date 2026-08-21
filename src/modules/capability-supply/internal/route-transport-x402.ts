import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { cancelResponseBody } from '@/lib/server/bounded-request-body'
import {
  exactAmountSchema,
  compareExactAmounts,
  formatExactAmount,
  parseDecimalExactAmount,
  rescaleExactAmount,
} from '@/modules/money/public'
import type { ExactAmount } from '@/modules/money/public'
import {
  decodeX402PaymentRequiredHeader,
  readX402PaymentPayerAndNonce,
  readX402PaymentResponseHeader,
  validateX402PaymentRequired,
  type X402SettlementEvidence,
  type X402SettlementResponse,
} from './x402-payment-signer'
import {
  verifyX402SignedOffer,
  verifyX402SignedReceipt,
  type X402VerifiedOffer,
} from './x402-offer-receipt'
import type { PaymentRequired } from '@x402/core/types'
import { isProviderConnectionCredentialRef } from '../provider-connection'
import type {
  ProviderConnectionAuthorityValidationResult,
  RouteTransportInvocation,
  RouteTransportRuntime,
} from './route-transport-invoke'
import {
  boundedString,
  MAX_RESPONSE_BYTES,
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
  type RouteTransportResponse,
} from './route-transport-http-json'

export type {
  X402SettlementEvidence,
  X402SettlementResponse,
  X402SettlementStatus,
} from './x402-payment-signer'

type X402Challenge = Readonly<{
  x402Version: 2
  resource: Readonly<{ url: string; description?: string; mimeType?: string }>
  accepts: readonly Readonly<{
    scheme: string
    network: `${string}:${string}`
    amount: string
    asset: string
    payTo: string
    maxTimeoutSeconds: number
    extra: Readonly<Record<string, unknown>>
  }>[]
  extensions?: Readonly<Record<string, unknown>>
}>

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
}>

export function expectedX402Amount(
  routeAmount: ExactAmount,
  configuration: X402Configuration,
): ExactAmount | undefined {
  if (
    !exactAmountSchema.safeParse(routeAmount).success ||
    routeAmount.currency !== configuration.currency
  )
    return undefined
  const rescaled = rescaleExactAmount(
    routeAmount,
    configuration.assetAmountExponent,
  )
  if (rescaled === undefined) return undefined
  const decimal = formatExactAmount(routeAmount)
  if (decimal === undefined) return undefined
  const tokenAmount = parseDecimalExactAmount(
    configuration.currency,
    decimal,
    configuration.assetAmountExponent,
  )
  return tokenAmount?.units === rescaled.units ? rescaled : undefined
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

export async function invokeX402(
  endpoint: URL,
  configuration: X402Configuration,
  invocation: RouteTransportInvocation,
  requestDigest: string,
  runtime: X402RouteTransportRuntime,
  preparedTarget: URL | undefined,
): Promise<RouteTransportObservation> {
  const headers = callHeaders(invocation, undefined)
  const target = preparedTarget
  if (target === undefined)
    return refused('x402', requestDigest, false, 'input_invalid')
  const authorityFailure = await validateX402ProviderAuthority(
    invocation,
    runtime,
  )
  if (authorityFailure !== undefined)
    return refused('x402', requestDigest, false, authorityFailure)
  let first: RouteTransportResponse
  try {
    first = await runtime.send(target, {
      method: configuration.method,
      redirect: 'manual',
      signal: AbortSignal.timeout(configuration.requestTimeoutMs),
      headers,
      ...(configuration.method === 'POST'
        ? { body: invocation.inputJson }
        : {}),
    })
  } catch (error) {
    return unknown(
      'x402',
      requestDigest,
      true,
      `payment_challenge_${errorName(error)}`,
    )
  }
  if (first.status !== 402) {
    return await normalizeJsonResponse(
      'x402',
      first,
      requestDigest,
      true,
      undefined,
      undefined,
      outboundSensitiveValues(invocation),
    )
  }
  await cancelResponseBody(first)
  const challenge = decodeX402Challenge(first.headers.get('payment-required'))
  if (challenge === undefined)
    return refused('x402', requestDigest, false, 'payment_challenge_invalid')
  const paymentChallengeDigest = canonicalDigest(challenge as StableHashValue)
  const requirement = challenge.accepts.find(
    (candidate) =>
      candidate.scheme === configuration.scheme &&
      candidate.network === configuration.network &&
      candidate.asset.toLowerCase() === configuration.asset.toLowerCase() &&
      candidate.payTo.toLowerCase() === configuration.payTo.toLowerCase(),
  )
  if (requirement === undefined)
    return {
      ...refused(
        'x402',
        requestDigest,
        false,
        'payment_requirement_unsupported',
      ),
      paymentChallengeDigest,
    }
  if (
    challenge.resource.url !== target.href ||
    Date.now() + requirement.maxTimeoutSeconds * 1_000 >
      invocation.authority.expiresAt
  ) {
    return {
      ...refused(
        'x402',
        requestDigest,
        false,
        'payment_requirement_outside_authority',
      ),
      paymentChallengeDigest,
    }
  }
  if (invocation.authority.maximumSpend.currency !== configuration.currency) {
    return {
      ...refused('x402', requestDigest, false, 'payment_currency_mismatch'),
      paymentChallengeDigest,
    }
  }
  const expectedAmount = expectedX402Amount(
    invocation.authority.maximumSpend,
    configuration,
  )
  if (expectedAmount === undefined) {
    return {
      ...refused('x402', requestDigest, false, 'payment_authority_invalid'),
      paymentChallengeDigest,
    }
  }
  const parsedPaymentAmount = exactAmountSchema.safeParse({
    currency: configuration.currency,
    units: requirement.amount,
    exponent: configuration.assetAmountExponent,
  })
  if (!parsedPaymentAmount.success) {
    return {
      ...refused('x402', requestDigest, false, 'payment_challenge_invalid'),
      paymentChallengeDigest,
    }
  }
  const paymentAmount = parsedPaymentAmount.data
  const amountComparison = compareExactAmounts(paymentAmount, expectedAmount)
  if (amountComparison !== 0) {
    return {
      ...refused(
        'x402',
        requestDigest,
        false,
        amountComparison === 1
          ? 'payment_exceeds_step_ceiling'
          : 'payment_amount_mismatch',
      ),
      paymentChallengeDigest,
    }
  }
  const signedOfferRequired =
    challenge.extensions !== undefined
    && Object.prototype.hasOwnProperty.call(
      challenge.extensions,
      'offer-receipt',
    )
  let verifiedOffer: X402VerifiedOffer | undefined
  if (signedOfferRequired) {
    const paymentRequired: PaymentRequired = {
      x402Version: challenge.x402Version,
      resource: { ...challenge.resource },
      accepts: challenge.accepts.map((candidate) => ({
        ...candidate,
        extra: { ...candidate.extra },
      })),
      ...(challenge.extensions === undefined ? {} : { extensions: { ...challenge.extensions } }),
    }
    const offerVerification = await verifyX402SignedOffer({
      paymentRequired,
      selectedRequirement: requirement,
      resourceUrl: target.href,
      nowSeconds: Math.floor(Date.now() / 1_000),
    })
    if (offerVerification.kind !== 'verified') {
      return {
        ...refused('x402', requestDigest, false, 'payment_offer_invalid'),
        paymentChallengeDigest,
        paymentAuthorizationStatus: 'not_created',
        paymentSubmissionStatus: 'not_submitted',
        settlementEvidence: { kind: 'not_submitted' },
      }
    }
    verifiedOffer = offerVerification.context
  }
  let paymentCredentialRef: string | undefined
  try {
    const configured =
      runtime.readX402PaymentCredentialRef === undefined
        ? undefined
        : await runtime.readX402PaymentCredentialRef()
    if (isProviderConnectionCredentialRef(configured))
      paymentCredentialRef = configured
  } catch {
    paymentCredentialRef = undefined
  }
  if (paymentCredentialRef === undefined) {
    return refused('x402', requestDigest, false, 'payment_custody_unavailable')
  }
  const authorizationIdentity = {
    paymentIdentifier: invocation.authority.operationKeyDigest,
    challengeDigest: paymentChallengeDigest,
    attemptRef: invocation.authority.attemptRef,
    effectGeneration: invocation.authority.effectGeneration ?? 0,
    paymentAmount,
  }
  const preparedAuthorization = await runtime.prepareX402PaymentAuthorization({
    challenge,
    credential: paymentCredentialRef,
    selectedRequirement: requirement,
    ...authorizationIdentity,
  })
  if (preparedAuthorization === undefined) {
    return {
      ...refused('x402', requestDigest, false, 'payment_signature_unavailable'),
      paymentChallengeDigest,
      paymentAuthorizationStatus: 'not_created',
      paymentSubmissionStatus: 'not_submitted',
      settlementEvidence: { kind: 'not_submitted' },
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

function decodeX402Challenge(header: string | null): X402Challenge | undefined {
  if (header === null || header.length > MAX_RESPONSE_BYTES * 2)
    return undefined
  try {
    const decoded = decodeX402PaymentRequiredHeader(header)
    const parsed = validateX402PaymentRequired(decoded)
    if (
      parsed.x402Version !== 2
      || !boundedString(parsed.resource.url, 2_000)
      || !Array.isArray(parsed.accepts)
      || parsed.accepts.length < 1
      || parsed.accepts.length > 16
    )
      return undefined
    for (const candidate of parsed.accepts) {
      if (
        !isRecord(candidate)
        || !boundedString(candidate.scheme, 100)
        || !boundedString(candidate.network, 100)
        || !/^[A-Za-z0-9-]+:[A-Za-z0-9._-]+$/.test(candidate.network)
        || typeof candidate.amount !== 'string'
        || !/^(?:0|[1-9]\d{0,77})$/.test(candidate.amount)
        || !boundedString(candidate.asset, 200)
        || !boundedString(candidate.payTo, 200)
        || !Number.isSafeInteger(candidate.maxTimeoutSeconds)
        || candidate.maxTimeoutSeconds <= 0
        || candidate.maxTimeoutSeconds > 86_400
        || !isRecord(candidate.extra)
        || !isSupportedX402TransferMethod(candidate.extra)
      )
        return undefined
    }
    return parsed as X402Challenge
  } catch {
    return undefined
  }
}

function isSupportedX402TransferMethod(
  extra: Readonly<Record<string, unknown>>,
): boolean {
  const method = extra.assetTransferMethod
  return method === undefined || method === 'eip3009' || method === 'permit2'
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
