import { nanoid } from 'nanoid'
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { env, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'

import { isBoundedJsonValue } from '../src/modules/capability-contract/public'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { stableStringify } from '../src/modules/common/stable-hash'
import { isRecord } from '../src/modules/common/is-record'
import {
  applyGardenerVerb,
  GardenerVerbError,
  gardenerPayloadDigest,
  gardenerVerbDigest,
  gardenerVerbSchema,
  assessWorkTreeDecisionPolicy,
  workTreeNodeAuthorityAmount,
  workTreeSchema,
  type GardenerEventKind,
  type GardenerVerb,
  type WorkTree,
  type WorkTreeApprovalAuthority,
  type WorkTreeApprovalRefusalCode,
} from '../src/modules/work-tree/public'
import { customerRouteRef } from '../src/modules/customer-request/route-plan-customer-projection'
import {
  readBrowserGuestSigningKey,
  verifyBrowserGuestAssertion,
} from '../src/lib/server/browser-guest-assertion'
import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '../src/modules/customer-request/service-auth-envelope'
import {
  consumeWorkTreeApproval,
} from './workTreeApprovals'
import { persistWorkTreeRepeatPermission } from './workTreeRepeatLedger'
import { evaluateLiveMoneyGate } from '../src/modules/money/public'

export const MAX_WORK_TREE_EVENTS = 256
export const MAX_WORK_TREE_SNAPSHOT_BYTES = 524_288
const MAX_WORK_TREE_EVENT_PAYLOAD_BYTES = 600_000
const encoder = new TextEncoder()

const timingArg = v.object({
  certainty: v.union(v.literal('fixed'), v.literal('window'), v.literal('fog')),
  date: v.optional(v.string()),
  window: v.optional(v.object({ earliest: v.string(), latest: v.string() })),
  leadTimeDays: v.optional(v.number()),
})
const costArg = v.object({
  currency: v.string(),
  estimateMinor: v.optional(v.number()),
  committedMinor: v.optional(v.number()),
  envelopeMinor: v.optional(v.number()),
})
const resourceArg = v.object({
  owner: v.union(v.literal('agent'), v.literal('human'), v.literal('business')),
  ownerRef: v.optional(v.string()),
  exclusive: v.optional(v.object({ startMs: v.number(), endMs: v.number() })),
})
const effortArg = v.object({ humanMinutes: v.optional(v.number()) })
const scopeArg = v.object({
  acceptance: v.union(v.literal('binary'), v.literal('criteria'), v.literal('judgement')),
  criteria: v.optional(v.array(v.object({
    criterionId: v.string(),
    label: v.string(),
    accepted: v.boolean(),
  }))),
})
const quoteArg = v.object({
  quoteRef: v.string(),
  observedAt: v.number(),
  expiresAt: v.number(),
  revision: v.number(),
  evidenceClass: v.union(v.literal('ae_sandbox_provider'), v.literal('published_price'), v.literal('business_quote')),
})
const nodeDraftArg = v.object({
  format: v.optional(v.literal('ae.work-node:v1')),
  kind: v.union(v.literal('package'), v.literal('decision'), v.literal('task'), v.literal('study')),
  title: v.string(),
  description: v.optional(v.string()),
  status: v.optional(v.literal('fog')),
  dependsOn: v.optional(v.array(v.string())),
  priority: v.optional(v.number()),
  timing: v.optional(timingArg),
  cost: v.optional(costArg),
  resource: v.optional(resourceArg),
  effort: v.optional(effortArg),
  scope: v.optional(scopeArg),
  authorityRef: v.optional(v.string()),
  evidenceRefs: v.optional(v.array(v.string())),
  quote: v.optional(quoteArg),
})
const fenceArg = {
  expectedGeneration: v.number(),
  expectedRevision: v.number(),
  proposalDigest: v.string(),
  targetNodeId: v.string(),
} as const
const gardenerVerbArg = v.union(
  v.object({
    kind: v.literal('elaborate'),
    ...fenceArg,
    children: v.array(nodeDraftArg),
  }),
  v.object({
    kind: v.literal('study'),
    ...fenceArg,
    studyBrief: v.string(),
    criteriaFromCharter: v.array(v.string()),
  }),
  v.object({
    kind: v.literal('propose_decision'),
    ...fenceArg,
    options: v.array(v.object({ optionId: v.string(), label: v.string(), summary: v.string() })),
    recommendation: v.optional(v.string()),
  }),
)

const workTreeServiceAssertionArg = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  scopes: v.array(v.string()),
  issuedAt: v.number(),
  signature: v.string(),
})
const applyArgs = {
  projectId: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  verb: gardenerVerbArg,
  guestAssertion: v.optional(v.string()),
  serviceAuth: v.optional(workTreeServiceAssertionArg),
}

const workTreeLineageArg = v.union(
  v.object({
    kind: v.literal('customer_request'),
    requestRef: v.string(),
    revision: v.number(),
    routeGenerationRef: v.string(),
    routeRef: v.string(),
  }),
  v.object({ kind: v.literal('standalone') }),
)
const workTreeCreateArgs = {
  idempotencyKey: v.string(),
  charterText: v.string(),
  lineage: workTreeLineageArg,
  guestAssertion: v.optional(v.string()),
  serviceAuth: v.optional(workTreeServiceAssertionArg),
}
const workTreeInspectArgs = {
  projectId: v.string(),
  guestAssertion: v.optional(v.string()),
  serviceAuth: v.optional(workTreeServiceAssertionArg),
}
const workTreeClaimArgs = {
  projectId: v.string(),
  idempotencyKey: v.string(),
  guestAssertion: v.string(),
}
const workTreeApprovalAuthorityArg = v.object({
  kind: v.literal('per_item'),
  amount: v.optional(v.object({ currency: v.string(), amountMinor: v.number() })),
})
const workTreeStepUpArg = v.object({
  acknowledgedConsequence: v.literal(true),
  approvalKind: v.literal('per_item'),
  approvalRef: v.optional(v.string()),
  authority: v.optional(workTreeApprovalAuthorityArg),
})
const workTreeRepeatGrantArg = v.object({
  delegatedCredentialId: v.string(),
  occurrences: v.number(),
  perUseSpend: v.object({ currency: v.string(), amountMinor: v.number() }),
  cumulativeSpend: v.object({ currency: v.string(), amountMinor: v.number() }),
  perUseDataAllocations: v.number(),
  cumulativeDataAllocations: v.number(),
  validUntil: v.number(),
})
const validRepeatGrant = (grant: WorkTreeDecisionArgs['repeatGrant']): boolean => {
  if (grant === undefined) return true
  const safeFinite = (value: number): boolean => Number.isSafeInteger(value) && Number.isFinite(value)
  return safeFinite(grant.occurrences)
    && grant.occurrences > 0
    && safeFinite(grant.perUseSpend.amountMinor)
    && grant.perUseSpend.amountMinor >= 0
    && safeFinite(grant.cumulativeSpend.amountMinor)
    && grant.cumulativeSpend.amountMinor >= 0
    && grant.perUseSpend.amountMinor <= grant.cumulativeSpend.amountMinor
    && safeFinite(grant.perUseDataAllocations)
    && grant.perUseDataAllocations >= 0
    && safeFinite(grant.cumulativeDataAllocations)
    && grant.cumulativeDataAllocations >= 0
    && grant.perUseDataAllocations <= grant.cumulativeDataAllocations
    && safeFinite(grant.validUntil)
}
const workTreeDecisionArgs = {
  projectId: v.string(),
  nodeId: v.string(),
  kind: v.union(v.literal('lock'), v.literal('adjust'), v.literal('park')),
  expectedGeneration: v.number(),
  expectedRevision: v.number(),
  proposalDigest: v.string(),
  idempotencyKey: v.string(),
  stepUp: v.optional(workTreeStepUpArg),
  repeatGrant: v.optional(workTreeRepeatGrantArg),
  guestAssertion: v.optional(v.string()),
  serviceAuth: v.optional(workTreeServiceAssertionArg),
}

type WorkTreeLineage =
  | Readonly<{
      kind: 'customer_request'
      requestRef: string
      revision: number
      routeGenerationRef: string
      routeRef: string
    }>
  | Readonly<{ kind: 'standalone' }>
type WorkTreeCaller = Readonly<{
  principalId: string
  ownerId: string
  credentialId?: string
  tokenIdentifier?: string
  source: 'human_source' | 'browser_guest' | 'customer_request_agent'
}>
type WorkTreePrincipal = Readonly<{ principalId: string; ownerId: string; lineage: WorkTreeLineage }>
type WorkTreeReadContext = Pick<QueryCtx, 'db' | 'auth'>
type WorkTreeMutationContext = Pick<MutationCtx, 'db' | 'auth'>

export type WorkTreeApplyReceipt = Readonly<{
  kind: 'applied' | 'replayed'
  replayed: boolean
  projectId: string
  tree: WorkTree
  operationKey: string
  seq: number
  event: { kind: GardenerEventKind; operationKey: string; seq: number }
}>

type WorkTreeDoc = Doc<'workTrees'>

export const readTreeByProject = internalQuery({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    const tree = await ctx.db
      .query('workTrees')
      .withIndex('by_projectId', (query) => query.eq('projectId', args.projectId))
      .unique()
    if (tree === null) return null
    const events = await ctx.db
      .query('workTreeEvents')
      .withIndex('by_treeId_and_seq', (query) => query.eq('treeId', tree.treeId))
      .order('asc')
      .take(MAX_WORK_TREE_EVENTS + 1)
    return {
      tree: parseSnapshot(tree.snapshotJson),
      events: events.slice(0, MAX_WORK_TREE_EVENTS),
      hasMoreEvents: events.length > MAX_WORK_TREE_EVENTS,
    }
  },
})

/** Source-owned WorkTree initializer; identity is always derived from ctx.auth. */
export const create = mutationGeneric({
  args: workTreeCreateArgs,
  handler: async (ctx, args) => createWorkTree(ctx, args),
})

/** Owner-only WorkTree readback. */
export const inspect = queryGeneric({
  args: workTreeInspectArgs,
  handler: async (ctx, args) => inspectWorkTree(ctx, args.projectId, args.guestAssertion, args.serviceAuth),
})

/** Atomically binds a signed guest WorkTree to the authenticated Clerk owner. */
export const claim = mutationGeneric({
  args: workTreeClaimArgs,
  handler: async (ctx, args) => claimWorkTree(ctx, args),
})


/** The sole mutation that changes a work-tree snapshot. */
export const apply = mutationGeneric({
  args: applyArgs,
  handler: async (ctx, args) => {
    const verb = parseVerb(args.verb)
    const caller = await resolveWorkTreeCaller(ctx, args.serviceAuth, args.guestAssertion, 'workTree.apply', {
      projectId: args.projectId,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      verb: args.verb,
    })
    if (caller === null) {
      return { kind: 'refused', code: 'authentication_required', replayed: false }
    }
    const current = await findCurrentTree(ctx, args.projectId)
    if (current === null) throw new GardenerVerbError('work_tree_target_not_found')
    if (!callerMayOperate(current, caller)) {
      return { kind: 'refused', code: 'forbidden', replayed: false }
    }
    const payloadDigest = gardenerPayloadDigest(args.projectId, verb)
    const replay = await replayEvent(ctx, args.projectId, args.operationKey, payloadDigest)
    if (replay !== null) return replay

    if (verb.expectedGeneration !== current.generation) {
      throw new GardenerVerbError('work_tree_generation_stale')
    }
    if (verb.expectedRevision !== current.revision) {
      throw new GardenerVerbError('work_tree_revision_stale')
    }
    if (verb.proposalDigest !== gardenerVerbDigest(verb)) {
      throw new GardenerVerbError('work_tree_proposal_digest_mismatch')
    }
    const applied = applyGardenerVerb(parseSnapshot(current.snapshotJson), verb, Date.now())
    const snapshotJson = stableJson(applied.tree)
    if (encoder.encode(snapshotJson).byteLength > MAX_WORK_TREE_SNAPSHOT_BYTES) {
      throw new GardenerVerbError('work_tree_snapshot_too_large')
    }
    const event = await appendEvent(ctx, {
      current,
      generation: applied.tree.generation,
      revision: applied.tree.revision,
      kind: applied.eventKind,
      operationKey: args.operationKey,
      payloadDigest,
      payload: { verb, result: applied.eventPayload },
      snapshot: applied.tree,
      actor: caller,
    })
    await ctx.db.patch(current._id, {
      generation: applied.tree.generation,
      revision: applied.tree.revision,
      snapshotJson,
      snapshotDigest: canonicalDigest(applied.tree),
      updatedAt: Date.now(),
    })
    return receipt(applied.tree, args.projectId, args.operationKey, event.seq, event.kind, false)
  },
})
/** Source-owned durable decision mutation; authority and fences are checked in decideWorkTree. */
export const decide = mutationGeneric({
  args: workTreeDecisionArgs,
  handler: async (ctx, args) => decideWorkTree(ctx, args),
})
type WorkTreeDecisionArgs = Readonly<{
  projectId: string
  nodeId: string
  kind: 'lock' | 'adjust' | 'park'
  expectedGeneration: number
  expectedRevision: number
  proposalDigest: string
  idempotencyKey: string
  stepUp?: Readonly<{
    acknowledgedConsequence: true
    approvalKind: 'per_item'
    approvalRef?: string
    authority?: WorkTreeApprovalAuthority
  }>
  repeatGrant?: Readonly<{
    delegatedCredentialId: string
    occurrences: number
    perUseSpend: Readonly<{ currency: string; amountMinor: number }>
    cumulativeSpend: Readonly<{ currency: string; amountMinor: number }>
    perUseDataAllocations: number
    cumulativeDataAllocations: number
    validUntil: number
  }>
  guestAssertion?: string
  serviceAuth?: CustomerRequestServiceAssertion
}>

type WorkTreeDecisionReceiptDoc = Doc<'workTreeDecisionReceipts'>

async function decideWorkTree(
  ctx: WorkTreeMutationContext,
  args: WorkTreeDecisionArgs,
): Promise<Record<string, unknown>> {
  if (!validRepeatGrant(args.repeatGrant)) {
    return { kind: 'refused', refusalCode: 'forbidden', replayed: false }
  }
  const caller = await resolveWorkTreeCaller(ctx, args.serviceAuth, args.guestAssertion, 'workTree.decide', {
    projectId: args.projectId,
    nodeId: args.nodeId,
    kind: args.kind,
    expectedGeneration: args.expectedGeneration,
    expectedRevision: args.expectedRevision,
    proposalDigest: args.proposalDigest,
    idempotencyKey: args.idempotencyKey,
    ...(args.stepUp === undefined ? {} : { stepUp: args.stepUp }),
    ...(args.repeatGrant === undefined ? {} : { repeatGrant: args.repeatGrant }),
  })
  if (caller === null) return { kind: 'refused', code: 'authentication_required', replayed: false }
  const current = await findCurrentTree(ctx, args.projectId)
  if (current === null) return decisionRefusal(ctx, args, 'not_found', undefined, caller)
  const commandDigest = decisionCommandDigest(args)
  if (!callerMayOperate(current, caller)) {
    return decisionRefusal(ctx, args, 'forbidden', current, caller, commandDigest)
  }

  const existing = await ctx.db
    .query('workTreeDecisionReceipts')
    .withIndex('by_projectId_and_idempotencyKey', (query) =>
      query.eq('projectId', args.projectId).eq('idempotencyKey', args.idempotencyKey))
    .unique()
  if (existing !== null) {
    if (existing.commandDigest !== commandDigest) {
      return decisionRefusal(ctx, args, 'digest_mismatch', current, caller, commandDigest, false)
    }
    return existing.refusalCode === undefined
      ? decisionReceipt(existing, 'replayed')
      : decisionRefusedReceipt(existing)
  }

  const proposalDigest = canonicalDigest({
    projectId: args.projectId,
    nodeId: args.nodeId,
    kind: args.kind,
    expectedGeneration: args.expectedGeneration,
    expectedRevision: args.expectedRevision,
  })
  if (args.proposalDigest !== proposalDigest) return decisionRefusal(ctx, args, 'digest_mismatch', current, caller, commandDigest)
  if (args.expectedGeneration !== current.generation || args.expectedRevision !== current.revision) {
    return decisionRefusal(ctx, args, 'stale_fence', current, caller, commandDigest)
  }
  const snapshot = parseSnapshot(current.snapshotJson)
  const target = snapshot.nodes.find((node) => node.nodeId === args.nodeId)
  if (target === undefined || target.kind !== 'decision' || target.status !== 'ready') {
    return decisionRefusal(ctx, args, 'not_found', current, caller, commandDigest)
  }
  const decisionPolicy = assessWorkTreeDecisionPolicy(target, 'lock')
  if (args.kind === 'lock' && decisionPolicy.paid) {
    const liveMoneyGate = evaluateLiveMoneyGate()
    if (liveMoneyGate.kind === 'refused') {
      const refusalCode = liveMoneyGate.code === 'live_money_gate_open' || liveMoneyGate.code === 'stripe_setup_required'
        ? liveMoneyGate.code
        : 'live_money_gate_open'
      return decisionRefusal(ctx, args, refusalCode, current, caller, commandDigest)
    }
  }
  const protectedLock = args.kind === 'lock' && decisionPolicy.requiresStepUp
  const now = Date.now()
  const receiptId = decisionReceiptId(args, commandDigest)
  if (args.repeatGrant !== undefined && (
    args.kind !== 'lock'
    || caller.source !== 'human_source'
    || protectedLock
    || !decisionPolicy.eligibleForRepeatPermission
    || (!decisionPolicy.paid && (
      args.repeatGrant.perUseSpend.amountMinor > 0
      || args.repeatGrant.cumulativeSpend.amountMinor > 0
    ))
    || args.repeatGrant.validUntil <= now
    || args.repeatGrant.perUseSpend.currency !== args.repeatGrant.cumulativeSpend.currency
    || args.repeatGrant.perUseSpend.amountMinor > args.repeatGrant.cumulativeSpend.amountMinor
    || args.repeatGrant.perUseDataAllocations > args.repeatGrant.cumulativeDataAllocations
  )) {
    return decisionRefusal(ctx, args, 'forbidden', current, caller, commandDigest)
  }
  if (protectedLock && args.stepUp === undefined) {
    return decisionRefusal(ctx, args, 'step_up_required', current, caller, commandDigest)
  }
  if (protectedLock && caller.source === 'customer_request_agent' && args.stepUp?.approvalRef === undefined) {
    return decisionRefusal(ctx, args, 'step_up_required', current, caller, commandDigest)
  }
  if (protectedLock && caller.source === 'customer_request_agent') {
    const expectedAuthority: WorkTreeApprovalAuthority = args.stepUp?.authority ?? {
      kind: 'per_item',
      ...(workTreeNodeAuthorityAmount(target) === undefined ? {} : { amount: workTreeNodeAuthorityAmount(target) }),
    }
    const approval = await consumeWorkTreeApproval(ctx, {
      approvalRef: args.stepUp?.approvalRef ?? '',
      ownerId: caller.ownerId,
      credentialId: caller.credentialId ?? '',
      projectId: args.projectId,
      nodeId: args.nodeId,
      proposalDigest: args.proposalDigest,
      authority: expectedAuthority,
      receiptId,
      now,
    })
    if (approval.kind === 'refused') {
      return decisionRefusal(ctx, args, approval.code, current, caller, commandDigest)
    }
  }

  const disposition = args.kind === 'lock' ? 'locked' : args.kind === 'park' ? 'queued' : 'adjusted'
  const nextStatus = args.kind === 'lock' ? 'locked' : args.kind === 'park' ? 'queued' : 'ready'
  const nextTree = workTreeSchema.parse({
    ...snapshot,
    revision: snapshot.revision + 1,
    nodes: snapshot.nodes.map((node) => node.nodeId === args.nodeId
      ? { ...node, status: nextStatus, updatedAt: now }
      : node),
  })
  const commandSnapshot = stableJson(nextTree)
  await appendEvent(ctx, {
    current,
    generation: nextTree.generation,
    revision: nextTree.revision,
    kind: 'decision_proposed',
    operationKey: `work-tree:decision:${args.idempotencyKey}`,
    payloadDigest: commandDigest,
    payload: {
      decision: args.kind,
      targetNodeId: args.nodeId,
      proposalDigest: args.proposalDigest,
      ...(args.stepUp === undefined ? {} : { stepUp: args.stepUp }),
      ...(args.repeatGrant === undefined ? {} : { repeatGrant: args.repeatGrant }),
    },
    snapshot: nextTree,
    actor: caller,
  })
  await ctx.db.patch(current._id, {
    revision: nextTree.revision,
    snapshotJson: commandSnapshot,
    snapshotDigest: canonicalDigest(nextTree),
    updatedAt: now,
  })
  const permissionRef = args.repeatGrant === undefined
    ? undefined
    : (await persistWorkTreeRepeatPermission(ctx, {
      projectId: args.projectId,
      treeId: current.treeId,
      ownerId: caller.ownerId,
      principalId: caller.principalId,
      nodeId: args.nodeId,
      generation: nextTree.generation,
      revision: nextTree.revision,
      proposalDigest: args.proposalDigest,
      delegatedCredentialId: args.repeatGrant.delegatedCredentialId,
      validFrom: now,
      validUntil: args.repeatGrant.validUntil,
      perUseSpend: args.repeatGrant.perUseSpend,
      cumulativeSpend: args.repeatGrant.cumulativeSpend,
      occurrenceLimit: args.repeatGrant.occurrences,
      perUseDataAllocations: args.repeatGrant.perUseDataAllocations,
      cumulativeDataAllocations: args.repeatGrant.cumulativeDataAllocations,
      sourceReceiptId: receiptId,
    })).permissionRef
  const inserted = await ctx.db.insert('workTreeDecisionReceipts', {
    projectId: args.projectId,
    treeId: current.treeId,
    principalId: caller.principalId,
    ownerId: caller.ownerId,
    ...(caller.credentialId === undefined ? {} : { credentialId: caller.credentialId }),
    actorSource: caller.source,
    nodeId: args.nodeId,
    decision: args.kind,
    expectedGeneration: args.expectedGeneration,
    expectedRevision: args.expectedRevision,
    proposalDigest: args.proposalDigest,
    idempotencyKey: args.idempotencyKey,
    commandDigest,
    receiptId,
    ...(permissionRef === undefined ? {} : { permissionRef }),
    generation: nextTree.generation,
    revision: nextTree.revision,
    disposition,
    authorityJson: decisionAuthorityJson(args, caller),
    occurredAt: now,
    readbackProjectId: args.projectId,
    readbackRevision: nextTree.revision,
  })
  const stored = await ctx.db.get(inserted)
  if (stored === null) return decisionUnknown(args, nextTree, caller)
  return decisionReceipt(stored, 'accepted')
}

function decisionCommandDigest(args: WorkTreeDecisionArgs): string {
  return canonicalDigest({
    projectId: args.projectId,
    nodeId: args.nodeId,
    kind: args.kind,
    expectedGeneration: args.expectedGeneration,
    expectedRevision: args.expectedRevision,
    proposalDigest: args.proposalDigest,
    idempotencyKey: args.idempotencyKey,
    ...(args.stepUp === undefined ? {} : { stepUp: args.stepUp }),
    ...(args.repeatGrant === undefined ? {} : { repeatGrant: args.repeatGrant }),
  })
}
function decisionReceiptId(args: WorkTreeDecisionArgs, commandDigest: string): string {
  return `decision:${canonicalDigest({
    projectId: args.projectId,
    idempotencyKey: args.idempotencyKey,
    commandDigest,
  })}`
}

function decisionAuthorityJson(args: WorkTreeDecisionArgs, caller: WorkTreeCaller): string {
  return stableJson({
    principalId: caller.principalId,
    source: caller.source,
    ...(args.stepUp === undefined
      ? { approval: 'not_required_or_missing' }
      : { approvalKind: args.stepUp.approvalKind, acknowledgedConsequence: true }),
  })
}

function decisionReceipt(
  receipt: WorkTreeDecisionReceiptDoc,
  kind: 'accepted' | 'replayed',
): Record<string, unknown> {
  return {
    kind,
    decision: receipt.decision,
    projectId: receipt.projectId,
    nodeId: receipt.nodeId,
    receiptId: receipt.receiptId,
    generation: receipt.generation,
    revision: receipt.revision,
    disposition: receipt.disposition,
    ...(receipt.permissionRef === undefined ? {} : { permissionRef: receipt.permissionRef }),
    ...(receipt.actorSource === undefined ? {} : { actor: { source: receipt.actorSource } }),
    occurredAt: receipt.occurredAt,
    readback: { projectId: receipt.readbackProjectId, revision: receipt.readbackRevision },
  }
}

function decisionRefusedReceipt(receipt: WorkTreeDecisionReceiptDoc): Record<string, unknown> {
  return {
    kind: 'refused',
    decision: receipt.decision,
    projectId: receipt.projectId,
    nodeId: receipt.nodeId,
    receiptId: receipt.receiptId,
    generation: receipt.generation,
    revision: receipt.revision,
    disposition: receipt.disposition,
    refusalCode: receipt.refusalCode,
    ...(receipt.actorSource === undefined ? {} : { actor: { source: receipt.actorSource } }),
    occurredAt: receipt.occurredAt,
    readback: { projectId: receipt.readbackProjectId, revision: receipt.readbackRevision },
  }
}

async function decisionRefusal(
  ctx: WorkTreeMutationContext,
  args: WorkTreeDecisionArgs,
  refusalCode: 'stale_fence' | 'forbidden' | 'not_found' | 'digest_mismatch' | 'step_up_required' | 'live_money_gate_open' | 'stripe_setup_required' | WorkTreeApprovalRefusalCode,
  current: WorkTreeDoc | null | undefined,
  caller: WorkTreeCaller | undefined,
  commandDigest?: string,
  persist = true,
): Promise<Record<string, unknown>> {
  const generation = current?.generation ?? args.expectedGeneration
  const revision = current?.revision ?? args.expectedRevision
  if (current === undefined || current === null || caller === undefined) {
    return {
      kind: 'refused',
      decision: args.kind,
      projectId: args.projectId,
      nodeId: args.nodeId,
      receiptId: `refused:${canonicalDigest({ ...args, serviceAuth: undefined, guestAssertion: undefined, refusalCode })}`,
      generation,
      revision,
      disposition: 'unchanged',
      refusalCode,
      occurredAt: Date.now(),
      readback: { projectId: args.projectId, revision },
    }
  }
  const digest = commandDigest ?? decisionCommandDigest(args)
  const receiptId = `refused:${canonicalDigest({
    projectId: args.projectId,
    idempotencyKey: args.idempotencyKey,
    commandDigest: digest,
    refusalCode,
  })}`
  const refusal = {
    kind: 'refused' as const,
    decision: args.kind,
    projectId: args.projectId,
    nodeId: args.nodeId,
    receiptId,
    generation,
    revision,
    disposition: 'unchanged' as const,
    refusalCode,
    actor: { source: caller.source },
    occurredAt: Date.now(),
    readback: { projectId: args.projectId, revision },
  }
  if (!persist || refusalCode === 'forbidden') return refusal
  const inserted = await ctx.db.insert('workTreeDecisionReceipts', {
    projectId: args.projectId,
    treeId: current.treeId,
    principalId: caller.principalId,
    ownerId: caller.ownerId,
    ...(caller.credentialId === undefined ? {} : { credentialId: caller.credentialId }),
    actorSource: caller.source,
    nodeId: args.nodeId,
    decision: args.kind,
    expectedGeneration: args.expectedGeneration,
    expectedRevision: args.expectedRevision,
    proposalDigest: args.proposalDigest,
    idempotencyKey: args.idempotencyKey,
    commandDigest: digest,
    receiptId,
    generation,
    revision,
    disposition: 'unchanged',
    refusalCode,
    authorityJson: decisionAuthorityJson(args, caller),
    occurredAt: refusal.occurredAt,
    readbackProjectId: args.projectId,
    readbackRevision: revision,
  })
  const stored = await ctx.db.get(inserted)
  return stored === null ? refusal : decisionRefusedReceipt(stored)
}

function decisionUnknown(
  args: WorkTreeDecisionArgs,
  tree: WorkTree,
  caller: WorkTreeCaller,
): Record<string, unknown> {
  return {
    kind: 'unknown',
    decision: args.kind,
    projectId: args.projectId,
    nodeId: args.nodeId,
    receiptId: `unknown:${args.idempotencyKey}`,
    generation: tree.generation,
    revision: tree.revision,
    disposition: 'unchanged',
    actor: { source: caller.source },
    occurredAt: Date.now(),
    readback: { projectId: args.projectId, revision: tree.revision },
  }
}


function parseVerb(value: unknown): GardenerVerb {
  const parsed = gardenerVerbSchema.safeParse(value)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    if (first?.code === 'too_big' && first.path[0] === 'children') {
      throw new GardenerVerbError('work_tree_children_limit', parsed.error)
    }
    if (first?.code === 'too_big' && first.path[0] === 'options') {
      throw new GardenerVerbError('work_tree_options_limit', parsed.error)
    }
    throw new GardenerVerbError('work_tree_verb_invalid', parsed.error)
  }
  return parsed.data
}

function parseSnapshot(snapshotJson: string): WorkTree {
  try {
    return workTreeSchema.parse(JSON.parse(snapshotJson))
  } catch (error) {
    throw new GardenerVerbError('work_tree_verb_invalid', error)
  }
}

async function findCurrentTree(ctx: WorkTreeMutationContext, projectId: string): Promise<WorkTreeDoc | null> {
  return await ctx.db
    .query('workTrees')
    .withIndex('by_projectId', (query) => query.eq('projectId', projectId))
    .unique()
}

async function currentTree(ctx: WorkTreeMutationContext, projectId: string): Promise<WorkTreeDoc> {
  const tree = await ctx.db
    .query('workTrees')
    .withIndex('by_projectId', (query) => query.eq('projectId', projectId))
    .unique()
  if (tree === null) throw new GardenerVerbError('work_tree_target_not_found')
  return tree
}

async function replayEvent(
  ctx: WorkTreeMutationContext,
  projectId: string,
  operationKey: string,
  payloadDigest: string,
): Promise<WorkTreeApplyReceipt | null> {
  const event = await ctx.db
    .query('workTreeEvents')
    .withIndex('by_projectId_and_operationKey', (query) =>
      query.eq('projectId', projectId).eq('operationKey', operationKey))
    .unique()
  if (event === null) return null
  if (event.payloadDigest !== payloadDigest) {
    throw new GardenerVerbError('work_tree_operation_conflict')
  }
  const current = await currentTree(ctx, projectId)
  return receipt(
    parseSnapshot(current.snapshotJson),
    projectId,
    event.operationKey,
    event.seq,
    event.kind as GardenerEventKind,
    true,
  )
}

async function appendEvent(
  ctx: WorkTreeMutationContext,
  input: {
    current: WorkTreeDoc
    generation: number
    revision: number
    kind: GardenerEventKind
    operationKey: string
    payloadDigest: string
    payload: Readonly<Record<string, unknown>>
    snapshot: WorkTree
    actor?: WorkTreeCaller
  },
): Promise<{ seq: number; kind: GardenerEventKind }> {
  const previous = await ctx.db
    .query('workTreeEvents')
    .withIndex('by_treeId_and_seq', (query) => query.eq('treeId', input.current.treeId))
    .order('desc')
    .first()
  const seq = (previous?.seq ?? 0) + 1
  if (seq > MAX_WORK_TREE_EVENTS) throw new GardenerVerbError('work_tree_event_limit')
  const payloadJson = stableJson({
    ...input.payload,
    snapshotJson: stableJson(input.snapshot),
  })
  if (encoder.encode(payloadJson).byteLength > MAX_WORK_TREE_EVENT_PAYLOAD_BYTES) {
    throw new GardenerVerbError('work_tree_snapshot_too_large')
  }
  await ctx.db.insert('workTreeEvents', {
    projectId: input.current.projectId,
    treeId: input.current.treeId,
    generation: input.generation,
    revision: input.revision,
    seq,
    kind: input.kind,
    operationKey: input.operationKey,
    payloadJson,
    payloadDigest: input.payloadDigest,
    ...(input.actor === undefined ? {} : {
      principalId: input.actor.principalId,
      ownerId: input.actor.ownerId,
      ...(input.actor.credentialId === undefined ? {} : { credentialId: input.actor.credentialId }),
      actorSource: input.actor.source,
    }),
    at: Date.now(),
  })
  return { seq, kind: input.kind }
}

function receipt(
  tree: WorkTree,
  projectId: string,
  operationKey: string,
  seq: number,
  kind: GardenerEventKind,
  replayed: boolean,
): WorkTreeApplyReceipt {
  return {
    kind: replayed ? 'replayed' : 'applied',
    replayed,
    projectId,
    tree,
    operationKey,
    seq,
    event: { kind, operationKey, seq },
  }
}

function stableJson(value: unknown): string {
  if (!isBoundedJsonValue(value)) throw new GardenerVerbError('work_tree_verb_invalid')
  return stableStringify(value)
}

function parseJson(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (!isRecord(parsed)) {
    throw new GardenerVerbError('work_tree_verb_invalid')
  }
  return parsed
}


type WorkTreeCreateInput = Readonly<{
  idempotencyKey: string
  charterText: string
  lineage: WorkTreeLineage
  guestAssertion?: string
  serviceAuth?: CustomerRequestServiceAssertion
}>

type WorkTreePrincipalResolution =
  | Readonly<{ kind: 'accepted'; principal: WorkTreePrincipal; caller: WorkTreeCaller }>
  | Readonly<{
      kind: 'refused'
      code:
        | 'authentication_required'
        | 'lineage_not_found'
        | 'lineage_forbidden'
        | 'lineage_revision_conflict'
        | 'lineage_conflict'
    }>

async function createWorkTree(
  ctx: WorkTreeMutationContext,
  args: WorkTreeCreateInput,
): Promise<Record<string, unknown>> {
  const idempotencyKey = args.idempotencyKey.trim()
  const charterText = args.charterText.trim()
  if (idempotencyKey.length === 0 || charterText.length === 0) {
    return { kind: 'refused', code: 'lineage_conflict', replayed: false }
  }

  const resolved = await resolveWorkTreePrincipal(
    ctx,
    args.lineage,
    args.serviceAuth,
    args.guestAssertion,
    charterText,
    {
      idempotencyKey,
      charterText,
      lineage: args.lineage,
    },
  )
  if (resolved.kind === 'refused') return { kind: 'refused', code: resolved.code, replayed: false }
  const principal = resolved.principal
  const caller = resolved.caller
  const lineageJson = stableJson(principal.lineage)
  const lineageDigest = canonicalDigest(principal.lineage)
  const payloadDigest = canonicalDigest({
    principalId: principal.principalId,
    idempotencyKey,
    charterText,
    lineage: principal.lineage,
  })
  const creationOperationKey = `work-tree:create:${canonicalDigest({
    principalId: principal.principalId,
    idempotencyKey,
  })}`

  // Routed Customer Request identity is shared across human and delegated
  // principals. Standalone identity deliberately remains principal-scoped.
  const existingByLineage = principal.lineage.kind === 'customer_request'
    ? await ctx.db
      .query('workTrees')
      .withIndex('by_ownerId_and_lineageDigest', (query) =>
        query.eq('ownerId', principal.ownerId).eq('lineageDigest', lineageDigest))
      .unique()
    : await ctx.db
      .query('workTrees')
      .withIndex('by_principalId_and_lineageDigest', (query) =>
        query.eq('principalId', principal.principalId).eq('lineageDigest', lineageDigest))
      .unique()
  if (existingByLineage !== null) {
    const existingTree = parseSnapshot(existingByLineage.snapshotJson)
    if (existingTree.charterText !== charterText) {
      return {
        kind: 'refused',
        code: principal.lineage.kind === 'customer_request'
          || existingByLineage.createIdempotencyKey !== idempotencyKey
          ? 'lineage_conflict'
          : 'idempotency_conflict',
        replayed: false,
      }
    }
    return await replayCreate(ctx, existingByLineage, 'work_tree_resumed')
  }

  const existingByKey = await ctx.db
    .query('workTrees')
    .withIndex('by_principalId_and_createIdempotencyKey', (query) =>
      query.eq('principalId', principal.principalId).eq('createIdempotencyKey', idempotencyKey))
    .unique()
  if (existingByKey !== null) {
    if (existingByKey.createPayloadDigest !== payloadDigest) {
      return { kind: 'refused', code: 'idempotency_conflict', replayed: false }
    }
    return await replayCreate(ctx, existingByKey, 'work_tree_resumed')
  }

  const now = Date.now()
  const projectId = `project:${nanoid()}`
  const treeId = `tree:${nanoid()}`
  const rootNodeId = `node:${nanoid()}`
  const tree = workTreeSchema.parse({
    format: 'ae.work-tree:v1',
    treeId,
    projectId,
    generation: 1,
    revision: 1,
    charterText,
    nodes: [{
      format: 'ae.work-node:v1',
      nodeId: rootNodeId,
      kind: 'package',
      title: charterText.slice(0, 200),
      status: 'fog',
      dependsOn: [],
      priority: 0,
      authorityRef: `authority:${canonicalDigest({ projectId, treeId, scope: 'work-tree-root' })}`,
      evidenceRefs: [],
      createdAt: now,
      updatedAt: now,
    }],
  })
  const snapshotJson = stableJson(tree)
  await ctx.db.insert('workTrees', {
    projectId,
    treeId,
    principalId: principal.principalId,
    ownerId: principal.ownerId,
    lineageJson,
    lineageDigest,
    createIdempotencyKey: idempotencyKey,
    createPayloadDigest: payloadDigest,
    creationOperationKey,
    generation: tree.generation,
    revision: tree.revision,
    snapshotJson,
    snapshotDigest: canonicalDigest(tree),
    createdAt: now,
    updatedAt: now,
  })
  await ctx.db.insert('workTreeEvents', {
    projectId,
    treeId,
    generation: tree.generation,
    revision: tree.revision,
    seq: 1,
    kind: 'created',
    operationKey: creationOperationKey,
    payloadJson: stableJson({
      principalId: principal.principalId,
      lineageJson,
      lineage: principal.lineage,
      createIdempotencyKey: idempotencyKey,
      snapshotJson,
    }),
    payloadDigest,
    principalId: caller.principalId,
    ownerId: caller.ownerId,
    ...(caller.credentialId === undefined ? {} : { credentialId: caller.credentialId }),
    actorSource: caller.source,
    at: now,
  })
  const created = await currentTreeForRead(ctx, projectId)
  return await acceptedCreate(ctx, created)
}
async function inspectWorkTree(
  ctx: WorkTreeReadContext,
  projectId: string,
  guestAssertion?: string,
  serviceAuth?: CustomerRequestServiceAssertion,
): Promise<Record<string, unknown>> {
  const caller = await resolveWorkTreeCaller(ctx, serviceAuth, guestAssertion, 'workTree.inspect', { projectId })
  if (caller === null) return { kind: 'refused', code: 'authentication_required' }
  const tree = await ctx.db
    .query('workTrees')
    .withIndex('by_projectId', (query) => query.eq('projectId', projectId))
    .unique()
  if (tree === null) return { kind: 'refused', code: 'not_found' }
  if (!principalMayInspect(tree, caller)) {
    return { kind: 'refused', code: 'forbidden' }
  }
  return { kind: 'accepted', readback: await workTreeReadback(ctx, tree) }
}

async function resolveWorkTreePrincipal(
  ctx: WorkTreeMutationContext,
  lineage: WorkTreeLineage,
  serviceAuth: CustomerRequestServiceAssertion | undefined,
  guestAssertion: string | undefined,
  charterText: string,
  command: Record<string, unknown>,
): Promise<WorkTreePrincipalResolution> {
  const caller = await resolveWorkTreeCaller(ctx, serviceAuth, guestAssertion, 'workTree.create', command)
  if (caller === null) return { kind: 'refused', code: 'authentication_required' }
  if (lineage.kind === 'standalone') {
    return {
      kind: 'accepted',
      principal: { principalId: caller.principalId, ownerId: caller.ownerId, lineage },
      caller,
    }
  }
  if (!Number.isSafeInteger(lineage.revision) || lineage.revision < 1
    || lineage.requestRef.trim().length === 0
    || lineage.routeGenerationRef.trim().length === 0
    || lineage.routeRef.trim().length === 0) {
    return { kind: 'refused', code: 'lineage_conflict' }
  }

  // Resolve the request head first, then its exact immutable revision. These
  // source rows fence both the current request revision and the WorkTree
  // charter before any effect is considered.
  const request = await ctx.db
    .query('customerRequestV2Heads')
    .withIndex('by_requestId', (query) => query.eq('requestId', lineage.requestRef))
    .unique()
  if (request === null) return { kind: 'refused', code: 'lineage_not_found' }
  if (request.currentRevision !== lineage.revision) {
    return { kind: 'refused', code: 'lineage_revision_conflict' }
  }

  // Customer Request agent principals are the source-owned account binding
  // for requests created under a delegated key. Human requests are accepted
  // only by their exact authenticated principal; no caller-supplied owner
  // identifier can widen that binding.
  const requestPrincipal = await ctx.db
    .query('customerRequestAgentPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', request.principalId))
    .unique()
  const requestOwnerId = requestPrincipal?.ownerId
    ?? (request.principalId === caller.principalId ? caller.ownerId : undefined)
  if (requestOwnerId === undefined || requestOwnerId !== caller.ownerId) {
    return { kind: 'refused', code: 'lineage_forbidden' }
  }
  const revision = await ctx.db
    .query('customerRequestV2Revisions')
    .withIndex('by_requestId_and_requestRevision', (query) =>
      query.eq('requestId', lineage.requestRef).eq('requestRevision', lineage.revision))
    .unique()
  if (revision === null) return { kind: 'refused', code: 'lineage_conflict' }
  const snapshot = revision.aggregate.snapshot
  const isLegacyResubmit = Object.prototype.hasOwnProperty.call(revision.aggregate.plan, 'routes')
  if (revision.aggregate.aggregateDigest !== request.currentAggregateDigest
    || revision.requestId !== lineage.requestRef
    || revision.requestRevision !== lineage.revision
    || snapshot.requestId !== lineage.requestRef
    || snapshot.revision !== lineage.revision
    || snapshot.principalId !== request.principalId
    || snapshot.delegatedAgentId !== request.delegatedAgentId
    || snapshot.intent.trim() !== charterText
    || isLegacyResubmit) {
    return { kind: 'refused', code: 'lineage_conflict' }
  }


  // The generation head and immutable generation are both checked. Reading
  // the exact row through its ordered index bounds the lookup before route
  // membership is evaluated.
  const generationHead = await ctx.db
    .query('customerRequestV2RoutePlanHeads')
    .withIndex('by_requestId', (query) => query.eq('requestId', lineage.requestRef))
    .unique()
  if (generationHead === null
    || generationHead.currentRequestRevision !== lineage.revision
    || generationHead.currentGenerationRef !== lineage.routeGenerationRef) {
    return { kind: 'refused', code: 'lineage_conflict' }
  }
  const generation = await ctx.db
    .query('customerRequestV2RoutePlanGenerations')
    .withIndex('by_requestId_and_generationRef', (query) =>
      query.eq('requestId', lineage.requestRef).eq('generationRef', lineage.routeGenerationRef))
    .unique()
  const routeGeneration = generation?.routeGeneration
  if (generation === null
    || routeGeneration === undefined
    || generation.requestRevision !== lineage.revision
    || generation.generationRef !== lineage.routeGenerationRef
    || generation.generation !== generationHead.currentGeneration
    || generation.generationDigest !== generationHead.currentGenerationDigest
    || routeGeneration.requestId !== lineage.requestRef
    || routeGeneration.requestRevision !== lineage.revision
    || routeGeneration.generationRef !== lineage.routeGenerationRef
    || routeGeneration.generation !== generationHead.currentGeneration
    || routeGeneration.generationDigest !== generationHead.currentGenerationDigest) {
    return { kind: 'refused', code: 'lineage_conflict' }
  }
  const route = routeGeneration.routes.find((candidate) => (
    customerRouteRef(lineage.routeGenerationRef, candidate.routePlanId) === lineage.routeRef
  ))
  if (route === undefined
    || route.requestId !== lineage.requestRef
    || route.requestRevision !== lineage.revision
    || route.registrySnapshotDigest !== routeGeneration.registrySnapshotDigest) {
    return { kind: 'refused', code: 'lineage_conflict' }
  }

  return {
    kind: 'accepted',
    principal: { principalId: caller.principalId, ownerId: requestOwnerId, lineage },
    caller,
  }
}
type WorkTreeClaimInput = Readonly<{
  projectId: string
  idempotencyKey: string
  guestAssertion: string
}>

async function claimWorkTree(
  ctx: WorkTreeMutationContext,
  args: WorkTreeClaimInput,
): Promise<Record<string, unknown>> {
  const projectId = args.projectId.trim()
  const idempotencyKey = args.idempotencyKey.trim()
  const identity = await ctx.auth.getUserIdentity()
  const principalId = identity?.tokenIdentifier
  const ownerId = identity?.subject
  if (projectId.length === 0 || idempotencyKey.length === 0
    || identity === null
    || typeof principalId !== 'string' || principalId.length === 0
    || typeof ownerId !== 'string' || ownerId.length === 0) {
    return { kind: 'refused', code: 'authentication_required', replayed: false }
  }
  const guestKey = readBrowserGuestSigningKey({
    env: env as Record<string, string | undefined>,
  })
  if (guestKey === undefined) return { kind: 'refused', code: 'authentication_required', replayed: false }
  const guest = await verifyBrowserGuestAssertion(
    guestKey,
    args.guestAssertion,
    { env: env as Record<string, string | undefined> },
  )
  if (guest === undefined) return { kind: 'refused', code: 'authentication_required', replayed: false }
  const current = await findCurrentTree(ctx, projectId)
  if (current === null) return { kind: 'refused', code: 'not_found', replayed: false }
  const claimPayloadDigest = canonicalDigest({
    contract: 'ae.work-tree-claim:v1',
    projectId,
    idempotencyKey,
    guestPrincipalId: guest.principalId,
    ownerId,
    principalId,
  })
  const claimOperationKey = `work-tree:claim:${canonicalDigest({ projectId, idempotencyKey })}`
  if (current.claimIdempotencyKey !== undefined) {
    if (current.claimIdempotencyKey === idempotencyKey
      && current.claimPayloadDigest === claimPayloadDigest
      && current.claimOperationKey === claimOperationKey
      && current.ownerId === ownerId
      && current.principalId === principalId) {
      return await replayClaim(ctx, current)
    }
    return {
      kind: 'refused',
      code: current.ownerId === ownerId ? 'claim_conflict' : 'forbidden',
      replayed: false,
    }
  }
  if (current.principalId !== guest.principalId || current.ownerId !== guest.principalId) {
    return { kind: 'refused', code: 'forbidden', replayed: false }
  }
  const caller: WorkTreeCaller = {
    principalId,
    ownerId,
    credentialId: principalId,
    tokenIdentifier: principalId,
    source: 'human_source',
  }
  const snapshot = parseSnapshot(current.snapshotJson)
  await appendEvent(ctx, {
    current,
    generation: current.generation,
    revision: current.revision,
    kind: 'claimed',
    operationKey: claimOperationKey,
    payloadDigest: claimPayloadDigest,
    payload: {
      previousGuestPrincipalId: guest.principalId,
      ownerId,
      principalId,
      idempotencyKey,
    },
    snapshot,
    actor: caller,
  })
  await ctx.db.patch(current._id, {
    principalId,
    ownerId,
    claimIdempotencyKey: idempotencyKey,
    claimPayloadDigest,
    claimOperationKey,
    claimedAt: Date.now(),
    updatedAt: Date.now(),
  })
  const claimed = await currentTreeForRead(ctx, projectId)
  return await acceptedClaim(ctx, claimed)
}

async function acceptedClaim(
  ctx: WorkTreeReadContext,
  tree: WorkTreeDoc,
): Promise<Record<string, unknown>> {
  return {
    kind: 'accepted',
    code: 'work_tree_claimed',
    replayed: false,
    readback: await workTreeReadback(ctx, tree),
    receipt: await claimReceipt(ctx, tree),
  }
}

async function replayClaim(
  ctx: WorkTreeReadContext,
  tree: WorkTreeDoc,
): Promise<Record<string, unknown>> {
  const accepted = await acceptedClaim(ctx, tree)
  return { ...accepted, kind: 'replayed', replayed: true }
}

async function claimReceipt(
  ctx: WorkTreeReadContext,
  tree: WorkTreeDoc,
): Promise<Record<string, unknown>> {
  const claimOperationKey = tree.claimOperationKey
  if (claimOperationKey === undefined || tree.claimIdempotencyKey === undefined
    || tree.claimPayloadDigest === undefined) {
    throw new Error('work_tree_claim_receipt_missing')
  }
  const event = await ctx.db
    .query('workTreeEvents')
    .withIndex('by_projectId_and_operationKey', (query) =>
      query.eq('projectId', tree.projectId).eq('operationKey', claimOperationKey))
    .unique()
  if (event === null || event.kind !== 'claimed') throw new Error('work_tree_claim_event_missing')
  return {
    receiptRef: `work-tree-claim:${canonicalDigest({
      projectId: tree.projectId,
      treeId: tree.treeId,
      operationKey: event.operationKey,
      payloadDigest: event.payloadDigest,
    })}`,
    projectId: tree.projectId,
    treeId: tree.treeId,
    operationKey: tree.claimIdempotencyKey,
    event: { kind: 'claimed', operationKey: event.operationKey, seq: event.seq },
    ...(event.actorSource === undefined ? {} : { actor: { source: event.actorSource } }),
    generation: tree.generation,
    revision: tree.revision,
    payloadDigest: event.payloadDigest,
  }
}

async function resolveWorkTreeCaller(
  ctx: WorkTreeReadContext,
  serviceAuth: CustomerRequestServiceAssertion | undefined,
  guestAssertion: string | undefined,
  operation: 'workTree.create' | 'workTree.inspect' | 'workTree.apply' | 'workTree.decide',
  command: Record<string, unknown>,
): Promise<WorkTreeCaller | null> {
  const requiredScope = operation === 'workTree.create'
    ? 'work_trees:create'
    : operation === 'workTree.inspect'
      ? 'work_trees:inspect'
      : operation === 'workTree.apply'
        ? 'work_trees:apply'
        : 'work_trees:decide'
  if (serviceAuth !== undefined) {
    if (!serviceAuth.scopes.includes(requiredScope)) return null
    const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
    if (key === undefined || key.length < 32) return null
    const verified = await verifyCustomerRequestServiceAssertion({
      key,
      operation,
      command: command as never,
      assertion: serviceAuth,
    })
    if (!verified) return null
    return {
      principalId: serviceAuth.principalId,
      ownerId: serviceAuth.ownerId,
      credentialId: serviceAuth.credentialId,
      source: 'customer_request_agent',
    }
  }
  const identity = await ctx.auth.getUserIdentity()
  if (identity !== null && typeof identity.tokenIdentifier === 'string' && identity.tokenIdentifier.length > 0) {
    return {
      principalId: identity.tokenIdentifier,
      ownerId: typeof identity.subject === 'string' && identity.subject.length > 0
        ? identity.subject
        : identity.tokenIdentifier,
      credentialId: identity.tokenIdentifier,
      tokenIdentifier: identity.tokenIdentifier,
      source: 'human_source',
    }
  }
  if (guestAssertion !== undefined) {
    const guestKey = readBrowserGuestSigningKey({
      env: env as Record<string, string | undefined>,
    })
    if (guestKey !== undefined) {
      const guest = await verifyBrowserGuestAssertion(
        guestKey,
        guestAssertion,
        { env: env as Record<string, string | undefined> },
      )
      if (guest !== undefined) {
        return {
          principalId: guest.principalId,
          ownerId: guest.principalId,
          credentialId: guest.principalId,
          source: 'browser_guest',
        }
      }
    }
  }
  return null
}

function callerMayOperate(tree: WorkTreeDoc, caller: WorkTreeCaller): boolean {
  if (tree.principalId === caller.principalId) return true
  if (caller.source === 'browser_guest' || tree.principalId.startsWith('browser_guest:')) return false
  return tree.ownerId === caller.ownerId
}

function principalMayInspect(tree: WorkTreeDoc, caller: WorkTreeCaller): boolean {
  return callerMayOperate(tree, caller)
}


async function currentTreeForRead(ctx: WorkTreeMutationContext, projectId: string): Promise<WorkTreeDoc> {
  const tree = await ctx.db
    .query('workTrees')
    .withIndex('by_projectId', (query) => query.eq('projectId', projectId))
    .unique()
  if (tree === null) throw new Error('work_tree_creation_not_persisted')
  return tree
}

async function acceptedCreate(
  ctx: WorkTreeReadContext,
  tree: WorkTreeDoc,
): Promise<Record<string, unknown>> {
  const readback = await workTreeReadback(ctx, tree)
  const receipt = await creationReceipt(ctx, tree)
  return {
    kind: 'accepted',
    code: 'work_tree_created',
    replayed: false,
    readback,
    receipt,
  }
}

async function replayCreate(
  ctx: WorkTreeReadContext,
  tree: WorkTreeDoc,
  code: 'work_tree_created' | 'work_tree_resumed',
): Promise<Record<string, unknown>> {
  return {
    kind: 'replayed',
    code,
    replayed: true,
    readback: await workTreeReadback(ctx, tree),
    receipt: await creationReceipt(ctx, tree),
  }
}

async function creationReceipt(
  ctx: WorkTreeReadContext,
  tree: WorkTreeDoc,
): Promise<Record<string, unknown>> {
  const event = await ctx.db
    .query('workTreeEvents')
    .withIndex('by_projectId_and_operationKey', (query) =>
      query.eq('projectId', tree.projectId).eq('operationKey', tree.creationOperationKey))
    .unique()
  if (event === null || event.kind !== 'created' || event.seq !== 1) {
    throw new Error('work_tree_creation_event_missing')
  }
  return {
    receiptRef: `work-tree-creation:${canonicalDigest({
      projectId: tree.projectId,
      treeId: tree.treeId,
      operationKey: tree.creationOperationKey,
      payloadDigest: event.payloadDigest,
    })}`,
    projectId: tree.projectId,
    treeId: tree.treeId,
    operationKey: tree.createIdempotencyKey,
    event: { kind: 'created', operationKey: event.operationKey, seq: event.seq },
    ...(event.actorSource === undefined ? {} : { actor: { source: event.actorSource } }),
    lineage: parseLineage(tree.lineageJson),
    generation: tree.generation,
    revision: tree.revision,
    payloadDigest: event.payloadDigest,
  }
}

async function workTreeReadback(
  ctx: WorkTreeReadContext,
  tree: WorkTreeDoc,
): Promise<Record<string, unknown>> {
  const events = await ctx.db
    .query('workTreeEvents')
    .withIndex('by_treeId_and_seq', (query) => query.eq('treeId', tree.treeId))
    .order('asc')
    .take(MAX_WORK_TREE_EVENTS + 1)
  const decisionReceipts = await ctx.db
    .query('workTreeDecisionReceipts')
    .withIndex('by_projectId_and_occurredAt', (query) => query.eq('projectId', tree.projectId))
    .order('desc')
    .take(65)
  return {
    projectId: tree.projectId,
    treeId: tree.treeId,
    lineage: parseLineage(tree.lineageJson),
    generation: tree.generation,
    revision: tree.revision,
    tree: parseSnapshot(tree.snapshotJson),
    events: events.slice(0, MAX_WORK_TREE_EVENTS).map((event) => {
      const targetNodeId = event.kind === 'decision_proposed'
        ? parseJson(event.payloadJson).targetNodeId
        : undefined
      return {
        kind: event.kind,
        operationKey: event.operationKey,
        seq: event.seq,
        generation: event.generation,
        revision: event.revision,
        payloadDigest: event.payloadDigest,
        at: event.at,
        ...(event.actorSource === undefined ? {} : { actor: { source: event.actorSource } }),
        ...(typeof targetNodeId === 'string' && targetNodeId.length > 0 ? { targetNodeId } : {}),
      }
    }),
    receipts: decisionReceipts.slice(0, 64).map((receipt) =>
      receipt.refusalCode === undefined
        ? decisionReceipt(receipt, 'accepted')
        : decisionRefusedReceipt(receipt)),
    hasMoreEvents: events.length > MAX_WORK_TREE_EVENTS,
  }
}

function parseLineage(value: string): WorkTreeLineage {
  const parsed: unknown = JSON.parse(value)
  if (!isRecord(parsed) || (parsed.kind !== 'standalone' && parsed.kind !== 'customer_request')) {
    throw new Error('work_tree_lineage_invalid')
  }
  if (parsed.kind === 'standalone') return { kind: 'standalone' }
  if (typeof parsed.requestRef !== 'string'
    || typeof parsed.revision !== 'number'
    || !Number.isSafeInteger(parsed.revision)
    || parsed.revision < 1
    || typeof parsed.routeGenerationRef !== 'string'
    || typeof parsed.routeRef !== 'string'
    || parsed.requestRef.trim().length === 0
    || parsed.routeGenerationRef.trim().length === 0
    || parsed.routeRef.trim().length === 0) {
    throw new Error('work_tree_lineage_invalid')
  }
  return {
    kind: 'customer_request',
    requestRef: parsed.requestRef,
    revision: parsed.revision,
    routeGenerationRef: parsed.routeGenerationRef,
    routeRef: parsed.routeRef,
  }
}
