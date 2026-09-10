import { cliContinuation, type ContinuationOptions } from './continuation-command'
import { CliFailure } from './output'

/**
 * Domain reasons an tool read can decline. These are source-owned tokens:
 * the CLI maps them onto canonical kinds and keeps the token as the machine
 * `code`, so scripts match on the same word the source emitted.
 */
export type ToolReadFailureReason =
  | 'mapping_cycle'
  | 'mapping_incompatible'
  | 'mapping_unavailable'
  | 'not_supported_by_ae'
  | 'tool_not_found'
  | 'tool_unavailable'
  | 'publisher_withdrew'
  | 'query_invalid'
  | 'readiness_expired'
  | 'setup_required'
  | 'source_capacity_exceeded'
  | 'source_unavailable'
  | 'temporarily_unavailable'
  | 'under_review'
  | 'updated_terms_require_review'

export function throwToolReadFailure(input: {
  reason: ToolReadFailureReason
  cursorProvided?: boolean
  toolRef?: string
  options?: ContinuationOptions
}): never {
  const code = input.reason
  switch (input.reason) {
    case 'query_invalid':
      throw new CliFailure(
        input.cursorProvided === true
          ? 'The search cursor is invalid or expired.'
          : 'The tool query is invalid.',
        { kind: 'INVALID_ARGUMENT', code },
      )
    case 'tool_not_found':
      // A reference that names no Tool is a dead end: the only move left is
      // finding a current one, so this carries the same continuation shape as
      // its sibling refusals instead of stopping at the message.
      throw new CliFailure(`The requested Market Tool${input.toolRef === undefined ? '' : ` ${input.toolRef}`} was not found.`, {
        kind: 'NOT_FOUND',
        code,
        suggestion: 'Search the current catalogue for a Tool that does this job.',
        nextCommand: cliContinuation(input.options, ['ae', 'search', '<job>']),
        ...(input.toolRef === undefined ? {} : { detail: { toolRef: input.toolRef } }),
      })
    // Publication state: the tool exists but is not usable as published.
    // Retrying the same read changes nothing until the publisher acts.
    case 'mapping_cycle':
    case 'mapping_incompatible':
    case 'not_supported_by_ae':
    case 'publisher_withdrew':
    case 'readiness_expired':
    case 'setup_required':
    case 'under_review':
    case 'updated_terms_require_review':
      throw new CliFailure('The requested Market Tool is not usable as published.', {
        kind: 'FAILED_PRECONDITION',
        code,
      })
    case 'source_capacity_exceeded':
      throw new CliFailure('The tool source is over capacity.', {
        kind: 'RESOURCE_EXHAUSTED',
        code,
        retryable: true,
      })
    case 'tool_unavailable':
      throw new CliFailure(`The requested Market Tool${input.toolRef === undefined ? '' : ` ${input.toolRef}`} is not currently callable; the provider must restore it.`, {
        kind: 'UNAVAILABLE',
        code,
        retryable: false,
        ...(input.toolRef === undefined ? {} : { detail: { toolRef: input.toolRef } }),
      })
    case 'mapping_unavailable':
    case 'source_unavailable':
    case 'temporarily_unavailable':
      throw new CliFailure(`The requested Market Tool${input.toolRef === undefined ? '' : ` ${input.toolRef}`} is unavailable.`, {
        kind: 'UNAVAILABLE',
        code,
        retryable: true,
        ...(input.toolRef === undefined ? {} : { detail: { toolRef: input.toolRef } }),
      })
    default: {
      const exhaustive: never = input.reason
      throw new CliFailure(`Unhandled tool read failure: ${exhaustive}`, {
        kind: 'INTERNAL',
        code: 'tool_read_failure_unhandled',
      })
    }
  }
}
