import { createFileRoute } from '@tanstack/react-router'
import { Agent, fetch as guardedFetch } from 'undici'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { readTrimmedEnv, type StringEnvironment } from '@/lib/server/read-trimmed-env'
import {
  type RouteTransportFetch,
  type RouteTransportInvocation,
  type X402PaymentAttemptEvent,
  type X402PaymentSignatureRequest,
  type X402PreparedAuthorization,
  type X402SettlementResponse,
} from '@/modules/capability-supply/route-transport-runtime'
import {
  createSandboxEvmX402PaymentSignature,
  readX402PaymentPayerAndNonce,
  verifyExactEvmX402Settlement,
} from '@/modules/capability-supply/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  createJitProviderConsequenceBoundary,
  ProviderConsequencePreReleaseRefusal,
  providerConsequenceTicketClaimsDigest,
  readX402EvmReceipt,
  type CanonicalProviderConsequenceTicket,
  type JitProviderX402RuntimeFactory,
  type ProviderConsequenceJournal,
  type ProviderConsequenceJsonValue,
} from '@/modules/capability-execution/invocation-runtime'
import {
  createProductionSecretRuntime,
  secretGeneration,
  secretRef,
  type ProductionSecretRuntimeOptions,
  type SecretGenerationProbe,
  type SecretPointer,
  type SecretPointerStore,
} from '@/modules/secrets/public'

const MAX_BODY_BYTES = 512 * 1024
const JOURNAL_TOKEN = /^[A-Za-z0-9_-]{43,128}$/u
const SIGNED_TICKET = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u

function isJsonValue(value: unknown): value is ProviderConsequenceJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isRecord(value) && Object.values(value).every(isJsonValue)
}

type ProviderInvocation = Extract<
  RouteTransportInvocation,
  Readonly<{ binding: Readonly<{ authority: Readonly<{ kind: 'provider_connection' }> }> }>
>

type PointerInput = Readonly<{
  secretRef: string
  activeGeneration: string
  pointerRevision: number
}>

type TicketEnvelope = Readonly<{
  ticket: CanonicalProviderConsequenceTicket
  ticketClaimsDigest: string
  signingSecret: PointerInput
  journalToken: string
}>

type TicketSigningRequest = TicketEnvelope & Readonly<{
  action: 'issue'
}>

type ConsequenceRequest = TicketEnvelope & Readonly<{
  action: 'execute'
  signedTicket: string
  invocation: ProviderInvocation
}>

export const Route = createFileRoute('/api/internal/provider-consequence')({
  server: {
    handlers: {
      POST: ({ request }) => handleProviderConsequenceRequest(request),
      GET: () => methodNotAllowed(['POST']),
      PUT: () => methodNotAllowed(['POST']),
      PATCH: () => methodNotAllowed(['POST']),
      DELETE: () => methodNotAllowed(['POST']),
      HEAD: () => methodNotAllowed(['POST']),
      OPTIONS: () => methodNotAllowed(['POST']),
      TRACE: () => methodNotAllowed(['POST']),
      CONNECT: () => methodNotAllowed(['POST']),
    },
  },
})

function noStore(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length
    && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function pointerInput(value: unknown): PointerInput | undefined {
  if (!isRecord(value) || !exactKeys(value, ['secretRef', 'activeGeneration', 'pointerRevision'])) return undefined
  try {
    return {
      secretRef: secretRef(value.secretRef as string),
      activeGeneration: secretGeneration(value.activeGeneration as string),
      pointerRevision: Number.isSafeInteger(value.pointerRevision) && Number(value.pointerRevision) >= 1
        ? Number(value.pointerRevision)
        : (() => { throw new TypeError('pointer_invalid') })(),
    }
  } catch {
    return undefined
  }
}

async function readRequest(request: Request): Promise<TicketSigningRequest | ConsequenceRequest | undefined> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return undefined
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return undefined
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return undefined
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!isRecord(value) || (value.action !== 'issue' && value.action !== 'execute')) return undefined
  const expectedKeys = value.action === 'issue'
    ? ['action', 'ticket', 'ticketClaimsDigest', 'signingSecret', 'journalToken']
    : ['action', 'ticket', 'ticketClaimsDigest', 'signingSecret', 'journalToken', 'signedTicket', 'invocation']
  if (!exactKeys(value, expectedKeys)) return undefined
  const signingSecret = pointerInput(value.signingSecret)
  if (!isRecord(value.ticket)
    || typeof value.ticketClaimsDigest !== 'string'
    || typeof value.journalToken !== 'string'
    || !JOURNAL_TOKEN.test(value.journalToken)
    || signingSecret === undefined) return undefined
  const ticket = value.ticket as CanonicalProviderConsequenceTicket
  let digest: string
  try {
    digest = providerConsequenceTicketClaimsDigest(ticket)
  } catch {
    return undefined
  }
  if (digest !== value.ticketClaimsDigest) return undefined
  const envelope: TicketEnvelope = {
    ticket,
    ticketClaimsDigest: digest,
    signingSecret,
    journalToken: value.journalToken,
  }
  if (value.action === 'issue') return { action: 'issue', ...envelope }
  if (!isRecord(value.invocation)
    || typeof value.signedTicket !== 'string'
    || !SIGNED_TICKET.test(value.signedTicket)) return undefined
  return {
    action: 'execute',
    ...envelope,
    signedTicket: value.signedTicket,
    invocation: value.invocation as ProviderInvocation,
  }
}

function required(environment: StringEnvironment, name: string): string {
  const value = readTrimmedEnv(environment, name)
  if (value === undefined) throw new TypeError('provider_consequence_configuration_invalid')
  return value
}

function vaultConfiguration(environment: StringEnvironment, scope: 'platform' | 'customer') {
  const prefix = scope === 'platform' ? 'AE_INFISICAL_PLATFORM' : 'AE_INFISICAL_CUSTOMER'
  const organizationSlug = readTrimmedEnv(environment, `${prefix}_ORGANIZATION_SLUG`)
  return {
    scope,
    baseUrl: required(environment, 'AE_INFISICAL_BASE_URL'),
    projectId: required(environment, `${prefix}_PROJECT_ID`),
    environment: required(environment, `${prefix}_ENVIRONMENT`),
    secretPath: required(environment, `${prefix}_SECRET_PATH`),
    machineIdentityId: required(environment, `${prefix}_MACHINE_IDENTITY_ID`),
    ...(organizationSlug === undefined ? {} : { organizationSlug }),
  } as const
}

function fixedPointerStore(...inputs: readonly PointerInput[]): SecretPointerStore {
  const pointers = new Map(inputs.map((input) => {
    const pointer: SecretPointer = Object.freeze({
      secretRef: secretRef(input.secretRef),
      activeGeneration: secretGeneration(input.activeGeneration),
      revision: input.pointerRevision,
    })
    return [pointer.secretRef, pointer] as const
  }))
  return Object.freeze({
    getActive: async (ref: SecretPointer['secretRef']) => pointers.get(ref),
    advanceActive: async () => { throw new TypeError('provider_consequence_pointer_read_only') },
  })
}

const unusedRotationProbe: SecretGenerationProbe = Object.freeze({
  validate: async () => { throw new TypeError('provider_consequence_rotation_not_available') },
})

function secretRuntimeOptions(
  request: TicketEnvelope,
  environment: StringEnvironment,
): ProductionSecretRuntimeOptions {
  return {
    configuration: {
      platform: vaultConfiguration(environment, 'platform'),
      customer: vaultConfiguration(environment, 'customer'),
    },
    platform: {
      pointerStore: fixedPointerStore(
        request.signingSecret,
        ...(request.ticket.paymentSecret === undefined ? [] : [request.ticket.paymentSecret]),
      ),
      generationProbe: unusedRotationProbe,
    },
    customer: {
      pointerStore: fixedPointerStore(request.ticket.secret),
      generationProbe: unusedRotationProbe,
    },
  }
}

function convexSiteOrigin(environment: StringEnvironment): string {
  const explicit = readTrimmedEnv(environment, 'CONVEX_SITE_URL')
  if (explicit !== undefined) {
    const url = new URL(explicit)
    if (url.protocol !== 'https:'
      || url.username.length > 0
      || url.password.length > 0
      || !url.hostname.endsWith('.convex.site')
      || url.origin !== explicit) throw new TypeError('provider_consequence_configuration_invalid')
    return url.origin
  }
  const deployment = required(environment, 'CONVEX_URL')
  const url = new URL(deployment)
  if (url.protocol !== 'https:'
    || url.username.length > 0
    || url.password.length > 0
    || url.origin !== deployment
    || !url.hostname.endsWith('.convex.cloud')) {
    throw new TypeError('provider_consequence_configuration_invalid')
  }
  url.hostname = `${url.hostname.slice(0, -'.convex.cloud'.length)}.convex.site`
  return url.origin
}

async function postConvex(
  origin: string,
  path: string,
  token: string,
  body: unknown,
): Promise<ProviderConsequenceJsonValue> {
  const { sendGuardedHttpRequest } = await import('@/modules/network-guard/server')
  const response = await sendGuardedHttpRequest(new Request(`${origin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }), MAX_BODY_BYTES)
  const value: unknown = await response.json().catch(() => undefined)
  if (!response.ok || !isJsonValue(value)) throw new Error('provider_consequence_convex_unavailable')
  return value
}

function journal(request: ConsequenceRequest, origin: string): ProviderConsequenceJournal {
  const { ticket, journalToken } = request
  return {
    begin: async (input) => {
      const result = await postConvex(
        origin,
        '/internal/provider-consequence/journal/begin',
        journalToken,
        {
        ticketRef: input.ticketRef,
        effectRef: input.effectRef,
        requestDigest: input.requestDigest,
        invocationDigest: input.invocationDigest,
        ticketClaimsDigest: input.ticketClaimsDigest,
        expiresAt: input.expiresAt,
        },
      )
      if (!isRecord(result)) throw new Error('provider_consequence_journal_invalid')
      return result
    },
    complete: async ({ claimRef, observation }) => {
      const result = await postConvex(
        origin,
        '/internal/provider-consequence/journal/complete',
        journalToken,
        { ticketRef: ticket.ticketRef, claimRef, observation },
      )
      if (!isRecord(result) || result.kind !== 'completed') throw new Error('provider_consequence_completion_unknown')
    },
    abortBeforeRelease: async ({ claimRef }) => {
      const result = await postConvex(
        origin,
        '/internal/provider-consequence/journal/abort',
        journalToken,
        { ticketRef: ticket.ticketRef, claimRef },
      )
      if (!isRecord(result) || result.kind !== 'aborted') throw new Error('provider_consequence_abort_unknown')
    },
  }
}

async function x402Rpc(
  request: ConsequenceRequest,
  origin: string,
  operation: string,
  args: Record<string, unknown>,
): Promise<ProviderConsequenceJsonValue | undefined> {
  const result = await postConvex(
    origin,
    '/internal/provider-consequence/x402',
    request.journalToken,
    { ticketRef: request.ticket.ticketRef, operation, args },
  )
  if (!isRecord(result) || result.kind !== 'result') throw new Error('provider_consequence_x402_unavailable')
  return result.value
}

function exactAmount(value: unknown): value is Readonly<{ currency: string; units: string; exponent: number }> {
  return isRecord(value)
    && typeof value.currency === 'string'
    && typeof value.units === 'string'
    && Number.isSafeInteger(value.exponent)
}

function x402RuntimeFactory(
  request: ConsequenceRequest,
  origin: string,
  secretOptions: ProductionSecretRuntimeOptions,
  dispatcher: Agent,
): JitProviderX402RuntimeFactory {
  const signatureCache = new Map<string, string>()
  return ({ ticket, invocation }) => {
    const authority = invocation.authority
    const paymentSecret = ticket.paymentSecret
    if (paymentSecret === undefined) throw new TypeError('payment_custody_unavailable')
    const credentialRef = paymentSecret.secretRef
    const readAuthorization = async (
      prepared: X402PreparedAuthorization,
      byDigest: boolean,
    ): Promise<string | undefined> => {
      const cached = signatureCache.get(prepared.authorizationDigest)
      if (cached !== undefined) return cached
      const value = await x402Rpc(
        request,
        origin,
        byDigest ? 'read_authorization_by_digest' : 'read_authorization',
        { ...prepared },
      )
      if (!isRecord(value)
        || value.state !== 'prepared'
        || value.dispatchRef !== ticket.invocationRef
        || value.attemptRef !== authority.attemptRef
        || value.effectGeneration !== authority.effectGeneration
        || value.operationRef !== ticket.operationRef
        || value.credentialRef !== credentialRef
        || typeof value.challengeJson !== 'string'
        || typeof value.selectedRequirementJson !== 'string'
        || typeof value.challengeDigest !== 'string') return undefined
      let paymentRequest: X402PaymentSignatureRequest
      try {
        const challenge = JSON.parse(value.challengeJson) as X402PaymentSignatureRequest['challenge']
        const selectedRequirement = JSON.parse(value.selectedRequirementJson) as X402PaymentSignatureRequest['selectedRequirement']
        if (canonicalDigest(challenge as StableHashValue) !== value.challengeDigest) return undefined
        paymentRequest = {
          challenge,
          selectedRequirement,
          paymentIdentifier: String(value.paymentIdentifier),
          credential: credentialRef,
        }
      } catch {
        return undefined
      }
      let signature: string | undefined
      const runtime = createProductionSecretRuntime(secretOptions)
      await runtime.consequences.platform.execute({ secretRef: credentialRef }, async (lease) => {
        await lease.useBytes(async (material) => {
          const credential = new TextDecoder().decode(material)
          signature = await createSandboxEvmX402PaymentSignature({ ...paymentRequest, credential })
        })
      })
      if (signature === undefined || signature.length === 0) return undefined
      await x402Rpc(request, origin, 'record_signature_digest', {
        custodyRef: prepared.custodyRef,
        authorizationDigest: prepared.authorizationDigest,
        paymentSignatureDigest: canonicalDigest(signature),
      })
      signatureCache.set(prepared.authorizationDigest, signature)
      return signature
    }
    return {
      readX402PaymentCredentialRef: async () => credentialRef,
      validateProviderConnectionAuthority: async (lookup) => (
        lookup.connectionRef === invocation.binding.authority.connectionRef
        && lookup.providerRef === ticket.providerRef
        && lookup.adapterId === ticket.adapterId
        && lookup.authorityGeneration === ticket.canonicalConnectionGeneration
        && lookup.authorityDigest === ticket.authorityDigest
        && lookup.leaseRef === ticket.leaseRef
        ? { kind: 'valid' as const }
        : { kind: 'unavailable' as const, reason: 'lease_identity_mismatch' as const }
      ),
      x402PaymentSigningAvailable: ({ credentialRef: connectionRef, maximumSpend }) => (
        connectionRef === invocation.binding.authority.connectionRef
        && exactAmount(maximumSpend)
        && exactAmount(invocation.authority.maximumSpend)
        && maximumSpend.currency === invocation.authority.maximumSpend.currency
        && maximumSpend.units === invocation.authority.maximumSpend.units
        && maximumSpend.exponent === invocation.authority.maximumSpend.exponent
      ),
      prepareX402PaymentAuthorization: async (paymentRequest) => {
        if (paymentRequest.attemptRef !== authority.attemptRef
          || paymentRequest.effectGeneration !== authority.effectGeneration
          || paymentRequest.paymentIdentifier !== authority.operationKeyDigest
          || paymentRequest.credential !== credentialRef) return undefined
        const reservation = await x402Rpc(request, origin, 'reserve_external_spend', {
          paymentIdentifier: paymentRequest.paymentIdentifier,
          challengeDigest: paymentRequest.challengeDigest,
          amount: paymentRequest.paymentAmount,
        })
        if (!isRecord(reservation) || reservation.kind !== 'accepted' || !isRecord(reservation.reservation)) return undefined
        const prepared = await x402Rpc(request, origin, 'prepare_authorization', {
          paymentIdentifier: paymentRequest.paymentIdentifier,
          operationKeyDigest: authority.operationKeyDigest,
          challengeDigest: paymentRequest.challengeDigest,
          challengeJson: JSON.stringify(paymentRequest.challenge),
          selectedRequirementJson: JSON.stringify(paymentRequest.selectedRequirement),
          providerEndpoint: paymentRequest.challenge.resource.url,
          scheme: paymentRequest.selectedRequirement.scheme,
          network: paymentRequest.selectedRequirement.network,
          asset: paymentRequest.selectedRequirement.asset,
          payTo: paymentRequest.selectedRequirement.payTo,
          amountUnits: paymentRequest.paymentAmount.units,
          currency: paymentRequest.paymentAmount.currency,
          exponent: paymentRequest.paymentAmount.exponent,
          reservationRef: reservation.reservation.reservationRef,
        })
        return isRecord(prepared)
          && typeof prepared.custodyRef === 'string'
          && typeof prepared.authorizationDigest === 'string'
          ? prepared as X402PreparedAuthorization
          : undefined
      },
      readX402PaymentAuthorization: async (prepared) => await readAuthorization(prepared, false),
      readX402PaymentAuthorizationByDigest: async (prepared) => await readAuthorization(prepared, true),
      beforeX402PaymentAuthorizationRead: async () => true,
      markX402PaymentPossiblySubmitted: async (event: X402PaymentAttemptEvent) => {
        await x402Rpc(request, origin, 'mark_possibly_submitted', { ...event })
      },
      observeX402PaymentAttempt: async (event) => {
        await x402Rpc(request, origin, 'observe_attempt', { ...event })
      },
      verifyX402Settlement: async ({ response, requirement, paymentSignature }) => {
        const authorization = readX402PaymentPayerAndNonce(paymentSignature)
        if (authorization === undefined) return false
        return verifyExactEvmX402Settlement({
          response: response as X402SettlementResponse,
          requirement,
          payer: authorization.payer,
          paymentNonce: authorization.nonce,
          receipt: await readX402EvmReceipt(
            requirement.network,
            response.transaction,
            dispatcher,
            'production',
            authorization.payer,
            authorization.nonce,
          ),
        })
      },
    }
  }
}

async function hmac(material: Uint8Array, message: string): Promise<string> {
  const keyBytes = Uint8Array.from(material)
  try {
    const key = await crypto.subtle.importKey('raw', keyBytes.buffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
    return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
  } finally {
    keyBytes.fill(0)
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

async function signedTicket(
  request: TicketEnvelope,
  options: ProductionSecretRuntimeOptions,
): Promise<string> {
  const message = signingMessage(request)
  let signature: string | undefined
  const runtime = createProductionSecretRuntime(options)
  await runtime.consequences.platform.execute({ secretRef: request.signingSecret.secretRef }, async (lease) => {
    await lease.useBytes(async (material) => {
      if (material.byteLength < 32) throw new TypeError('provider_consequence_signing_key_invalid')
      signature = await hmac(material, message)
    })
  })
  if (signature === undefined) throw new TypeError('provider_consequence_signing_unavailable')
  const opaque = `${request.ticket.ticketRef}.${request.ticket.expiresAt}.${signature}`
  if (!SIGNED_TICKET.test(opaque)) throw new TypeError('provider_consequence_ticket_invalid')
  return opaque
}

function signingMessage(request: TicketEnvelope): string {
  return [
    request.ticket.ticketRef,
    request.ticketClaimsDigest,
    request.ticket.expiresAt,
    request.signingSecret.secretRef,
    request.signingSecret.activeGeneration,
    request.signingSecret.pointerRevision,
  ].join(':')
}

async function verifySignedTicket(
  request: ConsequenceRequest,
  options: ProductionSecretRuntimeOptions,
): Promise<boolean> {
  const prefix = `${request.ticket.ticketRef}.${request.ticket.expiresAt}.`
  if (!request.signedTicket.startsWith(prefix)) return false
  const candidate = request.signedTicket.slice(prefix.length)
  if (!/^[0-9a-f]{64}$/u.test(candidate)) return false
  const message = signingMessage(request)
  let actual: string | undefined
  const runtime = createProductionSecretRuntime(options)
  await runtime.consequences.platform.execute({ secretRef: request.signingSecret.secretRef }, async (lease) => {
    await lease.useBytes(async (material) => {
      if (material.byteLength < 32) throw new TypeError('provider_consequence_signing_key_invalid')
      actual = await hmac(material, message)
    })
  })
  return actual !== undefined && constantTimeEqual(actual, candidate)
}

export async function handleProviderConsequenceRequest(
  rawRequest: Request,
  environment: StringEnvironment = process.env,
): Promise<Response> {
  const request = await readRequest(rawRequest)
  if (request === undefined) return noStore({ kind: 'unavailable' }, 400)
  let options: ProductionSecretRuntimeOptions
  let origin: string
  try {
    options = secretRuntimeOptions(request, environment)
    origin = convexSiteOrigin(environment)
  } catch {
    return noStore({ kind: 'unavailable' }, 503)
  }
  if (request.action === 'issue') {
    try {
      const attestation = await postConvex(
        origin,
        '/internal/provider-consequence/journal/attest',
        request.journalToken,
        {
          ticketRef: request.ticket.ticketRef,
          ticketClaimsDigest: request.ticketClaimsDigest,
          expiresAt: request.ticket.expiresAt,
          signingSecretRef: request.signingSecret.secretRef,
          signingSecretGeneration: request.signingSecret.activeGeneration,
          signingSecretPointerRevision: request.signingSecret.pointerRevision,
        },
      )
      if (!isRecord(attestation) || attestation.kind !== 'attested') {
        return noStore({ kind: 'unavailable' }, 409)
      }
      return noStore({ signedTicket: await signedTicket(request, options) }, 200)
    } catch {
      return noStore({ kind: 'unavailable' }, 503)
    }
  }
  const { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } =
    await import('@/modules/network-guard/public')
  const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
  const send: RouteTransportFetch = async (target, init) => {
    if (!await isPublicHttpTarget(target, defaultDnsResolver)) {
      throw new ProviderConsequencePreReleaseRefusal()
    }
    return await guardedFetch(target, { ...init, dispatcher })
  }
  try {
    const verifyTicket = async (candidate: string): Promise<CanonicalProviderConsequenceTicket | undefined> => {
      if (candidate !== request.signedTicket) return undefined
      return await verifySignedTicket(request, options) ? request.ticket : undefined
    }
    const boundary = createJitProviderConsequenceBoundary({
      verifyTicket,
      journal: journal(request, origin),
      secretRuntime: options,
      send,
      createCallbackScopedX402Runtime: x402RuntimeFactory(request, origin, options, dispatcher),
    })
    const observation = await boundary.execute({ ticket: request.signedTicket, invocation: request.invocation })
    return noStore(observation, 200)
  } catch {
    return noStore({ kind: 'unavailable' }, 503)
  } finally {
    await dispatcher.close().catch(() => undefined)
  }
}
