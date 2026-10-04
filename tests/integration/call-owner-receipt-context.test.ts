import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import schema from '../../convex/schema'
import { internal } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { convexModules } from '../helpers/convex-fixtures'
import { buildDevelopmentPublishedToolEvidence } from '../unit/capability-supply/fixtures/development-published-tool-evidence'
import { createPublicToolRef } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { callStatusResultSchema, ownerCallStatusResultSchema } from '@/modules/capability-execution/call-recovery.actions'

const tool = buildDevelopmentPublishedToolEvidence().tool
const input = { symbol: 'BTC', convert: 'USD' }
const toolRef = createPublicToolRef({ operationId: tool.operationId, publicationRef: tool.identity.publicationRef,
  publicationRevision: tool.identity.publicationRevision, contractRef: tool.contract.ref })
const callRef = 'call:owner-receipt'
const ownerId = 'account:receipt-owner'
const principalId = 'agent:receipt'
const applicationRef = 'application:receipt'
const queryArgs = { callRef, ownerId, toolRef }

async function fixture(overrides: Partial<Doc<'capabilityCalls'>> = {}) {
  const backend = convexTest(schema, convexModules)
  const ids = await backend.run(async (ctx) => {
    const call = await ctx.db.insert('capabilityCalls', {
      callRef, ownerId, principalId, applicationRef, credentialId: 'credential:never-project',
      toolRef, environment: tool.runtimeEnvironment, idempotencyKey: 'receipt:test',
      grantRef: 'grant:receipt', grantGeneration: 1, policyDigest: 'sha256:policy', grantExpiresAt: 100,
      inputJson: JSON.stringify(input), inputDigest: canonicalDigest(input),
      requestDigest: canonicalDigest({ operationRef: toolRef, input }), toolJson: JSON.stringify(tool),
      state: 'reconciliation_required', createdAt: 1, updatedAt: 2, ...overrides,
    })
    const principal = await ctx.db.insert('principals', {
      principalRef: principalId, kind: 'agent', lifecycle: 'active', displayName: 'Research assistant',
      revision: 1, createdAt: 1, updatedAt: 1,
    })
    const admission = await ctx.db.insert('agentAccessPrincipals', {
      principalId, ownerId, applicationRef, credentialId: 'credential:never-project',
      environment: tool.runtimeEnvironment, scopes: [], authorityMode: 'approval_required',
      grantGeneration: 1, spendingPolicyDigest: 'sha256:policy', lifecycle: 'revoked', recordedAt: 1, lastSeenAt: 1,
    })
    const membership = await ctx.db.insert('memberships', {
      membershipRef: 'membership:receipt', accountRef: ownerId, memberPrincipalRef: principalId,
      lifecycle: 'active', revision: 1, createdAt: 1,
      createdBy: { actorPrincipalRef: 'owner:receipt', activeAccountRef: ownerId, correlationRef: 'receipt:test', idempotencyRef: 'receipt:test' },
    })
    return { call, principal, admission, membership }
  })
  return { backend, ids }
}

describe('owner receipt context', () => {
  it('uses retained Call material and a current Account-owned Agent label after grant expiry/revocation', async () => {
    const { backend } = await fixture()
    const context = await backend.query(internal.capabilityCalls.readOwnerReceiptContext, queryArgs)
    expect(context).toEqual({
      attemptEvidence: { kind: 'not_recorded' },
      purpose: null,
      agent: { principalRef: principalId, applicationRef, currentDisplayName: 'Research assistant' },
      recordedTool: { kind: 'available', basis: 'call_snapshot', name: tool.contract.name, providerRef: tool.identity.businessId, providerName: null },
      reconciliation: { canSubmitEvidence: true, permissionBasis: 'account_owner', requiresVerifiedEvidence: true },
    })
    expect(JSON.stringify(context)).not.toContain('credential:never-project')
    expect(JSON.stringify(context)).not.toContain('BTC')
    // The owner adapter retains metadata; the protected public schema stays strict.
    const status = { kind: 'found', callRef, toolRef, state: 'reconciliation_required', version: 1 }
    expect(ownerCallStatusResultSchema.parse({ ...status, ownerContext: context })).toMatchObject({ ownerContext: context })
    expect(ownerCallStatusResultSchema.parse(status)).toEqual(status)
    expect(callStatusResultSchema.safeParse({ ...status, ownerContext: context }).success).toBe(false)
  })

  it.each([{ ownerId: 'account:foreign' }, { toolRef: 'tool:other' }, { callRef: 'call:missing' }])(
    'refuses mismatched receipt linkage: %j', async (overrides) => {
      const { backend } = await fixture()
      expect(await backend.query(internal.capabilityCalls.readOwnerReceiptContext, { ...queryArgs, ...overrides })).toBeNull()
    },
  )

  it.each([
    { toolJson: '{}' }, { inputJson: '{malformed' },
    { inputDigest: 'sha256:other' }, { requestDigest: 'sha256:other' }, { environment: 'production' as const },
  ])('marks untrustworthy snapshot material unavailable: %j', async (overrides) => {
    const { backend } = await fixture(overrides)
    expect(await backend.query(internal.capabilityCalls.readOwnerReceiptContext, queryArgs)).toMatchObject({
      recordedTool: { kind: 'unavailable' },
    })
  })

  it('marks a removed Call snapshot unavailable', async () => {
    const { backend, ids } = await fixture()
    await backend.run(async (ctx) => { await ctx.db.patch(ids.call, { toolJson: undefined }) })
    expect(await backend.query(internal.capabilityCalls.readOwnerReceiptContext, queryArgs)).toMatchObject({
      recordedTool: { kind: 'unavailable' },
    })
  })

  it.each([{ ownerId: 'account:other' }, { applicationRef: 'application:other' }, { environment: 'production' as const }])(
    'withholds a current label from mismatched Agent admission: %j', async (overrides) => {
      const { backend, ids } = await fixture()
      await backend.run(async (ctx) => { await ctx.db.patch(ids.admission, overrides) })
      expect(await backend.query(internal.capabilityCalls.readOwnerReceiptContext, queryArgs)).toMatchObject({
        agent: { currentDisplayName: null }, recordedTool: { kind: 'available' },
      })
    },
  )

  it('distinguishes current Agent renaming from recorded Tool identity and ended membership', async () => {
    const { backend, ids } = await fixture()
    await backend.run(async (ctx) => { await ctx.db.patch(ids.principal, { displayName: 'Renamed assistant' }) })
    expect(await backend.query(internal.capabilityCalls.readOwnerReceiptContext, queryArgs)).toMatchObject({
      agent: { currentDisplayName: 'Renamed assistant' }, recordedTool: { name: tool.contract.name },
    })
    await backend.run(async (ctx) => { await ctx.db.patch(ids.membership, { lifecycle: 'ended' }) })
    expect(await backend.query(internal.capabilityCalls.readOwnerReceiptContext, queryArgs)).toMatchObject({
      agent: { currentDisplayName: null }, recordedTool: { name: tool.contract.name },
      reconciliation: { canSubmitEvidence: true },
    })
  })
})
