import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { WorkNode, WorkTree } from '@/modules/work-tree/internal/contract'
import {
  decideRootWorkTree,
  projectRootWorkTree,
  startRootWorkTree,
  type WorkTreeDecisionReceipt,
  type WorkTreeSourceEvent,
  type WorkTreeSourcePort,
} from '@/modules/work-tree/internal/root-loop'

const projectId = 'project:root-loop'
const treeId = 'tree:root-loop'
const nowMs = 1_754_000_000_000

function node(input: Pick<WorkNode, 'nodeId' | 'kind' | 'status'> & Partial<WorkNode>): WorkNode {
  return {
    format: 'ae.work-node:v1',
    nodeId: input.nodeId,
    kind: input.kind,
    title: input.title ?? input.nodeId,
    status: input.status,
    dependsOn: input.dependsOn ?? [],
    priority: input.priority ?? 0,
    evidenceRefs: input.evidenceRefs ?? [],
    createdAt: input.createdAt ?? nowMs,
    updatedAt: input.updatedAt ?? nowMs,
    ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.timing === undefined ? {} : { timing: input.timing }),
  }
}

function tree(nodes: readonly WorkNode[], revision = 1): WorkTree {
  return {
    format: 'ae.work-tree:v1',
    treeId,
    projectId,
    generation: 1,
    revision,
    charterText: 'Bring the project up to date',
    nodes: [...nodes],
  }
}


function inspectResult(treeValue: WorkTree, events: readonly WorkTreeSourceEvent[] = []) {
  return {
    kind: 'accepted' as const,
    projectId,
    treeId: treeValue.treeId,
    generation: treeValue.generation,
    revision: treeValue.revision,
    tree: treeValue,
    events,
    hasMoreEvents: false,
    receipts: [] as readonly WorkTreeDecisionReceipt[],
  }
}

describe('human root WorkTree loop', () => {
  it('creates a durable project with the trimmed charter and no apply', async () => {
    const initial = tree([node({ nodeId: 'root', kind: 'package', status: 'fog' })])
    const calls: Array<Readonly<Record<string, unknown>>> = []
    const lineage = {
      kind: 'customer_request' as const,
      requestRef: 'request:root-loop',
      revision: 2,
      routeGenerationRef: 'generation:root-loop',
      routeRef: 'route-choice:root-loop',
    }
    const port: WorkTreeSourcePort = {
      create: async (input) => {
        calls.push({ method: 'create', ...input })
        return { kind: 'accepted', projectId, treeId, generation: 1, revision: 1, tree: initial }
      },
      inspect: async () => inspectResult(initial),
      apply: async () => {
        calls.push({ method: 'apply' })
        throw new Error('create-only start invoked apply')
      },
      decide: async () => {
        throw new Error('decision not part of start')
      },
    }

    await expect(startRootWorkTree({
      outcome: '  Bring the project up to date  ',
      lineage,
      guestAssertion: 'signed-guest',
    }, port))
      .resolves.toEqual({ kind: 'started', projectId })

    expect(calls).toEqual([{
      method: 'create',
      idempotencyKey: canonicalDigest({
        surface: 'root',
        charterText: 'Bring the project up to date',
      }),
      charterText: 'Bring the project up to date',
      lineage,
      guestAssertion: 'signed-guest',
    }])
  })
  it('refuses legacy development-mock readbacks before exposing node content', () => {
    const legacyTitle = 'Legacy decision content'
    const inspected = inspectResult(tree([
      node({ nodeId: 'root', kind: 'package', status: 'ready', timing: { certainty: 'fog' } }),
      node({
        nodeId: 'legacy-decision',
        kind: 'decision',
        status: 'ready',
        title: legacyTitle,
        evidenceRefs: ['ae:development-mock/bas-v1'],
      }),
    ], 2))

    const projected = projectRootWorkTree(inspected, nowMs)

    expect(projected).toEqual({ kind: 'refused', reason: 'not_found' })
    expect(JSON.stringify(projected)).not.toContain(legacyTitle)
  })
  it('refuses an empty outcome before calling the source', async () => {
    const calls: string[] = []
    const port: WorkTreeSourcePort = {
      create: async () => {
        calls.push('create')
        return { kind: 'refused', reason: 'unexpected_create' }
      },
      inspect: async () => { throw new Error('not used') },
      apply: async () => { throw new Error('not used') },
      decide: async () => { throw new Error('not used') },
    }

    await expect(startRootWorkTree({ outcome: ' \n\t ' }, port))
      .resolves.toEqual({ kind: 'refused', reason: 'outcome_empty' })
    expect(calls).toEqual([])
  })

  it('does not apply anything after a refused durable create', async () => {
    const calls: string[] = []
    const port: WorkTreeSourcePort = {
      create: async () => {
        calls.push('create')
        return { kind: 'refused', reason: 'source_refused' }
      },
      inspect: async () => { throw new Error('not used') },
      apply: async () => {
        calls.push('apply')
        throw new Error('apply_after_refusal')
      },
      decide: async () => { throw new Error('not used') },
    }

    await expect(startRootWorkTree({ outcome: 'Bring the project up to date' }, port))
      .resolves.toEqual({ kind: 'refused', reason: 'source_refused' })
    expect(calls).toEqual(['create'])
  })


  it('projects one durable decision proposal into a rereadable inbox item', () => {
    const decision = node({
      nodeId: 'decision', kind: 'decision', status: 'ready', title: 'Choose the next project step',
      description: 'Pick the next accountable step.',
    })
    const inspected = inspectResult(tree([
      node({ nodeId: 'root', kind: 'package', status: 'ready', timing: { certainty: 'fog' } }),
      decision,
    ], 4), [{
      seq: 1,
      kind: 'decision_proposed',
      operationKey: 'proposal:1',
      generation: 1,
      revision: 4,
      at: nowMs,
      payloadJson: JSON.stringify({ result: { targetNodeId: 'decision' } }),
    }])

    const projected = projectRootWorkTree(inspected, nowMs + 3_600_000)

    expect(projected).toMatchObject({ kind: 'ready', projectId, revision: 4 })
    if (projected.kind !== 'ready') return
    expect(projected.inbox.items).toHaveLength(1)
    expect(projected.inbox.items[0]).toMatchObject({
      nodeId: 'decision',
      title: 'Choose the next project step',
      source: 'ready-node',
      status: 'ready',
    })
    expect(projected.inbox.items[0]?.exits.lock).toMatchObject({
      projectId,
      nodeId: 'decision',
      expectedGeneration: 1,
      expectedRevision: 4,
    })
  })
  it('uses the latest proposal event for a node', () => {
    const inspected = inspectResult(tree([
      node({ nodeId: 'decision', kind: 'decision', status: 'queued', title: 'Choose the next project step' }),
    ], 5), [
      {
        seq: 1,
        kind: 'decision_proposed',
        operationKey: 'proposal:old',
        generation: 1,
        revision: 4,
        at: nowMs,
        targetNodeId: 'decision',
        payloadJson: '{}',
      },
      {
        seq: 2,
        kind: 'decision_proposed',
        operationKey: 'proposal:latest',
        generation: 1,
        revision: 5,
        at: nowMs + 1_000,
        targetNodeId: 'decision',
        payloadJson: '{}',
      },
    ])

    const projected = projectRootWorkTree(inspected, nowMs + 3_600_000)

    expect(projected.kind).toBe('ready')
    if (projected.kind !== 'ready') return
    expect(projected.inbox.items[0]).toMatchObject({
      source: 'propose_decision',
      status: 'pending',
      exits: { lock: { proposalId: 'proposal:latest' } },
    })
  })

  it('sends exact decision fences and returns source receipt plus fresh readback', async () => {
    const current = tree([
      node({ nodeId: 'root', kind: 'package', status: 'ready', timing: { certainty: 'fog' } }),
      node({ nodeId: 'decision', kind: 'decision', status: 'ready' }),
    ], 4)
    const received: Array<Parameters<WorkTreeSourcePort['decide']>[0]> = []
    const receipt: WorkTreeDecisionReceipt = {
      kind: 'accepted',
      decision: 'lock',
      projectId,
      nodeId: 'decision',
      receiptId: 'receipt:1',
      generation: 1,
      revision: 5,
      disposition: 'locked',
      occurredAt: nowMs,
      readback: { projectId, revision: 5 },
    }
    const port: WorkTreeSourcePort = {
      create: async () => { throw new Error('not used') },
      inspect: async () => inspectResult(current),
      apply: async () => { throw new Error('not used') },
      decide: async (input) => {
        received.push(input)
        return receipt
      },
    }

    const result = await decideRootWorkTree({
      projectId,
      nodeId: 'decision',
      kind: 'lock',
      expectedGeneration: 1,
      expectedRevision: 4,
      nowMs,
      guestAssertion: 'guest-a',
    }, port)
    const proposal = { projectId, nodeId: 'decision', kind: 'lock', expectedGeneration: 1, expectedRevision: 4 }

    expect(received[0]).toMatchObject({
      ...proposal,
      proposalDigest: canonicalDigest(proposal),
      idempotencyKey: canonicalDigest({ ...proposal, surface: 'root' }),
    })
    await decideRootWorkTree({
      projectId,
      nodeId: 'decision',
      kind: 'lock',
      expectedGeneration: 1,
      expectedRevision: 4,
      nowMs,
      guestAssertion: 'guest-b',
    }, port)
    expect(received).toHaveLength(2)
    expect(received[0]?.guestAssertion).toBe('guest-a')
    expect(received[1]?.guestAssertion).toBe('guest-b')
    expect(received[1]?.proposalDigest).toBe(received[0]?.proposalDigest)
    expect(received[1]?.idempotencyKey).toBe(received[0]?.idempotencyKey)
    expect(result.receipt).toEqual(receipt)
    expect(result.readback).toMatchObject({ kind: 'ready', projectId, revision: 4 })
    const uncertain = await decideRootWorkTree({
      projectId,
      nodeId: 'decision',
      kind: 'lock',
      expectedGeneration: 1,
      expectedRevision: 4,
      nowMs,
    }, {
      ...port,
      decide: async () => ({ kind: 'unknown' }),
    })
    expect(uncertain.receipt).toEqual({ kind: 'unknown' })
  })

})
