/**
 * Canonical error model for Agentic-Economy, anchored to RFC 9457 (Problem
 * Details for HTTP APIs) and the Google API canonical error codes
 * (`google.rpc.Code`). Every HTTP error body and the CLI error envelope are
 * projected from this single model; this is the shape a consumer can rely on.
 *
 * `kind` is a canonical problem kind (google.rpc.Code subset + repo
 * extensions); `code` is the stable machine token (kernel refusal/error codes,
 * per-route codes, SSE gate codes). No bespoke enum or envelope is invented —
 * the wire format follows the published standard.
 */
import type { OperationExecuteResult } from '@/modules/capability-execution'

/** Canonical problem kinds (google.rpc.Code subset + repo-native extensions). */
export const PROBLEM_KINDS = [
  'INVALID_ARGUMENT',
  'FAILED_PRECONDITION',
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'NOT_FOUND',
  'ALREADY_EXISTS',
  'METHOD_NOT_ALLOWED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RESOURCE_EXHAUSTED',
  'UNAVAILABLE',
  'INTERNAL',
  'UNKNOWN',
  // Repo-native: ok-outcome but matched nothing; NOT an error.
  'no_data',
] as const

export type ProblemKind = (typeof PROBLEM_KINDS)[number]

/** Default HTTP status per kind (overridable per problem). `no_data` is 200 by design. */
export const DEFAULT_STATUS: Record<ProblemKind, number> = {
  INVALID_ARGUMENT: 400,
  FAILED_PRECONDITION: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  METHOD_NOT_ALLOWED: 405,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RESOURCE_EXHAUSTED: 429,
  UNAVAILABLE: 503,
  INTERNAL: 500,
  UNKNOWN: 500,
  no_data: 200,
}

const KIND_BY_STATUS: Record<number, ProblemKind> = {
  400: 'INVALID_ARGUMENT',
  401: 'UNAUTHENTICATED',
  403: 'PERMISSION_DENIED',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'ALREADY_EXISTS',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'FAILED_PRECONDITION',
  429: 'RESOURCE_EXHAUSTED',
  500: 'INTERNAL',
  503: 'UNAVAILABLE',
}

/** Best-effort canonical kind for an HTTP status (used where only a status is known). */
export function kindForStatus(status: number): ProblemKind {
  return KIND_BY_STATUS[status] ?? 'UNKNOWN'
}

const TITLE_BY_KIND: Record<ProblemKind, string> = {
  INVALID_ARGUMENT: 'Invalid argument',
  FAILED_PRECONDITION: 'Failed precondition',
  UNAUTHENTICATED: 'Unauthenticated',
  PERMISSION_DENIED: 'Permission denied',
  NOT_FOUND: 'Not found',
  ALREADY_EXISTS: 'Already exists',
  METHOD_NOT_ALLOWED: 'Method not allowed',
  PAYLOAD_TOO_LARGE: 'Payload too large',
  UNSUPPORTED_MEDIA_TYPE: 'Unsupported media type',
  RESOURCE_EXHAUSTED: 'Resource exhausted',
  UNAVAILABLE: 'Unavailable',
  INTERNAL: 'Internal error',
  UNKNOWN: 'Unknown error',
  no_data: 'No data',
}

/** Short human title for a kind (overridable per problem). */
export function defaultTitle(kind: ProblemKind): string {
  return TITLE_BY_KIND[kind]
}

/** Input to build a problem-details object; projected by {@link buildProblem}. */
export type ProblemInput = {
  kind: ProblemKind
  /** Stable machine token (kernel refusal/error code, per-route code, SSE code). */
  code: string
  title?: string
  detail?: string
  reason?: string
  instance?: string
  retryable?: boolean
  /** Overrides DEFAULT_STATUS when projecting to HTTP. */
  status?: number
  /** Route-specific extension fields (e.g. `fields`, `unsupported`, `supported`). */
  extras?: Readonly<Record<string, unknown>>
}

/** RFC 9457 problem-details object. */
export type ProblemDetails = {
  type: 'about:blank'
  title: string
  status: number
  detail?: string
  instance?: string
  kind: ProblemKind
  code: string
  reason?: string
  retryable?: boolean
} & { [key: string]: unknown }

/**
 * Pure projection of {@link ProblemInput} into the RFC 9457 wire object.
 * `status` defaults from the kind unless overridden; `detail`/`instance` are
 * emitted only when provided; any extension members (`extras`) are spread
 * FIRST so the canonical members (type/title/status/kind/code/...) always win —
 * a caller can never accidentally overwrite a reserved key via `extras`.
 */
export function buildProblem(input: ProblemInput): ProblemDetails {
  const status = input.status ?? DEFAULT_STATUS[input.kind]
  const title = input.title ?? defaultTitle(input.kind)
  const detail = input.detail
  return {
    ...input.extras,
    type: 'about:blank',
    title,
    status,
    ...(detail === undefined ? {} : { detail }),
    ...(input.instance === undefined ? {} : { instance: input.instance }),
    kind: input.kind,
    code: input.code,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.retryable === undefined ? {} : { retryable: input.retryable }),
  }
}

/**
 * Failure codes emitted by the authenticated operation gateway. These are
 * intentionally a projection vocabulary, not a second domain error model:
 * runtime/action results stay typed, while HTTP/MCP adapters use this mapper
 * for protocol failures only.
 */
export const GATEWAY_PROBLEM_CODES = [
  'authentication_required',
  'access_grant_required',
  'scope_required',
  'operation_not_found',
  'operation_input_invalid',
  'input_invalid',
  'operation_not_current',
  'operation_unsupported',
  'operation_not_admitted',
  'operation_not_ready',
  'operation_withdrawn',
  'grant_not_found',
  'grant_revoked',
  'grant_generation_stale',
  'environment_mismatch',
  'authority_required',
  'authority_denied',
  'authority_expired',
  'budget_exceeded',
  'budget_exhausted',
  'rate_limited',
  'rate_limit_exceeded',
  'concurrency_limited',
  'concurrency_limit',
  'idempotency_conflict',
  'provider_unavailable',
  'provider_refused',
  'pre_release_failed',
  'outcome_unknown',
  'reconciliation_required',
  'invocation_not_found',
  'lease_not_current',
  'result_invalid',
  'source_unavailable',
  'invocation_runtime_unavailable',
  'authority_reader_unavailable',
  'invocation_in_progress',
  'invocation_cancelled',
  'operation_invoke_unavailable',
  'operation_invoke_result_invalid',
  'operation_invoke_failed',
] as const

export type GatewayProblemCode = (typeof GATEWAY_PROBLEM_CODES)[number]

export type GatewayFailureInput = Readonly<{
  code?: string
  reason?: string
  retryable?: boolean
  kind?: 'refused' | 'error'
}>

const GATEWAY_CODE_KIND: Readonly<Record<string, ProblemKind>> = {
  authentication_required: 'UNAUTHENTICATED',
  access_grant_required: 'PERMISSION_DENIED',
  scope_required: 'PERMISSION_DENIED',
  operation_not_found: 'NOT_FOUND',
  operation_input_invalid: 'INVALID_ARGUMENT',
  input_invalid: 'INVALID_ARGUMENT',
  operation_not_current: 'FAILED_PRECONDITION',
  operation_unsupported: 'FAILED_PRECONDITION',
  operation_not_admitted: 'FAILED_PRECONDITION',
  operation_not_ready: 'FAILED_PRECONDITION',
  operation_withdrawn: 'FAILED_PRECONDITION',
  grant_not_found: 'PERMISSION_DENIED',
  grant_revoked: 'PERMISSION_DENIED',
  grant_expired: 'PERMISSION_DENIED',
  grant_generation_stale: 'PERMISSION_DENIED',
  environment_mismatch: 'FAILED_PRECONDITION',
  authority_required: 'FAILED_PRECONDITION',
  authority_denied: 'PERMISSION_DENIED',
  authority_expired: 'FAILED_PRECONDITION',
  budget_exceeded: 'RESOURCE_EXHAUSTED',
  budget_exhausted: 'RESOURCE_EXHAUSTED',
  rate_limited: 'RESOURCE_EXHAUSTED',
  rate_limit_exceeded: 'RESOURCE_EXHAUSTED',
  concurrency_limited: 'RESOURCE_EXHAUSTED',
  concurrency_limit: 'RESOURCE_EXHAUSTED',
  idempotency_conflict: 'ALREADY_EXISTS',
  provider_unavailable: 'UNAVAILABLE',
  provider_refused: 'FAILED_PRECONDITION',
  pre_release_failed: 'FAILED_PRECONDITION',
  outcome_unknown: 'UNAVAILABLE',
  reconciliation_required: 'FAILED_PRECONDITION',
  invocation_not_found: 'NOT_FOUND',
  lease_not_current: 'FAILED_PRECONDITION',
  result_invalid: 'INTERNAL',
  source_unavailable: 'UNAVAILABLE',
  invocation_runtime_unavailable: 'UNAVAILABLE',
  authority_reader_unavailable: 'UNAVAILABLE',
  invocation_in_progress: 'ALREADY_EXISTS',
  operation_invoke_unavailable: 'UNAVAILABLE',
  operation_invoke_result_invalid: 'INTERNAL',
  operation_invoke_failed: 'INTERNAL',
  invocation_cancelled: 'FAILED_PRECONDITION',
}

const PUBLIC_STABLE_CODE_PATTERN = /^[a-z][a-z0-9_:-]{0,95}$/u

/** True when an untrusted value is a stable machine token safe to surface as `code`. */
export function isStableProblemCode(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_STABLE_CODE_PATTERN.test(value)
}

function publicGatewayCode(code: string | undefined, fallback: GatewayProblemCode): string {
  return code !== undefined && PUBLIC_STABLE_CODE_PATTERN.test(code) ? code : fallback
}

/**
 * Project an untrusted remote problem body (another deployment, a proxy, or a
 * hostile `--base-url`) onto the shared model. Only the stable `code`, the
 * canonical `kind`, and retryability cross the boundary: remote `title` and
 * `detail` are arbitrary backend prose and are never copied, for the same
 * reason {@link gatewayFailureToProblem} does not copy provider text. Human
 * text is rebuilt locally from the kind. `no_data` is an ok-outcome kind and
 * is never accepted from a failure body.
 */
export function remoteProblemToProblem(input: {
  status: number
  body: Readonly<Record<string, unknown>>
}): ProblemDetails {
  const declaredKind = PROBLEM_KINDS.find(
    (candidate) => candidate !== 'no_data' && candidate === input.body.kind,
  )
  const retryable = input.body.retryable
  return buildProblem({
    kind: declaredKind ?? kindForStatus(input.status),
    code: isStableProblemCode(input.body.code) ? input.body.code : String(input.status),
    status: input.status,
    ...(typeof retryable === 'boolean' ? { retryable } : {}),
  })
}

/**
 * Project an authenticated gateway failure onto the shared RFC 9457 model.
 * Provider text and arbitrary runtime details are deliberately not copied:
 * callers receive stable taxonomy and retryability, never content-shaped
 * exceptions or supplier responses.
 */
export function gatewayFailureToProblem(input: GatewayFailureInput): ProblemInput {
  const code = publicGatewayCode(input.code, input.kind === 'refused' ? 'operation_not_admitted' : 'operation_invoke_failed')
  const mapped = GATEWAY_CODE_KIND[code]
  const kind = mapped
    ?? (input.kind === 'refused'
      ? 'FAILED_PRECONDITION'
      : input.retryable === true ? 'UNAVAILABLE' : 'INTERNAL')
  return {
    kind,
    code,
    ...(input.retryable === undefined ? {} : { retryable: input.retryable }),
  }
}

/**
 * HTTP/MCP adapters keep domain outcomes as successful typed responses. Only
 * refusal/error variants are projected to Problem Details.
 */
export function operationInvokeResultToProblem(result: unknown): ProblemInput | null {
  if (typeof result !== 'object' || result === null || !('kind' in result)) {
    return gatewayFailureToProblem({ kind: 'error' })
  }
  const record = result as Record<string, unknown>
  if (
    record.kind === 'completed'
    || record.kind === 'pending'
    || record.kind === 'needs_authority'
    || record.kind === 'reconciliation_required'
  ) {
    return null
  }
  if (record.kind === 'refused' || record.kind === 'error') {
    return gatewayFailureToProblem({
      kind: record.kind,
      ...(typeof record.code === 'string' ? { code: record.code } : {}),
      ...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
      ...(typeof record.retryable === 'boolean' ? { retryable: record.retryable } : {}),
    })
  }
  return gatewayFailureToProblem({ kind: 'error' })
}

/**
 * Map a keyless-execution outcome to a {@link ProblemInput}. Returns `null`
 * for `ok` (not an error). `refused` and `error` carry their stable code +
 * canonical kind; refusal honesty is preserved via `code`/`reason`/`detail`.
 */
export function operationResultToProblem(result: OperationExecuteResult): ProblemInput | null {
  if (result.kind === 'ok') return null
  if (result.kind === 'refused') {
    switch (result.reason) {
      case 'operation_not_found':
        return { kind: 'NOT_FOUND', code: 'operation_not_found' }
      case 'input_invalid':
        return { kind: 'INVALID_ARGUMENT', code: 'input_invalid' }
      default:
        return { kind: 'FAILED_PRECONDITION', code: result.reason }
    }
  }
  const { retryable, code, reason } = result
  return {
    kind: retryable ? 'UNAVAILABLE' : 'INTERNAL',
    code,
    retryable,
    detail: reason,
  }
}

/** Public answer-turn error codes. Unknown private/provider codes are redacted. */
export const ANSWER_TURN_PROBLEM_CODES = [
  'invalid_content_type',
  'payload_too_large',
  'invalid_body',
  'rate_limited',
  'thread_forbidden',
  'thread_not_found',
  'thread_turn_limit',
  'missing_auth',
  'missing_convex_url',
  'answer_turn_failed',
  'answer_turn_persist_failed',
  'empty_prose',
  'grounding_failed',
  'epistemic_vocabulary',
  'injection_upgrade',
  'unsupported_provider_claim',
  'unavailable',
  'source_unavailable',
  'duplicate_operation_ref',
  'tool_unavailable',
  'prose_failed',
  'request_failed',
  'missing_turn_key',
  'answer_turn_idempotency_conflict',
  'answer_turn_in_progress',
] as const

export type AnswerTurnProblemCode = (typeof ANSWER_TURN_PROBLEM_CODES)[number]

type AnswerTurnProblemKind = Exclude<ProblemKind, 'no_data'>

/** Safe public answer failure. It intentionally has no reason, instance, or copy identifier. */
export type AnswerTurnProblem = Readonly<{
  type: string
  title: string
  status: number
  kind: AnswerTurnProblemKind
  code: AnswerTurnProblemCode
  detail?: string
  retryable?: boolean
}>

type AnswerTurnProblemDefinition = Readonly<{
  kind: AnswerTurnProblemKind
  status?: number
  detail: string
  retryable?: boolean
}>

const ANSWER_TURN_PROBLEM_DEFINITIONS: Readonly<Record<AnswerTurnProblemCode, AnswerTurnProblemDefinition>> = {
  invalid_content_type: { kind: 'UNSUPPORTED_MEDIA_TYPE', detail: 'Send the answer request as application/json.' },
  payload_too_large: { kind: 'PAYLOAD_TOO_LARGE', detail: 'The answer request is too large.' },
  invalid_body: { kind: 'INVALID_ARGUMENT', detail: 'The answer request body is invalid.' },
  rate_limited: { kind: 'RESOURCE_EXHAUSTED', detail: 'Too many answer requests. Try again shortly.', retryable: true },
  thread_forbidden: { kind: 'PERMISSION_DENIED', detail: 'This answer thread is not available to this browser.' },
  thread_not_found: { kind: 'NOT_FOUND', detail: 'This answer thread is not available.' },
  thread_turn_limit: {
    kind: 'RESOURCE_EXHAUSTED',
    status: 429,
    detail: 'This answer thread has reached its turn limit.',
  },
  missing_auth: { kind: 'UNAUTHENTICATED', detail: 'An owner session is required for this answer request.' },
  missing_convex_url: {
    kind: 'UNAVAILABLE',
    status: 503,
    detail: 'The answer service is not configured.',
    retryable: true,
  },
  answer_turn_failed: { kind: 'INTERNAL', detail: 'The answer could not be completed.' },
  answer_turn_persist_failed: { kind: 'INTERNAL', detail: 'The answer could not be saved.', retryable: true },
  empty_prose: { kind: 'FAILED_PRECONDITION', detail: 'The answer did not contain usable text.' },
  grounding_failed: { kind: 'FAILED_PRECONDITION', detail: 'The answer did not meet grounding requirements.' },
  epistemic_vocabulary: { kind: 'FAILED_PRECONDITION', detail: 'The answer did not meet language safety requirements.' },
  injection_upgrade: { kind: 'FAILED_PRECONDITION', detail: 'The answer did not meet language safety requirements.' },
  unsupported_provider_claim: { kind: 'FAILED_PRECONDITION', detail: 'The answer included an unsupported provider claim.' },
  unavailable: { kind: 'UNAVAILABLE', detail: 'The answer service is temporarily unavailable.', retryable: true },
  source_unavailable: { kind: 'UNAVAILABLE', detail: 'The answer source is temporarily unavailable.', retryable: true },
  duplicate_operation_ref: { kind: 'FAILED_PRECONDITION', detail: 'The answer used a duplicate operation.' },
  tool_unavailable: { kind: 'UNAVAILABLE', detail: 'An answer capability is temporarily unavailable.', retryable: true },
  prose_failed: { kind: 'INTERNAL', detail: 'The answer text could not be produced.', retryable: true },
  request_failed: { kind: 'UNAVAILABLE', detail: 'The answer request could not be completed.', retryable: true },
  missing_turn_key: { kind: 'INVALID_ARGUMENT', detail: 'A turn idempotency key is required.' },
  answer_turn_idempotency_conflict: {
    kind: 'ALREADY_EXISTS',
    detail: 'This turn key was already used for a different request.',
  },
  answer_turn_in_progress: { kind: 'ALREADY_EXISTS', detail: 'This turn is already in progress.' },
}

const isAnswerTurnProblemCode = (value: string): value is AnswerTurnProblemCode =>
  (ANSWER_TURN_PROBLEM_CODES as readonly string[]).includes(value)

function projectAnswerTurnProblem(
  code: AnswerTurnProblemCode,
): AnswerTurnProblem {
  const definition = ANSWER_TURN_PROBLEM_DEFINITIONS[code]
  const problem = buildProblem({
    kind: definition.kind,
    code,
    ...(definition.status === undefined ? {} : { status: definition.status }),
    detail: definition.detail,
    ...(definition.retryable === undefined ? {} : { retryable: definition.retryable }),
  })
  return {
    type: problem.type,
    title: problem.title,
    status: problem.status,
    kind: problem.kind as AnswerTurnProblemKind,
    code,
    ...(problem.detail === undefined ? {} : { detail: problem.detail }),
    ...(problem.retryable === undefined ? {} : { retryable: problem.retryable }),
  }
}

/**
 * Build a public answer problem from a private/current emitter code.
 * Unknown codes intentionally collapse to `answer_turn_failed`.
 */
export function buildAnswerTurnProblem(code: string): AnswerTurnProblem {
  return projectAnswerTurnProblem(isAnswerTurnProblemCode(code) ? code : 'answer_turn_failed')
}

/** Parse and redact an RFC problem body into the safe answer contract. */
export function parseAnswerTurnProblem(value: unknown): AnswerTurnProblem | undefined {
  if (typeof value !== 'object' || value === null || !('code' in value)) return undefined
  const code = value.code
  return typeof code === 'string' ? buildAnswerTurnProblem(code) : undefined
}

const ANSWER_TURN_PROBLEM_KEYS = ['type', 'title', 'status', 'kind', 'code', 'detail', 'retryable'] as const

/** Parse only canonical wire/durable problems; reject unknown codes and private fields. */
export function parseAnswerTurnProblemStrict(value: unknown): AnswerTurnProblem | undefined {
  if (typeof value !== 'object' || value === null || !('code' in value)) return undefined
  const record = value as Record<string, unknown>
  const code = record.code
  if (typeof code !== 'string' || !isAnswerTurnProblemCode(code)) return undefined
  if (Object.keys(record).some((key) => !ANSWER_TURN_PROBLEM_KEYS.some((allowed) => allowed === key))) return undefined
  const expected = projectAnswerTurnProblem(code)
  if (
    record.type !== expected.type
    || record.title !== expected.title
    || record.status !== expected.status
    || record.kind !== expected.kind
    || record.code !== expected.code
    || record.detail !== expected.detail
    || record.retryable !== expected.retryable
  ) return undefined
  return expected
}

/** Always return a safe answer problem, including for malformed/private input. */
export function redactAnswerTurnProblem(value: unknown): AnswerTurnProblem {
  return parseAnswerTurnProblem(value) ?? buildAnswerTurnProblem('answer_turn_failed')
}
