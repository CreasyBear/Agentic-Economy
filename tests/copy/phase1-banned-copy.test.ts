import { describe, expect, it } from 'vitest'

import { scanCopyClaims } from '@/lib/ui/contract-scans'

import { fixtureTargets, isFixtureMode } from '../imports/scan-targets'

const cleanCopyTargets = [
  { root: 'src/routes', includeExtensions: ['.ts', '.tsx'] },
  { root: 'src/components/ae', includeExtensions: ['.ts', '.tsx'] },
  { root: 'src/lib/ui/copy.ts', includeExtensions: ['.ts'] },
] as const

describe('Phase 1 public copy guardrail', () => {
  it('rejects unsupported owner/public capability claims', () => {
    const violations = scanCopyClaims(
      isFixtureMode() ? fixtureTargets('tests/fixtures/bad-copy') : cleanCopyTargets
    )

    if (isFixtureMode()) {
      expect(violations.map((violation) => violation.rule)).toEqual(
        expect.arrayContaining([
          'payment-or-booking-overclaim',
          'agent-action-overclaim',
          'marketplace-trust-overclaim',
        ])
      )
      return
    }

    expect(violations).toEqual([])
  })
})

