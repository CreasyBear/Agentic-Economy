import { mutationGeneric, queryGeneric } from 'convex/server'
import type { MutationCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { v } from 'convex/values'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '../src/modules/common/stable-hash'

import {
  decisionMapChoiceInputSchema,
  decisionMapConstraintChangeInputSchema,
  decisionMapDraftSchema,
  decisionMapSnapshotSchema,
  applyDecisionMapChoice,
  applyDecisionMapConstraintChange,
  authorDecisionMapSnapshot,
  type DecisionMapChoiceInput,
  type DecisionMapConstraintChangeInput,
  type DecisionMapSnapshot,
} from '../src/modules/decision-map/public'
import { requireSourceWrite, sourceWriteArgs, type SourceWriteArgs } from './sourceWriteAdmission'
import { isRecord } from './inquiryRuntimeDbHelpers'

const MAX_DECISION_MAP_EVENTS = 128
const MAX_EVENT_PAYLOAD_BYTES = 131_072
const encoder = new TextEncoder()

const decisionMapMutationArgs = {
  projectId: v.string(),
  ownerSessionId: v.string(),
  threadId: v.string(),
  operationKey: v.string(),
  correlationId: v.optional(v.string()),
  ...sourceWriteArgs,
}

export const getByThread = queryGeneric({
  args: { threadId: v.string(), ownerSessionId: v.string() },
  handler: async (ctx, args) => {
    const map = await ctx.db
      .query('decisionMaps')
      .withIndex('by_threadId', (query) => query.eq('threadId', args.threadId))
      .unique()
    if (map === null) return null
    if (map.ownerSessionId !== args.ownerSessionId) return null

    const snapshot = parseSnapshot(map.snapshotJson)
    const events = await ctx.db
      .query('decisionMapEvents')
      .withIndex('by_threadId_and_seq', (query) => query.eq('threadId', args.threadId))
      .order('asc')
      .take(MAX_DECISION_MAP_EVENTS)

    return { snapshot, events }
  },
})

export const create = mutationGeneric({
  args: {
    ...decisionMapMutationArgs,
    draftJson: v.string(),
    generation: v.optional(v.number()),
    revision: v.optional(v.number()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireDecisionMapSourceWrite(ctx, args)
    const generation = args.generation ?? 0
    const revision = args.revision ?? 1
    const createdAt = args.createdAt ?? Date.now()
    const updatedAt = args.updatedAt ?? args.now ?? createdAt
    assertGeneration(generation)
    assertPositiveInteger(revision, 'decision_map_revision_invalid')
    assertFiniteNumber(createdAt, 'decision_map_created_at_invalid')
    assertFiniteNumber(updatedAt, 'decision_map_updated_at_invalid')

    const draft = decisionMapDraftSchema.parse(parseJson(args.draftJson))
    const payload = { projectId: args.projectId, threadId: args.threadId, ownerSessionId: args.ownerSessionId, generation, revision, draft }
    const payloadDigest = digest(payload)
    const replay = await replayEvent(ctx, args.operationKey, payloadDigest)
    if (replay !== null) return replay

    const existing = await ctx.db
      .query('decisionMaps')
      .withIndex('by_threadId', (query) => query.eq('threadId', args.threadId))
      .unique()
    if (existing !== null) throw new Error('decision_map_already_exists')

    const snapshot = parseSnapshot(authorDecisionMapSnapshot({
      projectId: args.projectId,
      threadId: args.threadId,
      generation,
      revision,
      createdAt,
      updatedAt,
      now: updatedAt,
      draft,
    }))
    if (snapshot.projectId !== args.projectId || snapshot.threadId !== args.threadId) {
      throw new Error('decision_map_identity_mismatch')
    }

    const snapshotJson = canonicalJson(snapshot)
    const snapshotDigest = digest(snapshot)
    await ctx.db.insert('decisionMaps', {
      projectId: args.projectId,
      threadId: args.threadId,
      ownerSessionId: args.ownerSessionId,
      generation: snapshot.generation,
      revision: snapshot.revision,
      snapshotJson,
      snapshotDigest,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    })

    const event = await appendEvent(ctx, {
      projectId: args.projectId,
      threadId: args.threadId,
      generation: snapshot.generation,
      revision: snapshot.revision,
      kind: 'draft_created',
      operationKey: args.operationKey,
      payloadDigest,
      payload: { ...payload, snapshot },
      at: snapshot.createdAt,
    })
    return mutationResult(snapshot, event)
  },
})

export const recordChoice = mutationGeneric({
  args: {
    ...decisionMapMutationArgs,
    expectedGeneration: v.number(),
    expectedRevision: v.number(),
    decisionId: v.string(),
    choice: v.union(v.literal('lock'), v.literal('park')),
    at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireDecisionMapSourceWrite(ctx, args)
    const input = decisionMapChoiceInputSchema.parse({
      projectId: args.projectId,
      threadId: args.threadId,
      expectedGeneration: args.expectedGeneration,
      expectedRevision: args.expectedRevision,
      decisionId: args.decisionId,
      choice: args.choice,
      operationKey: args.operationKey,
      ...(args.at === undefined ? {} : { at: args.at }),
    })
    const payloadDigest = digest(input)
    const current = await currentMap(ctx, args.threadId, args.projectId)
    assertMapOwner(current, args.ownerSessionId)
    const replay = await replayEvent(ctx, args.operationKey, payloadDigest)
    if (replay !== null) return replay
    const transition = applyDecisionMapChoice(parseSnapshot(current.snapshotJson), input)
    const snapshot = parseSnapshot(transitionSnapshot(transition))
    return await commitTransition(ctx, current, {
      snapshot,
      kind: transitionKind(transition, 'choice_recorded'),
      operationKey: args.operationKey,
      payloadDigest,
      payload: { input, transition: transitionPayload(transition), snapshot },
      at: args.at ?? Date.now(),
    })
  },
})

export const recordConstraintChange = mutationGeneric({
  args: {
    ...decisionMapMutationArgs,
    expectedGeneration: v.number(),
    expectedRevision: v.number(),
    assumptionId: v.string(),
    value: v.string(),
    at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireDecisionMapSourceWrite(ctx, args)
    const input = decisionMapConstraintChangeInputSchema.parse({
      projectId: args.projectId,
      threadId: args.threadId,
      expectedGeneration: args.expectedGeneration,
      expectedRevision: args.expectedRevision,
      assumptionId: args.assumptionId,
      value: args.value,
      operationKey: args.operationKey,
      ...(args.at === undefined ? {} : { at: args.at }),
    })
    const payloadDigest = digest(input)
    const current = await currentMap(ctx, args.threadId, args.projectId)
    assertMapOwner(current, args.ownerSessionId)
    const replay = await replayEvent(ctx, args.operationKey, payloadDigest)
    if (replay !== null) return replay
    const transition = applyDecisionMapConstraintChange(parseSnapshot(current.snapshotJson), input)
    const snapshot = parseSnapshot(transitionSnapshot(transition))
    return await commitTransition(ctx, current, {
      snapshot,
      kind: transitionKind(transition, 'constraint_changed'),
      operationKey: args.operationKey,
      payloadDigest,
      payload: { input, transition: transitionPayload(transition), snapshot },
      at: args.at ?? Date.now(),
    })
  },
})

type DecisionMapResult = {
  kind: 'applied' | 'replayed'
  snapshot: DecisionMapSnapshot
  replayed: boolean
  operationKey: string
  seq: number
  event: { kind: string; operationKey: string; seq: number }
  decisionRecord?: DecisionMapSnapshot['decisionRecords'][number]
  changedDetail?: string
  preservedNodeIds?: readonly string[]
  affectedNodeIds?: readonly string[]
  reopenedNodeIds?: readonly string[]
}

type DecisionMapDoc = Doc<'decisionMaps'>

async function requireDecisionMapSourceWrite(ctx: { db: unknown }, args: SourceWriteArgs): Promise<void> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'answer_thread')
  if (sourceWrite.kind === 'rejected') {
    throw new Error(`decision_map_source_write_rejected:${sourceWrite.reason}`)
  }
}
async function currentMap(ctx: MutationCtx, threadId: string, projectId: string): Promise<DecisionMapDoc> {
  const map = await ctx.db
    .query('decisionMaps')
    .withIndex('by_threadId', (query) => query.eq('threadId', threadId))
    .unique()
  if (map === null) throw new Error('decision_map_not_found')
  if (map.projectId !== projectId) throw new Error('decision_map_project_mismatch')
  return map
}
function assertMapOwner(map: DecisionMapDoc, ownerSessionId: string): void {
  if (map.ownerSessionId !== ownerSessionId) throw new Error('decision_map_forbidden')
}


async function commitTransition(
  ctx: MutationCtx,
  current: DecisionMapDoc,
  input: { snapshot: DecisionMapSnapshot; kind: string; operationKey: string; payloadDigest: string; payload: unknown; at: number },
): Promise<DecisionMapResult> {
  const snapshotJson = canonicalJson(input.snapshot)
  const snapshotDigest = digest(input.snapshot)
  await ctx.db.patch(current._id, {
    generation: input.snapshot.generation,
    revision: input.snapshot.revision,
    snapshotJson,
    snapshotDigest,
    updatedAt: input.snapshot.updatedAt,
  })
  const event = await appendEvent(ctx, {
    projectId: current.projectId,
    threadId: current.threadId,
    generation: input.snapshot.generation,
    revision: input.snapshot.revision,
    kind: input.kind,
    operationKey: input.operationKey,
    payloadDigest: input.payloadDigest,
    payload: input.payload,
    at: input.at,
  })
  return mutationResult(input.snapshot, event)
}

async function appendEvent(
  ctx: MutationCtx,
  input: {
    projectId: string
    threadId: string
    generation: number
    revision: number
    kind: string
    operationKey: string
    payloadDigest: string
    payload: unknown
    at: number
  },
): Promise<{ kind: string; operationKey: string; seq: number }> {
  const payloadJson = canonicalJson(input.payload)
  if (encoder.encode(payloadJson).byteLength > MAX_EVENT_PAYLOAD_BYTES) {
    throw new Error('decision_map_event_payload_too_large')
  }
  const previous = await ctx.db
    .query('decisionMapEvents')
    .withIndex('by_threadId_and_seq', (query) => query.eq('threadId', input.threadId))
    .order('desc')
    .first()
  const seq = (previous?.seq ?? 0) + 1
  if (seq > MAX_DECISION_MAP_EVENTS) throw new Error('decision_map_event_limit')

  await ctx.db.insert('decisionMapEvents', {
    projectId: input.projectId,
    threadId: input.threadId,
    generation: input.generation,
    revision: input.revision,
    seq,
    kind: input.kind,
    operationKey: input.operationKey,
    payloadJson,
    payloadDigest: input.payloadDigest,
    at: input.at,
  })
  return { kind: input.kind, operationKey: input.operationKey, seq }
}

async function replayEvent(
  ctx: MutationCtx,
  operationKey: string,
  payloadDigest: string,
): Promise<DecisionMapResult | null> {
  const event = await ctx.db
    .query('decisionMapEvents')
    .withIndex('by_operationKey', (query) => query.eq('operationKey', operationKey))
    .first()
  if (event === null) return null
  if (event.payloadDigest !== payloadDigest) throw new Error('operation_key_conflict')
  const payload = parseJson(event.payloadJson)
  const snapshot = parseSnapshot(readRecord(payload, 'snapshot'))
  const report = snapshot.lastChangeReport
  const decisionRecord = snapshot.decisionRecords.find((entry) => entry.operationKey === event.operationKey)
  return {
    kind: 'replayed',
    snapshot,
    replayed: true,
    operationKey: event.operationKey,
    seq: event.seq,
    ...(decisionRecord === undefined ? {} : { decisionRecord }),
    event: { kind: event.kind, operationKey: event.operationKey, seq: event.seq },
    ...(report === undefined ? {} : {
      changedDetail: report.changedDetail,
      preservedNodeIds: report.preservedNodeIds,
      affectedNodeIds: report.affectedNodeIds,
      reopenedNodeIds: report.reopenedNodeIds,
    }),
  }
}

function mutationResult(
  snapshot: DecisionMapSnapshot,
  event: { kind: string; operationKey: string; seq: number },
): DecisionMapResult {
  const report = snapshot.lastChangeReport
  const decisionRecord = snapshot.decisionRecords.at(-1)
  return {
    kind: 'applied',
    snapshot,
    replayed: false,
    operationKey: event.operationKey,
    seq: event.seq,
    event,
    ...(decisionRecord === undefined ? {} : { decisionRecord }),
    ...(report === undefined ? {} : {
      changedDetail: report.changedDetail,
      preservedNodeIds: report.preservedNodeIds,
      affectedNodeIds: report.affectedNodeIds,
      reopenedNodeIds: report.reopenedNodeIds,
    }),
  }
}

function parseSnapshot(value: unknown): DecisionMapSnapshot {
  return decisionMapSnapshotSchema.parse(typeof value === 'string' ? parseJson(value) : value)
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error('decision_map_json_invalid')
  }
}

function canonicalJson(value: unknown): string {
  return stableStringify(value as StableHashValue)
}

function digest(value: unknown): string {
  return canonicalDigest(value as StableHashValue)
}

function transitionSnapshot(value: unknown): unknown {
  if (isRecord(value) && 'snapshot' in value) return value.snapshot
  return value
}

function transitionKind(value: unknown, fallback: string): string {
  if (isRecord(value) && typeof value.eventKind === 'string') return value.eventKind
  return fallback
}

function transitionPayload(value: unknown): unknown {
  if (!isRecord(value)) return null
  if ('event' in value) return value.event
  if ('changeReport' in value) return value.changeReport
  if ('report' in value) return value.report
  return null
}

function readRecord(value: unknown, key: string): unknown {
  if (!isRecord(value) || !(key in value)) throw new Error('decision_map_replay_payload_invalid')
  return value[key]
}


function assertGeneration(value: number): void {
  if (!Number.isInteger(value) || value < 0) throw new Error('decision_map_generation_invalid')
}

function assertPositiveInteger(value: number, code: string): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(code)
}

function assertFiniteNumber(value: number, code: string): void {
  if (!Number.isFinite(value)) throw new Error(code)
}

export type { DecisionMapChoiceInput, DecisionMapConstraintChangeInput, DecisionMapSnapshot }
