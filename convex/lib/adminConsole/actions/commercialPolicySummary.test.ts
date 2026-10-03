import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../../_generated/api'
import { SANDBOX_COMMERCIAL_POLICY_CONTROLS } from '@/modules/money/public'
import { convexTestWithMarketComponents, ownerAdmin } from '../../../../tests/helpers/convex-fixtures'

const NOW = Date.now()
beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production'))
afterEach(() => vi.unstubAllEnvs())

describe('production commercial approval summary', () => {
  it('requires admin authority and keeps all six families visible without creating approvals', async () => {
    const backend = convexTestWithMarketComponents()
    expect(await backend.query(api.moneyCommercialPolicy.readSummary, { environment: 'production', refreshAt: NOW }))
      .toMatchObject({ kind: 'refused' })
    const admin = await ownerAdmin(backend, 'user_policy-summary')
    const result = await admin.query(api.moneyCommercialPolicy.readSummary, { environment: 'production', refreshAt: NOW })
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    expect(result.rows.map(row => row.family)).toEqual([
      'commercial_perimeter', 'tax', 'accounting_client_money',
      'privacy_retention', 'treasury_custody', 'operations',
    ])
    expect(result.rows.every(row => row.current === null && row.pending.length === 0)).toBe(true)
    expect(await backend.run(ctx => ctx.db.query('moneyCommercialPolicies').collect())).toEqual([])
  })

  it('reads recorded terms and pending proposals separately, excluding expired proposals', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_policy-records')
    await backend.run(async ctx => {
      await ctx.db.insert('moneyCommercialPolicies', {
        policyRef: 'policy:tax:1', family: 'tax', environment: 'production', revision: 1,
        lifecycle: 'active', effectiveAt: NOW - 1_000, expiresAt: NOW + 1_000,
        evidenceRef: 'evidence:tax', evidenceDigest: 'sha256:evidence',
        control: SANDBOX_COMMERCIAL_POLICY_CONTROLS.tax,
        approvedByPrincipalRef: 'principal:owner', activeAccountRef: 'account:owner',
        authorityGeneration: 1, correlationRef: 'correlation:tax', idempotencyRef: 'idempotency:tax',
        commandDigest: 'sha256:command', activatedAt: NOW - 1_000, updatedAt: NOW - 1_000,
      })
      for (const [proposalRef, expiresAt] of [['proposal:live', NOW + 86_400_000], ['proposal:expired', NOW - 1]] as const) {
        await ctx.db.insert('adminApprovalProposals', {
          proposalRef, action: 'change_commercial_policy', commandDigest: 'sha256:command',
          commandJson: JSON.stringify({ input: { environment: 'production', family: 'tax' } }),
          proposerRef: 'principal:proposer', status: 'awaiting_second_approval', createdAt: NOW - 1_000, expiresAt,
        })
      }
    })
    const result = await admin.query(api.moneyCommercialPolicy.readSummary, { environment: 'production', refreshAt: NOW + 10 * 365 * 24 * 60 * 60 * 1_000 })
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    expect(result.rows.find(row => row.family === 'tax')).toMatchObject({
      current: { policyRef: 'policy:tax:1', evidenceRef: 'evidence:tax', approvedByPrincipalRef: 'principal:owner' },
      pending: [{ proposalRef: 'proposal:live' }],
    })
    expect(result.rows.find(row => row.family === 'operations')).toMatchObject({ current: null, pending: [] })
  })

  it('does not silently omit a malformed pending policy proposal', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_policy-invalid-proposal')
    await backend.run(ctx => ctx.db.insert('adminApprovalProposals', {
      proposalRef: 'proposal:invalid', action: 'change_commercial_policy', commandDigest: 'sha256:command',
      commandJson: '{', proposerRef: 'principal:proposer', status: 'awaiting_second_approval',
      createdAt: NOW, expiresAt: NOW + 86_400_000,
    }))
    expect(await admin.query(api.moneyCommercialPolicy.readSummary, { environment: 'production', refreshAt: NOW }))
      .toEqual({ kind: 'refused', code: 'commercial_policy_proposal_invalid' })
  })

  it.each([{ input: { family: 'tax' } }, { input: { environment: 'unsupported', family: 'tax' } }])(
    'refuses a policy proposal with a missing or unsupported environment: $input', async command => {
      const backend = convexTestWithMarketComponents()
      const admin = await ownerAdmin(backend, 'user_policy-invalid-environment')
      await backend.run(ctx => ctx.db.insert('adminApprovalProposals', {
        proposalRef: 'proposal:invalid-environment', action: 'change_commercial_policy', commandDigest: 'sha256:command',
        commandJson: JSON.stringify(command), proposerRef: 'principal:proposer', status: 'awaiting_second_approval',
        createdAt: NOW, expiresAt: NOW + 86_400_000,
      }))
      expect(await admin.query(api.moneyCommercialPolicy.readSummary, { environment: 'production', refreshAt: NOW }))
        .toEqual({ kind: 'refused', code: 'commercial_policy_proposal_invalid' })
    },
  )

  it('refuses a saturated proposal read rather than claiming a family has no pending decision', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_policy-overflow')
    await backend.run(async ctx => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert('adminApprovalProposals', {
          proposalRef: `proposal:overflow:${index}`, action: 'change_commercial_policy',
          commandDigest: 'sha256:command',
          commandJson: JSON.stringify({ input: { environment: 'production', family: 'tax' } }),
          proposerRef: 'principal:proposer', status: 'awaiting_second_approval',
          createdAt: NOW, expiresAt: NOW + 86_400_000,
        })
      }
    })
    expect(await admin.query(api.moneyCommercialPolicy.readSummary, { environment: 'production', refreshAt: NOW }))
      .toEqual({ kind: 'refused', code: 'commercial_policy_proposals_unavailable' })
  })
})
