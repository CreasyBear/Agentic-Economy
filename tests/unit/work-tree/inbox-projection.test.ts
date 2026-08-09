import { describe, expect, it } from 'vitest'

import { projectDecisionInbox, type PendingProposeDecision } from '@/modules/work-tree/public'
import type { WorkNode, WorkTree } from '@/modules/work-tree/public'

function decision(nodeId: string, updatedAt: number, overrides: Partial<WorkNode> = {}): WorkNode {
  return {
    format: 'ae.work-node:v1',
    nodeId,
    kind: 'decision',
    title: nodeId,
    status: 'ready',
    dependsOn: [],
    priority: 2,
    evidenceRefs: [],
    createdAt: updatedAt,
    updatedAt,
    ...overrides,
  }
}

function tree(treeId: string, nodes: readonly WorkNode[]): WorkTree {
  return {
    format: 'ae.work-tree:v1',
    treeId,
    projectId: `project-${treeId}`,
    generation: 1,
    revision: 1,
    charterText: 'Keep the next decision moving.',
    nodes: [...nodes],
  }
}

describe('decision inbox projection', () => {
  it('caps the global inbox at three and keeps the oldest items first', () => {
    const firstTree = tree('tree-a', [
      decision('oldest', 0),
      decision('second', 3_600_000),
      decision('third', 7_200_000),
    ])
    const secondTree = tree('tree-b', [
      decision('fourth', 10_800_000),
      decision('fifth', 14_400_000),
    ])

    const projection = projectDecisionInbox([firstTree, secondTree], { nowMs: 7_200_000 })

    expect(projection.items).toHaveLength(3)
    expect(projection.items.map((item) => item.nodeId)).toEqual(['oldest', 'second', 'third'])
    expect(projection.nextDecision).toBe('Next decision: 2h')
    expect(projection.nextDecisionHours).toBe(2)
  })

  it('flags money-yes items for grouping without adding a batch approval exit', () => {
    const item = decision('deposit', 1_000, {
      cost: { estimate: { currency: 'AUD', units: '12500', exponent: 2 }, envelope: { currency: 'AUD', units: '15000', exponent: 2 } },
    })

    const [projected] = projectDecisionInbox(tree('tree-a', [item]), { nowMs: 1_000 }).items

    expect(projected?.moneyYes).toBe(true)
    expect(projected?.moneyBatchKey).toBe('money-yes')
    expect(projected?.exits).toEqual(expect.objectContaining({
      lock: expect.objectContaining({ kind: 'lock', nodeId: 'deposit' }),
      adjust: expect.objectContaining({ kind: 'adjust', nodeId: 'deposit' }),
      park: expect.objectContaining({ kind: 'park', nodeId: 'deposit' }),
    }))
    expect(Object.keys(projected?.exits ?? {})).toEqual(['lock', 'adjust', 'park'])
  })

  it('includes a pending propose_decision once and preserves its proposal reference', () => {
    const proposedNode = decision('pending', 1_000, { status: 'queued' })
    const pending: PendingProposeDecision = {
      proposalId: 'proposal-1',
      treeId: 'tree-a',
      targetNodeId: proposedNode.nodeId,
      createdAt: 1_000,
    }

    const projection = projectDecisionInbox(tree('tree-a', [proposedNode]), {
      nowMs: 3_600_000,
      pendingProposeDecisions: [pending],
    })

    expect(projection.items[0]).toEqual(expect.objectContaining({
      source: 'propose_decision',
      status: 'pending',
      nodeId: 'pending',
    }))
    expect(projection.items[0]?.exits.lock.proposalId).toBe('proposal-1')
    expect(projection.nextDecision).toBe('Next decision: 0h')
  })
})
