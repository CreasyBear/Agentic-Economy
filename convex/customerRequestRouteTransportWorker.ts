"use node";

import { v, type Infer } from 'convex/values'
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
import type { RouteExecutionBinding } from '@/modules/customer-request/route-execution/machines/types'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'
import {
  invokePreparedRouteTransport,
  prepareRegisteredRouteTransportInvocation,
  type ProviderConnectionAuthorityReader,
  type ProviderConnectionAuthorityValidator,
  type RouteTransportFetch,
  type RouteTransportInvocation,
  type RouteTransportObservation,
  type X402PaymentSignatureRequest,
  type X402PreparedAuthorization,
  type X402RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import {
  createEvmX402PaymentSignature,
  credentialFromEnvironment,
  signRouteTransportCall,
  x402PaymentCredentialRefFromEnvironment,
} from '@/modules/capability-supply/server'
import type { ExactAmount } from '@/modules/money/public'

import { internal } from './_generated/api'
import { env, internalAction, type ActionCtx } from './_generated/server'

const workerResult = v.union(
  v.object({ kind: v.literal('none') }),
  v.object({ kind: v.literal('completed'), disposition: v.union(
    v.literal('succeeded'), v.literal('refused'), v.literal('partial'), v.literal('unknown'),
  ) }),
  v.object({ kind: v.literal('refused') }),
)
type OpenDispatchInvocation = Readonly<{
  dispatchRef: string
  attemptRef: string
  runRef: string
  operationKeyDigest: string
  inputJson: string
  inputDigest: string
  binding: RouteExecutionBinding
  authority: Readonly<{
    mandateDigest: string
    grantDigest: string
    capabilityContractDigest: string
    maximumSpend: ExactAmount
    expiresAt: number
  }>
  canonical: CustomerRequestCanonicalClaimMaterial
}>

type OpenDispatch = Readonly<
  | { kind: 'available'; invocation: OpenDispatchInvocation }
  | { kind: 'unavailable' }
>

type CanonicalPort = Pick<
  DurableActionInvocationPort,
  'transact' | 'readControl' | 'readAttempt'
>

type WorkerResult = Infer<typeof workerResult>


export const run = internalAction({
  args: { dispatchRef: v.string() },
  returns: workerResult,
  handler: async (ctx, args): Promise<Infer<typeof workerResult>> => {
    const opened: OpenDispatch = await ctx.runQuery(
      internal.customerRequestRouteExecution.openDispatch,
      { dispatchRef: args.dispatchRef },
    )
    if (opened.kind !== 'available') return { kind: 'none' as const }

    const canonical = opened.invocation.canonical
    const port = canonicalPort(ctx)
    const claimInput: CanonicalClaimInput = {
      ...canonical,
      expectedInvocationVersion: null,
    }
    const claim = await claimCanonicalInvocation(claimInput, port)
    if (claim.kind !== 'claimed') return { kind: 'none' as const }
    const claimed = await readCanonicalSnapshot(port, canonical)
    if (claimed === undefined) return { kind: 'none' as const }

    if (opened.invocation.authority.expiresAt <= Date.now()) {
      return await convergePreReleaseAndProjection(
        ctx,
        opened.invocation,
        claimed,
        preReleaseObservation(opened.invocation.canonical.materialInputDigest, 'authority_expired_before_release'),
        port,
      )
    }
    if (opened.invocation.binding.authority.kind === 'provider_connection'
      && opened.invocation.binding.connectionAuthority === undefined) {
      return await convergePreReleaseAndProjection(
        ctx,
        opened.invocation,
        claimed,
        preReleaseObservation(
          opened.invocation.canonical.materialInputDigest,
          'connection_authority_snapshot_invalid',
        ),
        port,
      )
    }

    const readProviderCredential = readProviderConnectionCredentialRef(ctx)
    const resolveCredential = credentialFromEnvironment
    const binding = transportBindingFromRouteBinding(opened.invocation.binding)
    const signing = routeCallSigningKey()
    const callIdentity = signing === undefined ? undefined : signRouteTransportCall({
      dispatchRef: opened.invocation.dispatchRef,
      attemptRef: opened.invocation.attemptRef,
      operationKeyDigest: opened.invocation.operationKeyDigest,
      mandateDigest: opened.invocation.authority.mandateDigest,
      grantDigest: opened.invocation.authority.grantDigest,
      capabilityContractDigest: opened.invocation.authority.capabilityContractDigest,
      inputDigest: opened.invocation.canonical.materialInputDigest,
      binding,
      maximumSpend: opened.invocation.authority.maximumSpend,
      expiresAt: opened.invocation.authority.expiresAt,
    }, signing)
    const invocation: RouteTransportInvocation | undefined = callIdentity === undefined
      ? undefined
      : routeTransportInvocation(opened.invocation, canonical.attempt.effectGeneration, callIdentity)
    if (invocation === undefined) {
      return await convergePreReleaseAndProjection(
        ctx,
        opened.invocation,
        claimed,
        preReleaseObservation(opened.invocation.canonical.materialInputDigest, 'call_signing_unavailable'),
        port,
      )
    }

    const preparation = prepareRegisteredRouteTransportInvocation(
      invocation,
      invocation.binding.adapterId === 'x402-fetch:v2'
        ? () => x402PaymentCredentialRefFromEnvironment() !== undefined
        : undefined,
    )
    if (preparation.kind === 'refused') {
      return await convergePreReleaseAndProjection(
        ctx,
        opened.invocation,
        claimed,
        preparation.observation,
        port,
      )
    }

    const fenceResult = await persistCanonicalReleaseFence({
      snapshot: claimed,
      recordedAt: new Date().toISOString(),
    }, port)
    if (fenceResult.kind === 'refused') return { kind: 'refused' as const }
    const fenced = await readCanonicalSnapshot(port, canonical)
    if (fenced === undefined) return { kind: 'none' as const }

    const dispatched: { kind: 'recorded' | 'replayed' | 'refused' } = await ctx.runMutation(
      internal.customerRequestRouteExecution.markDispatched,
      {
        dispatchRef: opened.invocation.dispatchRef,
        attemptRef: opened.invocation.attemptRef,
      },
    )
    if (dispatched.kind !== 'recorded') return { kind: 'refused' as const }

    if (!await isPublicHttpTarget(preparation.prepared.endpoint, defaultDnsResolver)) {
      return await convergePreReleaseAndProjection(
        ctx,
        opened.invocation,
        fenced,
        preReleaseObservation(opened.invocation.canonical.materialInputDigest, 'endpoint_not_public'),
        port,
        true,
      )
    }

    const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
    const fetch: RouteTransportFetch = async (input, init) => {
      const response = await guardedFetch(input, { ...init, dispatcher })
      return response
    }
    const runtime: X402RouteTransportRuntime = {
      send: fetch,
      resolveCredential,
      readProviderConnectionCredentialRef: readProviderCredential,
      validateProviderConnectionAuthority: providerConnectionAuthorityValidator(ctx, opened.invocation.binding),
      readX402PaymentCredentialRef: x402PaymentCredentialRefFromEnvironment,
      prepareX402PaymentAuthorization: async (request) => {
        if (opened.invocation.binding.authority.kind !== 'provider_connection') return undefined
        const connectionAuthority = opened.invocation.binding.connectionAuthority
        if (connectionAuthority === undefined) return undefined
        const paymentCredentialRef = x402PaymentCredentialRefFromEnvironment()
        if (paymentCredentialRef === undefined || request.credential !== paymentCredentialRef) return undefined
        return await ctx.runMutation(
          internal.customerRequestRouteExecution.prepareX402PaymentAuthorization,
          {
            dispatchRef: opened.invocation.dispatchRef,
            attemptRef: opened.invocation.attemptRef,
            effectGeneration: canonical.attempt.effectGeneration,
            paymentIdentifier: request.paymentIdentifier,
            operationKeyDigest: opened.invocation.operationKeyDigest,
            challengeDigest: request.challengeDigest,
            challengeJson: JSON.stringify(request.challenge),
            selectedRequirementJson: JSON.stringify(request.selectedRequirement),
            providerEndpoint: request.challenge.resource.url,
            credentialRef: paymentCredentialRef,
            scheme: request.selectedRequirement.scheme,
            network: request.selectedRequirement.network,
            asset: request.selectedRequirement.asset,
            payTo: request.selectedRequirement.payTo,
            amountUnits: request.paymentAmount.units,
            currency: request.paymentAmount.currency,
            exponent: request.paymentAmount.exponent,
          },
        )
      },
      readX402PaymentAuthorization: async (prepared) =>
        await readX402Authorization(ctx, prepared, false),
      readX402PaymentAuthorizationByDigest: async (prepared) =>
        await readX402Authorization(ctx, prepared, true),
      markX402PaymentPossiblySubmitted: async (event) => {
        const {
          amount,
          settlementEvidence: _settlementEvidence,
          ...paymentEvent
        } = event
        await ctx.runMutation(internal.customerRequestRouteExecution.markX402PaymentPossiblySubmitted, {
          dispatchRef: opened.invocation.dispatchRef,
          ...paymentEvent,
          effectGeneration: canonical.attempt.effectGeneration,
          amountUnits: amount.units,
          currency: amount.currency,
          exponent: amount.exponent,
        })
      },
      observeX402PaymentAttempt: async (event) => {
        const { amount, settlementEvidence, ...paymentEvent } = event
        await ctx.runMutation(internal.customerRequestRouteExecution.observeX402PaymentAttempt, {
          dispatchRef: opened.invocation.dispatchRef,
          ...paymentEvent,
          settlementStatus:
            settlementEvidence?.kind === 'not_submitted'
              ? 'not_settled'
              : settlementEvidence?.kind ?? 'unknown',
          ...(settlementEvidence !== undefined
            && settlementEvidence.kind !== 'not_submitted'
            && settlementEvidence.response !== undefined
            ? { settlementResponse: settlementEvidence.response }
            : {}),
          ...(settlementEvidence !== undefined
            && settlementEvidence.kind !== 'not_submitted'
            && settlementEvidence.digest !== undefined
            ? { settlementDigest: settlementEvidence.digest }
            : {}),
          state: event.state === 'reconciliation_required'
            || settlementEvidence?.kind === 'unknown'
            ? 'reconciliation_required'
            : 'observed',
          effectGeneration: canonical.attempt.effectGeneration,
          amountUnits: amount.units,
          currency: amount.currency,
          exponent: amount.exponent,
          evidenceRefs: [...event.evidenceRefs],
        })
      },
    }
    try {
      let observation: RouteTransportObservation
      try {
        observation = await invokePreparedRouteTransport(preparation.prepared, runtime)
      } catch (error) {
        observation = {
          transport: 'unknown',
          disposition: 'unknown',
          releaseStarted: true,
          requestDigest: opened.invocation.canonical.materialInputDigest,
          failureCode: `route_transport_${errorName(error)}`,
        }
      }
      const recordedAt = new Date().toISOString()
      const persisted = await persistCanonicalTerminalOutcome({
        snapshot: fenced,
        outcome: canonicalTerminalOutcome(observation, recordedAt),
        recordedAt,
      }, port)
      if (persisted.kind === 'refused') return { kind: 'none' as const }

      const outcome = observation.disposition === 'succeeded' && observation.outputJson !== undefined
        ? { kind: 'succeeded' as const, outputJson: observation.outputJson }
        : observation.disposition === 'partial' && observation.outputJson !== undefined
          ? { kind: 'partial' as const, outputJson: observation.outputJson }
          : observation.disposition === 'refused'
            ? { kind: 'failed' as const }
            : { kind: 'unknown' as const }
      await ctx.runMutation(internal.customerRequestRouteExecution.recordOutcome, {
        attemptRef: opened.invocation.attemptRef,
        operationKeyDigest: opened.invocation.operationKeyDigest,
        observationJson: JSON.stringify(observation),
        outcome,
      })
      return { kind: 'completed' as const, disposition: observation.disposition }
    } finally {
      await dispatcher.close().catch(() => undefined)
    }
  },
})

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

function preReleaseObservation(
  requestDigest: string,
  failureCode: string,
): RouteTransportObservation {
  return {
    transport: 'unknown',
    disposition: 'refused',
    releaseStarted: false,
    requestDigest,
    failureCode,
  }
}

async function convergePreReleaseAndProjection(
  ctx: ActionCtx,
  invocation: OpenDispatchInvocation,
  snapshot: CanonicalClaimSnapshot,
  observation: RouteTransportObservation,
  port: CanonicalPort,
  releaseFencePersisted = false,
): Promise<WorkerResult> {
  const recordedAt = new Date().toISOString()
  const projectedObservation = releaseFencePersisted
    ? { ...observation, releaseStarted: true }
    : observation
  const persisted = await persistCanonicalTerminalOutcome({
    snapshot,
    outcome: canonicalTerminalOutcome(projectedObservation, recordedAt),
    recordedAt,
  }, port)
  if (persisted.kind === 'refused') return { kind: 'none' }
  if (releaseFencePersisted) {
    await ctx.runMutation(internal.customerRequestRouteExecution.recordOutcome, {
      attemptRef: invocation.attemptRef,
      operationKeyDigest: invocation.operationKeyDigest,
      observationJson: JSON.stringify(projectedObservation),
      outcome: { kind: 'unknown' },
    })
    return { kind: 'completed', disposition: 'unknown' }
  }
  await ctx.runMutation(internal.customerRequestRouteExecution.recordNotReleased, {
    dispatchRef: invocation.dispatchRef,
    attemptRef: invocation.attemptRef,
    observationJson: JSON.stringify(projectedObservation),
  })
  return { kind: 'completed', disposition: 'refused' }
}

function canonicalTerminalOutcome(
  observation: RouteTransportObservation,
  recordedAt: string,
): CanonicalTerminalOutcome {
  const digestMaterial = {
    format: 'customer-request-route-observation:v1',
    transport: observation.transport,
    disposition: observation.disposition,
    releaseStarted: observation.releaseStarted,
    requestDigest: observation.requestDigest,
    responseDigest: observation.responseDigest ?? null,
    outputDigest: observation.outputJson === undefined
      ? null
      : canonicalDigest(observation.outputJson),
    providerReceiptDigest: observation.providerReceipt === undefined
      ? null
      : canonicalDigest(observation.providerReceipt),
    paymentProofDigest: observation.paymentProof === undefined
      ? null
      : canonicalDigest(observation.paymentProof),
    continuationTokenDigest: observation.continuationToken === undefined
      ? null
      : canonicalDigest(observation.continuationToken),
    failureCode: observation.failureCode ?? null,
    queryReleaseStatus: observation.queryReleaseStatus ?? null,
    paymentAuthorizationStatus: observation.paymentAuthorizationStatus ?? null,
    paymentSubmissionStatus: observation.paymentSubmissionStatus ?? null,
    settlementEvidence: observation.settlementEvidence ?? null,
    quoteDeliveryStatus: observation.quoteDeliveryStatus ?? null,
  }
  const evidenceDigest = canonicalDigest(digestMaterial)
  if ((observation.disposition === 'succeeded' || observation.disposition === 'partial')
    && observation.outputJson !== undefined) {
    return {
      kind: 'returned',
      businessOutcome: observation.disposition === 'succeeded'
        ? 'customer_request_route_succeeded'
        : 'customer_request_route_partial',
      resultRef: `route-result:v1:${evidenceDigest}`,
      resultDigest: evidenceDigest,
      resultReferenceable: false,
      release: observation.releaseStarted ? 'released' : 'possibly_released',
    }
  }
  if (observation.disposition === 'refused' && !observation.releaseStarted) {
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

function errorName(error: unknown): string {
  return error instanceof Error && error.name.trim().length > 0 ? error.name : 'unknown'
}

function routeCallSigningKey(): Readonly<{ keyId: string; secret: string }> | undefined {
  const secret = env.AE_ROUTE_CALL_SIGNING_SECRET
  const keyId = env.AE_ROUTE_CALL_SIGNING_KEY_ID
  return secret === undefined || keyId === undefined ? undefined : { keyId, secret }
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
  RouteExecutionBinding,
  { readonly authority: { readonly kind: 'keyless' } }
>
type ProviderRouteExecutionBinding = Extract<
  RouteExecutionBinding,
  { readonly authority: { readonly kind: 'provider_connection' } }
>

function transportBindingFromRouteBinding(binding: KeylessRouteExecutionBinding): KeylessRouteTransportBinding
function transportBindingFromRouteBinding(binding: ProviderRouteExecutionBinding): ProviderRouteTransportBinding
function transportBindingFromRouteBinding(binding: RouteExecutionBinding): RouteTransportInvocation['binding']
function transportBindingFromRouteBinding(binding: RouteExecutionBinding): RouteTransportInvocation['binding'] {
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

type KeylessRouteTransportInvocation = Extract<
  RouteTransportInvocation,
  { readonly binding: { readonly authority: { readonly kind: 'keyless' } } }
>
type ProviderRouteTransportInvocation = Extract<
  RouteTransportInvocation,
  { readonly binding: { readonly authority: { readonly kind: 'provider_connection' } } }
>

function routeTransportInvocation(
  source: OpenDispatchInvocation,
  effectGeneration: number,
  callIdentity: Readonly<{ keyId: string; signature: string }>,
): RouteTransportInvocation | undefined {
  const authority = {
    attemptRef: source.attemptRef,
    effectGeneration,
    operationKeyDigest: source.operationKeyDigest,
    mandateDigest: source.authority.mandateDigest,
    grantDigest: source.authority.grantDigest,
    capabilityContractDigest: source.authority.capabilityContractDigest,
    maximumSpend: source.authority.maximumSpend,
    expiresAt: source.authority.expiresAt,
    callIdentity,
  }
  if (source.binding.authority.kind === 'keyless') {
    return {
      binding: {
        adapterId: source.binding.adapterId,
        endpointUrl: source.binding.endpointUrl,
        authority: source.binding.authority,
        configJson: source.binding.configJson,
        configDigest: source.binding.configDigest,
      },
      inputJson: source.inputJson,
      authority,
    } satisfies KeylessRouteTransportInvocation
  }
  const connectionAuthority = source.binding.connectionAuthority
  if (connectionAuthority === undefined) return undefined
  return {
    binding: {
      adapterId: source.binding.adapterId,
      endpointUrl: source.binding.endpointUrl,
      authority: source.binding.authority,
      configJson: source.binding.configJson,
      configDigest: source.binding.configDigest,
    },
    inputJson: source.inputJson,
    authority: {
      ...authority,
      authorityGeneration: connectionAuthority.authorityGeneration,
      authorityDigest: connectionAuthority.authorityDigest,
    },
  } satisfies ProviderRouteTransportInvocation
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
function providerConnectionAuthorityValidator(
  ctx: ActionCtx,
  binding: RouteExecutionBinding,
): ProviderConnectionAuthorityValidator {
  return async (lookup) => {
    if (binding.authority.kind !== 'provider_connection') {
      return { kind: 'unavailable' as const, reason: 'digest_mismatch' as const }
    }
    const connectionAuthority = binding.connectionAuthority
    if (
      connectionAuthority === undefined
      || lookup.connectionRef !== connectionAuthority.connectionRef
      || lookup.providerRef !== binding.authority.providerRef
      || lookup.adapterId !== connectionAuthority.adapterId
      || lookup.authorityGeneration !== connectionAuthority.authorityGeneration
      || lookup.authorityDigest !== connectionAuthority.authorityDigest
    ) return { kind: 'unavailable' as const, reason: 'digest_mismatch' as const }
    return await ctx.runQuery(internal.capabilityProviderConnections.validateAuthority, {
      connectionRef: lookup.connectionRef,
      expectedAuthorityGeneration: lookup.authorityGeneration,
      expectedAuthorityDigest: lookup.authorityDigest,
      now: Date.now(),
    })
  }
}

async function readX402Authorization(
  ctx: ActionCtx,
  prepared: X402PreparedAuthorization,
  byDigest: boolean,
): Promise<string | undefined> {
  const material = byDigest
    ? await ctx.runQuery(
        internal.customerRequestRouteExecution.readX402PaymentAuthorizationByDigest,
        prepared,
      )
    : await ctx.runQuery(
        internal.customerRequestRouteExecution.readX402PaymentAuthorization,
        prepared,
      )
  if (material === null || material.state !== 'prepared') return undefined
  const credential = credentialFromEnvironment(material.credentialRef)
  if (credential === undefined) return undefined
  try {
    const challenge = JSON.parse(material.challengeJson) as X402PaymentSignatureRequest['challenge']
    const selectedRequirement = JSON.parse(
      material.selectedRequirementJson,
    ) as X402PaymentSignatureRequest['selectedRequirement']
    if (canonicalDigest(challenge as StableHashValue) !== material.challengeDigest) return undefined
    return await createEvmX402PaymentSignature({
      challenge,
      credential,
      paymentIdentifier: material.paymentIdentifier,
      selectedRequirement,
    })
  } catch {
    return undefined
  }
}
