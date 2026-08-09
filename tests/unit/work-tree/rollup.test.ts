import { describe, expect, it } from 'vitest'

import {
  MAX_TREE_DEPTH,
  WORK_NODE_FORMAT,
  calculateCpm,
  rollupTree,
  selectFrontier,
  validateTree,
  type WorkNode,
  type WorkTree,
} from '@/modules/work-tree/public'

const anchor = '1970-01-05'

function node(
  nodeId: string,
  status: WorkNode['status'] = 'ready',
  dependsOn: string[] = [],
  overrides: Partial<WorkNode> = {},
): WorkNode {
  return {
    format: WORK_NODE_FORMAT,
    nodeId,
    kind: 'task',
    title: nodeId,
    status,
    dependsOn,
    priority: 2,
    timing: {
      certainty: 'window',
      window: { earliest: anchor, latest: '2100-01-01' },
      leadTimeDays: 0,
    },
    evidenceRefs: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function tree(nodes: WorkNode[]): WorkTree {
  return {
    format: 'ae.work-tree:v1',
    treeId: 'tree-1',
    projectId: 'project-1',
    generation: 1,
    revision: 1,
    charterText: 'Test tree',
    nodes,
  }
}

describe('work-tree kernel', () => {
  it('computes CPM ES/EF/LS/LF, slack, and critical flags for a six-node network', () => {
    // A(2) -> B(4) -> D(2) -> F(2)
    //  \-> C(2) -> E(1) ----^; expected total slack: A=0, B=0,
    // C=3, D=0, E=3, F=0 business days.
    const input = tree([
      node('A', 'ready', [], { timing: { certainty: 'window', window: { earliest: anchor, latest: '2100-01-01' }, leadTimeDays: 2 } }),
      node('B', 'ready', ['A'], { timing: { certainty: 'window', window: { earliest: anchor, latest: '2100-01-01' }, leadTimeDays: 4 } }),
      node('C', 'ready', ['A'], { timing: { certainty: 'window', window: { earliest: anchor, latest: '2100-01-01' }, leadTimeDays: 2 } }),
      node('D', 'ready', ['B'], { timing: { certainty: 'window', window: { earliest: anchor, latest: '2100-01-01' }, leadTimeDays: 2 } }),
      node('E', 'ready', ['C'], { timing: { certainty: 'window', window: { earliest: anchor, latest: '2100-01-01' }, leadTimeDays: 1 } }),
      node('F', 'ready', ['D', 'E'], { timing: { certainty: 'window', window: { earliest: anchor, latest: '2100-01-01' }, leadTimeDays: 2 } }),
    ])

    const result = calculateCpm(input, { startDate: anchor })
    const schedule = new Map(result.schedules.map((item) => [item.nodeId, item]))
    expect([...schedule.values()].map((item) => item.earlyFinishDay)).toEqual([2, 6, 4, 8, 5, 10])
    expect(Object.fromEntries([...schedule].map(([id, item]) => [id, item.totalSlackDays]))).toEqual({
      A: 0, B: 0, C: 3, D: 0, E: 3, F: 0,
    })
    expect(Object.fromEntries([...schedule].map(([id, item]) => [id, item.freeSlackDays]))).toEqual({
      A: 0, B: 0, C: 0, D: 0, E: 3, F: 0,
    })
    expect([...schedule.values()].filter((item) => item.isCritical).map((item) => item.nodeId)).toEqual(['A', 'B', 'D', 'F'])
  })

  it('rolls up fog timing, cost envelopes, resources, effort, and scope', () => {
    const root = node('root', 'locked', [], {
      kind: 'package',
      cost: {
        estimate: { currency: 'USD', units: '0', exponent: 2 },
        committed: { currency: 'USD', units: '0', exponent: 2 },
        envelope: { currency: 'USD', units: '100', exponent: 2 },
      },
      effort: { humanMinutes: 30 },
      scope: { acceptance: 'criteria', criteria: [
        { criterionId: 'r1', label: 'Root criterion', accepted: true },
        { criterionId: 'r2', label: 'Child criterion', accepted: false },
      ] },
      timing: { certainty: 'window', window: { earliest: anchor, latest: '2100-01-01' }, leadTimeDays: 1 },
    })
    const fog = node('fog', 'fog', [], {
      parentId: 'root',
      priority: 3,
      timing: undefined,
      cost: undefined,
      resource: undefined,
      effort: undefined,
      scope: undefined,
    })
    const left = node('left', 'ready', [], {
      parentId: 'root',
      cost: { estimate: { currency: 'USD', units: '60', exponent: 2 }, envelope: { currency: 'USD', units: '60', exponent: 2 } },
      resource: { owner: 'human', ownerRef: 'sam', exclusive: { startMs: 0, endMs: 10 } },
      effort: { humanMinutes: 50 },
    })
    const right = node('right', 'ready', [], {
      parentId: 'root',
      cost: { estimate: { currency: 'USD', units: '500', exponent: 3 }, envelope: { currency: 'USD', units: '500', exponent: 3 } },
      resource: { owner: 'human', ownerRef: 'sam', exclusive: { startMs: 10, endMs: 20 } },
      effort: { humanMinutes: 40 },
    })
    const overlap = node('overlap', 'ready', [], {
      parentId: 'root',
      resource: { owner: 'human', ownerRef: 'sam', exclusive: { startMs: 5, endMs: 15 } },
      effort: { humanMinutes: 20 },
    })

    const result = rollupTree(tree([root, fog, left, right, overlap]), {
      startDate: anchor,
      attentionBudgetMinutes: 60,
    })
    expect(result.timing).toMatchObject({ knownMinDays: 1, fogBounded: true })
    expect(result.cost.byCurrency.USD).toMatchObject({
      estimate: { currency: 'USD', units: '1100', exponent: 3 },
      committed: { currency: 'USD', units: '0', exponent: 3 },
      envelope: { currency: 'USD', units: '2100', exponent: 3 },
      envelopeBreached: true,
    })
    expect(result.cost.breaches).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeId: 'root',
        childEnvelope: { currency: 'USD', units: '1100', exponent: 3 },
        envelope: { currency: 'USD', units: '100', exponent: 2 },
      }),
    ]))
    expect(result.resources.conflictPairs).toHaveLength(2)
    expect(result.resources.conflictPairs.every((pair) => pair.overlap.startMs < pair.overlap.endMs)).toBe(true)
    expect(result.resources.conflictPairs.some((pair) => pair.leftNodeId === 'left' && pair.rightNodeId === 'right')).toBe(false)
    expect(result.effort).toMatchObject({ totalHumanMinutes: 140, overBudget: true, attentionBudgetMinutes: 60 })
    expect(result.scope).toMatchObject({ accepted: 1, total: 2, coverage: 0.5, fogDenominator: true })
  })

  it('orders only dependency-satisfied fog frontier nodes', () => {
    const root = node('root', 'locked', [], { kind: 'package' })
    const done = node('done', 'done', [], { parentId: 'root' })
    const low = node('10', 'fog', ['done'], { parentId: 'root', priority: 4, timing: undefined })
    const urgent = node('2', 'fog', ['done'], { parentId: 'root', priority: 1, timing: undefined })
    const blocked = node('3', 'fog', ['missing'], { parentId: 'root', priority: 0, timing: undefined })
    expect(selectFrontier(tree([root, done, low, urgent, blocked])).map((item) => item.nodeId)).toEqual(['2', '10'])
  })

  it('rejects dependency cycles, hierarchy caps, depth caps, and illegal transitions', () => {
    const cycle = tree([
      node('a', 'ready', ['b']),
      node('b', 'ready', ['a']),
    ])
    expect(validateTree(cycle).errors.map((error) => error.reason)).toContain('dependency_cycle')

    const previous = tree([node('a', 'locked')])
    const next = tree([node('a', 'ready')])
    expect(validateTree(next, previous).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'illegal_status_transition', previousStatus: 'locked', nextStatus: 'ready' }),
    ]))

    const deepNodes: WorkNode[] = []
    for (let index = 0; index <= MAX_TREE_DEPTH; index += 1) {
      deepNodes.push(node(`d${index}`, 'ready', [], { parentId: index === 0 ? undefined : `d${index - 1}` }))
    }
    expect(validateTree(tree(deepNodes)).valid).toBe(true)
    deepNodes.push(node('too-deep', 'ready', [], { parentId: `d${MAX_TREE_DEPTH}` }))
    expect(validateTree(tree(deepNodes)).errors.map((error) => error.reason)).toContain('tree_depth_exceeded')
  })
})
