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
