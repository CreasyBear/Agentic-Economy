import { describe, expect, it } from 'vitest'

import { scanCopyClaims } from '@/lib/ui/contract-scans'

import { fixtureTargets, isFixtureMode } from '../imports/scan-targets'

const cleanCopyTargets = [
  { root: 'src/routes', includeExtensions: ['.ts', '.tsx'] },
  { root: 'src/components/ae', includeExtensions: ['.ts', '.tsx'] },
  { root: 'src/lib/ui/copy.ts', includeExtensions: ['.ts'] },
  { root: 'src/modules/catalog', includeExtensions: ['.ts'] },
  { root: 'src/modules/discovery', includeExtensions: ['.ts'] },
  { root: 'src/lib/seo', includeExtensions: ['.ts', '.tsx', '.json', '.md'] },
  { root: 'src/lib/schema', includeExtensions: ['.ts', '.tsx', '.json', '.md'] },
  { root: 'src/generated', includeExtensions: ['.ts', '.tsx', '.json', '.md'] },
  { root: 'public', includeExtensions: ['.html', '.json', '.md', '.txt', '.xml'] },
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
          'p2-inquiry-overclaim',
          'p2-notification-provider-overclaim',
          'p3-read-only-discovery-overclaim',
          'p3-developer-platform-overclaim',
          'p4-protected-action-overclaim',
          'p4-autonomous-action-overclaim',
          'p5-paid-activation-overclaim',
          'p5-money-rail-overclaim',
          'p6-business-action-overclaim',
          'p6-autonomous-money-marketplace-overclaim',
        ])
      )
      return
    }

    expect(violations).toEqual([])
  })
})
