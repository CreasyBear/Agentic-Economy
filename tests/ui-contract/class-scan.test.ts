import { describe, expect, it } from 'vitest'

import { scanUiContract } from '@/lib/ui/contract-scans'

import { fixtureTargets, isFixtureMode } from '../imports/scan-targets'

const cleanUiTargets = [
  { root: 'src/routes', includeExtensions: ['.ts', '.tsx'] },
  { root: 'src/components/ae', includeExtensions: ['.ts', '.tsx'] },
] as const

describe('UI contract class scan', () => {
  it('rejects route-local visual drift', () => {
    const violations = scanUiContract(
      isFixtureMode() ? fixtureTargets('tests/fixtures/bad-ui-contract') : cleanUiTargets
    )

    if (isFixtureMode()) {
      expect(violations.map((violation) => violation.rule)).toEqual(
        expect.arrayContaining(['raw-color', 'space-utility', 'transition-all', 'arbitrary-visual-token'])
      )
      return
    }

    expect(violations).toEqual([])
  })
})

