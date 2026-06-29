import { describe, expect, it } from 'vitest'

import { readOwnerStatusThroughSource } from '@/modules/catalog/owner-claim.functions'
import { resetPublicOwnerRouteReadbacksForTest } from '@/modules/catalog/public'
import { openRemovalDisputeThroughSource } from '@/modules/security/removal-dispute.functions'
import { adminProtectedActionDetailServerToRouteReadback } from '@/routes/admin.protected-actions.$proposalId'
import type { AdminContactFollowUpReconstructionServerResult } from '@/modules/protected-action/contact-follow-up.functions'

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

  it('does not synthesize admin protected-action detail rows for allowed empty results', () => {
    const result = adminProtectedActionDetailServerToRouteReadback({
      kind: 'allowed',
      httpStatus: 200,
      generatedAt: 1,
      actorRef: 'admin:test',
      rows: [],
    } satisfies AdminContactFollowUpReconstructionServerResult)

    expect(result).toEqual({
      kind: 'not_found',
      reason: 'No protected-action reconstruction matched that proposal.',
    })
    expect(JSON.stringify(result)).not.toContain('missing-admin-route')
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
  const previousBypass = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
  process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

  try {
    await run()
  } finally {
    restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousBypass)
  }
}

async function withoutSourceConfig(run: () => Promise<void>) {
  const previousBypass = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
  const previousConvexUrl = process.env.CONVEX_URL
  const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
  delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
  delete process.env.CONVEX_URL
  delete process.env.VITE_CONVEX_URL

  try {
    await run()
  } finally {
    restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousBypass)
    restoreEnv('CONVEX_URL', previousConvexUrl)
    restoreEnv('VITE_CONVEX_URL', previousPublicConvexUrl)
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}
