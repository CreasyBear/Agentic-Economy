import { isRecord } from '@/modules/common/is-record'
import { MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import {
  callStatusResultSchema,
  callStatusInputSchema,
} from '@/modules/capability-execution/call-recovery.actions'
import {
  callStatusStateSchema,
  type CallStatusResult,
} from '@/modules/capability-execution/call-recovery-contracts'
import type { CliOptions } from '../lib/args'
import { resolveAgentAccessCredential } from '../lib/config'
import { CliFailure, callJson, heading, line, printJson, requireOk, table } from '../lib/output'
import { usageFailure } from '../lib/help'
import { continuationCommand, continuationFlags } from '../lib/continuation-command'
import {
  connectionContinuationForCli,
  creditContinuationForCli,
  callNextActionForCli,
} from '../lib/suggested-continuation-adapter'

export const MAX_STATUS_WAIT_MS = 60_000
export const MIN_STATUS_DELAY_MS = 100
export const MAX_STATUS_DELAY_MS = 2_000

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined
}

export function callStatusPath(callRef: string): string {
  return CALL_ROUTE_CONTRACT.status.path.replace(
    '{callRef}',
    encodeURIComponent(callRef),
  )
}

const LOOPBACK_HOSTNAMES: Record<string, true> = { localhost: true, '127.0.0.1': true, '::1': true, '[::1]': true }

function configuredApiKeyOrigin(options: CliOptions, rawOrigin: string | undefined): string {
  if (rawOrigin === undefined || rawOrigin.trim().length === 0) {
    throw new CliFailure('Bind the existing credential to the selected Agentic Economy origin before using it.', {
      kind: 'INVALID_ARGUMENT',
      code: 'agent_access_key_origin_required',
      suggestion: 'Preserve the current credential identity and bind it to the exact selected origin.',
      nextCommand: `export AE_API_KEY_ORIGIN=${JSON.stringify(new URL(options.baseUrl).origin)}`,
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

export function requireAgentAccessKey(command: string, options: CliOptions, requiredScope?: string): string {
  const credential = resolveAgentAccessCredential(options.baseUrl, requiredScope)
  if (credential === undefined) {
    const shouldAuthorizeNow = command === 'call'
      || command === 'connect'
      || command === 'request create'
      || command.startsWith('supply ')
    const buyerConnection = connectionContinuationForCli('buyer')
    const connect = requiredScope === MARKET_SUPPLY_MANAGE_SCOPE
      ? { label: 'Authorize provider access for this exact origin.', command: 'ae connect --provider' }
      : { label: buyerConnection?.label ?? 'Authorize buyer access for this exact origin.', command: buyerConnection?.command ?? 'ae connect' }
    const continuation = shouldAuthorizeNow
      ? connect
      : { label: 'Inspect origin-bound connections before authorizing a new identity.', command: 'ae account connections' }
    throw new CliFailure(`No matching credential is selected for ${command} on this origin.`, {
      kind: 'UNAUTHENTICATED',
      code: 'agent_access_key_required',
      suggestion: continuation.label,
      nextCommand: continuation.command,
    })
  }
  configuredApiKeyOrigin(options, credential.origin)
  return credential.accessToken
}

function parseStatusResult(value: unknown): CallStatusResult {
  const parsed = callStatusResultSchema.safeParse(value)
  if (parsed.success) return parsed.data
  throw new CliFailure('The gateway returned an invalid Call status result.', {
    kind: 'UNAVAILABLE',
    code: 'call-status-result-invalid',
  })
}

export function pendingDelay(value: unknown, fallback?: number): number {
  const record = asRecord(value)
  const retryAfterMs = record?.retryAfterMs ?? (record === undefined ? value : undefined)
  if (retryAfterMs === undefined && fallback !== undefined) return fallback
  if (typeof retryAfterMs !== 'number' || !Number.isFinite(retryAfterMs)) {
    throw new CliFailure('The gateway returned a pending result without a bounded retryAfterMs.', {
      kind: 'UNAVAILABLE',
      code: 'call-status-malformed',
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
    throw new CliFailure('The gateway returned a terminal status without a terminal Call result.', {
      kind: 'UNAVAILABLE',
      code: 'call-status-malformed',
    })
  }
  return undefined
}

export function statusCommandFor(callRef: string): string {
  return `ae status ${callRef}`
}

export function statusTransportFailure(_callRef: string): CliFailure {
  const detail = {
    recovery: 'Read Call status again with the same Call identity.',
    identityPreserved: true,
  }
  return new CliFailure(
    'Call status transport is unknown; retry status with the same call identity.',
    {
      kind: 'UNAVAILABLE',
      code: 'call-status-transport-unknown',
      detail,
    },
  )
}

export function recoveryTransportFailure(
  action: 'cancel' | 'reconcile',
  _callRef: string,
  _idempotencyKey: string,
): CliFailure {
  const detail = {
    action,
    recovery: 'Retry with the same call and idempotency identity; do not create a new identity.',
    identityPreserved: true,
  }
  return new CliFailure(
    `Call ${action} transport is unknown; do not retry with a new identity.`,
    {
      kind: 'UNAVAILABLE',
      code: `call-${action}-transport-unknown`,
      detail,
    },
  )
}

type StatusContinuation = Readonly<{ command?: string; warning?: string }>

/** A refused status is a failure like every other refusal, so it must not exit 0. */
export const STATUS_REFUSED_EXIT_CODE = 1

export function renderStatusResult(
  title: string,
  callRef: string,
  body: unknown,
  options: CliOptions,
): number {
  const record = asRecord(body)
  let continuation: StatusContinuation | undefined
  if (record?.kind === 'found' || record?.kind === 'refused') {
    const parsedState = callStatusStateSchema.safeParse(record.state)
    const usage = asRecord(record.usage)
    continuation = record.code === 'invocation_not_found'
      // An unknown Call cannot become known by asking again for it.
      ? { command: 'ae history' }
      : usage?.chargeState === 'insufficient_credit'
        ? creditContinuationForCli()
        : callNextActionForCli({
            kind: record.kind,
            callRef,
            ...(parsedState.success ? { state: parsedState.data } : {}),
            ...(typeof record.retryable === 'boolean' ? { retryable: record.retryable } : {}),
          })
  }
  const continuationSuffix = continuationCommand(continuationFlags(options))
  const nextCommand = continuation?.command === undefined
    ? undefined
    : continuationSuffix.length === 0
      ? continuation.command
      : `${continuation.command} ${continuationSuffix}`
  const warning = continuation?.warning
  const exitCode = record?.kind === 'refused' ? STATUS_REFUSED_EXIT_CODE : 0
  if (options.json) {
    printJson(record === undefined || nextCommand === undefined
      ? body
      : {
          ...record,
          nextCommand,
          ...(warning === undefined ? {} : { warning }),
        })
    return exitCode
  }
  heading(`${title} ${callRef}`)
  table([
    ['status', typeof record?.state === 'string' ? record.state : typeof record?.kind === 'string' ? record.kind : 'unknown'],
    ['tool', typeof record?.toolRef === 'string' ? record.toolRef : 'unknown'],
  ])
  if (nextCommand !== undefined) line(`  next: ${nextCommand}`)
  if (continuation?.warning !== undefined) line(`  warning: ${continuation.warning}`)
  line(JSON.stringify(body, undefined, 2))
  return exitCode
}

export async function readCallStatus(
  options: CliOptions,
  callRef: string,
  credentialCommand = 'status',
): Promise<CallStatusResult> {
  const apiKey = requireAgentAccessKey(credentialCommand, options)
  const path = callStatusPath(callRef)
  const outcome = await callJson(options.baseUrl, path, {
    method: CALL_ROUTE_CONTRACT.status.method,
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  return parseStatusResult(requireOk(outcome, 'Call status'))
}

export async function runStatusCommand(args: readonly string[], options: CliOptions): Promise<number> {
  const callRef = args[0]?.trim()
  const parsedRef = callStatusInputSchema.safeParse({ callRef })
  if (!parsedRef.success || args.length > 1) {
    throw usageFailure('status', 'status-usage')
  }

  let body: CallStatusResult
  try {
    body = await readCallStatus(options, parsedRef.data.callRef)
  } catch (error) {
    if (error instanceof CliFailure && error.kind !== 'UNAVAILABLE') throw error
    throw statusTransportFailure(parsedRef.data.callRef)
  }
  return renderStatusResult('Call status', parsedRef.data.callRef, body, options)
}
