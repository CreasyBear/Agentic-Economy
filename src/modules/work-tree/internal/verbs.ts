// Adopted nanoid secure ID seam (`node_modules/nanoid/index.d.ts:13-28`).
import { nanoid } from 'nanoid'
// Zod v4 discriminated-union API (`node_modules/zod/v4/classic/schemas.d.ts:513-514`).
import { z } from 'zod'

import {
  MAX_CHILDREN_PER_ELABORATION,
  MAX_NODES_PER_TREE,
  WORK_NODE_STATUS_TRANSITIONS,
  isElaborationFrontier,
  workNodeCostSchema,
  workNodeEffortSchema,
  workNodeKindSchema,
  workNodeResourceSchema,
  workNodeScopeSchema,
  workNodeTimingSchema,
  workNodeWriteQuoteSchema,
  type WorkNode,
  type WorkNodeStatus,
  type WorkTree,
} from './contract'
import { validateTree } from './rollup'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

const proposalFenceSchema = z.strictObject({
  expectedGeneration: z.number().int().min(1),
  expectedRevision: z.number().int().min(1),
  proposalDigest: z.string().min(1),
})

/** A child draft deliberately has no identity or parent fields. The kernel supplies both. */
export const workNodeDraftSchema = z.strictObject({
  format: z.literal('ae.work-node:v1').default('ae.work-node:v1'),
  kind: workNodeKindSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(2_000).optional(),
  status: z.literal('fog').default('fog'),
  dependsOn: z.array(z.string().min(1)).max(16).default([]),
  priority: z.number().int().min(0).max(4).default(0),
  timing: workNodeTimingSchema.optional(),
  cost: workNodeCostSchema.optional(),
  resource: workNodeResourceSchema.optional(),
  effort: workNodeEffortSchema.optional(),
  scope: workNodeScopeSchema.optional(),
  authorityRef: z.string().optional(),
  evidenceRefs: z.array(z.string()).max(32).default([]),
  quote: workNodeWriteQuoteSchema.optional(),
})
export type WorkNodeDraft = z.input<typeof workNodeDraftSchema>
export type ParsedWorkNodeDraft = z.output<typeof workNodeDraftSchema>

const decisionOptionSchema = z.strictObject({
  optionId: z.string().min(1),
  label: z.string().min(1),
  summary: z.string().min(1),
})

export const elaborateVerbSchema = z.strictObject({
  kind: z.literal('elaborate'),
  ...proposalFenceSchema.shape,
  targetNodeId: z.string().min(1),
  children: z.array(workNodeDraftSchema).min(1).max(MAX_CHILDREN_PER_ELABORATION),
})

export const studyVerbSchema = z.strictObject({
  kind: z.literal('study'),
  ...proposalFenceSchema.shape,
  targetNodeId: z.string().min(1),
  studyBrief: z.string().min(1).max(1_000),
  criteriaFromCharter: z.array(z.string()),
})

export const proposeDecisionVerbSchema = z.strictObject({
  kind: z.literal('propose_decision'),
  ...proposalFenceSchema.shape,
  targetNodeId: z.string().min(1),
  options: z.array(decisionOptionSchema).min(1).max(4),
  recommendation: z.string().min(1).optional(),
})

/** The only model output accepted by the gardener seam. */
export const gardenerVerbSchema = z
  .discriminatedUnion('kind', [elaborateVerbSchema, studyVerbSchema, proposeDecisionVerbSchema])
  .superRefine((verb, ctx) => {
    if (verb.kind !== 'propose_decision') return
    const optionIds = new Set<string>()
    for (const option of verb.options) {
      if (optionIds.has(option.optionId)) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'duplicate_option_id' })
      }
      optionIds.add(option.optionId)
    }
    if (verb.recommendation !== undefined && !optionIds.has(verb.recommendation)) {
      ctx.addIssue({ code: 'custom', path: ['recommendation'], message: 'recommendation_not_an_option' })
    }
  })

export type GardenerVerb = z.infer<typeof gardenerVerbSchema>
export type ElaborateVerb = Extract<GardenerVerb, { kind: 'elaborate' }>
export type StudyVerb = Extract<GardenerVerb, { kind: 'study' }>
export type ProposeDecisionVerb = Extract<GardenerVerb, { kind: 'propose_decision' }>

export type GardenerRejectionCode =
  | 'work_tree_target_not_found'
  | 'work_tree_target_not_frontier'
  | 'work_tree_target_kind_invalid'
  | 'work_tree_dependency_missing'
  | 'work_tree_parent_cycle'
  | 'work_tree_dependency_cycle'
  | 'work_tree_children_limit'
  | 'work_tree_node_limit'
  | 'work_tree_depth_limit'
  | 'work_tree_status_transition_invalid'
  | 'work_tree_revision_overflow'
  | 'work_tree_options_limit'
  | 'work_tree_revision_stale'
  | 'work_tree_generation_stale'
  | 'work_tree_proposal_digest_mismatch'
  | 'work_tree_operation_conflict'
  | 'work_tree_snapshot_too_large'
  | 'work_tree_event_limit'
  | 'work_tree_verb_invalid'

export class GardenerVerbError extends Error {
  readonly code: GardenerRejectionCode

  constructor(code: GardenerRejectionCode, cause?: unknown) {
    super(code, { cause })
    this.name = 'GardenerVerbError'
    this.code = code
  }
}

/** Stable digest input: caller-provided proposalDigest is never self-referential. */
export function gardenerVerbDigest(verb: GardenerVerb): string {
  const { proposalDigest: _ignored, ...unsigned } = verb
  return canonicalDigest(unsigned)
}

/** Event payload digest includes the project identity, unlike the semantic proposal digest. */
export function gardenerPayloadDigest(projectId: string, verb: GardenerVerb): string {
  return canonicalDigest({ projectId, verb })
}

export type GardenerApplyResult = Readonly<{
  tree: WorkTree
  eventKind: GardenerEventKind
  eventPayload: Readonly<Record<string, StableHashValue>>
  changedNodeIds: readonly string[]
}>

const GardenerEventKindValues = ['created', 'claimed', 'elaborated', 'study_started', 'decision_proposed'] as const
export type GardenerEventKind = (typeof GardenerEventKindValues)[number]

/**
 * Applies a parsed verb without persistence. Convex owns fencing/idempotency; this
 * function owns the semantic tree transition and the graph check.
 */
export function applyGardenerVerb(
  tree: WorkTree,
  verb: GardenerVerb,
  now: number,
  idFactory: () => string = nanoid,
): GardenerApplyResult {
  const parsedTree = assertResultingTree(tree)
  const target = parsedTree.nodes.find((node) => node.nodeId === verb.targetNodeId)
  if (target === undefined) throw new GardenerVerbError('work_tree_target_not_found')

  if (verb.kind === 'elaborate') {
    if (!isElaborationFrontier(parsedTree, target.nodeId)) {
      throw new GardenerVerbError('work_tree_target_not_frontier')
    }
    if (verb.children.length > MAX_CHILDREN_PER_ELABORATION) {
      throw new GardenerVerbError('work_tree_children_limit')
    }
    if (parsedTree.nodes.length + verb.children.length > MAX_NODES_PER_TREE) {
      throw new GardenerVerbError('work_tree_node_limit')
    }
    if (!canTransition(target.status, 'ready')) {
      throw new GardenerVerbError('work_tree_status_transition_invalid')
    }

    const ids = new Set(parsedTree.nodes.map((node) => node.nodeId))
    const children: WorkNode[] = verb.children.map((draft) => {
      const childId = nextUniqueId(ids, idFactory)
      ids.add(childId)
      for (const dependency of draft.dependsOn) {
        if (!ids.has(dependency) && !parsedTree.nodes.some((node) => node.nodeId === dependency)) {
          throw new GardenerVerbError('work_tree_dependency_missing')
        }
      }
      return {
        ...draft,
        format: 'ae.work-node:v1',
        nodeId: childId,
        parentId: target.nodeId,
        status: 'fog',
        createdAt: now,
        updatedAt: now,
      }
    })

    const readyTarget: WorkNode = {
      ...target,
      status: 'ready',
      ...(target.kind === 'decision' || target.timing !== undefined
        ? {}
        : { timing: { certainty: 'fog' as const } }),
      updatedAt: now,
    }
    const nextTree = nextTreeWithNodes(parsedTree, [readyTarget, ...children])
    assertResultingTree(nextTree, parsedTree)
    return {
      tree: nextTree,
      eventKind: 'elaborated',
      eventPayload: { targetNodeId: target.nodeId, childNodeIds: children.map((child) => child.nodeId) },
      changedNodeIds: [target.nodeId, ...children.map((child) => child.nodeId)],
    }
  }

  if (verb.kind === 'study') {
    if (target.status !== 'queued' && target.status !== 'ready') {
      throw new GardenerVerbError('work_tree_status_transition_invalid')
    }
    if (!canTransition(target.status, 'studying')) {
      throw new GardenerVerbError('work_tree_status_transition_invalid')
    }
    const nextTarget = { ...target, status: 'studying' as const, updatedAt: now }
    const nextTree = nextTreeWithNodes(parsedTree, [nextTarget])
    assertResultingTree(nextTree, parsedTree)
    return {
      tree: nextTree,
      eventKind: 'study_started',
      eventPayload: {
        targetNodeId: target.nodeId,
        studyBrief: verb.studyBrief,
        criteriaFromCharter: verb.criteriaFromCharter,
      },
      changedNodeIds: [target.nodeId],
    }
  }

  if (target.kind !== 'decision') throw new GardenerVerbError('work_tree_target_kind_invalid')
  if (target.status !== 'studying' && target.status !== 'ready') {
    throw new GardenerVerbError('work_tree_status_transition_invalid')
  }
  const nextTarget = target.status === 'studying'
    ? { ...target, status: 'ready' as const, updatedAt: now }
    : { ...target, updatedAt: now }
  const nextTree = nextTreeWithNodes(parsedTree, [nextTarget])
  assertResultingTree(nextTree, parsedTree)
  return {
    tree: nextTree,
    eventKind: 'decision_proposed',
    eventPayload: {
      targetNodeId: target.nodeId,
      options: verb.options,
      ...(verb.recommendation === undefined ? {} : { recommendation: verb.recommendation }),
    },
    changedNodeIds: [target.nodeId],
  }
}

function canTransition(from: WorkNodeStatus, to: WorkNodeStatus): boolean {
  return WORK_NODE_STATUS_TRANSITIONS[from].includes(to)
}

function nextTreeWithNodes(tree: WorkTree, replacements: readonly WorkNode[]): WorkTree {
  const replacementById = new Map(replacements.map((node) => [node.nodeId, node]))
  const nodes = tree.nodes.map((node) => replacementById.get(node.nodeId) ?? node)
  for (const replacement of replacements) {
    if (!tree.nodes.some((node) => node.nodeId === replacement.nodeId)) nodes.push(replacement)
  }
  const revision = tree.revision + 1
  if (!Number.isSafeInteger(revision)) throw new GardenerVerbError('work_tree_revision_overflow')
  return { ...tree, revision, nodes }
}

function nextUniqueId(ids: Set<string>, idFactory: () => string): string {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const id = idFactory()
    if (id.length > 0 && !ids.has(id)) return id
  }
  throw new GardenerVerbError('work_tree_node_limit')
}

function assertResultingTree(tree: WorkTree, previousTree?: WorkTree): WorkTree {
  const result = validateTree(tree, previousTree)
  if (result.valid) return tree
  const reason = result.errors[0]?.reason
  switch (reason) {
    case 'dependency_cycle':
      throw new GardenerVerbError('work_tree_dependency_cycle')
    case 'dependency_missing':
      throw new GardenerVerbError('work_tree_dependency_missing')
    case 'parent_cycle':
      throw new GardenerVerbError('work_tree_parent_cycle')
    case 'tree_depth_exceeded':
      throw new GardenerVerbError('work_tree_depth_limit')
    case 'children_cap_exceeded':
      throw new GardenerVerbError('work_tree_children_limit')
    case 'illegal_status_transition':
      throw new GardenerVerbError('work_tree_status_transition_invalid')
    case 'node_count_exceeded':
      throw new GardenerVerbError('work_tree_node_limit')
    default:
      throw new GardenerVerbError('work_tree_verb_invalid')
  }
}