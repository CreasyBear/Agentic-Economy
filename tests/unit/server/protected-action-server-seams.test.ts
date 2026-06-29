import { describe, expect, it } from 'vitest'

import {
  approveCurrentOwnerContactFollowUpThroughSource,
  localE2eProposalId,
  markCurrentOwnerContactFollowUpNoRepairThroughSource,
  readAdminContactFollowUpReconstructionThroughSource,
  readCurrentOwnerContactFollowUpDetailThroughSource,
  readCurrentOwnerContactFollowUpQueueThroughSource,
  rejectCurrentOwnerContactFollowUpThroughSource,
  retryCurrentOwnerContactFollowUpThroughSource,
} from '@/modules/protected-action/contact-follow-up.functions'

describe('protected action server seams', () => {
  it('serves populated deterministic contact-follow-up readbacks for local verification', async () => {
    await withLocalBypass(async () => {
      const queue = await readCurrentOwnerContactFollowUpQueueThroughSource()
      expect(queue).toMatchObject({
        kind: 'ok',
        queue: expect.arrayContaining([
          expect.objectContaining({ proposal: expect.objectContaining({ selectedActionSlug: 'contact-follow-up' }) }),
        ]),
      })
      if (queue.kind !== 'ok') {
        throw new Error('Expected local contact follow-up queue.')
      }

      expect(queue.queue.length).toBeGreaterThanOrEqual(2)
      expect(queue.reconstructions.map((row) => row.readbackStatus)).toEqual(
        expect.arrayContaining(['receipt_recorded', 'proof_gap'])
      )
      expect(JSON.stringify(queue)).not.toContain('customer@example.test')

      const detail = await readCurrentOwnerContactFollowUpDetailThroughSource(localE2eProposalId)
      expect(detail).toMatchObject({
        kind: 'ok',
        reconstruction: {
          readbackStatus: 'receipt_recorded',
          receipt: { providerBoundary: 'source_owned_follow_up_outbox' },
          privateEvidenceRefs: [expect.objectContaining({ accessPolicy: 'owner_admin_operator_only' })],
        },
      })
    })
  })

  it('mutates approve, reject, retry, and no-repair through typed server results', async () => {
    await withLocalBypass(async () => {
      const approved = await approveCurrentOwnerContactFollowUpThroughSource({
        proposalId: localE2eProposalId,
        reason: 'Owner accepted consequence.',
        evidenceRefs: ['owner-review:test'],
        consequenceAccepted: true,
      })
      expect(approved).toMatchObject({
        kind: 'ok',
        code: 'contact_follow_up_attempt_recorded',
        reconstruction: { readbackStatus: 'receipt_recorded', gatewayAdmission: { status: 'consumed' } },
      })

      const rejected = await rejectCurrentOwnerContactFollowUpThroughSource({
        proposalId: localE2eProposalId,
        reason: 'Owner declined this source message.',
        evidenceRefs: ['owner-review:reject'],
        consequenceAccepted: false,
      })
      expect(rejected).toMatchObject({
        kind: 'ok',
        reconstruction: { readbackStatus: 'owner_rejected' },
      })
      if (rejected.kind !== 'ok') {
        throw new Error('Expected local reject result.')
      }
      expect(rejected.reconstruction.attempt).toBeUndefined()
      expect(rejected.reconstruction.receipt).toBeUndefined()

      const retried = await retryCurrentOwnerContactFollowUpThroughSource({
        proposalId: 'contact-follow-up:contact-follow-up:local-e2e-failed-proposal',
        readbackKind: 'receipt',
        reason: 'Retry after proof gap.',
      })
      expect(retried).toMatchObject({
        kind: 'ok',
        reconstruction: { readbackStatus: 'receipt_recorded' },
      })

      const noRepair = await markCurrentOwnerContactFollowUpNoRepairThroughSource({
        proposalId: 'contact-follow-up:contact-follow-up:local-e2e-failed-proposal',
        reason: 'Operator evidence is insufficient to repair.',
        evidenceRefs: ['operator:no-repair'],
      })
      expect(noRepair).toMatchObject({
        kind: 'ok',
        reconstruction: { readbackStatus: 'no_repair', noRepair: { reason: 'Operator evidence is insufficient to repair.' } },
      })
    })
  })

  it('returns redacted admin reconstruction rows without deployed proof claims', async () => {
    await withLocalBypass(async () => {
      const admin = await readAdminContactFollowUpReconstructionThroughSource()
      expect(admin).toMatchObject({
        kind: 'allowed',
        rows: expect.arrayContaining([
          expect.objectContaining({
            proposal: expect.objectContaining({ selectedActionSlug: 'contact-follow-up' }),
            privateEvidenceRefs: expect.any(Array),
          }),
        ]),
      })
      expect(JSON.stringify(admin)).not.toContain('raw provider')
      expect(JSON.stringify(admin)).not.toContain('customer@example.test')
    })
  })

  it('does not serve local protected-action fixtures when source config is missing without explicit bypass', async () => {
    await withMissingSourceConfig(async () => {
      const queue = await readCurrentOwnerContactFollowUpQueueThroughSource()
      expect(queue).toMatchObject({ kind: 'error', code: 'missing_convex_url' })
      expect(JSON.stringify(queue)).not.toContain(localE2eProposalId)

      const detail = await readCurrentOwnerContactFollowUpDetailThroughSource(localE2eProposalId)
      expect(detail).toMatchObject({ kind: 'error', code: 'missing_convex_url' })
      expect(JSON.stringify(detail)).not.toContain('receipt_recorded')

      const admin = await readAdminContactFollowUpReconstructionThroughSource()
      expect(admin).toMatchObject({ kind: 'denied', rows: [] })
      expect(JSON.stringify(admin)).not.toContain(localE2eProposalId)
    })
  })

  it('does not serve local protected-action mutation fixtures when source write secret is missing', async () => {
    await withMissingSourceWriteSecret(async () => {
      const approved = await approveCurrentOwnerContactFollowUpThroughSource(
        {
          proposalId: localE2eProposalId,
          reason: 'Owner accepted consequence.',
          evidenceRefs: ['owner-review:test'],
          consequenceAccepted: true,
        },
        sourceWriteContext()
      )
      expect(approved).toMatchObject({ kind: 'error', code: 'missing_source_write_secret' })
      expect(JSON.stringify(approved)).not.toContain(localE2eProposalId)
      expect(JSON.stringify(approved)).not.toContain('receipt_recorded')
    })
  })
})

async function withLocalBypass(run: () => Promise<void>) {
  const previousBypass = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
  const previousConvexUrl = process.env.CONVEX_URL
  const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
  process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
  delete process.env.CONVEX_URL
  delete process.env.VITE_CONVEX_URL

  try {
    await run()
  } finally {
    if (previousBypass === undefined) {
      delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    } else {
      process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousBypass
    }

    if (previousConvexUrl === undefined) {
      delete process.env.CONVEX_URL
    } else {
      process.env.CONVEX_URL = previousConvexUrl
    }

    if (previousPublicConvexUrl === undefined) {
      delete process.env.VITE_CONVEX_URL
    } else {
      process.env.VITE_CONVEX_URL = previousPublicConvexUrl
    }
  }
}

async function withMissingSourceConfig(run: () => Promise<void>) {
  const previousBypass = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
  const previousConvexUrl = process.env.CONVEX_URL
  const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
  delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
  delete process.env.CONVEX_URL
  delete process.env.VITE_CONVEX_URL

  try {
    await run()
  } finally {
    if (previousBypass === undefined) {
      delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    } else {
      process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousBypass
    }

    if (previousConvexUrl === undefined) {
      delete process.env.CONVEX_URL
    } else {
      process.env.CONVEX_URL = previousConvexUrl
    }

    if (previousPublicConvexUrl === undefined) {
      delete process.env.VITE_CONVEX_URL
    } else {
      process.env.VITE_CONVEX_URL = previousPublicConvexUrl
    }
  }
}

async function withMissingSourceWriteSecret(run: () => Promise<void>) {
  const previousBypass = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
  const previousSecret = process.env.AE_SOURCE_WRITE_SECRET
  delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
  delete process.env.AE_SOURCE_WRITE_SECRET

  try {
    await run()
  } finally {
    if (previousBypass === undefined) {
      delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    } else {
      process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousBypass
    }

    if (previousSecret === undefined) {
      delete process.env.AE_SOURCE_WRITE_SECRET
    } else {
      process.env.AE_SOURCE_WRITE_SECRET = previousSecret
    }
  }
}

function sourceWriteContext() {
  return {
    sourceWriteRequest: {
      method: 'POST',
      origin: 'https://ae.example',
      pathname: '/protected-actions',
    },
  }
}
