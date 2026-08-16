import { CliFailure } from './output'

/**
 * Domain reasons an operation read can decline. These are source-owned tokens:
 * the CLI maps them onto canonical kinds and keeps the token as the machine
 * `code`, so scripts match on the same word the source emitted.
 */
export type OperationReadFailureReason =
  | 'mapping_cycle'
  | 'mapping_incompatible'
  | 'mapping_unavailable'
  | 'not_supported_by_ae'
  | 'operation_not_found'
  | 'operation_unavailable'
  | 'publisher_withdrew'
  | 'query_invalid'
  | 'readiness_expired'
  | 'setup_required'
  | 'source_capacity_exceeded'
  | 'source_unavailable'
  | 'temporarily_unavailable'
  | 'under_review'
  | 'updated_terms_require_review'

export function throwOperationReadFailure(input: {
  reason: OperationReadFailureReason
  cursorProvided?: boolean
}): never {
  const code = input.reason
  switch (input.reason) {
    case 'query_invalid':
      throw new CliFailure(
        input.cursorProvided === true
          ? 'The search cursor is invalid or expired.'
          : 'The operation query is invalid.',
        { kind: 'INVALID_ARGUMENT', code },
      )
    case 'operation_not_found':
      throw new CliFailure('The requested Market Operation was not found.', {
        kind: 'NOT_FOUND',
        code,
      })
    // Publication state: the operation exists but is not usable as published.
    // Retrying the same read changes nothing until the publisher acts.
    case 'mapping_cycle':
    case 'mapping_incompatible':
    case 'not_supported_by_ae':
    case 'publisher_withdrew':
    case 'readiness_expired':
    case 'setup_required':
    case 'under_review':
    case 'updated_terms_require_review':
      throw new CliFailure('The requested Market Operation is not usable as published.', {
        kind: 'FAILED_PRECONDITION',
        code,
      })
    case 'source_capacity_exceeded':
      throw new CliFailure('The operation source is over capacity.', {
        kind: 'RESOURCE_EXHAUSTED',
        code,
        retryable: true,
      })
    case 'mapping_unavailable':
    case 'operation_unavailable':
    case 'source_unavailable':
    case 'temporarily_unavailable':
      throw new CliFailure('The requested Market Operation is unavailable.', {
        kind: 'UNAVAILABLE',
        code,
        retryable: true,
      })
    default: {
      const exhaustive: never = input.reason
      throw new CliFailure(`Unhandled operation read failure: ${exhaustive}`, {
        kind: 'INTERNAL',
        code: 'operation_read_failure_unhandled',
      })
    }
  }
}
