import {
  applyGardenerVerb,
  GardenerVerbError,
  gardenerVerbDigest,
  type WorkNode,
  type WorkTree,
} from '@/modules/work-tree/public'
import type {
  WorkTreeDecisionReceipt,
  WorkTreeSourceEvent,
  WorkTreeSourcePort,
} from '@/modules/work-tree/internal/root-loop'

/**
 * A kernel-backed in-memory WorkTree source for the T46 tracers.
 *
 * `apply` runs the real `applyGardenerVerb` behind real generation, revision
 * and proposal-digest fences, and `decide` implements the pinned T47 contract
 * (fence first, then `not_found` unless the target is a ready decision node).
 * A host that mis-sequences its verbs, forges a fence, or leans on transcript
 * state fails against this double rather than in production.
 */

export type SourceOp = 'create' | 'inspect' | 'apply' | 'decide'

export type FakeWorkTreeSource = WorkTreeSourcePort & Readonly<{
  ops: () => readonly SourceOp[]
  markReloadBoundary: () => void
  opsSinceReload: () => readonly SourceOp[]
  tree: (projectId: string) => WorkTree
}>

type Stored = {
  tree: WorkTree
  events: WorkTreeSourceEvent[]
  receipts: WorkTreeDecisionReceipt[]
}

export function createFakeWorkTreeSource(): FakeWorkTreeSource {
  const projects = new Map<string, Stored>()
  const byIdempotencyKey = new Map<string, string>()
  const appliedOperations = new Map<string, WorkTree>()
  const ops: SourceOp[] = []
  let reloadBoundary = 0
  let projectCount = 0
  let nodeCount = 0
  let clock = 1_700_000_000_000

  const load = (projectId: string): Stored => {
    const stored = projects.get(projectId)
    if (stored === undefined) throw new Error(`unknown project ${projectId}`)
    return stored
  }

  const append = (stored: Stored, event: Omit<WorkTreeSourceEvent, 'seq' | 'at'>): void => {
    clock += 1_000
    stored.events.push({ ...event, seq: stored.events.length + 1, at: clock })
  }

  return {
    ops: () => ops,
    markReloadBoundary: () => { reloadBoundary = ops.length },
    opsSinceReload: () => ops.slice(reloadBoundary),
    tree: (projectId) => load(projectId).tree,

    create: async (input) => {
      ops.push('create')
      const resumed = byIdempotencyKey.get(input.idempotencyKey)
      if (resumed !== undefined) {
        const stored = load(resumed)
        return {
          kind: 'replayed',
          projectId: resumed,
          treeId: stored.tree.treeId,
          generation: stored.tree.generation,
          revision: stored.tree.revision,
          tree: stored.tree,
        }
      }
      projectCount += 1
      const projectId = `project_opaque_${projectCount}`
      const root: WorkNode = {
        format: 'ae.work-node:v1',
        nodeId: 'root',
        kind: 'package',
        title: input.charterText.slice(0, 200),
        status: 'fog',
        dependsOn: [],
        priority: 0,
        evidenceRefs: [],
        createdAt: clock,
        updatedAt: clock,
      }
      const stored: Stored = {
        tree: {
          format: 'ae.work-tree:v1',
          treeId: `tree_${projectCount}`,
          projectId,
          generation: 1,
          revision: 1,
          charterText: input.charterText,
          nodes: [root],
        },
        events: [],
        receipts: [],
      }
      append(stored, { kind: 'created', operationKey: `${projectId}:created`, generation: 1, revision: 1, payloadJson: '{}' })
      projects.set(projectId, stored)
      byIdempotencyKey.set(input.idempotencyKey, projectId)
      return { kind: 'accepted', projectId, treeId: stored.tree.treeId, generation: 1, revision: 1, tree: stored.tree }
    },

    inspect: async ({ projectId }) => {
      ops.push('inspect')
      const stored = projects.get(projectId)
      if (stored === undefined) return { kind: 'refused', reason: 'not_found' }
      return {
        kind: 'accepted',
        projectId,
        treeId: stored.tree.treeId,
        generation: stored.tree.generation,
        revision: stored.tree.revision,
        tree: stored.tree,
        events: [...stored.events],
        hasMoreEvents: false,
        receipts: [...stored.receipts],
      }
    },

    apply: async ({ projectId, operationKey, verb }) => {
      ops.push('apply')
      const stored = load(projectId)
      const replayed = appliedOperations.get(operationKey)
      if (replayed !== undefined) {
        return { kind: 'replayed', receipt: { tree: replayed, operationKey }, readback: { projectId, revision: replayed.revision } }
      }
      if (verb.expectedGeneration !== stored.tree.generation) return { kind: 'refused', reason: 'work_tree_generation_stale' }
      if (verb.expectedRevision !== stored.tree.revision) return { kind: 'refused', reason: 'work_tree_revision_stale' }
      if (verb.proposalDigest !== gardenerVerbDigest(verb)) return { kind: 'refused', reason: 'work_tree_proposal_digest_mismatch' }
      clock += 1_000
      let applied
      try {
        applied = applyGardenerVerb(stored.tree, verb, clock, () => {
          nodeCount += 1
          return `node_${nodeCount}`
        })
      } catch (error) {
        if (error instanceof GardenerVerbError) return { kind: 'refused', reason: error.message }
        throw error
      }
      stored.tree = applied.tree
      appliedOperations.set(operationKey, applied.tree)
      append(stored, {
        kind: applied.eventKind,
        operationKey,
        generation: applied.tree.generation,
        revision: applied.tree.revision,
        payloadJson: JSON.stringify({ verb, result: applied.eventPayload }),
      })
      return { kind: 'accepted', receipt: { tree: applied.tree, operationKey }, readback: { projectId, revision: applied.tree.revision } }
    },

    decide: async (input) => {
      ops.push('decide')
      const stored = load(input.projectId)
      clock += 1_000
      const refuse = (refusalCode: 'stale_fence' | 'not_found'): WorkTreeDecisionReceipt => ({
        kind: 'refused',
        decision: input.kind,
        projectId: input.projectId,
        nodeId: input.nodeId,
        receiptId: `receipt_refused_${stored.receipts.length + 1}`,
        generation: stored.tree.generation,
        revision: stored.tree.revision,
        disposition: 'unchanged',
        refusalCode,
        occurredAt: clock,
        readback: { projectId: input.projectId, revision: stored.tree.revision },
      })
      if (input.expectedGeneration !== stored.tree.generation || input.expectedRevision !== stored.tree.revision) {
        return refuse('stale_fence')
      }
      const node = stored.tree.nodes.find((candidate) => candidate.nodeId === input.nodeId)
      if (node === undefined || node.kind !== 'decision' || node.status !== 'ready') return refuse('not_found')

      const status = input.kind === 'lock' ? 'locked' as const : input.kind === 'park' ? 'queued' as const : node.status
      const disposition = input.kind === 'lock' ? 'locked' as const : input.kind === 'park' ? 'queued' as const : 'adjusted' as const
      stored.tree = {
        ...stored.tree,
        revision: stored.tree.revision + 1,
        nodes: stored.tree.nodes.map((candidate) =>
          candidate.nodeId === node.nodeId ? { ...candidate, status, updatedAt: clock } : candidate),
      }
      const receipt: WorkTreeDecisionReceipt = {
        kind: 'accepted',
        decision: input.kind,
        projectId: input.projectId,
        nodeId: input.nodeId,
        receiptId: `receipt_${stored.receipts.length + 1}`,
        generation: stored.tree.generation,
        revision: stored.tree.revision,
        disposition,
        occurredAt: clock,
        readback: { projectId: input.projectId, revision: stored.tree.revision },
      }
      stored.receipts.push(receipt)
      return receipt
    },
  }
}
