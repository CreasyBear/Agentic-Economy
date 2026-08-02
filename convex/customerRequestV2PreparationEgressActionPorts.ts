"use node";

import { Agent, fetch as guardedFetch } from 'undici'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { isRecord } from '@/modules/common/is-record'
import type {
  CustomerRequestV2PreparationEgressActionPorts,
  DispatchPayload,
  DispatchResult,
} from '@/modules/customer-request/v2-preparation-egress'
import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'

import { internal } from './_generated/api'
import type { ActionCtx } from './_generated/server'

type HttpConfiguration = Readonly<{
  method: 'POST'
  requestTimeoutMs: number
  reconciliation?: Readonly<{ path: string; requestTimeoutMs: number }>
}>

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

    dispatchRegisteredAdapter: dispatchRegisteredAdapter,
    reconcileRegisteredAdapter: reconcileRegisteredAdapter,
    now: () => Date.now(),
  }
}

const adapterDispatchers = new Map<string, (dispatch: DispatchPayload, operationRef: string) => Promise<DispatchResult>>([
  ['http-json:v1', dispatchHttpJson],
])
const adapterReconcilers = new Map<string, (
  dispatch: DispatchPayload, operationRef: string,
) => Promise<{
  disposition: 'released' | 'not_released' | 'uncertain'
  providerEvidenceRef: string
  responseDigest: string
} | undefined>>([
  ['http-json:v1', reconcileHttpJson],
])

async function dispatchRegisteredAdapter(
  dispatch: DispatchPayload,
  operationRef: string,
): Promise<DispatchResult> {
  const adapter = adapterDispatchers.get(dispatch.adapterId)
  if (adapter === undefined) return notReleased(operationRef, 'adapter_not_registered')
  return await adapter(dispatch, operationRef)
}

async function reconcileRegisteredAdapter(dispatch: DispatchPayload, operationRef: string) {
  return await adapterReconcilers.get(dispatch.adapterId)?.(dispatch, operationRef)
}

async function dispatchHttpJson(
  dispatch: DispatchPayload,
  operationRef: string,
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

async function reconcileHttpJson(dispatch: DispatchPayload, operationRef: string) {
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
  return match?.[1] === undefined ? undefined : process.env[match[1]]
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
