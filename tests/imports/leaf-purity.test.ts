import { describe, expect, it } from 'vitest'

import { scanLeafPurity } from '@/lib/ui/contract-scans/leaf-purity'
import type { ScanTarget } from '@/lib/ui/contract-scans/file-discovery'

import { fixtureTargets, isFixtureMode } from './scan-targets'

const LEAF_TARGETS: readonly ScanTarget[] = [
  { root: 'src/components/ui', includeExtensions: ['.tsx'] },
  { root: 'src/components/ae/shared', includeExtensions: ['.tsx'] },
  { root: 'src/components/ae', includeExtensions: ['.tsx'] },
]

// pinned 2026-09-21 from first run; may only decrease
const LEAF_PURITY_EXCEPTIONS: readonly string[] = []

describe('leaf purity guardrail', () => {
  it('keeps leaf components free of data-access imports', () => {
    const violations = scanLeafPurity(
      isFixtureMode()
        ? fixtureTargets('tests/fixtures/quality-gates/leaf-purity')
        : LEAF_TARGETS,
    )

    if (isFixtureMode()) {
      expect(
        violations.some(
          (violation) =>
            violation.file === 'tests/fixtures/quality-gates/leaf-purity/BadLeaf.tsx' &&
            violation.excerpt === 'convex/react',
        ),
      ).toBe(true)
      return
    }

    const exceptions = new Set(LEAF_PURITY_EXCEPTIONS)
    const newViolations = violations.filter((violation) => !exceptions.has(violation.file))
    expect(
      newViolations,
      `Leaf components gained forbidden data-access imports:\n${newViolations
        .map((violation) => `  ${violation.file}:${violation.line} imports ${violation.excerpt}`)
        .join('\n')}`,
    ).toEqual([])

    const violatingFiles = new Set(violations.map((violation) => violation.file))
    const staleExceptions = LEAF_PURITY_EXCEPTIONS.filter((file) => !violatingFiles.has(file))
    expect(
      staleExceptions,
      staleExceptions.map((file) => `remove ${file} from LEAF_PURITY_EXCEPTIONS`).join('\n'),
    ).toEqual([])
  })
})
