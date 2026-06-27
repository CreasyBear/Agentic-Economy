import { describe, expect, it } from 'vitest'

import { scanPrivateImports } from '@/lib/ui/contract-scans'

import { cleanRuntimeTargets, fixtureTargets, isFixtureMode } from './scan-targets'

describe('private module import guardrail', () => {
  it('requires module public seams across route and module boundaries', () => {
    const violations = scanPrivateImports(
      isFixtureMode() ? fixtureTargets('tests/fixtures/bad-imports/private-import.fixture') : cleanRuntimeTargets()
    )

    if (isFixtureMode()) {
      expect(violations.map((violation) => violation.rule)).toContain('module-private-import')
      return
    }

    expect(violations).toEqual([])
  })
})

