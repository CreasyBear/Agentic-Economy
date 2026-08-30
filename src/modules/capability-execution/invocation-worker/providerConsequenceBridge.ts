import {
  parseRouteTransportObservationJson,
  type RouteTransportInvocation,
  type RouteTransportObservation,
} from '@/modules/capability-supply/route-transport-runtime'
import type { ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'
import {
  providerConsequenceInvocationDigest,
  type CanonicalProviderConsequenceTicket,
} from './jitProviderConsequence'
import { sendGuardedHttpRequest } from '@/modules/network-guard/server'

const SECRET_REF = /^sec_[0-9a-f]{32}$/u
const HTTPS_ORIGIN = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/u
const MAXIMUM_BRIDGE_RESPONSE_BYTES = 512 * 1024

type ProviderInvocation = Extract<
  RouteTransportInvocation,
  Readonly<{ binding: Readonly<{ authority: Readonly<{ kind: 'provider_connection' }> }> }>
>

type AdmittedProviderInvocation = ProviderInvocation & Readonly<{
  authority: ProviderInvocation['authority'] & Readonly<{
    leaseRef: string
    invocationRef: string
    operationRef: string
    attemptRef: string
    effectGeneration: number
    operationKeyDigest: string
    grantedScopes: readonly string[]
    grantedResources: readonly string[]
    readinessValidUntil: number
  }>
}>

function transport(adapterId: string): RouteTransportObservation['transport'] {
  if (adapterId === 'mcp-jsonrpc:v1') return 'mcp'
  if (adapterId === 'x402-fetch:v2') return 'x402'
  return 'http'
}

function refused(
  invocation: RouteTransportInvocation,
  requestDigest: string,
  failureCode: string,
): RouteTransportObservation {
  return {
    transport: transport(invocation.binding.adapterId),
    disposition: 'refused',
    releaseStarted: false,
    requestDigest,
    failureCode,
  }
}

function unknown(
  invocation: RouteTransportInvocation,
  requestDigest: string,
  failureCode: string,
): RouteTransportObservation {
  return {
    transport: transport(invocation.binding.adapterId),
    disposition: 'unknown',
    releaseStarted: true,
    requestDigest,
    failureCode,
  }
}

function exactObservation(
  invocation: RouteTransportInvocation,
  requestDigest: string,
  observationJson: string,
  failureCode: string,
): RouteTransportObservation {
  const observation = parseRouteTransportObservationJson(observationJson)
  return observation?.requestDigest === requestDigest
    ? observation
    : unknown(invocation, requestDigest, failureCode)
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Buffer.from(bytes).toString('base64url')
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return `sha256:${Buffer.from(bytes).toString('hex')}`
}

function consequenceEndpoint(): string | undefined {
  const raw = process.env.AE_PROVIDER_CONSEQUENCE_ORIGIN?.trim()
  if (raw === undefined || !HTTPS_ORIGIN.test(raw)) return undefined
  try {
    const url = new URL(raw)
    return url.origin === raw ? `${raw}/api/internal/provider-consequence` : undefined
  } catch {
    return undefined
  }
}

export function providerConsequenceX402PaymentCustodyAvailable(): boolean {
  const paymentSecretRef = process.env.AE_X402_PAYMENT_SECRET_REF?.trim()
  return paymentSecretRef !== undefined && SECRET_REF.test(paymentSecretRef)
}

function providerInvocation(value: RouteTransportInvocation): value is AdmittedProviderInvocation {
  if (value.binding.authority.kind !== 'provider_connection') return false
  const authority = value.authority as ProviderInvocation['authority']
  return authority.leaseRef !== undefined
    && authority.invocationRef !== undefined
    && authority.operationRef !== undefined
    && authority.attemptRef !== undefined
    && authority.effectGeneration !== undefined
    && authority.operationKeyDigest !== undefined
    && authority.grantedScopes !== undefined
    && authority.grantedResources !== undefined
    && authority.readinessValidUntil !== undefined
}

export async function invokeProviderConsequenceViaVercel(
  ctx: ActionCtx,
  input: Readonly<{
    invocation: RouteTransportInvocation
    requestDigest: string
  }>,
): Promise<RouteTransportObservation> {
  if (!providerInvocation(input.invocation)) {
    return refused(input.invocation, input.requestDigest, 'provider_consequence_authority_invalid')
  }
  const invocation = input.invocation
  const signingSecretRef = process.env.AE_PROVIDER_TICKET_SIGNING_SECRET_REF?.trim()
  const paymentSecretRef = process.env.AE_X402_PAYMENT_SECRET_REF?.trim()
  const endpoint = consequenceEndpoint()
  if (signingSecretRef === undefined
    || !SECRET_REF.test(signingSecretRef)
    || (invocation.binding.adapterId === 'x402-fetch:v2'
      && (paymentSecretRef === undefined || !SECRET_REF.test(paymentSecretRef)))
    || endpoint === undefined) {
    return refused(invocation, input.requestDigest, 'provider_consequence_runtime_unavailable')
  }
  const journalToken = randomToken()
  const ticketRef = `provider-ticket:${crypto.randomUUID()}`
  const commandId = `provider-effect:${invocation.authority.invocationRef}:${invocation.authority.attemptRef}:${invocation.authority.effectGeneration}`
  const invocationDigest = providerConsequenceInvocationDigest(invocation)
  if (invocationDigest === undefined) {
    return refused(invocation, input.requestDigest, 'provider_consequence_authority_invalid')
  }
  let issue: Awaited<ReturnType<ActionCtx['runMutation']>>
  try {
    issue = await ctx.runMutation(
      internal.capabilityProviderConsequenceJournal.issueProviderConsequenceTicket,
      {
      ticketRef,
      commandId,
      journalTokenDigest: await sha256(journalToken),
      requestDigest: input.requestDigest,
      invocationDigest,
      operationKeyDigest: invocation.authority.operationKeyDigest,
      invocationRef: invocation.authority.invocationRef,
      operationRef: invocation.authority.operationRef,
      attemptRef: invocation.authority.attemptRef,
      effectGeneration: invocation.authority.effectGeneration,
      leaseRef: invocation.authority.leaseRef,
      providerRef: invocation.binding.authority.providerRef,
      adapterId: invocation.binding.adapterId,
      authorityDigest: invocation.authority.authorityDigest,
      grantedScopes: [...invocation.authority.grantedScopes],
      grantedResources: [...invocation.authority.grantedResources],
      readinessValidUntil: invocation.authority.readinessValidUntil,
      ...(invocation.authority.readinessDigest === undefined
        ? {}
        : { readinessDigest: invocation.authority.readinessDigest }),
      signingSecretRef,
      ...(invocation.binding.adapterId === 'x402-fetch:v2' && paymentSecretRef !== undefined
        ? { paymentSecretRef }
        : {}),
      requestedExpiresAt: invocation.authority.expiresAt,
      },
    )
  } catch {
    return refused(invocation, input.requestDigest, 'provider_consequence_ticket_unavailable')
  }
  if (issue.kind === 'completed') {
    return exactObservation(
      invocation,
      input.requestDigest,
      issue.observationJson,
      'provider_consequence_replay_invalid',
    )
  }
  if (issue.kind === 'started') {
    return unknown(invocation, input.requestDigest, 'provider_consequence_started')
  }
  if (issue.kind !== 'issued') {
    return refused(invocation, input.requestDigest, 'provider_consequence_ticket_unavailable')
  }
  const envelope = {
    ticket: issue.ticket as CanonicalProviderConsequenceTicket,
    ticketClaimsDigest: issue.ticketClaimsDigest,
    signingSecret: issue.signingSecret,
    journalToken,
  }
  let signedTicket: string
  try {
    const signingResponse = await sendGuardedHttpRequest(new Request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'issue', ...envelope }),
    }), MAXIMUM_BRIDGE_RESPONSE_BYTES)
    const signingResult: unknown = await signingResponse.json()
    if (!signingResponse.ok
      || typeof signingResult !== 'object'
      || signingResult === null
      || Object.keys(signingResult).length !== 1
      || typeof (signingResult as { signedTicket?: unknown }).signedTicket !== 'string') {
      return refused(invocation, input.requestDigest, 'provider_consequence_ticket_signing_unavailable')
    }
    signedTicket = (signingResult as { signedTicket: string }).signedTicket
  } catch {
    return refused(invocation, input.requestDigest, 'provider_consequence_ticket_signing_unavailable')
  }
  let response: Response
  try {
    response = await sendGuardedHttpRequest(new Request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'execute', ...envelope, signedTicket, invocation }),
    }), MAXIMUM_BRIDGE_RESPONSE_BYTES)
  } catch {
    return unknown(invocation, input.requestDigest, 'provider_consequence_bridge_unknown')
  }
  if (!response.ok) return unknown(invocation, input.requestDigest, 'provider_consequence_bridge_unknown')
  let observationJson: string
  try {
    observationJson = JSON.stringify(await response.json())
  } catch {
    return unknown(invocation, input.requestDigest, 'provider_consequence_bridge_unknown')
  }
  return exactObservation(
    invocation,
    input.requestDigest,
    observationJson,
    'provider_consequence_bridge_unknown',
  )
}
