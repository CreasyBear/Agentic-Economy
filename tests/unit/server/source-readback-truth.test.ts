import { describe, expect, it, vi } from 'vitest'

import { readOwnerStatusThroughSource } from '@/modules/catalog/owner-claim.functions'
import { resetPublicOwnerRouteReadbacksForTest } from '@/modules/catalog/public'
import { openRemovalDisputeThroughSource } from '@/modules/security/removal-dispute.functions'

describe('source readback truth seams', () => {
  it('does not fall back to the default owner readback for unknown local slugs', async () => {
    await withLocalBypass(async () => {
      resetPublicOwnerRouteReadbacksForTest()

      const missing = await readOwnerStatusThroughSource('missing-local-slug')
      expect(missing).toEqual({ kind: 'not_found', reason: 'not_public' })
      expect(JSON.stringify(missing)).not.toContain('Parramatta Emergency Plumbing')

      const defaultResult = await readOwnerStatusThroughSource('parramatta-emergency-plumbing')
      expect(defaultResult).toMatchObject({
        kind: 'available',
        readback: { catalog: { name: 'Parramatta Emergency Plumbing' } },
      })
      expect(defaultResult.kind === 'available' ? defaultResult.readback.admission : undefined).toEqual({
        version: 'r1-target-admitted:v1',
        admitted: false,
        blockers: [
          { kind: 'not_published', ownerLabel: 'Publish this business page' },
          { kind: 'not_claimed', ownerLabel: 'Complete the business claim' },
          { kind: 'recipient_unresolvable', ownerLabel: 'Add a usable owner notification email' },
        ],
      })
    })
  })

  it('reports source unavailability instead of default owner readback when Convex config is missing', async () => {
    await withoutSourceConfig(async () => {
      const result = await readOwnerStatusThroughSource('parramatta-emergency-plumbing')
      expect(result).toEqual({ kind: 'unavailable', reason: 'source_unavailable', retryable: true })
      expect(JSON.stringify(result)).not.toContain('Parramatta Emergency Plumbing')
    })
  })

  it('rejects privacy removal for unknown local slugs without targeting the default business', async () => {
    await withLocalBypass(async () => {
      resetPublicOwnerRouteReadbacksForTest()

      const missing = await openRemovalDisputeThroughSource(removalInput({ slug: 'missing-local-slug' }))
      expect(missing).toMatchObject({ kind: 'error', code: 'dispute_invalid_target', retryable: false })
      expect(JSON.stringify(missing)).not.toContain('business:parramatta-emergency-plumbing')

      const recorded = await openRemovalDisputeThroughSource(removalInput({ slug: 'parramatta-emergency-plumbing' }))
      expect(recorded).toMatchObject({ kind: 'ok', receipt: { targetRef: 'business:parramatta-emergency-plumbing' } })
    })
  })

})

function removalInput(overrides: Partial<Parameters<typeof openRemovalDisputeThroughSource>[0]> = {}) {
  return {
    slug: 'parramatta-emergency-plumbing',
    contactEmail: 'owner@example.test',
    reasonCode: 'privacy_removal_requested' as const,
    evidenceSummary: 'The public facts are inaccurate and should be reviewed.',
    ...overrides,
  }
}

async function withLocalBypass(run: () => Promise<void>) {
  vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')

  try {
    await run()
  } finally {
    vi.unstubAllEnvs()
  }
}

async function withoutSourceConfig(run: () => Promise<void>) {
  vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', undefined)
  vi.stubEnv('CONVEX_URL', undefined)
  vi.stubEnv('VITE_CONVEX_URL', undefined)

  try {
    await run()
  } finally {
    vi.unstubAllEnvs()
  }
}

