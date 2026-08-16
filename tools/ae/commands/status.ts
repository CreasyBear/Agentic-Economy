import { isRecord } from '@/modules/common/is-record'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import {
  operationInvokeStatusResultSchema,
  operationStatusInputSchema,
} from '@/modules/capability-execution/operation-recovery.actions'
import type { OperationInvokeStatusResult } from '@/modules/capability-execution/operation-invoke'
import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk, table } from '../lib/output'

export const MAX_STATUS_WAIT_MS = 60_000
export const MIN_STATUS_DELAY_MS = 100
export const MAX_STATUS_DELAY_MS = 2_000

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined
}

export function operationStatusPath(invocationRef: string): string {
  return OPERATION_INVOKE_ROUTE_CONTRACT.status.path.replace(
    '{invocationRef}',
    encodeURIComponent(invocationRef),
  )
}

const LOOPBACK_HOSTNAMES: Record<string, true> = { localhost: true, '127.0.0.1': true, '::1': true, '[::1]': true }

function configuredApiKeyOrigin(options: CliOptions): string {
  const rawOrigin = process.env.AE_API_KEY_ORIGIN?.trim()
  if (rawOrigin === undefined || rawOrigin.length === 0) {
    throw new CliFailure('Set AE_API_KEY_ORIGIN to the exact server origin used by AE_API_KEY.', {
      kind: 'INVALID_ARGUMENT',
      code: 'agent_access_key_origin_required',
    })
  }

  let baseUrl: URL
  let originUrl: URL
  try {
    baseUrl = new URL(options.baseUrl)
    originUrl = new URL(rawOrigin)
  } catch {
    throw new CliFailure('AE_API_KEY_ORIGIN and --base-url must be valid server URLs.', {
      kind: 'INVALID_ARGUMENT',
      code: 'agent_access_key_origin_invalid',
    })
  }
  const isExactOrigin = (
    (baseUrl.protocol === 'http:' || baseUrl.protocol === 'https:')
    && baseUrl.username === ''
    && baseUrl.password === ''
    && (baseUrl.pathname === '' || baseUrl.pathname === '/')
    && baseUrl.search === ''
    && baseUrl.hash === ''
    && (originUrl.protocol === 'http:' || originUrl.protocol === 'https:')
    && originUrl.username === ''
    && originUrl.password === ''
    && (originUrl.pathname === '' || originUrl.pathname === '/')
    && originUrl.search === ''
    && originUrl.hash === ''
  )
  if (!isExactOrigin) {
    throw new CliFailure('AE_API_KEY_ORIGIN and --base-url must be valid exact HTTP(S) origins without paths, queries, or credentials.', {
      kind: 'INVALID_ARGUMENT',
      code: 'agent_access_key_origin_invalid',
    })
  }
  if (originUrl.origin !== baseUrl.origin) {
    throw new CliFailure(`AE_API_KEY_ORIGIN (${originUrl.origin}) does not match --base-url origin (${baseUrl.origin}).`, {
      kind: 'INVALID_ARGUMENT',
      code: 'agent_access_key_origin_mismatch',
      detail: { apiKeyOrigin: originUrl.origin, baseOrigin: baseUrl.origin },
    })
  }
  const isLoopbackHttp = baseUrl.protocol === 'http:' && LOOPBACK_HOSTNAMES[baseUrl.hostname.toLowerCase()] === true
  if (baseUrl.protocol !== 'https:' && !isLoopbackHttp) {
    throw new CliFailure('AE_API_KEY may only be sent over HTTPS, except to loopback HTTP development origins.', {
      kind: 'INVALID_ARGUMENT',
      code: 'agent_access_key_origin_insecure',
      detail: { baseOrigin: baseUrl.origin },
    })
  }
  return originUrl.origin
}

export function requireAgentAccessKey(command: string, options: CliOptions): string {
  const apiKey = process.env.AE_API_KEY?.trim()
  if (apiKey === undefined || apiKey.length === 0) {
    throw new CliFailure(`Set AE_API_KEY to read operation ${command}.`, {
      kind: 'UNAUTHENTICATED',
      code: 'agent_access_key_required',
    })
  }
  configuredApiKeyOrigin(options)
  return apiKey
}

function parseStatusResult(value: unknown): OperationInvokeStatusResult {
  const parsed = operationInvokeStatusResultSchema.safeParse(value)
  if (parsed.success) return parsed.data
  throw new CliFailure('The gateway returned an invalid operation status result.', {
    kind: 'UNAVAILABLE',
    code: 'operation-status-result-invalid',
  })
}

export function pendingDelay(value: unknown, fallback?: number): number {
  const record = asRecord(value)
  const retryAfterMs = record?.retryAfterMs ?? (record === undefined ? value : undefined)
  if (retryAfterMs === undefined && fallback !== undefined) return fallback
  if (typeof retryAfterMs !== 'number' || !Number.isFinite(retryAfterMs)) {
    throw new CliFailure('The gateway returned a pending result without a bounded retryAfterMs.', {
      kind: 'UNAVAILABLE',
      code: 'invoke-status-malformed',
    })
  }
  return Math.min(MAX_STATUS_DELAY_MS, Math.max(MIN_STATUS_DELAY_MS, retryAfterMs))
}

export function terminalResult(value: unknown): unknown | undefined {
  const body = asRecord(value)
  if (body === undefined) return undefined
  if (body.kind === 'refused' || body.kind === 'reconciliation_required') return value
  if (body.kind !== 'found') return undefined
  const result = asRecord(body.result)
  if (result !== undefined && (
    result.kind === 'completed'
    || result.kind === 'refused'
    || result.kind === 'reconciliation_required'
  )) return result
  if (body.state === 'cancelled' || body.state === 'reconciliation_required') return value
  if (body.state === 'terminal' || body.state === 'invalidated') {
    throw new CliFailure('The gateway returned a terminal status without a terminal operation result.', {
      kind: 'UNAVAILABLE',
      code: 'invoke-status-malformed',
    })
  }
  return undefined
}

export function statusCommandFor(invocationRef: string): string {
  return `npm run -s ae -- status ${invocationRef}`
}

export function statusTransportFailure(_invocationRef: string): CliFailure {
  const detail = {
    recovery: 'Read operation status again with the same invocation identity.',
    identityPreserved: true,
  }
  return new CliFailure(
    'Operation status transport is unknown; retry status with the same invocation identity.',
    {
      kind: 'UNAVAILABLE',
      code: 'operation-status-transport-unknown',
      detail,
    },
  )
}

export function recoveryTransportFailure(
  action: 'cancel' | 'reconcile',
  _invocationRef: string,
  _idempotencyKey: string,
): CliFailure {
  const detail = {
    action,
    recovery: 'Retry with the same invocation and idempotency identity; do not create a new identity.',
    identityPreserved: true,
  }
  return new CliFailure(
    `Operation ${action} transport is unknown; do not retry with a new identity.`,
    {
      kind: 'UNAVAILABLE',
      code: `operation-${action}-transport-unknown`,
      detail,
    },
  )
}

export function renderStatusResult(
  title: string,
  invocationRef: string,
  body: unknown,
  options: CliOptions,
): void {
  if (options.json) {
    printJson(body)
    return
  }
  heading(`${title} ${invocationRef}`)
  const record = asRecord(body)
  table([
    ['status', typeof record?.state === 'string' ? record.state : typeof record?.kind === 'string' ? record.kind : 'unknown'],
    ['operation', typeof record?.operationRef === 'string' ? record.operationRef : 'unknown'],
  ])
  line(JSON.stringify(body, undefined, 2))
}

export async function readOperationStatus(
  options: CliOptions,
  invocationRef: string,
): Promise<OperationInvokeStatusResult> {
  const apiKey = requireAgentAccessKey('status', options)
  const path = operationStatusPath(invocationRef)
  const outcome = await callJson(options.baseUrl, path, {
    method: OPERATION_INVOKE_ROUTE_CONTRACT.status.method,
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  return parseStatusResult(requireOk(outcome, 'operation status'))
}

export async function runStatusCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const invocationRef = args[0]?.trim()
  const parsedRef = operationStatusInputSchema.safeParse({ invocationRef })
  if (!parsedRef.success || args.length > 1) {
    throw new CliFailure('Usage: npm run -s ae -- status <invocation-ref>', {
      kind: 'INVALID_ARGUMENT',
      code: 'status-usage',
    })
  }

  let body: OperationInvokeStatusResult
  try {
    body = await readOperationStatus(options, parsedRef.data.invocationRef)
  } catch (error) {
    if (error instanceof CliFailure && error.kind !== 'UNAVAILABLE') throw error
    throw statusTransportFailure(parsedRef.data.invocationRef)
  }
  renderStatusResult('Operation status', parsedRef.data.invocationRef, body, options)
}

