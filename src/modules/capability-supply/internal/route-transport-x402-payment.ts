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
import type { PaymentRequired } from '@x402/core/types'
import { isProviderConnectionCredentialRef } from '../provider-connection'
import type {
  ProviderConnectionAuthorityValidationResult,
  RouteTransportInvocation,
  RouteTransportRuntime,
} from './route-transport-invoke'
import {
  decodeX402PaymentRequiredHeader,
  validateX402PaymentRequired,
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
import {
  isProviderRouteTransportAuthority,
  providerAuthorityFailure,
} from './route-transport-http-json'
import type {
  X402Configuration,
  X402PaymentAuthorizationIdentity,
  X402PaymentSignatureRequest,
  X402PreparedAuthorization,
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

export async function validateX402ProviderAuthority(
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

export async function prepareX402PaymentMaterial(
  endpoint: URL,
  configuration: X402Configuration,
  invocation: RouteTransportInvocation,
  requestDigest: string,
  runtime: RouteTransportRuntime,
  target: URL | undefined,
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
  const authorityFailure = await validateX402ProviderAuthority(invocation, runtime)
  if (authorityFailure !== undefined) {
    return {
      kind: 'refused',
      observation: refused('x402', requestDigest, false, authorityFailure),
    }
  }
  const challenge = decodePinnedX402Challenge(configuration.paymentRequired)
  if (challenge === undefined) {
    return {
      kind: 'refused',
      observation: refused('x402', requestDigest, false, 'payment_challenge_invalid'),
    }
  }
  const paymentChallengeDigest = canonicalDigest(challenge as StableHashValue)
  const requirement = challenge.accepts.find(
    (candidate) =>
      candidate.scheme === configuration.scheme
      && candidate.network === configuration.network
      && candidate.asset.toLowerCase() === configuration.asset.toLowerCase()
      && candidate.payTo.toLowerCase() === configuration.payTo.toLowerCase(),
  )
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
    !x402ResourceUrlBindsTarget(
      challenge.resource.url,
      target,
      configuration.method,
      configuration.query !== undefined,
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
    && Object.prototype.hasOwnProperty.call(challenge.extensions, 'offer-receipt')
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

export async function preparePinnedX402PaymentAuthorization(
  endpoint: URL,
  configuration: X402Configuration,
  invocation: RouteTransportInvocation,
  requestDigest: string,
  runtime: RouteTransportRuntime,
  target: URL | undefined,
): Promise<
  | Readonly<{ kind: 'prepared'; authorization: X402PreparedAuthorization }>
  | Readonly<{ kind: 'refused'; failureCode: string }>
> {
  const materialResult = await prepareX402PaymentMaterial(
    endpoint,
    configuration,
    invocation,
    requestDigest,
    runtime,
    target,
  )
  if (materialResult.kind === 'refused') {
    return {
      kind: 'refused',
      failureCode: materialResult.observation.failureCode ?? 'payment_challenge_invalid',
    }
  }
  let authorization: X402PreparedAuthorization | undefined
  try {
    authorization = await runtime.prepareX402PaymentAuthorization?.({
      challenge: materialResult.material.challenge,
      credential: materialResult.material.paymentCredentialRef,
      selectedRequirement: materialResult.material.requirement,
      ...materialResult.material.authorizationIdentity,
    })
  } catch {
    authorization = undefined
  }
  return authorization === undefined
    ? { kind: 'refused', failureCode: 'payment_signature_unavailable' }
    : { kind: 'prepared', authorization }
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

function decodePinnedX402Challenge(value: unknown): X402Challenge | undefined {
  try {
    return validateX402Challenge(validateX402PaymentRequired(value))
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

function paymentRequiredFromChallenge(challenge: X402Challenge): PaymentRequired {
  return {
    x402Version: challenge.x402Version,
    resource: { ...challenge.resource },
    accepts: challenge.accepts.map((candidate) => ({
      ...candidate,
      extra: { ...candidate.extra },
    })),
    ...(challenge.extensions === undefined ? {} : { extensions: { ...challenge.extensions } }),
  } as PaymentRequired
}

function expectedX402Amount(
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

function x402ResourceUrlBindsTarget(
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
