import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ConvexSource from '@/lib/server/convex-source'
import {
  applyWorkTreeThroughSource,
  claimWorkTreeThroughSource,
  createWorkTreeThroughSource,
  decideWorkTreeThroughSource,
  inspectWorkTreeThroughSource,
} from '@/modules/work-tree/work-tree.functions'
import type { WorkTree } from '@/modules/work-tree/public'

const sourceMocks = vi.hoisted(() => ({
  callSourceMutation: vi.fn(),
  callSourceQuery: vi.fn(),
  callPublicSourceMutation: vi.fn(),
  callPublicSourceQuery: vi.fn(),
  sourceMutation: vi.fn((name: string) => ({ name })),
  sourceQuery: vi.fn((name: string) => ({ name })),
}))

vi.mock('@/lib/server/convex-source', async (importOriginal) => {
  const actual = await importOriginal<typeof ConvexSource>()
  return {
    ...actual,
    callSourceMutation: sourceMocks.callSourceMutation,
    callSourceQuery: sourceMocks.callSourceQuery,
    callPublicSourceMutation: sourceMocks.callPublicSourceMutation,
    callPublicSourceQuery: sourceMocks.callPublicSourceQuery,
    sourceMutation: sourceMocks.sourceMutation,
    sourceQuery: sourceMocks.sourceQuery,
  }
})

const projectId = 'project:guest'
const tree: WorkTree = {
  format: 'ae.work-tree:v1',
  treeId: 'tree:guest',
  projectId,
  generation: 1,
  revision: 1,
  charterText: 'Bring the BAS up to date',
  nodes: [{
    format: 'ae.work-node:v1',
    nodeId: 'root',
    kind: 'package',
    title: 'Bring the BAS up to date',
    status: 'fog',
    dependsOn: [],
    priority: 0,
    evidenceRefs: [],
    createdAt: 1,
    updatedAt: 1,
  }],
}

const createInput = {
  idempotencyKey: 'create:guest',
  charterText: 'Bring the BAS up to date',
  lineage: { kind: 'standalone' as const },
}

const inspectInput = { projectId }
const applyInput = {
  projectId,
  operationKey: 'apply:guest',
  correlationId: 'correlation:guest',
  verb: {
    kind: 'elaborate' as const,
    targetNodeId: 'root',
    expectedGeneration: 1,
    expectedRevision: 1,
    proposalDigest: 'digest:verb',
    children: [{
      format: 'ae.work-node:v1' as const,
      kind: 'task' as const,
      title: 'Gather records',
      status: 'fog' as const,
      dependsOn: [],
      priority: 0,
      evidenceRefs: [],
    }],
  },
}
const decideInput = {
  projectId,
  nodeId: 'decision:guest',
  kind: 'lock' as const,
  expectedGeneration: 1,
  expectedRevision: 1,
  proposalDigest: 'digest:decision',
  idempotencyKey: 'decide:guest',
}

function readback() {
  return {
    projectId,
    treeId: tree.treeId,
    principalId: 'guest:principal',
    lineage: { kind: 'standalone' as const },
    generation: tree.generation,
    revision: tree.revision,
    tree,
    events: [{
      kind: 'created' as const,
      operationKey: `${projectId}:created`,
      seq: 1,
      generation: 1,
      revision: 1,
      payloadDigest: 'digest:create',
      at: 1,
    }],
    receipts: [],
    hasMoreEvents: false,
  }
}

function createResult() {
  return {
    kind: 'accepted' as const,
    code: 'work_tree_created' as const,
    replayed: false as const,
    readback: readback(),
    receipt: {
      receiptRef: 'receipt:create:guest',
      projectId,
      treeId: tree.treeId,
      operationKey: createInput.idempotencyKey,
      event: { kind: 'created' as const, operationKey: `${projectId}:created`, seq: 1 as const },
      generation: 1 as const,
      revision: 1 as const,
      payloadDigest: 'digest:create',
    },
  }
}

function applyResult() {
  return {
    kind: 'applied' as const,
    replayed: false,
    projectId,
    tree,
    operationKey: applyInput.operationKey,
    seq: 2,
    event: { kind: 'elaborated' as const, operationKey: applyInput.operationKey, seq: 2 },
  }
}

function decisionResult() {
  return {
    kind: 'accepted' as const,
    decision: 'lock' as const,
    projectId,
    nodeId: decideInput.nodeId,
    receiptId: 'receipt:decision:guest',
    generation: 1,
    revision: 2,
    disposition: 'locked' as const,
    occurredAt: 2,
    readback: { projectId, revision: 2 },
  }
}

beforeEach(() => {
  sourceMocks.callSourceMutation.mockReset()
  sourceMocks.callSourceQuery.mockReset()
  sourceMocks.callPublicSourceMutation.mockReset()
  sourceMocks.callPublicSourceQuery.mockReset()
})

describe('WorkTree source transport selection', () => {
  it('round-trips guest create and inspect through the public source transport', async () => {
    sourceMocks.callPublicSourceMutation.mockResolvedValue(createResult())
    sourceMocks.callPublicSourceQuery.mockResolvedValue({ kind: 'accepted', readback: readback() })

    const created = await createWorkTreeThroughSource({ ...createInput, guestAssertion: 'guest:signed' })
    const inspected = await inspectWorkTreeThroughSource({ ...inspectInput, guestAssertion: 'guest:signed' })

    expect(created).toMatchObject({ kind: 'accepted', readback: { projectId } })
    expect(inspected).toMatchObject({ kind: 'accepted', readback: { projectId } })
    expect(sourceMocks.callPublicSourceMutation).toHaveBeenCalledWith(
      { name: 'workTrees:create' },
      expect.objectContaining({ ...createInput, guestAssertion: 'guest:signed' }),
    )
    expect(sourceMocks.callPublicSourceQuery).toHaveBeenCalledWith(
      { name: 'workTrees:inspect' },
      { projectId, guestAssertion: 'guest:signed' },
    )
    expect(sourceMocks.callSourceMutation).not.toHaveBeenCalled()
    expect(sourceMocks.callSourceQuery).not.toHaveBeenCalled()
  })

  it('uses authenticated transport when no guest assertion is present', async () => {
    sourceMocks.callSourceMutation.mockResolvedValue(createResult())
    sourceMocks.callSourceQuery.mockResolvedValue({ kind: 'accepted', readback: readback() })

    await createWorkTreeThroughSource(createInput)
    await inspectWorkTreeThroughSource(inspectInput)

    expect(sourceMocks.callSourceMutation).toHaveBeenCalledWith({ name: 'workTrees:create' }, createInput)
    expect(sourceMocks.callSourceQuery).toHaveBeenCalledWith({ name: 'workTrees:inspect' }, inspectInput)
    expect(sourceMocks.callPublicSourceMutation).not.toHaveBeenCalled()
    expect(sourceMocks.callPublicSourceQuery).not.toHaveBeenCalled()
  })

  it('forwards guest apply and decide commands through public transport', async () => {
    sourceMocks.callPublicSourceMutation
      .mockResolvedValueOnce(applyResult())
      .mockResolvedValueOnce(decisionResult())

    const applied = await applyWorkTreeThroughSource({ ...applyInput, guestAssertion: 'guest:signed' })
    const decided = await decideWorkTreeThroughSource({ ...decideInput, guestAssertion: 'guest:signed' })

    expect(applied).toMatchObject({ kind: 'accepted', readback: { projectId } })
    expect(decided).toMatchObject({ kind: 'accepted', projectId, nodeId: decideInput.nodeId })
    expect(sourceMocks.callPublicSourceMutation).toHaveBeenNthCalledWith(
      1,
      { name: 'workTrees:apply' },
      expect.objectContaining({
        projectId,
        operationKey: applyInput.operationKey,
        correlationId: applyInput.correlationId,
        guestAssertion: 'guest:signed',
        verb: expect.objectContaining({ kind: 'elaborate', targetNodeId: 'root' }),
      }),
    )
    expect(sourceMocks.callPublicSourceMutation).toHaveBeenNthCalledWith(
      2,
      { name: 'workTrees:decide' },
      expect.objectContaining({ ...decideInput, guestAssertion: 'guest:signed' }),
    )
    expect(sourceMocks.callSourceMutation).not.toHaveBeenCalled()
  })
  it('passes through the ephemeral typed decide authentication refusal', async () => {
    sourceMocks.callSourceMutation.mockResolvedValue({ kind: 'refused', code: 'authentication_required', replayed: false })

    await expect(decideWorkTreeThroughSource(decideInput)).resolves.toEqual({
      kind: 'refused',
      code: 'authentication_required',
      replayed: false,
    })
  })
  it('parses real Convex-shaped replay receipts with occurredAt', async () => {
    sourceMocks.callSourceMutation.mockResolvedValue({
      kind: 'replayed',
      decision: 'lock',
      projectId,
      nodeId: decideInput.nodeId,
      receiptId: 'receipt:decision:guest',
      generation: 1,
      revision: 2,
      disposition: 'locked',
      occurredAt: 2,
      readback: { projectId, revision: 2 },
    })

    await expect(decideWorkTreeThroughSource(decideInput)).resolves.toMatchObject({
      kind: 'replayed',
      occurredAt: 2,
    })
  })

  it('maps a typed source refusal but keeps malformed responses unknown', async () => {
    sourceMocks.callSourceMutation.mockResolvedValueOnce({ kind: 'refused', code: 'forbidden', replayed: false })
    const refused = await applyWorkTreeThroughSource(applyInput)
    expect(refused).toEqual({ kind: 'refused', reason: 'forbidden' })

    sourceMocks.callSourceMutation.mockResolvedValueOnce({ kind: 'accepted', malformed: true })
    const unknown = await applyWorkTreeThroughSource({ ...applyInput, operationKey: 'apply:malformed' })
    expect(unknown.kind).toBe('unknown')
  })

  it('does not infer refusal from an untyped transport error message', async () => {
    sourceMocks.callSourceMutation.mockRejectedValue(new Error('forbidden'))

    const result = await applyWorkTreeThroughSource(applyInput)

    expect(result.kind).toBe('unknown')
  })
})