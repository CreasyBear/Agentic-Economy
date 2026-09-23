import { describe, expect, it } from 'vitest'
import type { ScanViolation } from '@/lib/ui/contract-scans/file-discovery'

import { scanTsxTypeQuarantine } from '@/lib/ui/contract-scans/tsx-type-quarantine'

import { fixtureTargets, isFixtureMode } from './scan-targets'

// pinned 2026-09-21 from first run; may only decrease
const TSX_TYPE_EXPORT_CEILING = 17
const TSX_TYPE_EXPORT_MARGIN = 0
const CLEAN_TARGETS = [
  { root: 'src/components', includeExtensions: ['.tsx'] },
  { root: 'src/routes', includeExtensions: ['.tsx'] },
] as const
const FIXTURE_ROOT = 'tests/fixtures/quality-gates/tsx-type-quarantine'

function formatViolations(violations: readonly ScanViolation[]): string {
  return violations
    .map((violation) => `${violation.file}:${violation.line} export type ${violation.message}`)
    .join('\n')
}

describe('tsx type quarantine', () => {
  it('keeps domain and state types out of TSX files', () => {
    const violations = scanTsxTypeQuarantine(
      isFixtureMode() ? fixtureTargets(FIXTURE_ROOT) : CLEAN_TARGETS,
    )

    if (isFixtureMode()) {
      expect(violations).toHaveLength(1)
      expect(violations[0]?.message).toBe('Order')
      return
    }

    const actual = violations.length
    expect(
      actual,
      `Found ${actual} non-Props type export(s) in TSX files; ceiling is ${TSX_TYPE_EXPORT_CEILING}.\n${formatViolations(violations)}`,
    ).toBeLessThanOrEqual(TSX_TYPE_EXPORT_CEILING)

    const margin = TSX_TYPE_EXPORT_CEILING - actual
    expect(
      margin,
      `Lower TSX_TYPE_EXPORT_CEILING in tests/imports/tsx-type-quarantine.test.ts to ${actual}`,
    ).toBeLessThanOrEqual(TSX_TYPE_EXPORT_MARGIN)
  })
})
