import { mutationGeneric, queryGeneric } from 'convex/server'
import type { MutationCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { v } from 'convex/values'

import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '../src/modules/common/stable-hash'
import {
  studyJournalEventSchema,
  type StudyJournalEvent,
} from '../src/modules/study/convex'
import {
  studyWriteArtifactSchema,
  studyWriteEvidenceClassSchema,
  type StudyWriteArtifact,
} from '../src/modules/study/public'
import { requireSourceWrite, sourceWriteArgs, type SourceWriteArgs } from './sourceWriteAdmission'

const MAX_STUDY_EVENTS = 128
const MAX_EVENT_PAYLOAD_BYTES = 131_072
const encoder = new TextEncoder()

const studyMutationArgs = {
  studyId: v.string(),
  projectId: v.string(),
  treeId: v.optional(v.string()),
  nodeId: v.string(),
  ownerSessionId: v.optional(v.string()),
  generation: v.optional(v.number()),
  treeRevision: v.optional(v.number()),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
}

export const getById = queryGeneric({
  args: {
    studyId: v.string(),
    ownerSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const study = await ctx.db
      .query('studies')
      .withIndex('by_studyId', (query) => query.eq('studyId', args.studyId))
      .unique()
    if (study === null) return { kind: 'not_found' as const }

    const identity = await ctx.auth.getUserIdentity()
    const ownerSessionMatches = args.ownerSessionId !== undefined
      && study.ownerSessionId === args.ownerSessionId
    const identityMatches = identity !== null
      && study.ownerSessionId !== undefined
      && identity.tokenIdentifier === study.ownerSessionId
    if (!ownerSessionMatches && !identityMatches) return { kind: 'not_found' as const }

    const events = await ctx.db
      .query('studyEvents')
      .withIndex('by_studyId_and_seq', (query) => query.eq('studyId', args.studyId))
      .order('asc')
      .take(MAX_STUDY_EVENTS + 1)
    const boundedEvents = events.slice(0, MAX_STUDY_EVENTS)
    return {
      study,
      events: boundedEvents,
      journal: readJournalEvents(boundedEvents),
      truncated: events.length > MAX_STUDY_EVENTS,
      hasMoreEvents: events.length > MAX_STUDY_EVENTS,
    }
  },
})

export const create = mutationGeneric({
  args: {
    ...studyMutationArgs,
    artifactJson: v.string(),
    journalEventJson: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStudySourceWrite(ctx, args)
    const artifact = parseArtifact(args.artifactJson)
    assertArtifactIdentity(artifact, args.studyId, args.projectId, args.nodeId, args.treeId)
    const generation = args.generation ?? 1
    assertPositiveInteger(generation, 'study_generation_invalid')
    const treeRevision = args.treeRevision
    if (treeRevision !== undefined) assertPositiveInteger(treeRevision, 'study_tree_revision_invalid')
    const createdAt = args.createdAt ?? artifact.observedAt
    const updatedAt = args.updatedAt ?? createdAt
    assertFiniteNumber(createdAt, 'study_created_at_invalid')
    assertFiniteNumber(updatedAt, 'study_updated_at_invalid')
    const journalEvent = args.journalEventJson === undefined ? undefined : parseJournalEvent(args.journalEventJson)
    if (journalEvent !== undefined) {
      assertJournalIdentity(journalEvent, args, generation, artifact.revision)
    }
    const payload = {
      artifact,
      generation,
      ...(args.treeId === undefined ? {} : { treeId: args.treeId }),
      ...(treeRevision === undefined ? {} : { treeRevision }),
      projectId: args.projectId,
      nodeId: args.nodeId,
      studyId: args.studyId,
      ...(journalEvent === undefined ? {} : { journalEvent }),
    }
    const payloadDigest = digest(payload)
    const replay = await replayOperation(ctx, args.operationKey, payloadDigest)
    if (replay !== null) return replayResult(replay, true)

    const existing = await ctx.db
      .query('studies')
      .withIndex('by_studyId', (query) => query.eq('studyId', args.studyId))
      .unique()
    if (existing !== null) throw new Error('study_already_exists')

    const artifactJson = canonicalJson(artifact)
    const studyId = await ctx.db.insert('studies', {
      studyId: args.studyId,
      projectId: args.projectId,
      ...(args.treeId === undefined ? {} : { treeId: args.treeId }),
      nodeId: args.nodeId,
      ...(args.ownerSessionId === undefined ? {} : { ownerSessionId: args.ownerSessionId }),
      generation,
      revision: artifact.revision,
      ...(treeRevision === undefined ? {} : { treeRevision }),
      status: artifact.status,
      artifactJson,
      artifactDigest: digest(artifact),
      createdAt,
      updatedAt,
    })
    const event = await appendStudyEvent(ctx, {
      studyId: args.studyId,
      projectId: args.projectId,
      ...(args.treeId === undefined ? {} : { treeId: args.treeId }),
      nodeId: args.nodeId,
      generation,
      revision: artifact.revision,
      ...(treeRevision === undefined ? {} : { treeRevision }),
      kind: 'study_created',
      operationKey: args.operationKey,
      payloadDigest,
      payload,
      at: updatedAt,
    })
    if (journalEvent !== undefined) {
      await appendJournalEvent(ctx, {
        studyId: args.studyId,
        projectId: args.projectId,
        nodeId: args.nodeId,
        ...(args.treeId === undefined ? {} : { treeId: args.treeId }),
        generation,
        revision: artifact.revision,
        ...(treeRevision === undefined ? {} : { treeRevision }),
        event: journalEvent,
      })
    }
    return {
      kind: 'applied' as const,
      replayed: false,
      study: { ...studyWithoutId(studyId), ...readStudyIdentity(args, artifact, generation, createdAt, updatedAt) },
      event,
    }
  },
})

export const recordResult = mutationGeneric({
  args: {
    ...studyMutationArgs,
    expectedRevision: v.number(),
    artifactJson: v.string(),
    journalEventsJson: v.optional(v.string()),
    at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStudySourceWrite(ctx, args)
    const artifact = parseArtifact(args.artifactJson)
    assertArtifactIdentity(artifact, args.studyId, args.projectId, args.nodeId, args.treeId)
    const current = await currentStudy(ctx, args.studyId, args.projectId, args.nodeId)
    assertStudyOwner(current, args.ownerSessionId)
    if (args.treeId !== undefined && current.treeId !== args.treeId) throw new Error('study_tree_identity_mismatch')
    const journalEvents = args.journalEventsJson === undefined ? [] : parseJournalEvents(args.journalEventsJson)
    for (const event of journalEvents) assertJournalIdentity(event, args, current.generation, artifact.revision)
    const payload = {
      artifact,
      expectedRevision: args.expectedRevision,
      generation: current.generation,
      ...(args.treeId === undefined ? {} : { treeId: args.treeId }),
      ...(args.treeRevision === undefined ? {} : { treeRevision: args.treeRevision }),
      projectId: args.projectId,
      nodeId: args.nodeId,
      studyId: args.studyId,
      journalEvents,
    }
    const payloadDigest = digest(payload)
    const replay = await replayOperation(ctx, args.operationKey, payloadDigest)
    if (replay !== null) return replayResult(replay, true)
    if (current.revision !== args.expectedRevision) throw new Error('study_revision_conflict')
    if (artifact.revision <= current.revision) throw new Error('study_artifact_revision_invalid')
    if (args.generation !== undefined && args.generation !== current.generation) throw new Error('study_generation_conflict')
    if (args.treeRevision !== undefined && current.treeRevision !== undefined && args.treeRevision < current.treeRevision) {
      throw new Error('study_tree_revision_conflict')
    }
    const nextTreeRevision = args.treeRevision ?? current.treeRevision
    const at = args.at ?? artifact.observedAt
    assertFiniteNumber(at, 'study_event_at_invalid')
    const nextArtifactJson = canonicalJson(artifact)
    await ctx.db.patch('studies', current._id, {
      revision: artifact.revision,
      status: artifact.status,
      artifactJson: nextArtifactJson,
      artifactDigest: digest(artifact),
      ...(args.treeRevision === undefined ? {} : { treeRevision: args.treeRevision }),
      updatedAt: at,
    })
    const event = await appendStudyEvent(ctx, {
      studyId: args.studyId,
      projectId: args.projectId,
      ...(current.treeId === undefined ? {} : { treeId: current.treeId }),
      nodeId: args.nodeId,
      generation: current.generation,
      revision: artifact.revision,
      ...(nextTreeRevision === undefined ? {} : { treeRevision: nextTreeRevision }),
      kind: 'study_result_recorded',
      operationKey: args.operationKey,
      payloadDigest,
      payload,
      at,
    })
    for (const journalEvent of journalEvents) {
      await appendJournalEvent(ctx, {
        studyId: args.studyId,
        projectId: args.projectId,
        nodeId: args.nodeId,
        ...(current.treeId === undefined ? {} : { treeId: current.treeId }),
        generation: current.generation,
        revision: artifact.revision,
        ...(nextTreeRevision === undefined ? {} : { treeRevision: nextTreeRevision }),
        event: journalEvent,
      })
    }
    return {
      kind: 'applied' as const,
      replayed: false,
      study: { ...current, ...studyPatch(artifact, nextArtifactJson, at, args.treeRevision) },
      event,
    }
  },
})
export const recordEvent = mutationGeneric({
  args: {
    ...studyMutationArgs,
    expectedRevision: v.number(),
    eventJson: v.string(),
    at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStudySourceWrite(ctx, args)
    const current = await currentStudy(ctx, args.studyId, args.projectId, args.nodeId)
    assertStudyOwner(current, args.ownerSessionId)
    if (current.revision !== args.expectedRevision) throw new Error('study_revision_conflict')
    if (args.generation !== undefined && args.generation !== current.generation) throw new Error('study_generation_conflict')
    if (args.treeId !== undefined && current.treeId !== args.treeId) throw new Error('study_tree_identity_mismatch')
    const event = parseJournalEvent(args.eventJson)
    assertJournalIdentity(event, args, current.generation, current.revision)
    if (event.operationKey !== args.operationKey) throw new Error('study_operation_key_mismatch')
    const payloadDigest = digest(event)
    const replay = await replayOperation(ctx, args.operationKey, payloadDigest)
    if (replay !== null) return replayResult(replay, true)
    const at = args.at ?? event.timestamp
    const nextTreeRevision = args.treeRevision ?? current.treeRevision
    assertFiniteNumber(at, 'study_event_at_invalid')
    const appended = await appendJournalEvent(ctx, {
      studyId: args.studyId,
      projectId: args.projectId,
      ...(current.treeId === undefined ? {} : { treeId: current.treeId }),
      nodeId: args.nodeId,
      generation: current.generation,
      revision: current.revision,
      ...(nextTreeRevision === undefined ? {} : { treeRevision: nextTreeRevision }),
      event,
      at,
      payloadDigest,
    })
    return { kind: 'applied' as const, replayed: false, study: current, event: appended }
  },
})

type StudySourceWriteArgs = SourceWriteArgs & { operationKey: string; correlationId: string; sourceWrite?: unknown }

async function requireStudySourceWrite(ctx: { db: unknown }, args: StudySourceWriteArgs): Promise<void> {
  const result = await requireSourceWrite(ctx, args, 'study')
  if (result.kind === 'rejected') throw new Error(`study_source_write_rejected:${result.reason}`)
}

type StudyDoc = Doc<'studies'>
type StudyEventDoc = Doc<'studyEvents'>

type StudyMutationResult = Readonly<{
  kind: 'applied' | 'replayed'
  replayed: boolean
  study: unknown
  event: Readonly<{ kind: string; operationKey: string; seq: number }>
}>

async function currentStudy(
  ctx: MutationCtx,
  studyId: string,
  projectId: string,
  nodeId: string,
): Promise<StudyDoc> {
  const study = await ctx.db
    .query('studies')
    .withIndex('by_studyId', (query) => query.eq('studyId', studyId))
    .unique()
  if (study === null) throw new Error('study_not_found')
  if (study.projectId !== projectId || study.nodeId !== nodeId) throw new Error('study_identity_mismatch')
  return study
}

function assertStudyOwner(study: StudyDoc, ownerSessionId: string | undefined): void {
  if (ownerSessionId !== undefined && study.ownerSessionId !== ownerSessionId) throw new Error('study_forbidden')
}

async function appendStudyEvent(
  ctx: MutationCtx,
  input: Readonly<{
    studyId: string
    projectId: string
    treeId?: string
    nodeId: string
    generation: number
    revision: number
    treeRevision?: number
    kind: 'study_created' | 'study_result_recorded' | StudyJournalEvent['type']
    operationKey: string
    payloadDigest: string
    payload: unknown
    evidenceClass?: StudyJournalEvent['evidenceClass']
    at: number
  }>,
): Promise<Readonly<{ kind: string; operationKey: string; seq: number }>> {
  const payloadJson = canonicalJson(input.payload)
  if (encoder.encode(payloadJson).byteLength > MAX_EVENT_PAYLOAD_BYTES) throw new Error('study_event_payload_too_large')
  const existing = await ctx.db
    .query('studyEvents')
    .withIndex('by_studyId_and_seq', (query) => query.eq('studyId', input.studyId))
    .order('desc')
    .first()
  const seq = (existing?.seq ?? 0) + 1
  if (seq > MAX_STUDY_EVENTS) throw new Error('study_event_limit_reached')
  await ctx.db.insert('studyEvents', {
    studyId: input.studyId,
    projectId: input.projectId,
    ...(input.treeId === undefined ? {} : { treeId: input.treeId }),
    nodeId: input.nodeId,
    generation: input.generation,
    revision: input.revision,
    ...(input.treeRevision === undefined ? {} : { treeRevision: input.treeRevision }),
    seq,
    kind: input.kind,
    operationKey: input.operationKey,
    payloadJson,
    payloadDigest: input.payloadDigest,
    digest: input.payloadDigest,
    ...(input.evidenceClass === undefined ? {} : { evidenceClass: input.evidenceClass }),
    at: input.at,
    timestamp: input.at,
  })
  return { kind: input.kind, operationKey: input.operationKey, seq }
}

async function appendJournalEvent(
  ctx: MutationCtx,
  input: Readonly<{
    studyId: string
    projectId: string
    treeId?: string
    nodeId: string
    generation: number
    revision: number
    treeRevision?: number
    event: StudyJournalEvent
    at?: number
    payloadDigest?: string
  }>,
): Promise<Readonly<{ kind: string; operationKey: string; seq: number }>> {
  return appendStudyEvent(ctx, {
    studyId: input.studyId,
    projectId: input.projectId,
    ...(input.treeId === undefined ? {} : { treeId: input.treeId }),
    nodeId: input.nodeId,
    generation: input.generation,
    revision: input.revision,
    ...(input.treeRevision === undefined ? {} : { treeRevision: input.treeRevision }),
    kind: input.event.type,
    operationKey: input.event.operationKey,
    payloadDigest: input.payloadDigest ?? input.event.digest,
    payload: input.event,
    evidenceClass: input.event.evidenceClass,
    at: input.at ?? input.event.timestamp,
  })
}

async function replayOperation(
  ctx: MutationCtx,
  operationKey: string,
  payloadDigest: string,
): Promise<StudyEventDoc | null> {
  const event = await ctx.db
    .query('studyEvents')
    .withIndex('by_operationKey', (query) => query.eq('operationKey', operationKey))
    .unique()
  if (event === null) return null
  if (event.payloadDigest !== payloadDigest) throw new Error('study_operation_conflict')
  return event
}

function replayResult(event: StudyEventDoc, replayed: boolean): StudyMutationResult {
  return {
    kind: 'replayed',
    replayed,
    study: null,
    event: { kind: event.kind, operationKey: event.operationKey, seq: event.seq },
  }
}

function parseArtifact(value: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('study_artifact_json_invalid')
  }
  return studyWriteArtifactSchema.parse(parsed)
}

function assertWritableJournalEvidence(event: StudyJournalEvent): void {
  const evidenceClasses = [
    event.evidenceClass,
    ...(event.type === 'quote_received' ? [event.quote.evidenceClass] : []),
    ...(event.type === 'recommended' && event.recommendation.evidenceClass !== undefined
      ? [event.recommendation.evidenceClass]
      : []),
  ]
  if (evidenceClasses.some((value) => !studyWriteEvidenceClassSchema.safeParse(value).success)) {
    throw new Error('study_evidence_class_invalid')
  }
}

function parseJournalEvent(value: string): StudyJournalEvent {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('study_event_json_invalid')
  }
  const event = studyJournalEventSchema.parse(parsed)
  assertWritableJournalEvidence(event)
  const { digest: suppliedDigest, ...unsigned } = event
  if (digest(unsigned) !== suppliedDigest) throw new Error('study_event_digest_mismatch')
  return event
}

function parseJournalEvents(value: string): readonly StudyJournalEvent[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('study_events_json_invalid')
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_STUDY_EVENTS) throw new Error('study_events_invalid')
  return parsed.map((event) => parseJournalEvent(JSON.stringify(event)))
}

function readJournalEvents(events: readonly StudyEventDoc[]): readonly StudyJournalEvent[] {
  const journal: StudyJournalEvent[] = []
  for (const event of events) {
    const parsed = studyJournalEventSchema.safeParse(parseJson(event.payloadJson))
    if (parsed.success) journal.push(parsed.data)
  }
  return journal
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function assertJournalIdentity(
  event: StudyJournalEvent,
  args: { projectId: string; treeId?: string; nodeId: string; treeRevision?: number },
  generation: number,
  revision: number,
): void {
  if (
    event.projectId !== args.projectId
    || event.nodeId !== args.nodeId
    || (args.treeId !== undefined && event.treeId !== args.treeId)
    || event.generation !== generation
    || event.revision !== revision
    || (args.treeRevision !== undefined && event.treeRevision !== args.treeRevision)
  ) throw new Error('study_event_identity_mismatch')
}

function assertArtifactIdentity(
  artifact: StudyWriteArtifact,
  studyId: string,
  projectId: string,
  nodeId: string,
  treeId?: string,
): void {
  if (
    artifact.studyId !== studyId
    || artifact.projectId !== projectId
    || artifact.nodeId !== nodeId
    || (treeId !== undefined && artifact.treeId !== treeId)
  ) throw new Error('study_artifact_identity_mismatch')
}

function canonicalJson(value: unknown): string {
  return stableStringify(value as StableHashValue)
}

function digest(value: unknown): string {
  return canonicalDigest(value as StableHashValue)
}

function assertPositiveInteger(value: number, code: string): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(code)
}

function assertFiniteNumber(value: number, code: string): void {
  if (!Number.isFinite(value)) throw new Error(code)
}

function readStudyIdentity(
  args: {
    studyId: string
    projectId: string
    treeId?: string
    nodeId: string
    ownerSessionId?: string
    treeRevision?: number
  },
  artifact: StudyWriteArtifact,
  generation: number,
  createdAt: number,
  updatedAt: number,
): Readonly<Record<string, unknown>> {
  return {
    studyId: args.studyId,
    projectId: args.projectId,
    ...(args.treeId === undefined ? {} : { treeId: args.treeId }),
    nodeId: args.nodeId,
    ...(args.ownerSessionId === undefined ? {} : { ownerSessionId: args.ownerSessionId }),
    generation,
    revision: artifact.revision,
    ...(args.treeRevision === undefined ? {} : { treeRevision: args.treeRevision }),
    status: artifact.status,
    artifactJson: canonicalJson(artifact),
    artifactDigest: digest(artifact),
    createdAt,
    updatedAt,
  }
}

function studyWithoutId(id: unknown): Readonly<Record<string, unknown>> {
  return { _id: id }
}

function studyPatch(
  artifact: StudyWriteArtifact,
  artifactJson: string,
  updatedAt: number,
  treeRevision?: number,
): Readonly<Record<string, unknown>> {
  return {
    revision: artifact.revision,
    status: artifact.status,
    artifactJson,
    artifactDigest: digest(artifact),
    ...(treeRevision === undefined ? {} : { treeRevision }),
    updatedAt,
  }
}
