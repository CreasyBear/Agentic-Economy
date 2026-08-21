import { describe, expect, it } from 'vitest'

import { CliFailure } from '../../../tools/ae/lib/output'
import {
  throwOperationReadFailure,
  type OperationReadFailureReason,
} from '../../../tools/ae/lib/operation-read-failure'

describe('operation read failures', () => {
  it.each([
    ['operation_not_found', 'NOT_FOUND'],
    ['query_invalid', 'INVALID_ARGUMENT'],
    ['setup_required', 'FAILED_PRECONDITION'],
    ['under_review', 'FAILED_PRECONDITION'],
    ['publisher_withdrew', 'FAILED_PRECONDITION'],
    ['source_capacity_exceeded', 'RESOURCE_EXHAUSTED'],
    ['source_unavailable', 'UNAVAILABLE'],
    ['temporarily_unavailable', 'UNAVAILABLE'],
  ] as const satisfies readonly (readonly [OperationReadFailureReason, string])[])(
    'exits 1 and keeps the source reason as the machine code for %s',
    (reason, kind) => {
      let thrown: unknown
      try {
        throwOperationReadFailure({ reason })
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBeInstanceOf(CliFailure)
      if (!(thrown instanceof CliFailure)) return
      expect(thrown.kind).toBe(kind)
      expect(thrown.code).toBe(reason)
      expect(thrown.exitCode).toBe(1)
    },
  )

  it('names the cursor when an invalid query came from a supplied cursor', () => {
    let thrown: unknown
    try {
      throwOperationReadFailure({ reason: 'query_invalid', cursorProvided: true })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(CliFailure)
    if (!(thrown instanceof CliFailure)) return
    expect(thrown.kind).toBe('INVALID_ARGUMENT')
    expect(thrown.code).toBe('query_invalid')
    expect(thrown.message).toContain('cursor')
  })
})
