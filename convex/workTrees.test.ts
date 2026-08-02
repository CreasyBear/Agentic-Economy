/// <reference types="vite/client" />
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { anyApi } from 'convex/server'
import { convexTest, type TestConvex } from 'convex-test'
import type { StableHashValue } from '../src/modules/common/stable-hash'
import { isRecord } from '../src/modules/common/is-record'

import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  gardenerVerbDigest,
  gardenerVerbSchema,
  type GardenerVerb,
} from '../src/modules/work-tree/convex'
import { createCustomerRequestServiceAssertion } from '../src/modules/customer-request/service-auth-envelope'
import { mintBrowserGuestAssertion } from '../src/lib/server/browser-guest-assertion'
import { internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const workTreesApi = anyApi.workTrees
if (workTreesApi === undefined) throw new Error('work_tree_api_missing')

function requireApiBinding<T>(binding: T | undefined, errorMessage: string): T {
  if (binding === undefined) throw new Error(errorMessage)
  return binding
}

const applyWorkTree = requireApiBinding(workTreesApi.apply, 'work_tree_apply_missing')
const createWorkTree = requireApiBinding(workTreesApi.create, 'work_tree_create_missing')
const decideWorkTree = requireApiBinding(workTreesApi.decide, 'work_tree_decide_missing')
const inspectWorkTree = requireApiBinding(workTreesApi.inspect, 'work_tree_inspect_missing')
const readWorkTreeByProject = requireApiBinding(
  internal.workTrees.readTreeByProject,
  'work_tree_read_tree_by_project_missing',
)

const GUEST_SIGNING_KEY = 'work-tree-guest-signing-key-that-is-at-least-32-bytes'

const node = (input: Partial<{
  nodeId: string
  kind: 'package' | 'decision' | 'task' | 'study'
  title: string
  status: 'fog' | 'queued' | 'ready' | 'studying' | 'locked' | 'done' | 'cancelled'
  parentId: string
  dependsOn: string[]
  timing: { certainty: 'fixed' | 'window' | 'fog' }
  description: string
  evidenceRefs: string[]
}> = {}) => ({
  format: 'ae.work-node:v1' as const,
  nodeId: input.nodeId ?? 'target',
  kind: input.kind ?? 'task',
  title: input.title ?? 'Target',
  status: input.status ?? 'fog',
  ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
  dependsOn: input.dependsOn ?? [],
  priority: 0,
  ...(input.timing === undefined ? {} : { timing: input.timing }),
  ...(input.description === undefined ? {} : { description: input.description }),
  evidenceRefs: input.evidenceRefs ?? [],
  createdAt: 1,
  updatedAt: 1,
})

const baseTree = (
  nodes = [
    node({ nodeId: 'root', kind: 'package', title: 'Root', status: 'ready', timing: { certainty: 'fog' } }),
    node({ nodeId: 'target', parentId: 'root' }),
  ],
  projectId = 'project:one',
  treeId = 'tree:one',
) => ({
  format: 'ae.work-tree:v1' as const,
  treeId,
  projectId,
  generation: 1,
  revision: 1,
  charterText: 'A bounded charter.',
  nodes,
})

function isStableHashValue(value: unknown): value is StableHashValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }
  if (Array.isArray(value)) return value.every((entry) => isStableHashValue(entry))
  return isRecord(value) && Object.values(value).every((entry) => isStableHashValue(entry))
}

async function seedTree(
  backend: Pick<TestConvex<typeof schema>, 'run'>,
  tree = baseTree(),
  principalId = 'principal:test-work-tree',
  ownerId = 'test-work-tree',
) {
  if (!isStableHashValue(tree)) throw new Error('work tree fixture contains an unstable hash value')
  await backend.run(async (ctx) => {
    await ctx.db.insert('workTrees', {
      projectId: tree.projectId,
      treeId: tree.treeId,
      principalId,
      ownerId,
      lineageJson: JSON.stringify({ kind: 'standalone' }),
      lineageDigest: canonicalDigest({ kind: 'standalone' }),
      createIdempotencyKey: `seed:${tree.projectId}`,
      createPayloadDigest: canonicalDigest({ projectId: tree.projectId, treeId: tree.treeId }),
      creationOperationKey: `seed:create:${tree.projectId}`,
      generation: tree.generation,
      revision: tree.revision,
      snapshotJson: JSON.stringify(tree),
      snapshotDigest: canonicalDigest(tree),
      createdAt: 1,
      updatedAt: 1,
    })
  })
}

type UnsignedGardenerVerb = z.input<typeof gardenerVerbSchema> extends infer Verb
  ? Verb extends { proposalDigest: string } ? Omit<Verb, 'proposalDigest'> : never
  : never

function verb(input: UnsignedGardenerVerb): GardenerVerb {
  const normalized = gardenerVerbSchema.parse({ ...input, proposalDigest: 'pending' })
  return { ...normalized, proposalDigest: gardenerVerbDigest(normalized) }
}

function args(operationKey: string, proposal: GardenerVerb, projectId = 'project:one') {
  return {
    projectId,
    operationKey,
    correlationId: operationKey,
    verb: proposal,
  }
}

async function backendWithTree(tree = baseTree()) {
  const backend = convexTest(schema, modules)
  await seedTree(backend, tree)
  return backend.withIdentity({
    subject: 'test-work-tree',
    issuer: 'https://identity.example',
    tokenIdentifier: 'principal:test-work-tree',
  })
}

describe('gardener verbs Convex contract', () => {
  const previousGuestKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN

  afterEach(() => {
    if (previousGuestKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousGuestKey
  })

  it('rejects a hostile non-menu verb kind', async () => {
    const backend = await backendWithTree()
    await expect(backend.mutation(applyWorkTree, args('hostile', {
      kind: 'hostile', targetNodeId: 'target', expectedGeneration: 1, expectedRevision: 1, proposalDigest: 'x',
    } as never))).rejects.toThrow()
  })

  it('rejects a target outside the elaboration frontier', async () => {
    const backend = await backendWithTree()
    const proposal = verb({ kind: 'elaborate', targetNodeId: 'root', expectedGeneration: 1, expectedRevision: 1, children: [{ kind: 'task', title: 'Nope' }] })
    await expect(backend.mutation(applyWorkTree, args('outside-frontier', proposal))).rejects.toThrow('work_tree_target_not_frontier')
  })

  it('rejects elaboration beyond the child cap', async () => {
    const backend = await backendWithTree()
    const proposal = {
      kind: 'elaborate', targetNodeId: 'target', expectedGeneration: 1, expectedRevision: 1, proposalDigest: 'hostile',
      children: Array.from({ length: 9 }, (_, index) => ({ kind: 'task' as const, title: `Child ${index}` })),
    } as never
    await expect(backend.mutation(applyWorkTree, args('child-cap', proposal))).rejects.toThrow('work_tree_children_limit')
  })

  it('rejects a depth-cap breach', async () => {
    const chain = [node({ nodeId: 'root', kind: 'package', status: 'ready', timing: { certainty: 'fog' } })]
    let parentId = 'root'
    for (const id of ['one', 'two', 'three', 'four', 'target']) {
      chain.push(node({
        nodeId: id,
        parentId,
        status: id === 'target' ? 'fog' : 'ready',
        ...(id === 'target' ? {} : { timing: { certainty: 'fog' as const } }),
      }))
      parentId = id
    }
    const backend = await backendWithTree(baseTree(chain))
    const proposal = verb({ kind: 'elaborate', targetNodeId: 'target', expectedGeneration: 1, expectedRevision: 1, children: [{ kind: 'task', title: 'Too deep' }] })
    await expect(backend.mutation(applyWorkTree, args('depth-cap', proposal))).rejects.toThrow('work_tree_depth_limit')
  })

  it('rejects a cycle in resulting dependsOn edges', async () => {
    const tree = baseTree([
      node({ nodeId: 'root', kind: 'package', status: 'ready', timing: { certainty: 'fog' }, dependsOn: ['cycle-b'] }),
      node({ nodeId: 'target', parentId: 'root' }),
      node({ nodeId: 'cycle-b', dependsOn: ['root'] }),
    ])
    const backend = await backendWithTree(tree)
    const proposal = verb({ kind: 'elaborate', targetNodeId: 'target', expectedGeneration: 1, expectedRevision: 1, children: [{ kind: 'task', title: 'Cycle' }] })
    await expect(backend.mutation(applyWorkTree, args('cycle', proposal))).rejects.toThrow('work_tree_dependency_cycle')
  })

  it('replays an exact operation and rejects an altered payload under its key', async () => {
    const backend = await backendWithTree()
    const proposal = verb({ kind: 'elaborate', targetNodeId: 'target', expectedGeneration: 1, expectedRevision: 1, children: [{ kind: 'task', title: 'Child' }] })
    const applied = await backend.mutation(applyWorkTree, args('replay', proposal))
    const replayed = await backend.mutation(applyWorkTree, args('replay', proposal))
    expect(replayed).toEqual({ ...applied, kind: 'replayed', replayed: true })
    const altered = verb({ kind: 'elaborate', targetNodeId: 'target', expectedGeneration: 1, expectedRevision: 1, children: [{ kind: 'task', title: 'Altered' }] })
    await expect(backend.mutation(applyWorkTree, args('replay', altered))).rejects.toThrow('work_tree_operation_conflict')
  })

  it('returns the current tree when an earlier apply is replayed', async () => {
    const backend = await backendWithTree()
    const firstProposal = verb({
      kind: 'elaborate',
      targetNodeId: 'target',
      expectedGeneration: 1,
      expectedRevision: 1,
      children: [{ kind: 'decision', title: 'Choose a BAS path' }],
    })
    const first = await backend.mutation(applyWorkTree, args('replay:current:first', firstProposal))
    const child = first.tree.nodes.find((candidate: { parentId?: string }) => candidate.parentId === 'target')
    if (child === undefined) throw new Error('elaborated child missing')
    const secondProposal = verb({
      kind: 'elaborate',
      targetNodeId: child.nodeId,
      expectedGeneration: 1,
      expectedRevision: 2,
      children: [{ kind: 'task', title: 'Collect BAS records' }],
    })
    const second = await backend.mutation(applyWorkTree, args('replay:current:second', secondProposal))
    const replayed = await backend.mutation(applyWorkTree, args('replay:current:first', firstProposal))
    expect(second).toMatchObject({ kind: 'applied', tree: { revision: 3 } })
    expect(replayed).toMatchObject({
      kind: 'replayed',
      replayed: true,
      tree: { revision: 3 },
    })
    expect(replayed.tree).toEqual(second.tree)
  })

  it('scopes apply operation replay keys by project', async () => {
    const backend = await backendWithTree()
    await seedTree(backend, baseTree(undefined, 'project:two', 'tree:two'))
    const proposal = verb({
      kind: 'elaborate',
      targetNodeId: 'target',
      expectedGeneration: 1,
      expectedRevision: 1,
      children: [{ kind: 'task', title: 'Child' }],
    })
    const first = await backend.mutation(applyWorkTree, args('shared-operation-key', proposal, 'project:one'))
    const second = await backend.mutation(applyWorkTree, args('shared-operation-key', proposal, 'project:two'))
    expect(first).toMatchObject({ kind: 'applied', projectId: 'project:one' })
    expect(second).toMatchObject({ kind: 'applied', projectId: 'project:two' })
    await expect(backend.mutation(applyWorkTree, args('shared-operation-key', proposal, 'project:one')))
      .resolves.toMatchObject({ kind: 'replayed', projectId: 'project:one' })
    await expect(backend.mutation(applyWorkTree, args('shared-operation-key', proposal, 'project:two')))
      .resolves.toMatchObject({ kind: 'replayed', projectId: 'project:two' })
  })

  it('keeps an elaborated parent actionable so its fog children remain on the frontier', async () => {
    const backend = await backendWithTree()
    const first = verb({
      kind: 'elaborate',
      targetNodeId: 'target',
      expectedGeneration: 1,
      expectedRevision: 1,
      children: [{ kind: 'decision', title: 'Choose a BAS path' }],
    })
    const applied = await backend.mutation(applyWorkTree, args('frontier:first', first))
    const child = applied.tree.nodes.find((candidate: { parentId?: string }) => candidate.parentId === 'target')
    expect(applied.tree.nodes.find((candidate: { nodeId: string }) => candidate.nodeId === 'target')?.status).toBe('ready')
    expect(child?.status).toBe('fog')
    if (child === undefined) throw new Error('elaborated child missing')

    const second = verb({
      kind: 'elaborate',
      targetNodeId: child.nodeId,
      expectedGeneration: 1,
      expectedRevision: 2,
      children: [{ kind: 'task', title: 'Collect BAS records' }],
    })
    await expect(backend.mutation(applyWorkTree, args('frontier:second', second))).resolves.toMatchObject({
      kind: 'applied',
      tree: { revision: 3 },
    })
  })

  it('rejects stale generation and revision fences', async () => {
    const backend = await backendWithTree()
    const proposal = verb({ kind: 'elaborate', targetNodeId: 'target', expectedGeneration: 1, expectedRevision: 1, children: [{ kind: 'task', title: 'Child' }] })
    await backend.mutation(applyWorkTree, args('fresh', proposal))
    const staleRevision = verb({ kind: 'study', targetNodeId: 'target', expectedGeneration: 1, expectedRevision: 1, studyBrief: 'Study', criteriaFromCharter: [] })
    await expect(backend.mutation(applyWorkTree, args('stale-revision', staleRevision))).rejects.toThrow('work_tree_revision_stale')
    await backend.run(async (ctx) => {
      const tree = await ctx.db.query('workTrees').withIndex('by_projectId', (query) => query.eq('projectId', 'project:one')).unique()
      if (tree === null) throw new Error('missing tree')
      await ctx.db.patch(tree._id, { generation: 2 })
    })
    const staleGeneration = verb({ kind: 'study', targetNodeId: 'target', expectedGeneration: 1, expectedRevision: 2, studyBrief: 'Study', criteriaFromCharter: [] })
    await expect(backend.mutation(applyWorkTree, args('stale-generation', staleGeneration))).rejects.toThrow('work_tree_generation_stale')
  })

  it('rejects a snapshot beyond the byte cap', async () => {
    const huge = 'x'.repeat(20_000)
    const tree = baseTree([
      node({ nodeId: 'decision', kind: 'decision', status: 'ready', evidenceRefs: Array.from({ length: 32 }, () => huge) }),
    ])
    const backend = await backendWithTree(tree)
    const proposal = verb({ kind: 'propose_decision', targetNodeId: 'decision', expectedGeneration: 1, expectedRevision: 1, options: [{ optionId: 'a', label: 'A', summary: 'A' }] })
    await expect(backend.mutation(applyWorkTree, args('oversized', proposal))).rejects.toThrow('work_tree_snapshot_too_large')
  })

  it('bounds event reads with a cap-plus-one query', async () => {
    const backend = await backendWithTree()
    await backend.run(async (ctx) => {
      for (let seq = 1; seq <= 300; seq += 1) {
        await ctx.db.insert('workTreeEvents', {
          projectId: 'project:one',
          treeId: 'tree:one',
          generation: 1,
          revision: seq,
          seq,
          kind: 'study_started',
          operationKey: `read:${seq}`,
          payloadJson: JSON.stringify({ snapshotJson: JSON.stringify(baseTree()) }),
          payloadDigest: `digest:${seq}`,
          at: seq,
        })
      }
    })
    const read = await backend.query(readWorkTreeByProject, { projectId: 'project:one' })
    expect(read?.events).toHaveLength(256)
    expect(read?.hasMoreEvents).toBe(true)
    expect(read?.events.at(-1)?.seq).toBe(256)
  })

  it('rejects a forbidden status transition', async () => {
    const backend = await backendWithTree(baseTree([node({ nodeId: 'done', kind: 'task', status: 'done', timing: { certainty: 'fog' } })]))
    const proposal = verb({ kind: 'study', targetNodeId: 'done', expectedGeneration: 1, expectedRevision: 1, studyBrief: 'Study', criteriaFromCharter: [] })
    await expect(backend.mutation(applyWorkTree, args('status', proposal))).rejects.toThrow('work_tree_status_transition_invalid')
  })
  it('creates one source-owned tree, replays idempotently, and refuses other principals', async () => {
    const backend = convexTest(schema, modules)
    const owner = backend.withIdentity({
      subject: 'owner',
      issuer: 'https://identity.example',
      tokenIdentifier: 'https://identity.example|owner',
    })
    const stranger = backend.withIdentity({
      subject: 'stranger',
      issuer: 'https://identity.example',
      tokenIdentifier: 'https://identity.example|stranger',
    })
    const input = {
      idempotencyKey: 'create:one',
      charterText: 'Prepare a bounded BAS path.',
      lineage: { kind: 'standalone' as const },
    }

    const first = await owner.mutation(createWorkTree, input)
    expect(first).toMatchObject({
      kind: 'accepted',
      code: 'work_tree_created',
      replayed: false,
      readback: {
        generation: 1,
        revision: 1,
        tree: { format: 'ae.work-tree:v1', generation: 1, revision: 1, nodes: [{ kind: 'package' }] },
        events: [{ kind: 'created', seq: 1 }],
      },
      receipt: { generation: 1, revision: 1, event: { kind: 'created', seq: 1 } },
    })
    if (first.kind !== 'accepted') throw new Error(`unexpected create result: ${JSON.stringify(first)}`)

    const replay = await owner.mutation(createWorkTree, input)
    expect(replay).toMatchObject({ kind: 'replayed', replayed: true, code: 'work_tree_resumed' })
    if (replay.kind !== 'replayed') throw new Error(`unexpected replay result: ${JSON.stringify(replay)}`)
    expect(replay.readback).toEqual(first.readback)
    expect(replay.receipt).toEqual(first.receipt)

    const inspected = await owner.query(inspectWorkTree, { projectId: first.readback.projectId })
    expect(inspected).toEqual({ kind: 'accepted', readback: first.readback })

    await expect(stranger.query(inspectWorkTree, { projectId: first.readback.projectId }))
      .resolves.toEqual({ kind: 'refused', code: 'forbidden' })

    await expect(owner.mutation(createWorkTree, { ...input, charterText: 'Changed charter.' }))
      .resolves.toEqual({ kind: 'refused', code: 'idempotency_conflict', replayed: false })
    await expect(owner.query(inspectWorkTree, { projectId: first.readback.projectId }))
      .resolves.toEqual(inspected)
  })

  it('accepts a valid server-minted guest assertion and refuses a forged one', async () => {
    const key = GUEST_SIGNING_KEY
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = key
    const guestAssertion = await mintBrowserGuestAssertion(key, {
      sessionId: '123e4567-e89b-42d3-a456-426614174000',
      issuedAt: Date.now(),
    })
    const backend = convexTest(schema, modules)
    const input = {
      idempotencyKey: 'guest:create:one',
      charterText: 'Prepare a guest-owned BAS path.',
      lineage: { kind: 'standalone' as const },
      guestAssertion,
    }

    const created = await backend.mutation(createWorkTree, input)
    expect(created).toMatchObject({
      kind: 'accepted',
      readback: { principalId: 'browser_guest:123e4567-e89b-42d3-a456-426614174000' },
    })
    const forged = await backend.mutation(createWorkTree, {
      ...input,
      idempotencyKey: 'guest:create:forged',
      guestAssertion: `${guestAssertion}x`,
    })
    expect(forged).toEqual({ kind: 'refused', code: 'authentication_required', replayed: false })
  })

  it('does not fall back to a Clerk identity when service authentication is present', async () => {
    const target = node({ nodeId: 'target', kind: 'decision', status: 'ready' })
    const backend = await backendWithTree(baseTree([target]))
    const proposal = {
      projectId: 'project:one',
      nodeId: 'target',
      kind: 'adjust' as const,
      expectedGeneration: 1,
      expectedRevision: 1,
    }
    const refused = await backend.mutation(decideWorkTree, {
      ...proposal,
      proposalDigest: canonicalDigest(proposal),
      idempotencyKey: 'service-auth:invalid',
      serviceAuth: {
        principalId: 'principal:test-work-tree',
        ownerId: 'test-work-tree',
        credentialId: 'credential:fake',
        scopes: ['work_trees:decide'],
        issuedAt: Date.now(),
        signature: 'not-a-valid-hmac',
      },
    })
    expect(refused).toEqual({ kind: 'refused', code: 'authentication_required', replayed: false })
    const applyProposal = verb({
      kind: 'study',
      targetNodeId: 'target',
      expectedGeneration: 1,
      expectedRevision: 1,
      studyBrief: 'Study',
      criteriaFromCharter: [],
    })
    const applyRefused = await backend.mutation(applyWorkTree, {
      ...args('service-auth:invalid-apply', applyProposal),
      serviceAuth: {
        principalId: 'principal:test-work-tree',
        ownerId: 'test-work-tree',
        credentialId: 'credential:fake',
        scopes: ['work_trees:apply'],
        issuedAt: Date.now(),
        signature: 'not-a-valid-hmac',
      },
    })
    expect(applyRefused).toEqual({ kind: 'refused', code: 'authentication_required', replayed: false })
    const receipts = await backend.run(async (ctx) => await ctx.db
      .query('workTreeDecisionReceipts')
      .withIndex('by_projectId_and_idempotencyKey', (query) =>
        query.eq('projectId', 'project:one').eq('idempotencyKey', 'service-auth:invalid'))
      .take(10))
    expect(receipts).toHaveLength(0)
  })

  it('accepts a verified guest assertion for a decision', async () => {
    const sessionId = '123e4567-e89b-42d3-a456-426614174000'
    const principalId = `browser_guest:${sessionId}`
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = GUEST_SIGNING_KEY
    const guestAssertion = await mintBrowserGuestAssertion(GUEST_SIGNING_KEY, {
      sessionId,
      issuedAt: Date.now(),
    })
    const backend = convexTest(schema, modules)
    await seedTree(
      backend,
      baseTree([node({ nodeId: 'target', kind: 'decision', status: 'ready' })]),
      principalId,
      principalId,
    )
    const proposal = {
      projectId: 'project:one',
      nodeId: 'target',
      kind: 'adjust' as const,
      expectedGeneration: 1,
      expectedRevision: 1,
    }
    const accepted = await backend.mutation(decideWorkTree, {
      ...proposal,
      proposalDigest: canonicalDigest(proposal),
      idempotencyKey: 'guest:decision',
      guestAssertion,
    })
    expect(accepted).toMatchObject({
      kind: 'accepted',
      decision: 'adjust',
      readback: { projectId: 'project:one', revision: 2 },
    })
  })

  it('does not insert a changed-command receipt under an existing decision key', async () => {
    const backend = await backendWithTree(baseTree([
      node({ nodeId: 'target', kind: 'decision', status: 'ready' }),
    ]))
    const proposal = {
      projectId: 'project:one',
      nodeId: 'target',
      kind: 'adjust' as const,
      expectedGeneration: 1,
      expectedRevision: 1,
    }
    const firstArgs = {
      ...proposal,
      proposalDigest: canonicalDigest(proposal),
      idempotencyKey: 'decision:same-key',
    }
    const accepted = await backend.mutation(decideWorkTree, firstArgs)
    const changed = {
      ...proposal,
      kind: 'park' as const,
      proposalDigest: canonicalDigest({ ...proposal, kind: 'park' as const }),
      idempotencyKey: firstArgs.idempotencyKey,
    }
    await expect(backend.mutation(decideWorkTree, changed)).resolves.toMatchObject({
      kind: 'refused',
      refusalCode: 'digest_mismatch',
    })
    const receipts = await backend.run(async (ctx) => await ctx.db
      .query('workTreeDecisionReceipts')
      .withIndex('by_projectId_and_idempotencyKey', (query) =>
        query.eq('projectId', 'project:one').eq('idempotencyKey', firstArgs.idempotencyKey))
      .take(10))
    expect(receipts).toHaveLength(1)
    await expect(backend.mutation(decideWorkTree, firstArgs)).resolves.toMatchObject({
      kind: 'replayed',
      receiptId: accepted.receiptId,
    })
  })

  it('replays the exact owner-authorized decision across human and agent actors', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = GUEST_SIGNING_KEY
    const backend = convexTest(schema, modules)
    await seedTree(backend, baseTree([
      node({ nodeId: 'target', kind: 'decision', status: 'ready' }),
    ]))
    const owner = backend.withIdentity({
      subject: 'test-work-tree',
      issuer: 'https://identity.example',
      tokenIdentifier: 'principal:test-work-tree',
    })
    const proposal = {
      projectId: 'project:one',
      nodeId: 'target',
      kind: 'adjust' as const,
      expectedGeneration: 1,
      expectedRevision: 1,
    }
    const command = {
      ...proposal,
      proposalDigest: canonicalDigest(proposal),
      idempotencyKey: 'decision:human-agent-replay',
    }
    const accepted = await owner.mutation(decideWorkTree, command)
    expect(accepted).toMatchObject({
      kind: 'accepted',
      actor: { principalId: 'principal:test-work-tree', source: 'human_source' },
    })

    const serviceAuth = await createCustomerRequestServiceAssertion({
      key: GUEST_SIGNING_KEY,
      operation: 'workTree.decide',
      command,
      principal: {
        principalId: 'clerk_api_key:t45-agent',
        ownerId: 'test-work-tree',
        credentialId: 'credential:t45-agent',
        scopes: ['work_trees:decide'],
      },
      issuedAt: Date.now(),
    })
    const replayed = await backend.mutation(decideWorkTree, { ...command, serviceAuth })
    expect(replayed).toMatchObject({
      kind: 'replayed',
      receiptId: accepted.receiptId,
      actor: { principalId: 'principal:test-work-tree', source: 'human_source' },
    })
    const stranger = backend.withIdentity({
      subject: 'clerk-other-t45',
      issuer: 'https://identity.example',
      tokenIdentifier: 'https://identity.example|clerk-other-t45',
    })
    await expect(stranger.mutation(decideWorkTree, command)).resolves.toMatchObject({
      kind: 'refused',
      refusalCode: 'forbidden',
    })
  })

  it('refuses a paid Lock while the first-dollar money gate is closed and rereads the refusal receipt', async () => {
    const protectedTarget = {
      ...node({ nodeId: 'target', kind: 'decision', status: 'ready' }),
      cost: { currency: 'AUD', estimateMinor: 10_000 },
      authorityRef: 'authority:t49',
    }
    const backend = await backendWithTree(baseTree([protectedTarget]))
    const owner = backend
    const proposal = {
      projectId: 'project:one',
      nodeId: 'target',
      kind: 'lock' as const,
      expectedGeneration: 1,
      expectedRevision: 1,
    }

    const refused = await owner.mutation(decideWorkTree, {
      ...proposal,
      proposalDigest: canonicalDigest(proposal),
      idempotencyKey: 't49:paid-lock:refused',
    })
    expect(refused).toMatchObject({
      kind: 'refused',
      decision: 'lock',
      refusalCode: 'live_money_gate_open',
      disposition: 'unchanged',
      readback: { projectId: 'project:one', revision: 1 },
    })

    const readback = await owner.query(inspectWorkTree, { projectId: 'project:one' })
    expect(readback).toMatchObject({
      kind: 'accepted',
      readback: {
        tree: { revision: 1, nodes: [{ nodeId: 'target', status: 'ready' }] },
        receipts: [expect.objectContaining({ kind: 'refused', refusalCode: 'live_money_gate_open' })],
      },
    })
  })

  it('records Adjust and Park as fenced source revisions and replays a stepped-up Lock', async () => {
    const protectedTarget = {
      ...node({ nodeId: 'target', kind: 'decision', status: 'ready' }),
      authorityRef: 'authority:t49',
    }
    const backend = await backendWithTree(baseTree([protectedTarget]))
    const owner = backend
    const adjust = {
      projectId: 'project:one',
      nodeId: 'target',
      kind: 'adjust' as const,
      expectedGeneration: 1,
      expectedRevision: 1,
    }
    const adjusted = await owner.mutation(decideWorkTree, {
      ...adjust,
      proposalDigest: canonicalDigest(adjust),
      idempotencyKey: 't49:adjust',
    })
    expect(adjusted).toMatchObject({ kind: 'accepted', decision: 'adjust', disposition: 'adjusted', readback: { revision: 2 } })

    const park = { ...adjust, kind: 'park' as const, expectedRevision: 2 }
    const parked = await owner.mutation(decideWorkTree, {
      ...park,
      proposalDigest: canonicalDigest(park),
      idempotencyKey: 't49:park',
    })
    expect(parked).toMatchObject({ kind: 'accepted', decision: 'park', disposition: 'queued', readback: { revision: 3 } })

    const lockBackend = await backendWithTree(baseTree([protectedTarget]))
    const lockOwner = lockBackend
    const lock = { ...adjust, kind: 'lock' as const }
    const lockArgs = {
      ...lock,
      proposalDigest: canonicalDigest(lock),
      idempotencyKey: 't49:lock',
      stepUp: { acknowledgedConsequence: true as const, approvalKind: 'per_item' as const },
    }
    const locked = await lockOwner.mutation(decideWorkTree, lockArgs)
    expect(locked).toMatchObject({ kind: 'accepted', decision: 'lock', disposition: 'locked', readback: { revision: 2 } })
    const replayed = await lockOwner.mutation(decideWorkTree, lockArgs)
    expect(replayed).toMatchObject({ kind: 'replayed', receiptId: locked.receiptId })

    const parkedReadback = await owner.query(inspectWorkTree, { projectId: 'project:one' })
    expect(parkedReadback).toMatchObject({
      readback: {
        tree: { revision: 3, nodes: [{ nodeId: 'target', status: 'queued' }] },
        receipts: expect.arrayContaining([
          expect.objectContaining({ decision: 'adjust', disposition: 'adjusted' }),
          expect.objectContaining({ decision: 'park', disposition: 'queued' }),
        ]),
      },
    })
    const lockedReadback = await lockOwner.query(inspectWorkTree, { projectId: 'project:one' })
    expect(lockedReadback).toMatchObject({
      readback: {
        tree: { revision: 2, nodes: [{ nodeId: 'target', status: 'locked' }] },
        events: expect.arrayContaining([
          expect.objectContaining({ kind: 'decision_proposed', targetNodeId: 'target' }),
        ]),
        receipts: [expect.objectContaining({ decision: 'lock', disposition: 'locked' })],
      },
    })
  })
  it('persists an eligible human repeat grant and replays its receipt timestamp', async () => {
    const target = node({ nodeId: 'target', kind: 'decision', status: 'ready' })
    const backend = await backendWithTree(baseTree([
      node({ nodeId: 'root', kind: 'package', title: 'Root', status: 'ready', timing: { certainty: 'fog' } }),
      target,
    ]))
    const proposal = {
      projectId: 'project:one',
      nodeId: 'target',
      kind: 'lock' as const,
      expectedGeneration: 1,
      expectedRevision: 1,
    }
    const lockArgs = {
      ...proposal,
      proposalDigest: canonicalDigest(proposal),
      idempotencyKey: 't49:repeat-grant',
      repeatGrant: {
        delegatedCredentialId: 'credential:repeat-agent',
        occurrences: 1,
        perUseSpend: { currency: 'AUD', amountMinor: 0 },
        cumulativeSpend: { currency: 'AUD', amountMinor: 0 },
        perUseDataAllocations: 1,
        cumulativeDataAllocations: 2,
        validUntil: Date.now() + 60_000,
      },
    }
    const positiveSpendGrant = {
      ...lockArgs,
      idempotencyKey: 't49:repeat-grant-positive-unpaid',
      repeatGrant: {
        ...lockArgs.repeatGrant,
        perUseSpend: { currency: 'AUD', amountMinor: 1 },
        cumulativeSpend: { currency: 'AUD', amountMinor: 1 },
      },
    }
    await expect(backend.mutation(decideWorkTree, positiveSpendGrant)).resolves.toMatchObject({
      kind: 'refused',
      refusalCode: 'forbidden',
    })
    const accepted = await backend.mutation(decideWorkTree, lockArgs)
    expect(accepted).toMatchObject({
      kind: 'accepted',
      decision: 'lock',
      permissionRef: expect.stringMatching(/^repeat-permission:/u),
      readback: { revision: 2 },
    })
    if (accepted.kind !== 'accepted' || accepted.permissionRef === undefined) {
      throw new Error('repeat grant receipt missing permission reference')
    }
    const permissionRef = accepted.permissionRef
    const permissionRow = await backend.run(async (ctx) => await ctx.db
      .query('workTreeRepeatPermissions')
      .withIndex('by_permissionRef', (query) => query.eq('permissionRef', permissionRef))
      .unique())
    expect(permissionRow).toMatchObject({
      permissionRef,
      projectId: 'project:one',
      treeId: 'tree:one',
      ownerId: 'test-work-tree',
      principalId: 'principal:test-work-tree',
      nodeId: 'target',
      generation: 1,
      revision: 2,
      proposalDigest: lockArgs.proposalDigest,
      delegatedCredentialId: 'credential:repeat-agent',
      occurrenceLimit: 1,
      perUseSpendMinor: 0,
      cumulativeSpendMinor: 0,
      cumulativeDataAllocations: 2,
      sourceReceiptId: accepted.receiptId,
    })
    const replayed = await backend.mutation(decideWorkTree, lockArgs)
    expect(replayed).toMatchObject({ kind: 'replayed', permissionRef })
    if (typeof replayed !== 'object' || replayed === null || !('occurredAt' in replayed)) {
      throw new Error('replayed receipt timestamp missing')
    }
    const occurredAt = replayed.occurredAt
    if (typeof occurredAt !== 'number') throw new Error('replayed receipt timestamp invalid')
    expect(Number.isNaN(new Date(occurredAt).getTime())).toBe(false)
  })
  it('refuses non-safe or contradictory repeat grant caps at the Convex boundary', async () => {
    const backend = await backendWithTree(baseTree([
      node({ nodeId: 'root', kind: 'package', title: 'Root', status: 'ready', timing: { certainty: 'fog' } }),
      node({ nodeId: 'target', kind: 'decision', status: 'ready', parentId: 'root' }),
    ]))
    const proposal = {
      projectId: 'project:one',
      nodeId: 'target',
      kind: 'lock' as const,
      expectedGeneration: 1,
      expectedRevision: 1,
    }
    const baseGrant = {
      delegatedCredentialId: 'credential:repeat-agent',
      occurrences: 1,
      perUseSpend: { currency: 'AUD', amountMinor: 0 },
      cumulativeSpend: { currency: 'AUD', amountMinor: 0 },
      perUseDataAllocations: 0,
      cumulativeDataAllocations: 0,
      validUntil: Date.now() + 60_000,
    }
    const malformedGrants = [
      { ...baseGrant, occurrences: Number.MAX_SAFE_INTEGER + 1 },
      { ...baseGrant, perUseSpend: { currency: 'AUD', amountMinor: -1 } },
      { ...baseGrant, cumulativeSpend: { currency: 'AUD', amountMinor: Number.MAX_SAFE_INTEGER + 1 } },
      { ...baseGrant, perUseDataAllocations: -1 },
      { ...baseGrant, cumulativeDataAllocations: 0, perUseDataAllocations: 1 },
      { ...baseGrant, validUntil: Number.MAX_SAFE_INTEGER + 1 },
    ]
    for (const [index, repeatGrant] of malformedGrants.entries()) {
      await expect(backend.mutation(decideWorkTree, {
        ...proposal,
        proposalDigest: canonicalDigest(proposal),
        idempotencyKey: `t49:repeat-invalid:${index}`,
        repeatGrant,
      })).resolves.toMatchObject({ kind: 'refused', refusalCode: 'forbidden' })
    }
  })
})
