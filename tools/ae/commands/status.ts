import { isRecord } from '@/modules/common/is-record'
import { statusRefSchema, validateJourneyNext } from '@/modules/actions/contract'
import { journeyStatusResultSchema } from '@/modules/actions/status.actions'
import { MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import { callStatusResultSchema } from '@/modules/capability-execution/call-recovery.actions'
import type { CallStatusResult } from '@/modules/capability-execution/call-recovery-contracts'
import type { CliOptions } from '../lib/args'
import { resolveAgentAccessCredential } from '../lib/config'
import { CLI_REQUEST_TIMEOUT_MS, CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import { usageFailure } from '../lib/help'
import { journeyNextCommand } from '../lib/journey-next-command'
import { CALL_REF_FORMAT_EXAMPLE } from '../lib/tool-ref-format'
import { connectionContinuationForCli } from '../lib/suggested-continuation-adapter'
import { cliContinuation, shellArgument } from '../lib/continuation-command'
export { renderStatusResult, STATUS_REFUSED_EXIT_CODE } from './status-render'

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
      nextCommand: `export AE_API_KEY_ORIGIN=${shellArgument(new URL(options.baseUrl).origin)}`,
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

export async function readCallStatus(
  options: CliOptions,
  callRef: string,
  credentialCommand = 'status',
  timeoutMs = CLI_REQUEST_TIMEOUT_MS,
): Promise<CallStatusResult> {
  const apiKey = requireAgentAccessKey(credentialCommand, options)
  const path = callStatusPath(callRef)
  const outcome = await callJson(options.baseUrl, path, {
    method: CALL_ROUTE_CONTRACT.status.method,
    headers: { Authorization: `Bearer ${apiKey}` },
  }, Math.min(CLI_REQUEST_TIMEOUT_MS, timeoutMs))
  return parseStatusResult(requireOk(outcome, 'Call status'))
}

/** Status accepts the original canonical ref without guessing its kind. */
function statusCallRefUsageFailure(options: CliOptions): CliFailure {
  return new CliFailure(
    `Usage: ae status <ref>. Supply a Tool, Quote, Call or Turn ref; a Call ref looks like ${CALL_REF_FORMAT_EXAMPLE}.`,
    {
      kind: 'INVALID_ARGUMENT',
      code: 'status-usage',
      suggestion: 'List your Calls to find an exact call ref.',
      nextCommand: cliContinuation(options, ['ae', 'history']),
    },
  )
}

export async function runStatusCommand(args: readonly string[], options: CliOptions): Promise<number> {
  const ref = args[0]?.trim()
  if (args.length !== 1 || !ref) throw usageFailure('status', 'status-usage')
  const kind = ref.startsWith('operation:v1:') ? 'tool'
    : ref.startsWith('operation-commitment:v1:') ? 'quote'
    : ref.startsWith('operation-invocation:v1:') ? 'call'
    : ref.startsWith('turn_') ? 'turn' : undefined
  const parsedRef = kind === undefined ? undefined : statusRefSchema.safeParse({ kind, ref })
  if (!parsedRef?.success) throw statusCallRefUsageFailure(options)
  let apiKey: string
  try {
    apiKey = requireAgentAccessKey('status', options)
  } catch (error) {
    if (parsedRef.data.kind !== 'tool' || !(error instanceof CliFailure) || error.kind !== 'UNAUTHENTICATED') throw error
    throw new CliFailure('Journey status requires buyer authentication.', {
      kind: 'UNAUTHENTICATED', code: 'agent_access_key_required',
      suggestion: `Anonymous Tool information is available via ${cliContinuation(options, ['ae', 'describe', ref])}.`,
      next: [{ action: 'registry.tools.describe', args: { toolRef: parsedRef.data.ref }, authority: 'public' }],
    })
  }
  const outcome = await callJson(options.baseUrl, `/api/v1/status/${encodeURIComponent(ref)}`, {
    method: 'GET', headers: { Authorization: `Bearer ${apiKey}` },
  })
  const result = requireOk(outcome, 'Journey status')
  if (!isRecord(result)) {
    throw new CliFailure('Journey status response is malformed.', { kind: 'UNAVAILABLE', code: 'invalid_journey_status' })
  }
  const parsed = journeyStatusResultSchema.safeParse({ ...result, next: validateJourneyNext(result.next, { origin: options.baseUrl }) })
  if (!parsed.success) {
    throw new CliFailure(`Journey status response is malformed at ${parsed.error.issues[0]?.path.join('.') || 'response'}.`, { kind: 'UNAVAILABLE', code: 'invalid_journey_status' })
  }
  if (parsed.data.kind !== kind || parsed.data.ref !== ref) {
    throw new CliFailure('Journey status response does not match the requested ref.', { kind: 'UNAVAILABLE', code: 'invalid_journey_status' })
  }
  const body = parsed.data
  if (options.json) printJson(body)
  else {
    heading(`${kind[0]!.toUpperCase()}${kind.slice(1)} status`)
    line(`Ref: ${ref}`)
    if (body.kind === 'tool') line(`Readiness: ${body.readiness}`)
    if (body.kind === 'quote') line(`Commitment: ${body.commitment}`)
    if (body.kind === 'call' || body.kind === 'turn') line(`State: ${body.workState}`)
    if (body.kind === 'call') line(`Recovery: ${JSON.stringify(body.recovery)}`)
    for (const next of body.next) line(`Next: ${journeyNextCommand(next, options) ?? `${next.action} ${JSON.stringify(next.args)}`}`)
  }
  return body.workState === 'failed' || body.workState === 'rejected' ||
    body.kind === 'quote' && body.commitment === 'refused' ? 1 : 0
}
