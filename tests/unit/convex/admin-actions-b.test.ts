/// <reference types="vite/client" />
import { makeFunctionReference } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { SANDBOX_COMMERCIAL_POLICY_CONTROLS } from '@/modules/money/public'
import type { AdminCommandAction, AdminCommandArgs, AdminCommandReceipt } from '@/lib/operator/admin-console/contracts'
import {
  convexTestWithMarketComponents, nonAdmin, ownerAdmin, reviewerAdmin,
  supportAdmin, testMfaConsequenceProof, type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

const sourceMutation = makeFunctionReference<'mutation', Record<string, unknown>, AdminCommandReceipt<'verify_capability_source_authority'>>('capabilitySupply:verifyCapabilitySourceAuthority')
const policyMutation = makeFunctionReference<'mutation', Record<string, unknown>, AdminCommandReceipt<'change_commercial_policy'>>('moneyCommercialPolicy:change')
const sourceInput = {
  publicationRef: 'publication:admin-actions-b', expectedRevision: 1,
  expectedSourceDigest: `sha256:${'c'.repeat(64)}`,
}
const now = Date.now()
afterEach(() => vi.unstubAllEnvs())
const policyInput: AdminCommandArgs<'change_commercial_policy'>['input'] = {
  changeKind: 'activate', family: 'commercial_perimeter',
  environment: 'production', policyRef: 'commercial-policy:admin-actions-b',
  revision: 1, effectiveAt: now - 1_000, expiresAt: now + 86_400_000,
  control: SANDBOX_COMMERCIAL_POLICY_CONTROLS.commercial_perimeter,
}
function args<A extends AdminCommandAction>(
  actor: string, command: AdminCommandArgs<A>,
): AdminCommandArgs<A> {
  const digest = canonicalDigest({ scope: 'admin_operator', action: command.action,
    input: command.input, reasonCode: command.reasonCode, evidenceRefs: command.evidenceRefs,
    ...(command.expectedStateDigest === undefined ? {} : { expectedStateDigest: command.expectedStateDigest }),
  })
  return { ...command, proof: testMfaConsequenceProof({ subject: actor }, digest) }
}
function sourceCommand(actor: string, key: string, overrides: Partial<AdminCommandArgs<'verify_capability_source_authority'>> = {}) {
  return args(actor, { action: 'verify_capability_source_authority', input: sourceInput,
    reasonCode: 'evidence_verified', evidenceRefs: ['review:source:123'],
    operationKey: key, correlationId: key, approval: { kind: 'execute' },
    ...overrides,
  })
}
function policyCommand(actor: string, key: string, overrides: Partial<AdminCommandArgs<'change_commercial_policy'>> = {}) {
  return args(actor, { action: 'change_commercial_policy', input: policyInput,
    reasonCode: 'pricing_update', evidenceRefs: ['approval:commercial-policy:123'],
    operationKey: key, correlationId: key, approval: { kind: 'execute' },
    ...overrides,
  })
}
async function seedPublication(backend: ConvexFixtureBackend) {
  await backend.run(async (ctx) => {
    const businessId = await ctx.db.insert('businesses', {
      owningAccountRef: 'acc_adminactionsb000000000000000000', slug: 'admin-actions-b',
      name: 'Provider', normalizedName: 'provider', category: 'software',
      businessContext: { kind: 'programmable_provider', website: 'https://provider.example', providerIdentifier: 'provider:b' },
      publicStatus: 'published', trustTier: 'listed', sourceHash: 'source:admin-b',
      createdAt: 1, updatedAt: 2,
    })
    await ctx.db.insert('capabilityPublications', {
      publicationRef: sourceInput.publicationRef, revision: 1,
      toolRef: `operation:v1:${'a'.repeat(64)}`, businessId, networkId: 'ae:public',
      runtimeEnvironment: 'production', capabilityId: 'provider.lookup', version: 1,
      contractDigest: `sha256:${'b'.repeat(64)}`, sourceKind: 'openapi_http',
      sourceRevision: '1', publisherRef: 'principal:provider', authorityMode: 'provider_owned',
      provenanceDigest: `sha256:${'d'.repeat(64)}`, offeringId: 'offering:provider',
      bindingId: 'binding:provider', disposition: 'current', sourceAuthorityState: 'review_required',
      sourceDigest: sourceInput.expectedSourceDigest,
      credentialState: 'ready', healthState: 'healthy', readinessEvidenceRefs: [],
      registrationEvidenceRefs: [], createdAt: 1, updatedAt: 2,
    })
  })
}

describe('admin source authority and commercial policy actions', () => {
  it.each(['support', 'reviewer', 'non_admin'])('denies %s for both actions', async (role) => {
    const backend = convexTestWithMarketComponents()
    const subject = `user_admin-b-${role}`
    const caller = role === 'support' ? await supportAdmin(backend, subject)
      : role === 'reviewer' ? await reviewerAdmin(backend, subject)
        : await nonAdmin(backend, subject)
    const source = await withSourceWrite('admin_operator', sourceCommand(subject, `source:${role}`))
    const policy = await withSourceWrite('admin_operator', policyCommand(subject, `policy:${role}`))
    const code = role === 'non_admin' ? 'missing_membership' : 'action_not_allowed'
    expect(await caller.mutation(sourceMutation, source)).toMatchObject({ kind: 'refused', code })
    expect(await caller.mutation(policyMutation, policy)).toMatchObject({ kind: 'refused', code })
  })

  it('requires proof and refuses missing publications, verified publications, and stale state', async () => {
    const backend = convexTestWithMarketComponents()
    const subject = 'user_admin-b-source'
    const admin = await ownerAdmin(backend, subject)
    const missing = sourceCommand(subject, 'source:missing')
    expect(await admin.mutation(sourceMutation, await withSourceWrite('admin_operator', missing)))
      .toMatchObject({ kind: 'refused', code: 'publication_not_found' })
    await seedPublication(backend)
    const { proof: _sourceProof, ...noProof } = sourceCommand(subject, 'source:proof')
    expect(await admin.mutation(sourceMutation, await withSourceWrite('admin_operator', noProof)))
      .toMatchObject({ kind: 'refused', code: 'mfa_reverification_required' })
    const stale = sourceCommand(subject, 'source:stale', { expectedStateDigest: 'sha256:stale' })
    expect(await admin.mutation(sourceMutation, await withSourceWrite('admin_operator', stale)))
      .toMatchObject({ kind: 'refused', code: 'target_changed' })
    const approved = await withSourceWrite('admin_operator', sourceCommand(subject, 'source:verified'))
    const first = await admin.mutation(sourceMutation, approved)
    expect(first).toMatchObject({ kind: 'completed', code: 'source_authority_verified' })
    expect(await admin.mutation(sourceMutation, approved)).toEqual(first)
    const again = sourceCommand(subject, 'source:again')
    expect(await admin.mutation(sourceMutation, await withSourceWrite('admin_operator', again)))
      .toMatchObject({ kind: 'refused', code: 'source_authority_not_reviewable' })
    const audit = await backend.run((ctx) => ctx.db.query('auditEvents')
      .withIndex('by_eventType_and_createdAt', (query) => query.eq('eventType', 'capability_supply.eligibility_changed'))
      .collect())
    expect(audit).toHaveLength(2)
  })

  it('records insufficiency while preserving a reviewable publication', async () => {
    const backend = convexTestWithMarketComponents()
    await seedPublication(backend)
    const subject = 'user_admin-b-insufficient'
    const admin = await ownerAdmin(backend, subject)
    const command = sourceCommand(subject, 'source:insufficient', { reasonCode: 'evidence_insufficient' })
    expect(await admin.mutation(sourceMutation, await withSourceWrite('admin_operator', command)))
      .toMatchObject({ kind: 'completed', code: 'source_authority_insufficient' })
    const row = await backend.run((ctx) => ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => query.eq('publicationRef', sourceInput.publicationRef).eq('revision', 1))
      .unique())
    expect(row).toMatchObject({ sourceAuthorityState: 'review_required', registrationEvidenceRefs: ['review:source:123'] })
  })

  it('requires policy proof, returns policy_not_found, and replays identical receipts', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const backend = convexTestWithMarketComponents()
    const subject = 'user_admin-b-policy'
    const admin = await ownerAdmin(backend, subject)
    const absent = policyCommand(subject, 'policy:absent', { input: {
      ...policyInput, changeKind: 'suspend', expectedCurrentPolicyRef: policyInput.policyRef,
    } })
    expect(await admin.mutation(policyMutation, await withSourceWrite('admin_operator', absent)))
      .toMatchObject({ kind: 'refused', code: 'policy_not_found' })
    const { proof: _policyProof, ...missingProof } = policyCommand(subject, 'policy:proof')
    expect(await admin.mutation(policyMutation, await withSourceWrite('admin_operator', missingProof)))
      .toMatchObject({ kind: 'refused', code: 'mfa_reverification_required' })
    const command = await withSourceWrite('admin_operator', policyCommand(subject, 'policy:activate'))
    const first = await admin.mutation(policyMutation, command)
    expect(first).toMatchObject({ kind: 'completed', code: 'commercial_policy_changed' })
    expect(await admin.mutation(policyMutation, command)).toEqual(first)
    const stale = policyCommand(subject, 'policy:stale', { expectedStateDigest: 'sha256:stale' })
    expect(await admin.mutation(policyMutation, await withSourceWrite('admin_operator', stale)))
      .toMatchObject({ kind: 'refused', code: 'target_changed' })
    const rows = await backend.run((ctx) => ctx.db.query('moneyCommercialPolicies')
      .withIndex('by_policyRef', (query) => query.eq('policyRef', policyInput.policyRef)).collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ evidenceRef: 'approval:commercial-policy:123',
      evidenceDigest: canonicalDigest(['approval:commercial-policy:123']),
      commandDigest: canonicalDigest({
        scope: 'admin_operator', action: command.action, input: command.input,
        reasonCode: command.reasonCode, evidenceRefs: command.evidenceRefs,
      }) })
  })

  it('requires a distinct second owner before changing policy exactly once', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const backend = convexTestWithMarketComponents()
    const proposer = 'user_admin-b-proposer'
    const approver = 'user_admin-b-approver'
    const first = await ownerAdmin(backend, proposer)
    const second = await ownerAdmin(backend, approver)
    const direct = policyCommand(proposer, 'policy:direct')
    expect(await first.mutation(policyMutation, await withSourceWrite('admin_operator', direct)))
      .toMatchObject({ kind: 'refused', code: 'approval_required' })
    const proposed = policyCommand(proposer, 'policy:propose', { approval: { kind: 'propose' } })
    const proposal = await first.mutation(policyMutation, await withSourceWrite('admin_operator', proposed))
    expect(proposal.kind).toBe('proposed')
    if (proposal.kind !== 'proposed') throw new Error('proposal_expected')
    const approve = policyCommand(approver, 'policy:approve', {
      approval: { kind: 'approve', proposalRef: proposal.proposalRef },
    })
    const command = await withSourceWrite('admin_operator', approve)
    const completed = await second.mutation(policyMutation, command)
    expect(completed).toMatchObject({ kind: 'completed', code: 'commercial_policy_changed' })
    expect(await second.mutation(policyMutation, command)).toEqual(completed)
    const policies = await backend.run((ctx) => ctx.db.query('moneyCommercialPolicies')
      .withIndex('by_policyRef', (query) => query.eq('policyRef', policyInput.policyRef)).collect())
    expect(policies).toHaveLength(1)
  })
})
