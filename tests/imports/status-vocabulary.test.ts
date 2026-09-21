import { describe, expect, it } from 'vitest'
import type { ScanTarget, ScanViolation } from '@/lib/ui/contract-scans/file-discovery'

import { scanStatusVocabulary } from '@/lib/ui/contract-scans/status-vocabulary'

import { fixtureTargets, isFixtureMode } from './scan-targets'

// pinned 2026-09-21 from first run; may only decrease
const STATUS_LITERAL_FILE_CEILING = 28
const STATUS_LITERAL_FILE_MARGIN = 2
const CLEAN_TARGETS: readonly ScanTarget[] = [
  { root: 'src', includeExtensions: ['.ts', '.tsx'] },
]
const FIXTURE_ROOT = 'tests/fixtures/quality-gates/status-vocabulary'

function formatViolations(violations: readonly ScanViolation[]): string {
  return violations
    .map((violation) => `${violation.file}: ${violation.message}`)
    .join('\n')
}

describe('status vocabulary ratchet', () => {
  it('keeps raw status labels from spreading', () => {
    const violations = scanStatusVocabulary(
      isFixtureMode() ? fixtureTargets(FIXTURE_ROOT) : CLEAN_TARGETS,
    )

    if (isFixtureMode()) {
      expect(violations).toHaveLength(1)
      expect(violations[0]?.message).toBe('Connected')
      return
    }

    const actual = violations.length
    expect(
      actual,
      `Found ${actual} file(s) with raw status labels; ceiling is ${STATUS_LITERAL_FILE_CEILING}.\n` +
        `${formatViolations(violations)}\n` +
        'route this label through getStatusPresentation() in src/lib/ui/status-presentation.ts',
    ).toBeLessThanOrEqual(STATUS_LITERAL_FILE_CEILING)

    const margin = STATUS_LITERAL_FILE_CEILING - actual
    expect(
      margin,
      `Lower STATUS_LITERAL_FILE_CEILING in tests/imports/status-vocabulary.test.ts to ${actual}`,
    ).toBeLessThanOrEqual(STATUS_LITERAL_FILE_MARGIN)
  })
})
