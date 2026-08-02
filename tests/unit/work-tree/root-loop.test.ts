import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { WorkNode, WorkTree } from '@/modules/work-tree/internal/contract'
import {
  decideRootWorkTree,
  isBasDevelopmentAsk,
  projectRootWorkTree,
  startRootWorkTree,
  type WorkTreeDecisionReceipt,
  type WorkTreeSourceEvent,
  type WorkTreeSourcePort,
} from '@/modules/work-tree/internal/root-loop'

const projectId = 'project:bas'
const treeId = 'tree:bas'
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
    charterText: 'Bring my BAS up to date',
    nodes: [...nodes],
  }
}

function acceptedApply(treeValue: WorkTree, operationKey: string) {
  return {
    kind: 'accepted' as const,
    receipt: { tree: treeValue, operationKey },
    readback: { projectId, revision: treeValue.revision },
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
  it('creates the durable project before applying the fenced BAS development path', async () => {
    const rootFog = node({ nodeId: 'root', kind: 'package', status: 'fog' })
    const decisionFog = node({
      nodeId: 'decision', kind: 'decision', status: 'fog', parentId: 'root',
      evidenceRefs: ['ae:development-mock/bas-v1'],
    })
    const rootReady = node({
      ...rootFog, status: 'ready', timing: { certainty: 'fog' },
    })
    const decisionReady = node({ ...decisionFog, status: 'ready' })
    const initial = tree([rootFog])
    const afterRoot = tree([rootReady, decisionFog], 2)
    const afterDecision = tree([rootReady, decisionReady], 3)
    const calls: Array<Readonly<Record<string, unknown>>> = []
    let current = initial

    const port: WorkTreeSourcePort = {
      create: async (input) => {
        calls.push({ method: 'create', ...input })
        return { kind: 'accepted', projectId, treeId, generation: 1, revision: 1, tree: initial }
      },
      inspect: async () => inspectResult(current),
      apply: async (input) => {
        calls.push({
          method: 'apply',
          verbKind: input.verb.kind,
          operationKey: input.operationKey,
          guestAssertion: input.guestAssertion,
        })
        current = input.verb.kind === 'propose_decision'
          ? afterDecision
          : input.verb.targetNodeId === 'root' ? afterRoot : afterDecision
        return acceptedApply(current, input.operationKey)
      },
      decide: async () => {
        throw new Error('decision not part of start')
      },
    }

    await expect(startRootWorkTree({ outcome: '  Bring my BAS up to date  ', guestAssertion: 'signed-guest' }, port))
      .resolves.toEqual({ kind: 'started', projectId })
    expect(calls.map((call) => call.method)).toEqual(['create', 'apply', 'apply', 'apply'])
    expect(calls.slice(1).map((call) => call.verbKind)).toEqual(['elaborate', 'elaborate', 'propose_decision'])
    expect(calls.slice(1).map((call) => call.guestAssertion))
      .toEqual(['signed-guest', 'signed-guest', 'signed-guest'])
  })
  it('resumes an interrupted fixture from the durable readback without restarting the root', async () => {
    const rootFog = node({ nodeId: 'root', kind: 'package', status: 'fog' })
    const decisionFog = node({
      nodeId: 'decision', kind: 'decision', status: 'fog', parentId: 'root',
      evidenceRefs: ['ae:development-mock/bas-v1'],
    })
    const rootReady = node({ ...rootFog, status: 'ready', timing: { certainty: 'fog' } })
    const decisionReady = node({ ...decisionFog, status: 'ready' })
    const initial = tree([rootFog])
    const afterRoot = tree([rootReady, decisionFog], 2)
    const afterDecision = tree([rootReady, decisionReady], 3)
    const afterProposal = tree([rootReady, decisionReady], 4)
    const calls: Array<Readonly<Record<string, unknown>>> = []
    let current = initial
    let createCount = 0
    let interrupt = true

    const port: WorkTreeSourcePort = {
      create: async (input) => {
        calls.push({ method: 'create', ...input })
        createCount += 1
        return {
          kind: 'accepted',
          projectId,
          treeId,
          generation: current.generation,
          revision: current.revision,
          tree: current,
        }
      },
      inspect: async () => inspectResult(current),
      apply: async (input) => {
        calls.push({ method: 'apply', verbKind: input.verb.kind, targetNodeId: input.verb.targetNodeId })
        if (interrupt && input.verb.targetNodeId === 'decision') {
          interrupt = false
          throw new Error('simulated interruption')
        }
        current = input.verb.targetNodeId === 'root'
          ? afterRoot
          : input.verb.kind === 'propose_decision' ? afterProposal : afterDecision
        return acceptedApply(current, input.operationKey)
      },
      decide: async () => { throw new Error('decision not part of start') },
    }

    await expect(startRootWorkTree({ outcome: 'Bring BAS up to date' }, port))
      .rejects.toThrow('simulated interruption')
    await expect(startRootWorkTree({ outcome: 'Bring BAS up to date' }, port))
      .resolves.toEqual({ kind: 'started', projectId })

    expect(createCount).toBe(2)
    expect(calls.map((call) => call.method)).toEqual(['create', 'apply', 'apply', 'create', 'apply', 'apply'])
    expect(calls.filter((call) => call.targetNodeId === 'root')).toHaveLength(1)
    expect(calls.slice(4).map((call) => call.verbKind)).toEqual(['elaborate', 'propose_decision'])
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

    await expect(startRootWorkTree({ outcome: 'Bring BAS up to date' }, port))
      .resolves.toEqual({ kind: 'refused', reason: 'source_refused' })
    expect(calls).toEqual(['create'])
  })
  it('surfaces a refused development fixture instead of reporting started', async () => {
    const initial = tree([node({ nodeId: 'root', kind: 'package', status: 'fog' })])
    const calls: Array<Readonly<Record<string, unknown>>> = []
    const port: WorkTreeSourcePort = {
      create: async (input) => {
        calls.push({ method: 'create', ...input })
        return { kind: 'accepted', projectId, treeId, generation: 1, revision: 1, tree: initial }
      },
      inspect: async () => inspectResult(initial),
      apply: async (input) => {
        calls.push({ method: 'apply', guestAssertion: input.guestAssertion })
        return { kind: 'refused', reason: 'fixture_forbidden' }
      },
      decide: async () => { throw new Error('not used') },
    }

    await expect(startRootWorkTree({ outcome: 'Bring BAS up to date', guestAssertion: 'signed-guest' }, port))
      .resolves.toEqual({ kind: 'refused', reason: 'fixture_forbidden' })
    expect(calls).toEqual([
      expect.objectContaining({ method: 'create' }),
      { method: 'apply', guestAssertion: 'signed-guest' },
    ])
  })


  it('projects one durable decision proposal into a rereadable inbox item', () => {
    const decision = node({
      nodeId: 'decision', kind: 'decision', status: 'ready', title: 'Choose a BAS path',
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
      title: 'Choose a BAS path',
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
      node({ nodeId: 'decision', kind: 'decision', status: 'queued', title: 'Choose a BAS path' }),
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
  })

  it('only routes BAS asks to the WorkTree loop', () => {
    expect(isBasDevelopmentAsk('Please help with BAS lodgement')).toBe(true)
    expect(isBasDevelopmentAsk('Find a local bookkeeper')).toBe(false)
  })
})
