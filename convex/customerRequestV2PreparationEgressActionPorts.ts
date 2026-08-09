"use node";

import { Agent, fetch as guardedFetch } from 'undici'

import {
  claimCanonicalInvocation,
  persistCanonicalReleaseFence,
  persistCanonicalTerminalOutcome,
  type CanonicalClaimDecision,
  type CanonicalClaimSnapshot,
  type DurableActionInvocationPort,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { isRecord } from '@/modules/common/is-record'
import type {
  CustomerRequestV2PreparationEgressActionPorts,
  DispatchPayload,
  DispatchResult,
} from '@/modules/customer-request/v2-preparation-egress'
import type { ReconciliationEvidence } from '@/modules/customer-request/v2-preparation-egress/types'
import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'
import { internal } from './_generated/api'
import type { ActionCtx } from './_generated/server'

type HttpConfiguration = Readonly<{
  method: 'POST'
  requestTimeoutMs: number
  reconciliation?: Readonly<{ path: string; requestTimeoutMs: number }>
}>
type PersistReleaseFence = () => Promise<boolean>

export function customerRequestV2PreparationEgressActionPorts(
  ctx: ActionCtx,
): CustomerRequestV2PreparationEgressActionPorts {
  return {
    allocateEgress: async (args) => (
      await ctx.runMutation(internal.customerRequestV2PreparationEgressState.allocate, args)
    ),

    beginDispatch: async (args) => (
      await ctx.runMutation(internal.customerRequestV2PreparationEgressState.beginDispatch, args)
    ),

    resolveDispatch: async (args) => (
      await ctx.runMutation(internal.customerRequestV2PreparationEgressState.resolveDispatch, args)
    ),

    queryStatus: async (args) => (
      await ctx.runQuery(internal.customerRequestV2PreparationEgressState.status, args)
    ),

    queryUnresolvedForRequest: async (args) => (
      await ctx.runQuery(internal.customerRequestV2PreparationEgressState.unresolvedForRequest, args)
    ),

    openReconciliation: async (args) => (
      await ctx.runQuery(internal.customerRequestV2PreparationEgressState.openReconciliation, args)
    ),

    reconcileUncertain: async (args) => (
      await ctx.runMutation(internal.customerRequestV2PreparationEgressState.reconcileUncertain, args)
    ),

    dispatchRegisteredAdapter: async (dispatch, operationRef) => {
      const resolved = await resolveProviderDispatch(ctx, dispatch)
      return resolved === undefined
        ? notReleased(operationRef, 'connection_authority_unavailable')
        : await dispatchRegisteredAdapter(resolved, operationRef, canonicalPort(ctx), () => Date.now())
    },
    reconcileRegisteredAdapter: async (dispatch, operationRef) => {
      const resolved = await resolveProviderDispatch(ctx, dispatch)
      return resolved === undefined
        ? undefined
        : await reconcileRegisteredAdapter(resolved, operationRef, canonicalPort(ctx), () => Date.now())
    },
    now: () => Date.now(),
  }
}
async function resolveProviderDispatch(
  ctx: ActionCtx,
  dispatch: DispatchPayload,
): Promise<DispatchPayload | undefined> {
  const authority = dispatch.connectionAuthority
  if (authority === undefined) return dispatch
  if (dispatch.credentialRef !== authority.connectionRef
    || dispatch.adapterId !== authority.adapterId) return undefined
  const connection = await ctx.runQuery(internal.capabilityProviderConnections.read, {
    connectionRef: authority.connectionRef,
  })
  if (connection === null
    || connection.providerRef !== authority.providerRef
    || connection.adapterId !== authority.adapterId) return undefined
  const resolved = await ctx.runQuery(internal.capabilityProviderConnections.resolveCredentialRef, {
    connectionRef: authority.connectionRef,
    expectedAuthorityGeneration: authority.authorityGeneration,
    expectedAuthorityDigest: authority.authorityDigest,
    now: Date.now(),
  })
  return resolved.kind === 'resolved'
    ? { ...dispatch, credentialRef: resolved.credentialRef }
    : undefined
}




const adapterDispatchers: Record<string, (
  dispatch: DispatchPayload,
  operationRef: string,
  persistReleaseFence: PersistReleaseFence,
) => Promise<DispatchResult>> = {
  'http-json:v1': dispatchHttpJson,
}
const adapterReconcilers: Record<string, (
  dispatch: DispatchPayload,
  operationRef: string,
  persistReleaseFence: PersistReleaseFence,
) => Promise<ReconciliationEvidence | undefined>> = {
  'http-json:v1': reconcileHttpJson,
}


function canonicalPort(ctx: ActionCtx): Pick<
  DurableActionInvocationPort,
  'transact' | 'readControl' | 'readAttempt'
> {
  return {
    transact: async (command) => {
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
    readControl: async (invocationRef) => (
      await ctx.runQuery(internal.actionInvocationControl.readControl, { invocationRef }) ?? undefined
    ),
    readAttempt: async (invocationRef, attemptRef) => (
      await ctx.runQuery(internal.actionInvocationControl.readAttempt, { invocationRef, attemptRef }) ?? undefined
    ),
  }
}

async function readCanonicalSnapshot(
  port: Pick<DurableActionInvocationPort, 'readControl' | 'readAttempt'>,
  invocationRef: string,
  attemptRef: string,
): Promise<CanonicalClaimSnapshot | undefined> {
  const control = await port.readControl(invocationRef)
  if (control === undefined || control.currentAttemptRef !== attemptRef) return undefined
  const attempt = await port.readAttempt(invocationRef, attemptRef)
  return attempt === undefined ? undefined : { control, attempt }
}

async function dispatchRegisteredAdapter(
  dispatch: DispatchPayload,
  operationRef: string,
  port: Pick<DurableActionInvocationPort, 'transact' | 'readControl' | 'readAttempt'>,
  now: () => number,
): Promise<DispatchResult> {
  const material = dispatch.canonicalClaimMaterial
  if (material === undefined || material.sourceRef !== operationRef) {
    return notReleased(operationRef, 'canonical_claim_material_missing')
  }
  if (Date.parse(material.attempt.leaseExpiresAt) <= now()) {
    return notReleased(operationRef, 'canonical_claim_lease_expired')
  }
  const decision = await claimCanonicalInvocation({
    ...material,
    expectedInvocationVersion: null,
  }, port)
  if (decision.kind !== 'claimed') return canonicalDecisionResult(operationRef, decision)
  const claimed = await readCanonicalSnapshot(port, material.invocationRef, material.attempt.attemptRef)
  if (claimed === undefined) return notReleased(operationRef, 'canonical_claim_snapshot_missing')
  let fenced: CanonicalClaimSnapshot | undefined
  const persistReleaseFence = async (): Promise<boolean> => {
    const fence = await persistCanonicalReleaseFence({
      snapshot: claimed,
      recordedAt: new Date(now()).toISOString(),
    }, port)
    if (fence.kind !== 'applied') return false
    fenced = await readCanonicalSnapshot(port, material.invocationRef, material.attempt.attemptRef)
    return fenced !== undefined
  }
  const adapter = adapterDispatchers[dispatch.adapterId]
  if (adapter === undefined) {
    const result = notReleased(operationRef, 'adapter_not_registered')
    await persistCanonicalTerminal(port, claimed, result, now())
    return result
  }
  let result: DispatchResult
  try {
    result = await adapter(dispatch, operationRef, persistReleaseFence)
  } catch (error) {
    result = {
      state: 'uncertain',
      failureCode: 'adapter_dispatch_failed',
      evidenceRef: `ae:adapter-dispatch-failed:${canonicalDigest({
        operationRef,
        error: errorName(error),
      })}`,
    }
  }
  const terminal = await persistCanonicalTerminal(port, fenced ?? claimed, result, now())

  return terminal.kind === 'refused'
    ? canonicalRefused(operationRef, 'canonical_terminal_refused')
    : result
}

async function reconcileRegisteredAdapter(
  dispatch: DispatchPayload,
  operationRef: string,
  port: Pick<DurableActionInvocationPort, 'transact' | 'readControl' | 'readAttempt'>,
  now: () => number,
): Promise<ReconciliationEvidence | undefined> {
  const material = dispatch.canonicalClaimMaterial
  if (material === undefined || material.sourceRef !== operationRef
    || Date.parse(material.attempt.leaseExpiresAt) <= now()) {
    return undefined
  }
  const decision = await claimCanonicalInvocation({
    ...material,
    expectedInvocationVersion: null,
  }, port)
  if (decision.kind !== 'claimed') return undefined
  const claimed = await readCanonicalSnapshot(port, material.invocationRef, material.attempt.attemptRef)
  if (claimed === undefined) return undefined
  let fenced: CanonicalClaimSnapshot | undefined
  const persistReleaseFence = async (): Promise<boolean> => {
    const fence = await persistCanonicalReleaseFence({
      snapshot: claimed,
      recordedAt: new Date(now()).toISOString(),
    }, port)
    if (fence.kind !== 'applied') return false
    fenced = await readCanonicalSnapshot(port, material.invocationRef, material.attempt.attemptRef)
    return fenced !== undefined
  }
  let evidence: ReconciliationEvidence | undefined
  const adapter = adapterReconcilers[dispatch.adapterId]
  if (adapter === undefined) {
    evidence = undefined
  } else {
    try {
      evidence = await adapter(dispatch, operationRef, persistReleaseFence)
    } catch {
      evidence = undefined
    }
  }
  const evidenceMaterial = evidence === undefined
    ? {
      operationRef,
      providerEvidenceRef: 'reconciliation-unobserved',
      responseDigest: 'reconciliation-unobserved',
    }
    : {
      operationRef,
      providerEvidenceRef: evidence.providerEvidenceRef,
      responseDigest: evidence.responseDigest,
    }
  const evidenceDigest = canonicalDigest(evidenceMaterial as StableHashValue)
  const terminal = evidence === undefined || evidence.disposition === 'uncertain'
    ? {
      kind: 'uncertain' as const,
      errorDigest: evidenceDigest,
      reconciliationRequiredAt: new Date(now() + 1).toISOString(),
      release: 'possibly_released' as const,
    }
    : {
      kind: 'returned' as const,
      businessOutcome: 'reconciliation_observed',
      resultRef: `ae:reconciliation-result:${evidenceDigest}`,
      resultDigest: evidenceDigest,
      resultReferenceable: false,
      release: 'released' as const,
    }
  const persisted = await persistCanonicalTerminalOutcome({
    snapshot: fenced ?? claimed,
    outcome: terminal,
    recordedAt: new Date(now()).toISOString(),
  }, port)
  return persisted.kind === 'refused' ? undefined : evidence
}
async function persistCanonicalTerminal(
  port: Pick<DurableActionInvocationPort, 'transact'>,
  snapshot: CanonicalClaimSnapshot,
  result: DispatchResult,
  now: number,
) {
  const recordedAt = new Date(now).toISOString()
  const evidenceMaterial = {
    operationRef: snapshot.control.invocationRef,
    evidenceRef: result.evidenceRef,
    responseStatus: result.responseStatus ?? null,
    responseContentType: result.responseContentType ?? null,
    responseBodyDigest: result.responseBodyDigest ?? null,
    failureCode: result.failureCode ?? null,
  }
  const evidenceDigest = canonicalDigest(evidenceMaterial as StableHashValue)
  const outcome = result.state === 'released'
    ? {
      kind: 'returned' as const,
      businessOutcome: 'provider_response_observed',
      resultRef: `ae:provider-result:${evidenceDigest}`,
      resultDigest: evidenceDigest,
      resultReferenceable: false,
      release: 'released' as const,
    }
    : result.state === 'not_released'
      ? {
        kind: 'failed' as const,
        errorDigest: evidenceDigest,
        release: 'not_released' as const,
      }
      : {
        kind: 'uncertain' as const,
        errorDigest: evidenceDigest,
        reconciliationRequiredAt: new Date(Date.parse(recordedAt) + 1).toISOString(),
        release: 'possibly_released' as const,
      }
  return await persistCanonicalTerminalOutcome({ snapshot, outcome, recordedAt }, port)
}

function canonicalDecisionResult(
  operationRef: string,
  decision: Exclude<CanonicalClaimDecision, { kind: 'claimed' }>,
): DispatchResult {
  if (decision.kind === 'active') {
    return {
      state: 'uncertain',
      canonicalDisposition: 'active',
      failureCode: 'canonical_claim_active',
      evidenceRef: `ae:canonical-claim-active:${canonicalDigest(operationRef)}`,
    }
  }
  if (decision.kind === 'terminal_replay') {
    const state = decision.snapshot.attempt.outcome.state === 'returned'
      ? 'released'
      : decision.snapshot.attempt.outcome.state === 'failed'
        ? 'not_released'
        : 'uncertain'
    return {
      state,
      canonicalDisposition: 'terminal_replay',
      evidenceRef: `ae:canonical-terminal-replay:${canonicalDigest({
        operationRef,
        outcome: decision.snapshot.attempt.outcome,
      } as StableHashValue)}`,
    }
  }
  return canonicalRefused(operationRef, decision.code)
}

function canonicalRefused(operationRef: string, code: string): DispatchResult {
  return {
    state: 'uncertain',
    canonicalDisposition: 'refused',
    failureCode: code,
    evidenceRef: `ae:canonical-refused:${canonicalDigest({ operationRef, code } as StableHashValue)}`,
  }
}
async function dispatchHttpJson(
  dispatch: DispatchPayload,
  operationRef: string,
  persistReleaseFence: PersistReleaseFence,
): Promise<DispatchResult> {
  let endpoint: URL
  let configuration: HttpConfiguration
  try {
    endpoint = new URL(dispatch.endpointUrl)
    const parsed = JSON.parse(dispatch.configJson) as unknown
    if (!isHttpConfiguration(parsed) || endpoint.protocol !== 'https:'
      || endpoint.username !== '' || endpoint.password !== '') {
      return notReleased(operationRef, 'adapter_config_invalid')
    }
    configuration = parsed
  } catch {
    return notReleased(operationRef, 'adapter_config_invalid')
  }
  if (!await isPublicHttpTarget(endpoint, defaultDnsResolver)) {
    return notReleased(operationRef, 'endpoint_not_public')
  }
  const credential = resolveCredential(dispatch.credentialRef)
  if (credential === undefined) return notReleased(operationRef, 'credential_unavailable')
  const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
  let networkCallStarted = false
  try {
    if (!await persistReleaseFence()) {
      return notReleased(operationRef, 'canonical_release_fence_refused')
    }
    networkCallStarted = true
    const response = await guardedFetch(endpoint, {
      method: configuration.method,
      redirect: 'manual',
      dispatcher,
      signal: AbortSignal.timeout(configuration.requestTimeoutMs),
      body: dispatch.bodyText,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${credential}`,
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
      operationRef,
      responseStatus: response.status,
      responseContentType: response.headers.get('content-type') ?? '',
      responseBodyDigest,
    }
    return {
      state: 'released',
      evidenceRef: `provider-response:${canonicalDigest(evidenceMaterial as StableHashValue)}`,
      responseStatus: response.status,
      responseContentType: evidenceMaterial.responseContentType,
      responseBodyDigest,
      ...(bodyText === undefined ? {} : { responseBodyText: bodyText }),
    }
  } catch (error) {
    return networkCallStarted
      ? {
        state: 'uncertain',
        failureCode: 'network_outcome_unknown',
        evidenceRef: `ae:network-unknown:${canonicalDigest({
          operationRef,
          error: errorName(error),
        })}`,
      }
      : notReleased(operationRef, 'preflight_failed')
  } finally {
    await dispatcher.close().catch(() => undefined)
  }
}

async function reconcileHttpJson(
  dispatch: DispatchPayload,
  operationRef: string,
  persistReleaseFence: PersistReleaseFence,
) {
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
    if (!await persistReleaseFence()) return undefined
    const response = await guardedFetch(endpoint, {
      method: 'POST',
      redirect: 'manual',
      dispatcher,
      signal: AbortSignal.timeout(configuration.reconciliation.requestTimeoutMs),
      body: JSON.stringify({ protocol: 'ae.preparation-reconciliation:v1', operationRef }),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${credential}`,
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
    state: 'not_released',
    failureCode,
    evidenceRef: `ae:not-released:${canonicalDigest({ operationRef, failureCode })}`,
  }
}

function resolveCredential(reference: string): string | undefined {
  const match = /^env:([A-Z][A-Z0-9_]{1,199})$/.exec(reference)
  return match?.[1] === undefined ? undefined : readTrimmedEnv(process.env, match[1])
}

function isHttpConfiguration(value: unknown): value is HttpConfiguration {
  if (!isRecord(value)) return false
  const record = value
  const keys = Object.keys(record).sort()
  const reconciliation = record.reconciliation
  const reconciliationValid = reconciliation === undefined || (isRecord(reconciliation)
    && Object.keys(reconciliation).length === 2
    && typeof reconciliation.path === 'string'
    && /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,1000}$/.test(reconciliation.path)
    && validTimeout(reconciliation.requestTimeoutMs))
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
  if (!isRecord(value)) return false
  const record = value
  return Object.keys(record).length === 4
    && record.protocol === 'ae.preparation-reconciliation:v1'
    && record.operationRef === operationRef
    && (record.disposition === 'released'
      || record.disposition === 'not_released'
      || record.disposition === 'uncertain')
    && typeof record.evidenceRef === 'string'
    && record.evidenceRef.length > 0
    && record.evidenceRef.length <= 500
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown_error'
}

async function readBoundedResponseText(
  response: Awaited<ReturnType<typeof guardedFetch>>,
  maximumBytes: number,
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
