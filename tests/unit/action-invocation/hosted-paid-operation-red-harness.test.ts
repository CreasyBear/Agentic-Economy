import { describe, expect, it } from 'vitest'

import {
  EXPECTED_PHASE_3C_REDS,
  classifyPhase3CRedReport,
} from '../../../tools/dev/verify-phase-3c-red-contract'

const entries = Object.entries(EXPECTED_PHASE_3C_REDS)

function report(overrides: Partial<{
  assertions: unknown[]
}> = {}) {
  return {
    testResults: [{
      assertionResults: overrides.assertions ?? entries.map(([fullName, reason]) => ({
        fullName,
        status: 'failed',
        failureMessages: [`AssertionError: [P3C_RED:${reason}] required contract is absent`],
      })),
    }],
  }
}

describe('Phase 3C RED classifier', () => {
  it('accepts only the full allowlist with the exact absent-contract reasons', () => {
    const result = classifyPhase3CRedReport(report({
      assertions: entries.map(([fullName, reason]) => ({
        fullName,
        status: 'failed',
        failureMessages: [
          `AssertionError: [P3C_RED:${reason}] required contract is absent\n`
          + '    at runWithTimeout (node_modules/@vitest/runner/dist/chunk-artifact.js:2272:10)',
        ],
      })),
    }))
    expect(result.kind).toBe('expected_red')
    if (result.kind === 'expected_red') expect(result.tests).toHaveLength(entries.length)
  })

  it.each([
    ['malformed_output', undefined],
    ['import_failure', 'Error: Cannot find module hosted-contract'],
    ['config_failure', 'Error: Vitest config invalid'],
    ['timeout_failure', 'Error: test timed out in 5000ms'],
    ['infrastructure_failure', 'Unhandled Error: Worker exited unexpectedly'],
    ['reason_mismatch', 'AssertionError: ordinary assertion failed'],
  ])('rejects %s instead of classifying it as expected RED', (code, failure) => {
    const value = failure === undefined
      ? {}
      : report({ assertions: [{
          fullName: entries[0]![0],
          status: 'failed',
          failureMessages: [failure],
        }] })
    expect(classifyPhase3CRedReport(value)).toMatchObject({ kind: 'rejected', code })
  })

  it('rejects an unrelated failure', () => {
    expect(classifyPhase3CRedReport(report({ assertions: [{
      fullName: 'unrelated suite should fail',
      status: 'failed',
      failureMessages: ['AssertionError: unrelated'],
    }] }))).toMatchObject({ kind: 'rejected', code: 'unrelated_failure' })
  })

  it('rejects a missing allowlisted test', () => {
    expect(classifyPhase3CRedReport(report({ assertions: report().testResults[0]!
      .assertionResults.slice(1) })))
      .toMatchObject({ kind: 'rejected', code: 'missing_test' })
  })

  it('rejects an unexpected pass', () => {
    expect(classifyPhase3CRedReport(report({ assertions: entries.map(([fullName, reason], index) => ({
      fullName,
      status: index === 0 ? 'passed' : 'failed',
      failureMessages: index === 0 ? [] : [`[P3C_RED:${reason}]`],
    })) }))).toMatchObject({ kind: 'rejected', code: 'unexpected_pass' })
  })
})
