/**
 * T46 — the human root WorkTree loop, expressed as pure host orchestration.
 *
 * The root host owns no authority. Every fact rendered at `/` comes back from a
 * WorkTree source readback (snapshot + append-only events); this module only
 * sequences source calls and projects their result. It deliberately holds no
 * TanStack, Convex, or React import so the route boundary can inject the source
 * port and the tracer tests can drive the loop without a deployment.
 *
 * Ownership: the source functions themselves live in
 * `src/modules/work-tree/work-tree.functions.ts` (create/inspect, T45) and
 * `src/modules/work-tree/work-tree-agent.functions.ts` (apply/decide, T47).
 * `WorkTreeSourcePort` is the exact capability this host requires from them;
 * the concrete wiring lives in `../human-root.functions.ts`.
 */

import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'

import type { WorkTree, WorkTreeLineage } from './contract'
export type { WorkTreeLineage }
import type { WorkTreeApprovalAuthority, WorkTreeApprovalRefusalCode } from './approval'
import {
  DECISION_INBOX_LIMIT,
  projectDecisionInbox,
  type DecisionInboxProjection,
  type PendingProposeDecision,
} from './inbox-projection'
import type { GardenerEventKind, GardenerVerb } from './verbs'

// ---------------------------------------------------------------------------
// Source port
// ---------------------------------------------------------------------------
export type WorkTreeSourceEvent = Readonly<{
  seq: number
  kind: GardenerEventKind
  operationKey: string
  generation: number
  revision: number
  at: number
  actor?: WorkTreeActor
  targetNodeId?: string
  payloadJson: string
}>

export type WorkTreeDecisionKind = 'lock' | 'adjust' | 'park'

export type WorkTreeStepUp = Readonly<{
  acknowledgedConsequence: true
  approvalKind: 'per_item'
  approvalRef?: string | undefined
  authority?: WorkTreeApprovalAuthority | undefined
}>

export type WorkTreeRefusalCode = 'stale_fence' | 'forbidden' | 'not_found' | 'digest_mismatch' | 'step_up_required' | 'live_money_gate_open' | 'stripe_setup_required' | WorkTreeApprovalRefusalCode

export type WorkTreeActor = Readonly<{
  source: 'human_source' | 'browser_guest' | 'customer_request_agent'
}>

/**
 * Structural mirror of the decision receipt/result returned by the source.
 * The host renders receipts and never mints them; typecheck catches any drift
 * when the real function is bound in `human-root.functions.ts`.
 */
export type WorkTreeDecisionReceipt =
  | Readonly<{
      kind: 'accepted' | 'replayed'
      decision: WorkTreeDecisionKind
      projectId: string
      nodeId: string
      receiptId: string
      generation: number
      revision: number
      disposition: 'locked' | 'queued' | 'adjusted' | 'unchanged'
      permissionRef?: string | undefined
      actor?: WorkTreeActor | undefined
      occurredAt: number
      readback: Readonly<{ projectId: string; revision: number }>
    }>
  | Readonly<{
      kind: 'refused'
      decision: WorkTreeDecisionKind
      projectId: string
      nodeId: string
      receiptId: string
      generation: number
      revision: number
      disposition: 'locked' | 'queued' | 'adjusted' | 'unchanged'
      actor?: WorkTreeActor | undefined
      refusalCode: WorkTreeRefusalCode
      occurredAt: number
      readback: Readonly<{ projectId: string; revision: number }>
    }>

export type WorkTreeDecisionResult =
  | WorkTreeDecisionReceipt
  | Readonly<{
      kind: 'refused'
      code: 'authentication_required' | 'quarantine_writes_frozen'
      replayed: false
    }>
  | Readonly<{ kind: 'unknown' }>

export type WorkTreeAcceptedReadback = Readonly<{
  kind: 'accepted'
  projectId: string
  treeId: string
  generation: number
  revision: number
  tree: WorkTree
  events: readonly WorkTreeSourceEvent[]
  hasMoreEvents: boolean
  receipts?: readonly WorkTreeDecisionReceipt[]
}>

export type WorkTreeRefusal = Readonly<{ kind: 'refused'; reason: string }>

export type WorkTreeCreateResult =
  | Readonly<{
      kind: 'accepted' | 'replayed'
      projectId: string
      treeId: string
      generation: number
      revision: number
      tree: WorkTree
    }>
  | WorkTreeRefusal

export type WorkTreeInspectResult = WorkTreeAcceptedReadback | WorkTreeRefusal

export type WorkTreeApplyResult =
  | Readonly<{
      kind: 'accepted' | 'replayed'
      receipt: Readonly<{ tree: WorkTree; operationKey: string }>
      readback: Readonly<{ projectId: string; revision: number }>
    }>
  | WorkTreeRefusal
  | Readonly<{ kind: 'unknown'; reason: string }>

export type WorkTreeSourcePort = Readonly<{
  create(input: Readonly<{
    idempotencyKey: string
    charterText: string
    lineage: WorkTreeLineage
    /**
     * Opaque signed browser-guest token for an anonymous human start. It is
     * server-minted and server-verified; the host never names a principal, and
     * an authenticated caller omits it entirely.
     */
    guestAssertion?: string
  }>): Promise<WorkTreeCreateResult>
  inspect(input: Readonly<{ projectId: string; guestAssertion?: string }>): Promise<WorkTreeInspectResult>
  apply(input: Readonly<{
    projectId: string
    operationKey: string
    correlationId: string
    verb: GardenerVerb
    /** Opaque signed browser-guest token; transport authority, never a principal. */
    guestAssertion?: string
  }>): Promise<WorkTreeApplyResult>
  decide(input: Readonly<{
    projectId: string
    nodeId: string
    kind: WorkTreeDecisionKind
    expectedGeneration: number
    expectedRevision: number
    proposalDigest: string
    idempotencyKey: string
    stepUp?: WorkTreeStepUp
    /** Opaque signed browser-guest token; transport authority, never a principal. */
    guestAssertion?: string
  }>): Promise<WorkTreeDecisionResult>
}>

// ---------------------------------------------------------------------------
// Host-facing view
// ---------------------------------------------------------------------------

export type RootWorkTreeView = Readonly<{
  kind: 'ready'
  projectId: string
  treeId: string
  generation: number
  revision: number
  tree: WorkTree
  events: readonly WorkTreeSourceEvent[]
  inbox: DecisionInboxProjection
  receipts: readonly WorkTreeDecisionReceipt[]
  hasMoreEvents: boolean
}>
export type RootWorkTreeReadback = RootWorkTreeView | WorkTreeRefusal

export type RootWorkTreeStart =
  | Readonly<{ kind: 'started'; projectId: string }>
  | WorkTreeRefusal


/**
 * Submit path: create the durable project before the person is redirected to
 * its source-backed readback.
 */
export async function startRootWorkTree(
  input: Readonly<{ outcome: string; lineage?: WorkTreeLineage; guestAssertion?: string }>,
  port: WorkTreeSourcePort,
): Promise<RootWorkTreeStart> {
  const charterText = input.outcome.trim().slice(0, 4_000)
  if (charterText.length === 0) return { kind: 'refused', reason: 'outcome_empty' }

  const created = await port.create({
    // Retry and refresh land on the same project; the source scopes the key to
    // the principal, so the key never has to carry identity.
    idempotencyKey: canonicalDigest({ surface: 'root', charterText }),
    charterText,
    lineage: input.lineage ?? { kind: 'standalone' },
    ...(input.guestAssertion === undefined ? {} : { guestAssertion: input.guestAssertion }),
  })
  if (created.kind === 'refused') return created

  return { kind: 'started', projectId: created.projectId }
}

/** Reload path: source readback only. No model call, no transcript, no replay. */
export async function readRootWorkTree(
  input: Readonly<{ projectId: string; nowMs: number; guestAssertion?: string }>,
  port: WorkTreeSourcePort,
): Promise<RootWorkTreeReadback> {
  return projectRootWorkTree(
    await port.inspect({
      projectId: input.projectId,
      ...(input.guestAssertion === undefined ? {} : { guestAssertion: input.guestAssertion }),
    }),
    input.nowMs,
  )
}

export async function decideRootWorkTree(
  input: Readonly<{
    projectId: string
    nodeId: string
    kind: WorkTreeDecisionKind
    expectedGeneration: number
    expectedRevision: number
    nowMs: number
    stepUp?: WorkTreeStepUp
    guestAssertion?: string
  }>,
  port: WorkTreeSourcePort,
): Promise<Readonly<{ receipt: WorkTreeDecisionResult; readback: RootWorkTreeReadback }>> {
  // The fenced proposal excludes approval metadata. Step-up is source-bound
  // authority for this exact proposal and is included in the idempotency/command
  // digest, while a re-issued guest session never changes decision identity.
  const proposal = {
    projectId: input.projectId,
    nodeId: input.nodeId,
    kind: input.kind,
    expectedGeneration: input.expectedGeneration,
    expectedRevision: input.expectedRevision,
  }
  const command = {
    ...proposal,
    ...(input.stepUp === undefined ? {} : { stepUp: input.stepUp }),
  }
  const authority = input.guestAssertion === undefined ? {} : { guestAssertion: input.guestAssertion }
  const receipt = await port.decide({
    ...command,
    ...authority,
    proposalDigest: canonicalDigest(proposal),
    idempotencyKey: canonicalDigest({ ...command, surface: 'root' }),
  })
  // The receipt is a claim about the source; the tree the person sees is always
  // the fresh readback, including after a refusal.
  return {
    receipt,
    readback: await readRootWorkTree({ projectId: input.projectId, nowMs: input.nowMs, ...authority }, port),
  }
}

export function projectRootWorkTree(inspected: WorkTreeInspectResult, nowMs: number): RootWorkTreeReadback {
  if (inspected.kind === 'refused') return inspected
  if (inspected.tree.nodes.some((node) => node.evidenceRefs.includes('ae:development-mock/bas-v1'))) {
    return { kind: 'refused', reason: 'not_found' }
  }
  const pending = pendingProposeDecisions(inspected.tree, inspected.events)
  return {
    kind: 'ready',
    projectId: inspected.projectId,
    treeId: inspected.treeId,
    generation: inspected.generation,
    revision: inspected.revision,
    tree: inspected.tree,
    events: inspected.events,
    inbox: projectDecisionInbox(inspected.tree, { nowMs, pendingProposeDecisions: pending }),
    receipts: inspected.receipts ?? [],
    hasMoreEvents: inspected.hasMoreEvents,
  }
}

// ---------------------------------------------------------------------------
// Durable inbox derivation
// ---------------------------------------------------------------------------

/**
 * The inbox is derived from the append-only event log, never from component or
 * stream state, so a cold reload reproduces it exactly. A `decision_proposed`
 * event whose target has not yet been locked, finished or cancelled is a
 * decision still waiting on the person.
 *
 * `projectDecisionInbox` admits ready decision nodes first and dedupes by node,
 * so a proposal against an already-ready node collapses into that node's item
 * rather than doubling it. When a node is proposed more than once, the latest
 * event is the durable proposal the person must act on.
 */
function pendingProposeDecisions(
  tree: WorkTree,
  events: readonly WorkTreeSourceEvent[],
): readonly PendingProposeDecision[] {
  const byNodeId = new Map(tree.nodes.map((node) => [node.nodeId, node]))
  const pending = new Map<string, Readonly<{ seq: number; item: PendingProposeDecision }>>()

  for (const event of events) {
    if (event.kind !== 'decision_proposed') continue
    const nodeId = eventTargetNodeId(event)
    if (nodeId === undefined) continue
    const node = byNodeId.get(nodeId)
    if (node === undefined || node.kind !== 'decision') continue
    if (node.status === 'locked' || node.status === 'done' || node.status === 'cancelled') continue
    const current = pending.get(nodeId)
    if (current !== undefined && current.seq >= event.seq) continue
    pending.set(nodeId, {
      seq: event.seq,
      item: { proposalId: event.operationKey, treeId: tree.treeId, targetNodeId: nodeId, createdAt: event.at },
    })
  }

  return [...pending.values()]
    .map(({ item }) => item)
    .sort((left, right) => left.createdAt - right.createdAt || left.targetNodeId.localeCompare(right.targetNodeId))
    .slice(0, DECISION_INBOX_LIMIT)
}

function eventResult(event: WorkTreeSourceEvent): Record<string, unknown> {
  try {
    const payload: unknown = JSON.parse(event.payloadJson)
    if (!isRecord(payload)) return {}
    return isRecord(payload.result) ? payload.result : {}
  } catch {
    return {}
  }
}

function eventTargetNodeId(event: WorkTreeSourceEvent): string | undefined {
  if (event.targetNodeId !== undefined) return event.targetNodeId
  const target = eventResult(event).targetNodeId
  return typeof target === 'string' ? target : undefined
}

