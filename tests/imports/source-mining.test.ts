import { describe, expect, it } from 'vitest'

import { scanSourceMining } from '@/lib/ui/contract-scans'

import { cleanRuntimeTargets, fixtureTargets, isFixtureMode } from './scan-targets'

describe('source-mining guardrail', () => {
  it('rejects backup coupling and Phase 2+ surface symbols', () => {
    const violations = scanSourceMining(
      isFixtureMode() ? fixtureTargets('tests/fixtures/bad-source-mining') : cleanRuntimeTargets()
    )

    if (isFixtureMode()) {
      expect(violations.map((violation) => violation.rule)).toEqual(
        expect.arrayContaining(['backup-source-reference', 'future-surface-symbol', 'future-protocol-symbol'])
      )
      return
    }

    expect(violations).toEqual([])
  })
})

