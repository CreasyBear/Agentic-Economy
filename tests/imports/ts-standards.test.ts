import { describe, expect, it } from 'vitest'

import { scanTypeScriptStandards } from '@/lib/ui/contract-scans'

import { cleanRuntimeTargets, fixtureTargets, isFixtureMode } from './scan-targets'

describe('TypeScript standards guardrail', () => {
  it('rejects broad runtime type holes', () => {
    const violations = scanTypeScriptStandards(
      isFixtureMode() ? fixtureTargets('tests/fixtures/bad-ts-standards') : cleanRuntimeTargets()
    )

    if (isFixtureMode()) {
      expect(violations.map((violation) => violation.rule)).toEqual(
        expect.arrayContaining([
          'explicit-any',
          'non-null-assertion',
          'convex-any-validator',
          'broad-status-string',
          'hard-coded-source-csrf',
          'client-exposed-source-write-secret',
        ])
      )
      return
    }

    expect(violations).toEqual([])
  })
})
