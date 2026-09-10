import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  compareExactAmounts,
  exactAmountSchema,
  formatExactAmount,
  parseDecimalExactAmount,
  rescaleExactAmount,
} from '@/modules/money/public'
import type { ExactAmount } from '@/modules/money/public'
import { isProviderConnectionCredentialRef } from '../provider-connection'
import type {
  RouteTransportInvocation,
  RouteTransportRuntime,
} from './route-transport-call'
import {
  decodeX402PaymentRequiredHeader,
  validateX402PaymentRequired,
  type X402PaymentRequired,
} from './x402-payment-signer'
import {
  verifyX402SignedOffer,
  type X402VerifiedOffer,
} from './x402-offer-receipt'
import {
  boundedString,
  MAX_RESPONSE_BYTES,
  refused,
  type RouteTransportObservation,
} from './route-transport-observation'
import type {
  X402Configuration,
  X402PaymentAuthorizationIdentity,
} from './route-transport-x402'

export type X402Challenge = Readonly<{
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

export type X402PaymentMaterial = Readonly<{
  challenge: X402Challenge
  requirement: X402Challenge['accepts'][number]
  paymentChallengeDigest: string
  paymentAmount: ExactAmount
  paymentCredentialRef: string
  authorizationIdentity: X402PaymentAuthorizationIdentity
  verifiedOffer?: X402VerifiedOffer
}>

export type X402PaymentMaterialResult =
  | Readonly<{ kind: 'ready'; material: X402PaymentMaterial }>
  | Readonly<{ kind: 'refused'; observation: RouteTransportObservation }>

export type X402ChallengeSelection = Readonly<{
  challenge: X402Challenge
  requirement: X402Challenge['accepts'][number]
}>

export async function prepareX402PaymentMaterial(
  endpoint: URL,
  configuration: X402Configuration,
  invocation: RouteTransportInvocation,
  requestDigest: string,
  runtime: RouteTransportRuntime,
  target: URL | undefined,
  selection?: X402ChallengeSelection,
): Promise<X402PaymentMaterialResult> {
  if (
    target === undefined
    || target.origin !== endpoint.origin
    || target.protocol !== endpoint.protocol
  )
    return {
      kind: 'refused',
      observation: refused('x402', requestDigest, false, 'input_invalid'),
    }
  const challenge = selection?.challenge ?? decodePinnedX402Challenge(configuration, invocation.committedPaymentRequiredJson)
  if (challenge === undefined) {
    return {
      kind: 'refused',
      observation: refused('x402', requestDigest, false, 'payment_challenge_invalid'),
    }
  }
  const paymentChallengeDigest = canonicalDigest(challenge as StableHashValue)
  const requirement = selection?.requirement
    ?? configuredX402Requirement(challenge, configuration)
  if (requirement === undefined) {
    return {
      kind: 'refused',
      observation: {
        ...refused('x402', requestDigest, false, 'payment_requirement_unsupported'),
        paymentChallengeDigest,
      },
    }
  }
  if (
    !challenge.accepts.includes(requirement)
    || !configuredX402RequirementMatches(requirement, configuration)
  ) {
    return {
      kind: 'refused',
      observation: {
        ...refused('x402', requestDigest, false, 'payment_requirement_unsupported'),
        paymentChallengeDigest,
      },
    }
  }
  if (
    !x402ResourceUrlBindsTarget(
      challenge.resource.url,
      target,
      configuration.method,
      configuration.query !== undefined || configuration.queryObjectPointer !== undefined,
    )
    || Date.now() + requirement.maxTimeoutSeconds * 1_000 > invocation.authority.expiresAt
  ) {
    return {
      kind: 'refused',
      observation: {
        ...refused('x402', requestDigest, false, 'payment_requirement_outside_authority'),
        paymentChallengeDigest,
      },
    }
  }
  if (invocation.authority.maximumSpend.currency !== configuration.currency) {
    return {
      kind: 'refused',
      observation: {
        ...refused('x402', requestDigest, false, 'payment_currency_mismatch'),
        paymentChallengeDigest,
      },
    }
  }
  const expectedAmount = expectedX402Amount(invocation.authority.maximumSpend, configuration)
  if (expectedAmount === undefined) {
    return {
      kind: 'refused',
      observation: {
        ...refused('x402', requestDigest, false, 'payment_authority_invalid'),
        paymentChallengeDigest,
      },
    }
  }
  const parsedPaymentAmount = exactAmountSchema.safeParse({
    currency: configuration.currency,
    units: requirement.amount,
    exponent: configuration.assetAmountExponent,
  })
  if (!parsedPaymentAmount.success) {
    return {
      kind: 'refused',
      observation: {
        ...refused('x402', requestDigest, false, 'payment_challenge_invalid'),
        paymentChallengeDigest,
      },
    }
  }
  const paymentAmount = parsedPaymentAmount.data
  const amountComparison = compareExactAmounts(paymentAmount, expectedAmount)
  if (amountComparison !== 0) {
    return {
      kind: 'refused',
      observation: {
        ...refused(
          'x402',
          requestDigest,
          false,
          amountComparison === 1 ? 'payment_exceeds_step_ceiling' : 'payment_amount_mismatch',
        ),
        paymentChallengeDigest,
      },
    }
  }
  const signedOfferRequired = challenge.extensions !== undefined
    && Object.hasOwn(challenge.extensions, 'offer-receipt')
  let verifiedOffer: X402VerifiedOffer | undefined
  if (signedOfferRequired) {
    const offerVerification = await verifyX402SignedOffer({
      paymentRequired: paymentRequiredFromChallenge(challenge),
      selectedRequirement: requirement,
      resourceUrl: target.href,
      nowSeconds: Math.floor(Date.now() / 1_000),
    })
    if (offerVerification.kind !== 'verified') {
      return {
        kind: 'refused',
        observation: {
          ...refused('x402', requestDigest, false, 'payment_offer_invalid'),
          paymentChallengeDigest,
          paymentAuthorizationStatus: 'not_created',
          paymentSubmissionStatus: 'not_submitted',
          settlementEvidence: { kind: 'not_submitted' },
        },
      }
    }
    verifiedOffer = offerVerification.context
  }
  let paymentCredentialRef: string | undefined
  try {
    const configured = runtime.readX402PaymentCredentialRef === undefined
      ? undefined
      : await runtime.readX402PaymentCredentialRef()
    if (isProviderConnectionCredentialRef(configured)) paymentCredentialRef = configured
  } catch {
    paymentCredentialRef = undefined
  }
  if (paymentCredentialRef === undefined) {
    return {
      kind: 'refused',
      observation: {
        ...refused('x402', requestDigest, false, 'payment_custody_unavailable'),
        paymentChallengeDigest,
      },
    }
  }
  const authorizationIdentity: X402PaymentAuthorizationIdentity = {
    paymentIdentifier: invocation.authority.operationKeyDigest,
    challengeDigest: paymentChallengeDigest,
    attemptRef: invocation.authority.attemptRef,
    effectGeneration: invocation.authority.effectGeneration ?? 0,
    paymentAmount,
  }
  return {
    kind: 'ready',
    material: {
      challenge,
      requirement,
      paymentChallengeDigest,
      paymentAmount,
      paymentCredentialRef,
      authorizationIdentity,
      ...(verifiedOffer === undefined ? {} : { verifiedOffer }),
    },
  }
}

export function freshX402ChallengeSelection(
  committed: X402ChallengeSelection,
  freshChallenge: X402Challenge,
): X402ChallengeSelection | undefined {
  if (!x402ResourcesEquivalent(committed.challenge.resource, freshChallenge.resource)) {
    return undefined
  }
  const requirement = freshChallenge.accepts.find((candidate) =>
    x402RequirementsEquivalent(committed.requirement, candidate))
  return requirement === undefined
    ? undefined
    : { challenge: freshChallenge, requirement }
}

function configuredX402Requirement(
  challenge: X402Challenge,
  configuration: X402Configuration,
): X402Challenge['accepts'][number] | undefined {
  return challenge.accepts.find((candidate) =>
    configuredX402RequirementMatches(candidate, configuration))
}

function configuredX402RequirementMatches(
  candidate: X402Challenge['accepts'][number],
  configuration: X402Configuration,
): boolean {
  return candidate.scheme === configuration.scheme
    && candidate.network === configuration.network
    && candidate.asset.toLowerCase() === configuration.asset.toLowerCase()
    && candidate.payTo.toLowerCase() === configuration.payTo.toLowerCase()
}

function x402ResourcesEquivalent(
  committed: X402Challenge['resource'],
  fresh: X402Challenge['resource'],
): boolean {
  let committedUrl: string
  let freshUrl: string
  try {
    committedUrl = new URL(committed.url).href
    freshUrl = new URL(fresh.url).href
  } catch {
    return false
  }
  return committedUrl === freshUrl
    && committed.description === fresh.description
    && committed.mimeType === fresh.mimeType
}

function x402RequirementsEquivalent(
  committed: X402Challenge['accepts'][number],
  fresh: X402Challenge['accepts'][number],
): boolean {
  return committed.scheme === fresh.scheme
    && committed.network === fresh.network
    && committed.amount === fresh.amount
    && committed.asset.toLowerCase() === fresh.asset.toLowerCase()
    && committed.payTo.toLowerCase() === fresh.payTo.toLowerCase()
    && committed.maxTimeoutSeconds === fresh.maxTimeoutSeconds
    && canonicalDigest(normalizedX402Extra(committed.extra) as StableHashValue)
      === canonicalDigest(normalizedX402Extra(fresh.extra) as StableHashValue)
}

function normalizedX402Extra(
  extra: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    ...extra,
    assetTransferMethod: extra.assetTransferMethod ?? 'eip3009',
  }
}

export function decodeX402Challenge(header: string | null): X402Challenge | undefined {
  if (header === null || header.length > MAX_RESPONSE_BYTES * 2)
    return undefined
  try {
    return validateX402Challenge(
      validateX402PaymentRequired(decodeX402PaymentRequiredHeader(header)),
    )
  } catch {
    return undefined
  }
}

function decodePinnedX402Challenge(configuration: X402Configuration, committedPaymentRequiredJson?: string): X402Challenge | undefined {
  if (!('paymentRequiredJson' in configuration) || typeof configuration.paymentRequiredJson !== 'string') {
    return undefined
  }
  if (committedPaymentRequiredJson !== undefined && committedPaymentRequiredJson.length > 65_536) return undefined
  try {
    return validateX402Challenge(
      validateX402PaymentRequired(JSON.parse(committedPaymentRequiredJson ?? configuration.paymentRequiredJson)),
    )
  } catch {
    return undefined
  }
}

function validateX402Challenge(value: unknown): X402Challenge | undefined {
  if (!isRecord(value) || value.x402Version !== 2) return undefined
  const resource = value.resource
  const accepts = value.accepts
  if (
    !isRecord(resource)
    || !boundedString(resource.url, 2_000)
    || !Array.isArray(accepts)
    || accepts.length < 1
    || accepts.length > 16
  ) return undefined
  for (const candidate of accepts) {
    const maxTimeoutSeconds = isRecord(candidate)
      ? candidate.maxTimeoutSeconds
      : undefined
    if (
      !isRecord(candidate)
      || !boundedString(candidate.scheme, 100)
      || !boundedString(candidate.network, 100)
      || !/^[A-Za-z0-9-]+:[A-Za-z0-9._-]+$/.test(candidate.network)
      || typeof candidate.amount !== 'string'
      || !/^(?:0|[1-9]\d{0,77})$/.test(candidate.amount)
      || !boundedString(candidate.asset, 200)
      || !boundedString(candidate.payTo, 200)
      || typeof maxTimeoutSeconds !== 'number'
      || !Number.isSafeInteger(maxTimeoutSeconds)
      || maxTimeoutSeconds <= 0
      || maxTimeoutSeconds > 86_400
      || !isRecord(candidate.extra)
      || !isSupportedX402TransferMethod(candidate.extra)
    ) return undefined
  }
  return value as X402Challenge
}

function paymentRequiredFromChallenge(challenge: X402Challenge): X402PaymentRequired {
  return {
    x402Version: challenge.x402Version,
    resource: { ...challenge.resource },
    accepts: challenge.accepts.map((candidate) => ({
      ...candidate,
      extra: { ...candidate.extra },
    })),
    ...(challenge.extensions === undefined ? {} : { extensions: { ...challenge.extensions } }),
  }
}

export function expectedX402Amount(
  routeAmount: ExactAmount,
  configuration: X402Configuration,
): ExactAmount | undefined {
  if (
    !exactAmountSchema.safeParse(routeAmount).success
    || routeAmount.currency !== configuration.currency
  ) return undefined
  const rescaled = rescaleExactAmount(routeAmount, configuration.assetAmountExponent)
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

export function x402ResourceUrlBindsTarget(
  resourceUrl: string,
  target: URL,
  method: 'GET' | 'POST',
  queryMapped: boolean,
): boolean {
  let resource: URL
  try {
    resource = new URL(resourceUrl)
  } catch {
    return false
  }
  if (
    resource.protocol !== 'https:'
    || resource.username !== ''
    || resource.password !== ''
    || resource.hash !== ''
    || resource.origin !== target.origin
    || resource.pathname !== target.pathname
  ) return false
  return method === 'GET' && queryMapped ? true : resource.href === target.href
}

function isSupportedX402TransferMethod(
  extra: Readonly<Record<string, unknown>>,
): boolean {
  const method = extra.assetTransferMethod
  return method === undefined || method === 'eip3009' || method === 'permit2'
}
