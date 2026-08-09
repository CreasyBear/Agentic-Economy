/// <reference types="vite/client" />
import { afterEach, describe, expect, it } from 'vitest'
import { anyApi, type DataModelFromSchemaDefinition } from 'convex/server'
import { convexTest, type TestConvex, type TestConvexForDataModel } from 'convex-test'

import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { createCustomerRequestServiceAssertion } from '../src/modules/customer-request/service-auth-envelope'
import { internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const workTreesApi = anyApi.workTrees
const approvalsApi = anyApi.workTreeApprovals
const principalsApi = anyApi.customerRequestPrincipals
if (workTreesApi === undefined || approvalsApi === undefined || principalsApi === undefined) throw new Error('work_tree_approval_api_missing')
function requireApiBinding<T>(binding: T | undefined, errorMessage: string): T {
  if (binding === undefined) throw new Error(errorMessage)
  return binding
}

const decideWorkTree = requireApiBinding(workTreesApi.decide, 'work_tree_decide_missing')
const issueApproval = requireApiBinding(approvalsApi.issue, 'work_tree_approval_issue_missing')
const registerAgentPrincipal = requireApiBinding(principalsApi.registerAgentPrincipal, 'agent_principal_register_missing')
const readApproval = requireApiBinding(internal.workTreeApprovals.readByApprovalRef, 'work_tree_approval_read_missing')

const SERVICE_KEY = 'work-tree-approval-service-key-at-least-32-bytes'

const targetNode = (nodeId = 'target') => ({
  format: 'ae.work-node:v1' as const,
  nodeId,
  kind: 'decision' as const,
  title: 'Choose a path',
  status: 'ready' as const,
  dependsOn: [],
  priority: 0,
  cost: { estimate: { currency: 'AUD', units: '0', exponent: 3 } },
  authorityRef: 'authority:t49',
  evidenceRefs: [],
  createdAt: 1,
  updatedAt: 1,
})

const tree = (nodes = [targetNode()]) => ({
  format: 'ae.work-tree:v1' as const,
  treeId: 'tree:approval',
  projectId: 'project:approval',
  generation: 1,
  revision: 1,
  charterText: 'A bounded approval fixture.',
  nodes,
})

async function seed(backend: Pick<TestConvex<typeof schema>, 'run'>, nodes = [targetNode()]) {
  await backend.run(async (ctx) => {
    await ctx.db.insert('workTrees', {
      projectId: 'project:approval',
      treeId: 'tree:approval',
      principalId: 'owner:approval',
      ownerId: 'owner:approval',
      lineageJson: JSON.stringify({ kind: 'standalone' }),
      lineageDigest: canonicalDigest({ kind: 'standalone' }),
      createIdempotencyKey: 'seed:approval',
      createPayloadDigest: 'seed:approval',
      creationOperationKey: 'seed:approval',
      generation: 1,
      revision: 1,
      snapshotJson: JSON.stringify(tree(nodes)),
      snapshotDigest: canonicalDigest(tree(nodes)),
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('customerRequestAgentPrincipals', {
      principalId: 'agent:approval',
      ownerId: 'owner:approval',
      ownerTokenIdentifier: 'https://identity.example|owner:approval',
      credentialId: 'credential:approval',
      scopes: ['work_trees:decide'],
      recordedAt: 1,
      lastSeenAt: 1,
    })
  })
}

const proposal = {
  projectId: 'project:approval',
  nodeId: 'target',
  kind: 'lock' as const,
  expectedGeneration: 1,
  expectedRevision: 1,
}
const authority = { kind: 'per_item' as const, amount: { currency: 'AUD', units: '0', exponent: 2 } }
const proposalDigest = canonicalDigest(proposal)

type ApprovalStepUp = Readonly<{
  acknowledgedConsequence: true
  approvalKind: 'per_item'
  approvalRef?: string
  authority?: Readonly<{
    kind: 'per_item'
    amount?: Readonly<{ currency: string; units: string; exponent: number }>
  }>
}>

async function serviceAuth(input: Readonly<{ idempotencyKey: string; credentialId?: string; stepUp?: ApprovalStepUp }>) {
  const command = {
    ...proposal,
    proposalDigest,
    idempotencyKey: input.idempotencyKey,
    ...(input.stepUp === undefined ? {} : { stepUp: input.stepUp }),
  }
  return await createCustomerRequestServiceAssertion({
    key: SERVICE_KEY,
    operation: 'workTree.decide',
    command,
    principal: {
      principalId: 'agent:approval',
      ownerId: 'owner:approval',
      credentialId: input.credentialId ?? 'credential:approval',
      scopes: ['work_trees:decide'],
    },
    issuedAt: Date.now(),
  })
}

type ApprovalBackend = TestConvexForDataModel<DataModelFromSchemaDefinition<typeof schema>>

async function issue(backend: ApprovalBackend, overrides: Record<string, unknown> = {}) {
  return await backend.mutation(issueApproval, {
    ...proposal,
    proposalDigest,
    credentialId: 'credential:approval',
    authority,
    expiresAt: Date.now() + 60_000,
    idempotencyKey: 'approval:issue',
    ...overrides,
  })
}
function backendWithOwner() {
  return convexTest(schema, modules).withIdentity({
    subject: 'owner:approval',
    issuer: 'https://identity.example',
    tokenIdentifier: 'https://identity.example|owner:approval',
  })
}


describe('T49 WorkTree approval artifact Convex seam', () => {
  const previousKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN

  afterEach(() => {
    if (previousKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousKey
  })

  it('requires the artifact for an approve_each agent and preserves unchanged readback', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY
    const backend = backendWithOwner()
    await seed(backend)
    const missing = {
      ...proposal,
      proposalDigest,
      idempotencyKey: 'decision:missing',
      stepUp: { acknowledgedConsequence: true as const, approvalKind: 'per_item' as const },
      serviceAuth: await serviceAuth({ idempotencyKey: 'decision:missing', stepUp: { acknowledgedConsequence: true, approvalKind: 'per_item' } }),
    }
    await expect(backend.mutation(decideWorkTree, missing)).resolves.toMatchObject({
      kind: 'refused', refusalCode: 'step_up_required', disposition: 'unchanged', readback: { revision: 1 },
    })
    const row = await backend.run(async (ctx) => await ctx.db.query('workTrees').withIndex('by_projectId', (q) => q.eq('projectId', proposal.projectId)).unique())
    expect(row?.revision).toBe(1)
  })
  it('registers a fresh key principal before standalone approval and rejects a different owner', async () => {
    const backend = backendWithOwner()
    await seed(backend)
    await expect(backend.mutation(registerAgentPrincipal, {
      principalId: 'clerk_api_key:key:fresh',
      credentialId: 'key:fresh',
      scopes: ['customer_requests:create', 'customer_requests:inspect_only'],
      seenAt: Date.now(),
    })).resolves.toEqual({ kind: 'recorded' })
    await expect(issue(backend, {
      credentialId: 'key:fresh',
      idempotencyKey: 'approval:fresh',
    })).resolves.toMatchObject({
      kind: 'accepted',
      ownerId: 'owner:approval',
      credentialId: 'key:fresh',
    })
    const stranger = convexTest(schema, modules).withIdentity({
      subject: 'owner:other',
      issuer: 'https://identity.example',
      tokenIdentifier: 'https://identity.example|owner:other',
    })
    await seed(stranger)
    await expect(issue(stranger, {
      credentialId: 'key:fresh',
      idempotencyKey: 'approval:stranger',
    })).resolves.toMatchObject({ kind: 'refused', code: 'approval_credential_mismatch' })
  })

  it('issues an opaque exact artifact, consumes once, attributes the actor, and replays exactly', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY
    const backend = backendWithOwner()
    await seed(backend)
    const expiresAt = Date.now() + 60_000
    const issued = await issue(backend, { expiresAt })
    expect(issued).toMatchObject({ kind: 'accepted', ownerId: 'owner:approval', credentialId: 'credential:approval', authority })
    if (issued.kind !== 'accepted') throw new Error('approval_issue_refused')
    expect(issued.approvalRef).toMatch(/^work-tree-approval:/u)
    const stepUp = { acknowledgedConsequence: true as const, approvalKind: 'per_item' as const, approvalRef: issued.approvalRef }
    const command = { ...proposal, proposalDigest, idempotencyKey: 'decision:accepted', stepUp }
    const accepted = await backend.mutation(decideWorkTree, {
      ...command,
      serviceAuth: await serviceAuth({ idempotencyKey: command.idempotencyKey, stepUp }),
    })
    expect(accepted).toMatchObject({
      kind: 'accepted', decision: 'lock', readback: { revision: 2 },
      actor: { source: expect.any(String) },
    })
    const replayed = await backend.mutation(decideWorkTree, {
      ...command,
      serviceAuth: await serviceAuth({ idempotencyKey: command.idempotencyKey, stepUp }),
    })
    expect(replayed).toMatchObject({ kind: 'replayed', receiptId: accepted.receiptId })
    const issuedAgainAfterEffect = await issue(backend, { expiresAt })
    expect(issuedAgainAfterEffect).toEqual(issued)
    const row = await backend.query(readApproval, { approvalRef: issued.approvalRef })
    expect(row).toMatchObject({
      status: 'consumed',
      consumedReceiptId: accepted.receiptId,
      authorityAmountCurrency: 'AUD',
      authorityAmountUnits: '0',
      authorityAmountExponent: 2,
    })
  })

  it('refuses wrong credential, amount, and expiry without changing the tree', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY
    const backend = backendWithOwner()
    await seed(backend)
    const issued = await issue(backend)
    if (issued.kind !== 'accepted') throw new Error('approval_issue_refused')
    const baseStepUp = { acknowledgedConsequence: true as const, approvalKind: 'per_item' as const, approvalRef: issued.approvalRef }
    await expect(backend.mutation(decideWorkTree, {
      ...proposal, proposalDigest, idempotencyKey: 'decision:wrong-credential', stepUp: baseStepUp,
      serviceAuth: await serviceAuth({ idempotencyKey: 'decision:wrong-credential', credentialId: 'credential:wrong', stepUp: baseStepUp }),
    })).resolves.toMatchObject({ kind: 'refused', refusalCode: 'approval_credential_mismatch', readback: { revision: 1 } })

    const wrongAmountStepUp = { ...baseStepUp, authority: { kind: 'per_item' as const, amount: { currency: 'AUD', units: '1', exponent: 2 } } }
    await expect(backend.mutation(decideWorkTree, {
      ...proposal, proposalDigest, idempotencyKey: 'decision:wrong-amount', stepUp: wrongAmountStepUp,
      serviceAuth: await serviceAuth({ idempotencyKey: 'decision:wrong-amount', stepUp: wrongAmountStepUp }),
    })).resolves.toMatchObject({ kind: 'refused', refusalCode: 'approval_amount_mismatch', readback: { revision: 1 } })

    await backend.run(async (ctx) => {
      const row = await ctx.db.query('workTreeApprovals').withIndex('by_approvalRef', (q) => q.eq('approvalRef', issued.approvalRef)).unique()
      if (row === null) throw new Error('approval_row_missing')
      await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 })
    })
    const expiredStepUp = { acknowledgedConsequence: true as const, approvalKind: 'per_item' as const, approvalRef: issued.approvalRef }
    await expect(backend.mutation(decideWorkTree, {
      ...proposal, proposalDigest, idempotencyKey: 'decision:expired', stepUp: expiredStepUp,
      serviceAuth: await serviceAuth({ idempotencyKey: 'decision:expired', stepUp: expiredStepUp }),
    })).resolves.toMatchObject({ kind: 'refused', refusalCode: 'approval_expired', readback: { revision: 1 } })
  })
  it('consumes one artifact under concurrent distinct retries and holds the second attempt', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY
    const backend = backendWithOwner()
    await seed(backend)
    const issued = await issue(backend, { idempotencyKey: 'approval:concurrent' })
    if (issued.kind !== 'accepted') throw new Error('approval_issue_refused')
    const stepUp = { acknowledgedConsequence: true as const, approvalKind: 'per_item' as const, approvalRef: issued.approvalRef }
    const first = { ...proposal, proposalDigest, idempotencyKey: 'decision:concurrent:one', stepUp }
    const second = { ...proposal, proposalDigest, idempotencyKey: 'decision:concurrent:two', stepUp }
    const [left, right] = await Promise.all([
      backend.mutation(decideWorkTree, { ...first, serviceAuth: await serviceAuth({ idempotencyKey: first.idempotencyKey, stepUp }) }),
      backend.mutation(decideWorkTree, { ...second, serviceAuth: await serviceAuth({ idempotencyKey: second.idempotencyKey, stepUp }) }),
    ])
    const results = [left, right]
    expect(results.filter((result) => result.kind === 'accepted')).toHaveLength(1)
    expect(results.filter((result) => result.kind === 'refused')).toHaveLength(1)
    const row = await backend.query(readApproval, { approvalRef: issued.approvalRef })
    expect(row?.status).toBe('consumed')
  })
})
