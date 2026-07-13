"use node";

import { v } from 'convex/values'
import { Agent, fetch as guardedFetch } from 'undici'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'

import { internal } from './_generated/api'
import { internalAction, type ActionCtx } from './_generated/server'

type Dispatch = Readonly<{
  endpointUrl: string
  credentialRef: string
  adapterId: string
  configJson: string
  bodyText: string
}>
type DispatchResult = Readonly<{
  state: 'released' | 'not_released' | 'uncertain'
  evidenceRef: string
  responseStatus?: number
  responseContentType?: string
  responseBodyDigest?: string
  responseBodyText?: string
  failureCode?: string
}>
type HttpConfiguration = Readonly<{
  method: 'POST'
  requestTimeoutMs: number
  reconciliation?: Readonly<{ path: string; requestTimeoutMs: number }>
}>

export const run = internalAction({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(),
    preparationRef: v.string(), now: v.number(),
  },
  returns: v.union(
    v.object({ kind: v.literal('completed'), states: v.array(v.object({
      operationRef: v.string(), state: v.union(
        v.literal('released'), v.literal('not_released'), v.literal('uncertain'), v.literal('in_flight'),
      ),
    })) }),
    v.object({ kind: v.literal('conflict') }),
    v.object({ kind: v.literal('needs_attention') }),
  ),
  handler: async (ctx, args): Promise<
    | { kind: 'completed'; states: Array<{
      operationRef: string; state: 'released' | 'not_released' | 'uncertain' | 'in_flight'
    }> }
    | { kind: 'conflict' | 'needs_attention' }
  > => {
    const allocation: {
      kind: 'allocated' | 'replayed' | 'conflict' | 'needs_attention'
      operationRefs?: string[]
    } = await ctx.runMutation(internal.customerRequestV2PreparationEgressState.allocate, args)
    if (allocation.kind === 'conflict') return { kind: 'conflict' }
    if (allocation.kind === 'needs_attention' || allocation.operationRefs === undefined) return { kind: 'needs_attention' }
    return await processOperations(ctx, allocation.operationRefs, args.principalId)
  },
})

export const resume = internalAction({
  args: { preparationRef: v.string(), principalId: v.string() },
  returns: v.union(
    v.object({ kind: v.literal('completed'), states: v.array(v.object({
      operationRef: v.string(), state: v.union(
        v.literal('released'), v.literal('not_released'), v.literal('uncertain'), v.literal('in_flight'),
      ),
    })) }),
    v.object({ kind: v.literal('needs_attention') }),
  ),
  handler: async (ctx, args): Promise<
    | { kind: 'completed'; states: Array<{
      operationRef: string; state: 'released' | 'not_released' | 'uncertain' | 'in_flight'
    }> }
    | { kind: 'needs_attention' }
  > => {
    const status: { states: Array<{ operationRef: string }> } = await ctx.runQuery(
      internal.customerRequestV2PreparationEgressState.status,
      args,
    )
    return await processOperations(ctx, status.states.map(({ operationRef }) => operationRef), args.principalId)
  },
})

export const resumeRequest = internalAction({
  args: { requestId: v.string(), principalId: v.string() },
  returns: v.union(
    v.object({
      kind: v.literal('completed'), states: v.array(v.object({
        operationRef: v.string(), requestRevision: v.number(), state: v.union(
          v.literal('released'), v.literal('not_released'), v.literal('uncertain'), v.literal('in_flight'),
        ),
      })),
    }),
    v.object({ kind: v.literal('needs_attention'), operations: v.array(v.object({
      operationRef: v.string(), requestRevision: v.number(),
    })) }),
  ),
  handler: async (ctx, args): Promise<
    | { kind: 'completed'; states: Array<{
      operationRef: string
      requestRevision: number
      state: 'released' | 'not_released' | 'uncertain' | 'in_flight'
    }> }
    | { kind: 'needs_attention'; operations: Array<{ operationRef: string; requestRevision: number }> }
  > => {
    const unresolved: Array<{ operationRef: string; requestRevision: number }> = await ctx.runQuery(
      internal.customerRequestV2PreparationEgressState.unresolvedForRequest,
      args,
    )
    const processed = await processOperations(ctx, unresolved.map(({ operationRef }) => operationRef), args.principalId)
    if (processed.kind !== 'completed') return { kind: 'needs_attention', operations: unresolved }
    const revisions = new Map(unresolved.map(({ operationRef, requestRevision }) => [operationRef, requestRevision]))
    return { kind: 'completed', states: processed.states.map((state) => ({
      ...state, requestRevision: revisions.get(state.operationRef) ?? 0,
    })) }
  },
})

export const reconcile = internalAction({
  args: { operationRef: v.string(), principalId: v.string() },
  returns: v.union(
    v.object({ kind: v.literal('reconciled'), state: v.union(
      v.literal('released'), v.literal('not_released'), v.literal('uncertain'),
    ) }),
    v.object({ kind: v.literal('unavailable') }),
  ),
  handler: async (ctx, args): Promise<
    { kind: 'reconciled'; state: 'released' | 'not_released' | 'uncertain' } | { kind: 'unavailable' }
  > => {
    const state = await reconcileOperation(ctx, args.operationRef, args.principalId)
    return state === undefined ? { kind: 'unavailable' } : { kind: 'reconciled', state }
  },
})

async function processOperations(
  ctx: ActionCtx, operationRefs: readonly string[], principalId: string,
): Promise<
  | { kind: 'completed'; states: Array<{
    operationRef: string; state: 'released' | 'not_released' | 'uncertain' | 'in_flight'
  }> }
  | { kind: 'needs_attention' }
> {
  const states: Array<{
    operationRef: string; state: 'released' | 'not_released' | 'uncertain' | 'in_flight'
  }> = []
  for (const operationRef of operationRefs) {
    const begun: {
      kind: 'dispatch' | 'in_flight' | 'terminal' | 'needs_attention'
      state?: 'released' | 'not_released' | 'uncertain'
      endpointUrl?: string
      credentialRef?: string
      adapterId?: string
      configJson?: string
      bodyText?: string
      dispatchAttemptRef?: string
    } = await ctx.runMutation(internal.customerRequestV2PreparationEgressState.beginDispatch, {
      operationRef, principalId, now: Date.now(),
    })
    if (begun.kind === 'needs_attention') return { kind: 'needs_attention' }
    if (begun.kind === 'in_flight') {
      states.push({ operationRef, state: 'in_flight' })
      continue
    }
    let state = begun.state
    if (begun.kind === 'dispatch') {
      if (begun.endpointUrl === undefined || begun.credentialRef === undefined || begun.adapterId === undefined
        || begun.configJson === undefined || begun.bodyText === undefined
        || begun.dispatchAttemptRef === undefined) return { kind: 'needs_attention' }
      const result = await dispatchRegisteredAdapter({
        endpointUrl: begun.endpointUrl, credentialRef: begun.credentialRef,
        adapterId: begun.adapterId, configJson: begun.configJson, bodyText: begun.bodyText,
      }, operationRef)
      state = await ctx.runMutation(internal.customerRequestV2PreparationEgressState.resolveDispatch, {
        operationRef, dispatchAttemptRef: begun.dispatchAttemptRef, ...result, now: Date.now(),
      }) as 'released' | 'not_released' | 'uncertain'
    }
    if (state === undefined) return { kind: 'needs_attention' }
    if (state === 'uncertain') state = await reconcileOperation(ctx, operationRef, principalId) ?? 'uncertain'
    states.push({ operationRef, state })
  }
  return { kind: 'completed', states }
}

async function reconcileOperation(
  ctx: ActionCtx, operationRef: string, principalId: string,
): Promise<'released' | 'not_released' | 'uncertain' | undefined> {
  const opened: {
    kind: 'available' | 'unavailable'
    endpointUrl?: string
    credentialRef?: string
    adapterId?: string
    configJson?: string
  } = await ctx.runQuery(internal.customerRequestV2PreparationEgressState.openReconciliation, {
    operationRef, principalId,
  })
  if (opened.kind !== 'available' || opened.endpointUrl === undefined || opened.credentialRef === undefined
    || opened.adapterId === undefined || opened.configJson === undefined) return undefined
  const evidence = await reconcileRegisteredAdapter({
    endpointUrl: opened.endpointUrl, credentialRef: opened.credentialRef,
    adapterId: opened.adapterId, configJson: opened.configJson, bodyText: '',
  }, operationRef)
  if (evidence === undefined) return undefined
  const evidenceMaterial = {
    operationRef, disposition: evidence.disposition,
    providerEvidenceRef: evidence.providerEvidenceRef, responseDigest: evidence.responseDigest,
  }
  return await ctx.runMutation(internal.customerRequestV2PreparationEgressState.reconcileUncertain, {
    ...evidenceMaterial, evidenceDigest: canonicalDigest(evidenceMaterial),
    observedAt: Date.now(),
  }) as 'released' | 'not_released' | 'uncertain'
}

const adapterDispatchers = new Map<string, (dispatch: Dispatch, operationRef: string) => Promise<DispatchResult>>([
  ['http-json:v1', dispatchHttpJson],
])
const adapterReconcilers = new Map<string, (
  dispatch: Dispatch, operationRef: string,
) => Promise<{
  disposition: 'released' | 'not_released' | 'uncertain'
  providerEvidenceRef: string
  responseDigest: string
} | undefined>>([
  ['http-json:v1', reconcileHttpJson],
])

async function dispatchRegisteredAdapter(dispatch: Dispatch, operationRef: string): Promise<DispatchResult> {
  const adapter = adapterDispatchers.get(dispatch.adapterId)
  if (adapter === undefined) return notReleased(operationRef, 'adapter_not_registered')
  return await adapter(dispatch, operationRef)
}

async function reconcileRegisteredAdapter(dispatch: Dispatch, operationRef: string) {
  return await adapterReconcilers.get(dispatch.adapterId)?.(dispatch, operationRef)
}

async function dispatchHttpJson(dispatch: Dispatch, operationRef: string): Promise<DispatchResult> {
  let endpoint: URL
  let configuration: HttpConfiguration
  try {
    endpoint = new URL(dispatch.endpointUrl)
    const parsed = JSON.parse(dispatch.configJson) as unknown
    if (!isHttpConfiguration(parsed) || endpoint.protocol !== 'https:' || endpoint.username !== '' || endpoint.password !== '') {
      return notReleased(operationRef, 'adapter_config_invalid')
    }
    configuration = parsed
  } catch {
    return notReleased(operationRef, 'adapter_config_invalid')
  }
  if (!await isPublicHttpTarget(endpoint, defaultDnsResolver)) return notReleased(operationRef, 'endpoint_not_public')
  const credential = resolveCredential(dispatch.credentialRef)
  if (credential === undefined) return notReleased(operationRef, 'credential_unavailable')
  const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
  let networkCallStarted = false
  try {
    networkCallStarted = true
    const response = await guardedFetch(endpoint, {
      method: configuration.method,
      redirect: 'manual',
      dispatcher,
      signal: AbortSignal.timeout(configuration.requestTimeoutMs),
      body: dispatch.bodyText,
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${credential}`,
        'Idempotency-Key': operationRef,
      },
    })
    let bodyText: string | undefined
    let bodyDisposition: 'available' | 'too_large' | 'read_failed' = 'read_failed'
    try {
      const bounded = await readBoundedResponseText(response, 64 * 1024)
      if (bounded.ok) {
        bodyText = bounded.text
        bodyDisposition = 'available'
      } else bodyDisposition = 'too_large'
    } catch {
      bodyDisposition = 'read_failed'
    }
    const responseBodyDigest = bodyText === undefined
      ? canonicalDigest({ kind: bodyDisposition })
      : canonicalDigest(bodyText)
    const evidenceMaterial = {
      operationRef, responseStatus: response.status,
      responseContentType: response.headers.get('content-type') ?? '', responseBodyDigest,
    }
    return {
      state: 'released', evidenceRef: `provider-response:${canonicalDigest(evidenceMaterial as StableHashValue)}`,
      responseStatus: response.status, responseContentType: evidenceMaterial.responseContentType, responseBodyDigest,
      ...(bodyText === undefined ? {} : { responseBodyText: bodyText }),
    }
  } catch (error) {
    return networkCallStarted
      ? {
          state: 'uncertain', failureCode: 'network_outcome_unknown',
          evidenceRef: `ae:network-unknown:${canonicalDigest({ operationRef, error: errorName(error) })}`,
        }
      : notReleased(operationRef, 'preflight_failed')
  } finally {
    await dispatcher.close().catch(() => undefined)
  }
}

async function reconcileHttpJson(dispatch: Dispatch, operationRef: string) {
  let endpoint: URL
  let configuration: HttpConfiguration
  try {
    const base = new URL(dispatch.endpointUrl)
    const parsed = JSON.parse(dispatch.configJson) as unknown
    if (!isHttpConfiguration(parsed) || parsed.reconciliation === undefined) return undefined
    endpoint = new URL(parsed.reconciliation.path, base)
    if (endpoint.origin !== base.origin || endpoint.protocol !== 'https:') return undefined
    configuration = parsed
  } catch {
    return undefined
  }
  if (!await isPublicHttpTarget(endpoint, defaultDnsResolver)) return undefined
  const credential = resolveCredential(dispatch.credentialRef)
  if (credential === undefined || configuration.reconciliation === undefined) return undefined
  const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
  try {
    const response = await guardedFetch(endpoint, {
      method: 'POST', redirect: 'manual', dispatcher,
      signal: AbortSignal.timeout(configuration.reconciliation.requestTimeoutMs),
      body: JSON.stringify({ protocol: 'ae.preparation-reconciliation:v1', operationRef }),
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${credential}`,
        'Idempotency-Key': `${operationRef}:reconcile`,
      },
    })
    const bounded = await readBoundedResponseText(response, 64 * 1024)
    if (response.status < 200 || response.status >= 300 || !bounded.ok) return undefined
    const bodyText = bounded.text
    const body = JSON.parse(bodyText) as unknown
    if (!isReconciliationEvidence(body, operationRef)) return undefined
    return {
      disposition: body.disposition,
      providerEvidenceRef: body.evidenceRef,
      responseDigest: canonicalDigest(bodyText),
    }
  } catch {
    return undefined
  } finally {
    await dispatcher.close().catch(() => undefined)
  }
}

function notReleased(operationRef: string, failureCode: string): DispatchResult {
  return {
    state: 'not_released', failureCode,
    evidenceRef: `ae:not-released:${canonicalDigest({ operationRef, failureCode })}`,
  }
}

function resolveCredential(reference: string): string | undefined {
  const match = /^env:([A-Z][A-Z0-9_]{1,199})$/.exec(reference)
  return match?.[1] === undefined ? undefined : process.env[match[1]]
}

function isHttpConfiguration(value: unknown): value is HttpConfiguration {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const reconciliation = record.reconciliation
  const reconciliationValid = reconciliation === undefined || (reconciliation !== null
    && typeof reconciliation === 'object' && !Array.isArray(reconciliation)
    && Object.keys(reconciliation).length === 2
    && typeof (reconciliation as Record<string, unknown>).path === 'string'
    && /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,1000}$/.test((reconciliation as Record<string, unknown>).path as string)
    && validTimeout((reconciliation as Record<string, unknown>).requestTimeoutMs))
  const keysValid = keys.join(',') === 'method,requestTimeoutMs'
    || keys.join(',') === 'method,reconciliation,requestTimeoutMs'
  return keysValid && record.method === 'POST'
    && typeof record.requestTimeoutMs === 'number' && Number.isInteger(record.requestTimeoutMs)
    && record.requestTimeoutMs >= 100 && record.requestTimeoutMs <= 120_000
    && reconciliationValid
}

function validTimeout(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 120_000
}

function isReconciliationEvidence(value: unknown, operationRef: string): value is Readonly<{
  protocol: 'ae.preparation-reconciliation:v1'
  operationRef: string
  disposition: 'released' | 'not_released' | 'uncertain'
  evidenceRef: string
}> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return Object.keys(record).length === 4
    && record.protocol === 'ae.preparation-reconciliation:v1' && record.operationRef === operationRef
    && (record.disposition === 'released' || record.disposition === 'not_released' || record.disposition === 'uncertain')
    && typeof record.evidenceRef === 'string' && record.evidenceRef.length > 0 && record.evidenceRef.length <= 500
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown_error'
}

async function readBoundedResponseText(
  response: Awaited<ReturnType<typeof guardedFetch>>, maximumBytes: number,
): Promise<{ ok: true; text: string } | { ok: false }> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel().catch(() => undefined)
    return { ok: false }
  }
  if (response.body === null) return { ok: true, text: '' }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    for (;;) {
      const result: { done: boolean; value?: unknown } = await reader.read()
      if (result.done) break
      if (!(result.value instanceof Uint8Array)) {
        await reader.cancel().catch(() => undefined)
        return { ok: false }
      }
      totalBytes += result.value.byteLength
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined)
        return { ok: false }
      }
      chunks.push(result.value)
    }
  } catch {
    await reader.cancel().catch(() => undefined)
    return { ok: false }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, text: new TextDecoder().decode(body) }
}
