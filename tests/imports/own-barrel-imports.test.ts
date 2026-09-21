import { describe, expect, it } from 'vitest'

import { scanOwnBarrelImports } from '@/lib/ui/contract-scans/own-barrel-imports'
import type { ScanViolation } from '@/lib/ui/contract-scans/file-discovery'

import { isFixtureMode } from './scan-targets'

// pinned 2026-09-21 from first run; may only decrease
const OWN_BARREL_EXCEPTIONS: string[] = [
  'src/modules/registry/internal/registry-action-contracts.ts',
]

const FIXTURE_MODULES_ROOT = 'tests/fixtures/quality-gates/own-barrel-imports/modules'

function formatViolations(violations: readonly ScanViolation[]): string {
  return violations
    .map(({ file, line, message }) => `${file}:${line} ${message}`)
    .join('\n')
}

describe('own-barrel import guardrail', () => {
  it('keeps module internals off their own public barrels', () => {
    const violations = scanOwnBarrelImports(
      isFixtureMode() ? FIXTURE_MODULES_ROOT : 'src/modules',
    )

    if (isFixtureMode()) {
      expect(violations).toEqual([
        expect.objectContaining({
          file: 'tests/fixtures/quality-gates/own-barrel-imports/modules/x/internal/own-barrel.fixture',
          rule: 'own-barrel-import',
        }),
      ])
      return
    }

    const actualFiles = new Set(violations.map(({ file }) => file))
    const newViolations = violations.filter(
      ({ file }) => !OWN_BARREL_EXCEPTIONS.includes(file),
    )
    expect(
      newViolations,
      `New own-barrel imports found:\n${formatViolations(newViolations)}`,
    ).toEqual([])

    const staleExceptions = OWN_BARREL_EXCEPTIONS.filter(
      (file) => !actualFiles.has(file),
    )
    expect(
      staleExceptions,
      staleExceptions.map(
        (file) => `remove ${file} from OWN_BARREL_EXCEPTIONS`,
      ).join('\n'),
    ).toEqual([])
  })
})
