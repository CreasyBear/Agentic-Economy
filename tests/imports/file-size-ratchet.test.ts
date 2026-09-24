import { describe, expect, it } from 'vitest'

import {
  scanFileSizes,
  type FileSizeBucket,
} from '@/lib/ui/contract-scans/file-size-ratchet'

import { fixtureTargets, isFixtureMode } from './scan-targets'

// pinned 2026-09-21 from first run; may only decrease
const FILE_SIZE_CEILINGS = {
  over300: 218,
  over500: 74,
  over1000: 0,
} as const
const OVER_1000_ALLOWED: readonly string[] = []
const FILE_SIZE_MARGIN = 0
const FILE_SIZE_BUCKETS = [
  'over300',
  'over500',
  'over1000',
] as const satisfies readonly FileSizeBucket[]
const FIXTURE_ROOT = 'tests/fixtures/quality-gates/file-size-ratchet'
const FIXTURE_MODE = isFixtureMode()
const RESULT = scanFileSizes(
  FIXTURE_MODE
    ? fixtureTargets(FIXTURE_ROOT)
    : [
        { root: 'src', includeExtensions: ['.ts', '.tsx'] },
        { root: 'convex', includeExtensions: ['.ts'] },
      ],
)
// devSeed is a temporary local fixture and is outside the maintained source ratchet.
const MEASURED_FILES = RESULT.files.filter(({ file }) => file !== 'convex/devSeed.ts')
const LARGEST_FILES = MEASURED_FILES
  .slice(0, 20)
  .map(({ file, lines }) => `  ${lines}  ${file}`)
  .join('\n')

describe('file-size ratchet', () => {
  it('detects an oversized fixture', () => {
    if (!FIXTURE_MODE) return

    expect(RESULT.counts.over300).toBeGreaterThanOrEqual(1)
    expect(RESULT.violations.map(({ file }) => file)).toContain(
      `${FIXTURE_ROOT}/oversized.fixture`,
    )
  })

  it('keeps the over-1000 allowlist exact', () => {
    if (FIXTURE_MODE) return

    const actual = MEASURED_FILES
      .filter(({ lines }) => lines > 1000)
      .map(({ file }) => file)

    expect(
      actual.filter((file) => !OVER_1000_ALLOWED.includes(file)),
      `Add no new files over 1,000 lines. The 20 largest files are:\n${LARGEST_FILES}`,
    ).toEqual([])
    expect(
      OVER_1000_ALLOWED.filter((file) => !actual.includes(file)),
      'Remove files now at or below 1,000 lines from OVER_1000_ALLOWED.',
    ).toEqual([])
  })

  it.each(FILE_SIZE_BUCKETS)(
    'keeps %s within its pinned ceiling',
    (bucket) => {
      if (FIXTURE_MODE) return

      const minimum = bucket === 'over300' ? 300 : bucket === 'over500' ? 500 : 1000
      const actual = MEASURED_FILES.filter(({ lines }) => lines > minimum).length
      const ceiling = FILE_SIZE_CEILINGS[bucket]

      expect(
        actual,
        `Found ${actual} files in ${bucket}, ceiling is ${ceiling}. ` +
          `The 20 largest files are:\n${LARGEST_FILES}`,
      ).toBeLessThanOrEqual(ceiling)

      expect(
        ceiling - actual,
        `Lower FILE_SIZE_CEILINGS.${bucket} in ` +
          `tests/imports/file-size-ratchet.test.ts to ${actual}`,
      ).toBeLessThanOrEqual(FILE_SIZE_MARGIN)
    },
  )
})
