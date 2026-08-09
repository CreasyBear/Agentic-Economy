"use node";

import { v } from 'convex/values'
import { Agent, fetch as guardedFetch } from 'undici'

import {
  claimCanonicalInvocation,
  persistCanonicalReleaseFence,
  persistCanonicalTerminalOutcome,
  type CanonicalClaimCommand,
  type CanonicalClaimInput,
  type CanonicalClaimSnapshot,
  type CanonicalTerminalOutcome,
  type CustomerRequestCanonicalClaimMaterial,
  type DurableActionInvocationPort,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  invokeRegisteredRouteCancellation,
  type ProviderConnectionAuthorityReader,
  type RouteTransportCancellationInvocation,
  type RouteTransportCancellationObservation,
  type RouteTransportFetch,
  type RouteTransportInvocation,
} from '@/modules/capability-supply/route-transport-runtime'
import { signRouteTransportCall } from '@/modules/capability-supply/server'
import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'
import type { ExactAmount } from '@/modules/money/public'

import { internal } from './_generated/api'
import { env, internalAction, type ActionCtx } from './_generated/server'
type CancellationConnectionAuthority = Readonly<{
  connectionRef: string
  providerRef: string
  adapterId: string
  authorityGeneration: number
  authorityDigest: string
  operationRef: string
  grantedScopes: string[]
  grantedResources: string[]
}>
type OpenCancellationBinding =
  | Readonly<{
    adapterId: string
    endpointUrl: string
    authority: Readonly<{ kind: 'keyless' }>
    configJson: string
    configDigest: string
  }>
  | Readonly<{
    adapterId: string
    endpointUrl: string
    authority: Readonly<{
      kind: 'provider_connection'
      connectionRef: string
      providerRef: string
    }>
    connectionAuthority: CancellationConnectionAuthority
    configJson: string
    configDigest: string
  }>
type OpenCancellationInvocation = Readonly<{
  cancellationRef: string
  attemptRef: string
  operationKeyDigest: string
  binding: OpenCancellationBinding
  authority: Readonly<{
    mandateDigest: string
    grantDigest: string
    capabilityContractDigest: string
    maximumSpend: ExactAmount
    expiresAt: number
  }>
  canonical: CustomerRequestCanonicalClaimMaterial
}>

type OpenCancellation = Readonly<
  | { kind: 'available'; invocation: OpenCancellationInvocation }
  | { kind: 'unavailable' }
>
type CanonicalPort = Pick<
  DurableActionInvocationPort,
  'transact' | 'readControl' | 'readAttempt'
>

export const run = internalAction({
  args: { cancellationRef: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const openedValue = await ctx.runQuery(
      internal.customerRequestRouteExecution.openCancellationAttempt,
      { cancellationRef: args.cancellationRef },
    )
    if (!isOpenCancellation(openedValue) || openedValue.kind !== 'available') return null
    const opened = openedValue

    const canonical = opened.invocation.canonical
    const claimInput: CanonicalClaimInput = {
      ...canonical,
      expectedInvocationVersion: null,
    }
    const port = canonicalPort(ctx)
    const claimed = await claimCanonicalInvocation(claimInput, port)
    if (claimed.kind !== 'claimed') return null
    const claimedSnapshot = await readCanonicalSnapshot(port, canonical)
    if (claimedSnapshot === undefined) return null

    const readProviderCredential = readProviderConnectionCredentialRef(ctx)
    const resolveCredential = credentialFromEnvironment
    const binding = transportBindingFromRouteBinding(opened.invocation.binding)
    const signing = routeCallSigningKey()
    const callIdentity = signing === undefined ? undefined : signRouteTransportCall({
      dispatchRef: opened.invocation.cancellationRef,
      attemptRef: opened.invocation.attemptRef,
      operationKeyDigest: opened.invocation.operationKeyDigest,
      mandateDigest: opened.invocation.authority.mandateDigest,
      grantDigest: opened.invocation.authority.grantDigest,
      capabilityContractDigest: opened.invocation.authority.capabilityContractDigest,
      inputDigest: opened.invocation.cancellationRef,
      binding,
      maximumSpend: opened.invocation.authority.maximumSpend,
      expiresAt: opened.invocation.authority.expiresAt,
    }, signing)
    if (callIdentity === undefined) {
      const observation: RouteTransportCancellationObservation = {
        disposition: 'rejected',
        requestDigest: canonical.materialInputDigest,
        failureCode: 'call_signing_unavailable',
      }
      await convergeTerminalAndProjection(ctx, args.cancellationRef, claimedSnapshot, observation, port)
      return null
    }

    const fenceResult = await persistCanonicalReleaseFence(
      { snapshot: claimedSnapshot, recordedAt: canonical.recordedAt },
      port,
    )
    if (fenceResult.kind !== 'applied') return null
    const fencedSnapshot = await readCanonicalSnapshot(port, canonical)
    if (fencedSnapshot === undefined) return null

    const endpoint = safeUrl(opened.invocation.binding.endpointUrl)
    const publicTarget = endpoint !== undefined
      && await isPublicHttpTarget(endpoint, defaultDnsResolver).catch(() => false)
    const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
    const send: RouteTransportFetch = async (input, init) => (
      await guardedFetch(input, { ...init, dispatcher })
    )
    try {
      const observation = !publicTarget
        ? {
            disposition: 'unknown' as const,
            requestDigest: opened.invocation.cancellationRef,
            failureCode: 'endpoint_not_public',
          }
        : await invokeCancellation(
            opened.invocation,
            callIdentity,
            send,
            resolveCredential,
            readProviderCredential,
          )
      await convergeTerminalAndProjection(
        ctx, args.cancellationRef, fencedSnapshot, observation, port,
      )
      return null
    } finally {
      await dispatcher.close().catch(() => undefined)
    }
  },
})
function isOpenCancellation(value: unknown): value is OpenCancellation {
  return isRecord(value) && (value.kind === 'available' || value.kind === 'unavailable')
}


function canonicalPort(ctx: ActionCtx): CanonicalPort {
  return {
    transact: async (command: CanonicalClaimCommand) => {
      const {
        commandId,
        commandDigest,
        expectedInvocationVersion,
        expectedEffectGeneration,
        row,
        currentAttemptWrite,
        history,
      } = command
      const mutableRow = {
        ...row,
        control: {
          ...row.control,
          control: row.control.control.state === 'gathering_information'
            ? {
                ...row.control.control,
                missingFields: [...row.control.control.missingFields],
              }
            : row.control.control,
        },
      }
      return await ctx.runMutation(internal.actionInvocationControl.transact, {
        commandId,
        commandDigest,
        expectedInvocationVersion,
        ...(expectedEffectGeneration === undefined ? {} : { expectedEffectGeneration }),
        row: mutableRow,
        ...(currentAttemptWrite === undefined ? {} : { currentAttemptWrite }),
        history,
      })
    },
    readControl: async (invocationRef: string) => (
      await ctx.runQuery(internal.actionInvocationControl.readControl, { invocationRef }) ?? undefined
    ),
    readAttempt: async (invocationRef: string, attemptRef: string) => (
      await ctx.runQuery(internal.actionInvocationControl.readAttempt, { invocationRef, attemptRef }) ?? undefined
    ),
  }
}

async function readCanonicalSnapshot(
  port: CanonicalPort,
  canonical: CustomerRequestCanonicalClaimMaterial,
): Promise<CanonicalClaimSnapshot | undefined> {
  const control = await port.readControl(canonical.invocationRef)
  if (control === undefined || control.currentAttemptRef !== canonical.attempt.attemptRef) {
    return undefined
  }
  const attempt = await port.readAttempt(canonical.invocationRef, canonical.attempt.attemptRef)
  return attempt === undefined ? undefined : { control, attempt }
}

async function convergeTerminalAndProjection(
  ctx: ActionCtx,
  cancellationRef: string,
  snapshot: CanonicalClaimSnapshot,
  observation: RouteTransportCancellationObservation,
  port: CanonicalPort,
): Promise<void> {
  const terminalAtMs = Date.now()
  const terminalAt = new Date(terminalAtMs).toISOString()
  const terminal = canonicalTerminalOutcome(observation, terminalAt)
  const persisted = await persistCanonicalTerminalOutcome({
    snapshot,
    outcome: terminal,
    recordedAt: terminalAt,
  }, port)
  if (persisted.kind === 'refused') return
  await ctx.runMutation(internal.customerRequestRouteExecution.resolveCancellationAttempt, {
    cancellationRef,
    observation,
  })
}

function canonicalTerminalOutcome(
  observation: RouteTransportCancellationObservation,
  recordedAt: string,
): CanonicalTerminalOutcome {
  const evidenceDigest = canonicalDigest(observation as StableHashValue)
  if (observation.disposition === 'accepted') {
    return {
      kind: 'returned',
      businessOutcome: 'cancellation_accepted',
      resultRef: `route-cancellation-result:v1:${evidenceDigest}`,
      resultDigest: evidenceDigest,
      resultReferenceable: false,
      release: 'released',
    }
  }
  if (observation.disposition === 'rejected' || observation.disposition === 'unsupported') {
    return {
      kind: 'failed',
      errorDigest: evidenceDigest,
      release: 'not_released',
    }
  }
  return {
    kind: 'uncertain',
    errorDigest: evidenceDigest,
    reconciliationRequiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
    release: 'possibly_released',
  }
}

async function invokeCancellation(
  invocation: OpenCancellationInvocation,
  callIdentity: Readonly<{ keyId: string; signature: string }>,
  send: RouteTransportFetch,
  resolveCredential: (reference: string) => string | undefined,
  readProviderCredential: ProviderConnectionAuthorityReader,
): Promise<RouteTransportCancellationObservation> {
  try {
    const authority = {
      ...invocation.authority,
      attemptRef: invocation.attemptRef,
      operationKeyDigest: invocation.operationKeyDigest,
      callIdentity,
    }
    if (invocation.binding.authority.kind === 'keyless') {
      const binding = {
        adapterId: invocation.binding.adapterId,
        endpointUrl: invocation.binding.endpointUrl,
        authority: invocation.binding.authority,
        configJson: invocation.binding.configJson,
        configDigest: invocation.binding.configDigest,
      }
      return await invokeRegisteredRouteCancellation(
        {
          binding,
          authority,
          cancellationRequestRef: invocation.cancellationRef,
        } satisfies RouteTransportCancellationInvocation,
        { send, resolveCredential, readProviderConnectionCredentialRef: readProviderCredential },
      )
    }
    if (!('connectionAuthority' in invocation.binding)) {
      return {
        disposition: 'unknown',
        requestDigest: invocation.cancellationRef,
        failureCode: 'connection_authority_snapshot_invalid',
      }
    }
    const connectionAuthority = invocation.binding.connectionAuthority
    const binding = {
      adapterId: invocation.binding.adapterId,
      endpointUrl: invocation.binding.endpointUrl,
      authority: invocation.binding.authority,
      configJson: invocation.binding.configJson,
      configDigest: invocation.binding.configDigest,
    }
    return await invokeRegisteredRouteCancellation(
      {
        binding,
        authority: {
          ...authority,
          authorityGeneration: connectionAuthority.authorityGeneration,
          authorityDigest: connectionAuthority.authorityDigest,
        },
        cancellationRequestRef: invocation.cancellationRef,
      } satisfies RouteTransportCancellationInvocation,
      { send, resolveCredential, readProviderConnectionCredentialRef: readProviderCredential },
    )
  } catch (error) {
    return {
      disposition: 'unknown',
      requestDigest: invocation.cancellationRef,
      failureCode: `cancellation_worker_${errorName(error)}`,
    }
  }
}

type KeylessRouteTransportBinding = Extract<
  RouteTransportInvocation['binding'],
  { readonly authority: { readonly kind: 'keyless' } }
>
type ProviderRouteTransportBinding = Extract<
  RouteTransportInvocation['binding'],
  { readonly authority: { readonly kind: 'provider_connection' } }
>
type KeylessRouteExecutionBinding = Extract<
  OpenCancellationBinding,
  { readonly authority: { readonly kind: 'keyless' } }
>
type ProviderRouteExecutionBinding = Extract<
  OpenCancellationBinding,
  { readonly authority: { readonly kind: 'provider_connection' } }
>

function transportBindingFromRouteBinding(binding: KeylessRouteExecutionBinding): KeylessRouteTransportBinding
function transportBindingFromRouteBinding(binding: ProviderRouteExecutionBinding): ProviderRouteTransportBinding
function transportBindingFromRouteBinding(binding: OpenCancellationBinding): RouteTransportInvocation['binding']
function transportBindingFromRouteBinding(binding: OpenCancellationBinding): RouteTransportInvocation['binding'] {
  if (binding.authority.kind === 'keyless') {
    return {
      adapterId: binding.adapterId,
      endpointUrl: binding.endpointUrl,
      authority: binding.authority,
      configJson: binding.configJson,
      configDigest: binding.configDigest,
    }
  }
  return {
    adapterId: binding.adapterId,
    endpointUrl: binding.endpointUrl,
    authority: binding.authority,
    configJson: binding.configJson,
    configDigest: binding.configDigest,
  }
}

function readProviderConnectionCredentialRef(ctx: ActionCtx): ProviderConnectionAuthorityReader {
  return async ({ connectionRef, providerRef, adapterId, authorityGeneration, authorityDigest }) => {
    const connection = await ctx.runQuery(internal.capabilityProviderConnections.read, { connectionRef })
    if (connection === null
      || connection.providerRef !== providerRef
      || connection.adapterId !== adapterId) {
      return { kind: 'unavailable' as const, reason: 'digest_mismatch' as const }
    }
    return await ctx.runQuery(internal.capabilityProviderConnections.resolveCredentialRef, {
      connectionRef,
      expectedAuthorityGeneration: authorityGeneration,
      expectedAuthorityDigest: authorityDigest,
      now: Date.now(),
    })
  }
}

function routeCallSigningKey(): Readonly<{ keyId: string; secret: string }> | undefined {
  const secret = env.AE_ROUTE_CALL_SIGNING_SECRET
  const keyId = env.AE_ROUTE_CALL_SIGNING_KEY_ID
  return secret === undefined || secret.trim().length === 0 || keyId === undefined || keyId.trim().length === 0
    ? undefined
    : { keyId, secret }
}

function credentialFromEnvironment(reference: string): string | undefined {
  const match = /^env:([A-Z][A-Z0-9_]{1,199})$/.exec(reference)
  return match?.[1] === undefined ? undefined : readTrimmedEnv(process.env, match[1])
}

function safeUrl(value: string): URL | undefined {
  try { return new URL(value) } catch { return undefined }
}

function errorName(error: unknown): string {
  return error instanceof Error && error.name.trim().length > 0 ? error.name : 'unknown'
}
