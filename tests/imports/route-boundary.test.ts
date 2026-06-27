import { describe, expect, it } from 'vitest'

import { scanRouteBoundaries } from '@/lib/ui/contract-scans'

import { fixtureTargets, isFixtureMode, routeTargets } from './scan-targets'

describe('route boundary guardrail', () => {
  it('keeps routes as adapters over public seams', () => {
    const violations = scanRouteBoundaries(
      isFixtureMode() ? fixtureTargets('tests/fixtures/bad-imports/route-boundary.fixture') : routeTargets()
    )

    if (isFixtureMode()) {
      expect(violations.map((violation) => violation.rule)).toContain('route-convex-schema-import')
      return
    }

    expect(violations).toEqual([])
  })
})

