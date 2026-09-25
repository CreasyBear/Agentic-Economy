import { describe, expect, it } from 'vitest'

import { scanRouteControllerSizes } from '@/lib/ui/contract-scans/route-controller-size'

import { fixtureTargets, isFixtureMode } from './scan-targets'

export const ROUTE_CONTROLLER_MAX_LINES = 80
const ROUTE_SIZE_MARGIN = 0

// pinned 2026-09-21 from first run; may only decrease
export const ROUTE_SIZE_EXCEPTIONS: Record<string, number> = {
  'src/routes/__root.tsx': 110,
}

const cleanTargets = [{ root: 'src/routes', includeExtensions: ['.tsx'] }] as const
const fixtureRoot = 'tests/fixtures/quality-gates/route-controller-size'

describe('route controller size guardrail', () => {
  it('keeps route controllers thin', () => {
    const targets = isFixtureMode() ? fixtureTargets(fixtureRoot) : cleanTargets
    const { measurements, violations } = scanRouteControllerSizes(
      targets,
      ROUTE_CONTROLLER_MAX_LINES,
    )

    if (isFixtureMode()) {
      expect(violations).toEqual([
        expect.objectContaining({
          file: `${fixtureRoot}/oversized-route.tsx`,
          actualLines: 90,
          rule: 'route-controller-size',
        }),
      ])
      return
    }

    const lineCountByFile = new Map(measurements.map(({ file, lineCount }) => [file, lineCount]))
    const unapproved = violations.filter(({ file }) => !(file in ROUTE_SIZE_EXCEPTIONS))
    const offenders = unapproved.map(({ file, actualLines }) => `${file}: ${actualLines}`).join('\n')

    expect(
      unapproved,
      `Route controllers must be at most ${ROUTE_CONTROLLER_MAX_LINES} lines. Offenders:\n${offenders}`,
    ).toEqual([])

    for (const [file, ceiling] of Object.entries(ROUTE_SIZE_EXCEPTIONS)) {
      const actual = lineCountByFile.get(file)
      expect(actual, `${file} was not scanned`).toBeDefined()
      if (actual === undefined) continue

      expect(actual, `${file} grew ${ceiling}→${actual}`).toBeLessThanOrEqual(ceiling)
      expect(
        actual,
        `remove ${file} from ROUTE_SIZE_EXCEPTIONS`,
      ).toBeGreaterThan(ROUTE_CONTROLLER_MAX_LINES)
      expect(
        ceiling - actual,
        `Lower ROUTE_SIZE_EXCEPTIONS[${file}] in tests/imports/route-controller-size.test.ts to ${actual}`,
      ).toBeLessThanOrEqual(ROUTE_SIZE_MARGIN)
    }
  })
})
