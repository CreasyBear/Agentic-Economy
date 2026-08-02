/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, describe, expect, it } from 'vitest'

import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { createSourceWriteAdmission, sourceWriteBodyDigest } from '../src/modules/security/source-write-admission'
import { studyJournalEventSchema, type StudyJournalEvent } from '../src/modules/study/public'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const studiesApi = anyApi.studies
if (studiesApi === undefined) throw new Error('study_api_missing')

function requireApiBinding<T>(binding: T | undefined, errorMessage: string): T {
  if (binding === undefined) throw new Error(errorMessage)
  return binding
}

const createStudy = requireApiBinding(studiesApi.create, 'study_create_missing')
const recordStudyEvent = requireApiBinding(studiesApi.recordEvent, 'study_record_event_missing')
const recordStudyResult = requireApiBinding(studiesApi.recordResult, 'study_record_result_missing')
const inspectStudy = requireApiBinding(studiesApi.getById, 'study_get_by_id_missing')

const SOURCE_WRITE_SECRET = 'study-journal-local-source-write-secret'
const SOURCE_REQUEST = {
  method: 'POST',
  origin: 'http://127.0.0.1:3024',
  pathname: '/api/study',
  bodyDigest: sourceWriteBodyDigest(undefined),
}

const sourceWrite = (operationKey: string, nonce = operationKey) => createSourceWriteAdmission({
  env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
  request: SOURCE_REQUEST,
  scope: 'study',
  operationKey,
  correlationId: operationKey,
  nonce,
})

const studyIdentity = {
  studyId: 'study:convex:one',
  projectId: 'project:convex',
  treeId: 'tree:convex',
  nodeId: 'study-node:convex',
  ownerSessionId: 'owner-session:convex',
  generation: 1,
  treeRevision: 3,
}
type WithoutDigest<Event> = Event extends unknown ? Omit<Event, 'digest'> : never
type UnsignedStudyJournalEvent = WithoutDigest<StudyJournalEvent>

const scanArtifact = {
  format: 'ae.study:v1' as const,
  studyId: studyIdentity.studyId,
  projectId: studyIdentity.projectId,
  treeId: studyIdentity.treeId,
  nodeId: studyIdentity.nodeId,
  status: 'scanning' as const,
  learnings: [],
  citations: [],
  followUpQuestions: [],
  qualityScore: 0,
  observedAt: 10_000,
  expiresAt: 10_000,
  revision: 1,
  evidenceClass: 'published_price' as const,
  quotes: [],
  topsis: null,
  excludedQuotes: [],
  rfxState: 'tender' as const,
}

function journalEvent(input: UnsignedStudyJournalEvent): StudyJournalEvent {
  return studyJournalEventSchema.parse({ ...input, digest: canonicalDigest(input) })
}

function scanStarted(operationKey = 'study:scan') {
  return journalEvent({
    type: 'scan_started',
    operationKey,
    projectId: studyIdentity.projectId,
    treeId: studyIdentity.treeId,
    nodeId: studyIdentity.nodeId,
    generation: studyIdentity.generation,
    revision: 1,
    treeRevision: studyIdentity.treeRevision,
    timestamp: 10_000,
    evidenceClass: 'published_price',
  })
}

function candidateObserved(operationKey: string, candidateRef: string) {
  return journalEvent({
    type: 'candidate_observed',
    operationKey,
    projectId: studyIdentity.projectId,
    treeId: studyIdentity.treeId,
    nodeId: studyIdentity.nodeId,
    generation: studyIdentity.generation,
    revision: 1,
    treeRevision: studyIdentity.treeRevision,
    timestamp: 10_100,
    evidenceClass: 'published_price',
    candidateRef,
    providerSlug: candidateRef.replace('service:', ''),
  })
}

function refusalAtRevision(revision: number, treeRevision: number, operationKey = 'study:refused') {
  return journalEvent({
    type: 'refused',
    operationKey,
    projectId: studyIdentity.projectId,
    treeId: studyIdentity.treeId,
    nodeId: studyIdentity.nodeId,
    generation: studyIdentity.generation,
    revision,
    treeRevision,
    timestamp: 10_200,
    evidenceClass: 'ae_sandbox_provider',
    code: 'provider_unknown',
    reason: 'The labelled development provider did not return a quote.',
  })
}

async function createFixtureStudy(backend: TestConvex<typeof schema>) {
  const event = scanStarted()
  return await backend.mutation(createStudy, {
    ...studyIdentity,
    operationKey: 'study:create',
    correlationId: 'study:create',
    artifactJson: JSON.stringify(scanArtifact),
    journalEventJson: JSON.stringify(event),
    createdAt: 10_000,
    updatedAt: 10_000,
    sourceWrite: sourceWrite('study:create'),
  })
}

describe('durable Study journal Convex seam', () => {
  const previousSecret = process.env.AE_SOURCE_WRITE_SECRET

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AE_SOURCE_WRITE_SECRET
    else process.env.AE_SOURCE_WRITE_SECRET = previousSecret
  })

  it('persists a labelled start event and returns chronology plus evidence on cold readback', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const created = await createFixtureStudy(backend)

    expect(created).toMatchObject({ kind: 'applied', replayed: false, study: { revision: 1, status: 'scanning' } })
    const read = await backend.query(inspectStudy, { studyId: studyIdentity.studyId, ownerSessionId: studyIdentity.ownerSessionId })
    expect(read?.journal).toEqual([expect.objectContaining({
      type: 'scan_started',
      evidenceClass: 'published_price',
      generation: 1,
      revision: 1,
      treeRevision: 3,
    })])
    expect(read?.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'study_created' }),
      expect.objectContaining({ kind: 'scan_started' }),
    ]))
    expect(read?.truncated).toBe(false)
  })
  it('returns a typed not_found for an omitted or unmatched owner session', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    await createFixtureStudy(backend)

    await expect(backend.query(inspectStudy, { studyId: studyIdentity.studyId }))
      .resolves.toEqual({ kind: 'not_found' })
    await expect(backend.query(inspectStudy, {
      studyId: studyIdentity.studyId,
      ownerSessionId: 'owner-session:other',
    })).resolves.toEqual({ kind: 'not_found' })

    const owner = backend.withIdentity({
      subject: 'owner-session:convex',
      issuer: 'https://identity.example',
      tokenIdentifier: studyIdentity.ownerSessionId,
    })
    await expect(owner.query(inspectStudy, { studyId: studyIdentity.studyId }))
      .resolves.toMatchObject({ study: { studyId: studyIdentity.studyId } })
  })

  it('replays identical events, refuses conflicting payloads, and fences stale revisions', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    await createFixtureStudy(backend)

    const event = candidateObserved('study:candidate', 'service:alpha')
    const args = {
      ...studyIdentity,
      expectedRevision: 1,
      operationKey: event.operationKey,
      correlationId: event.operationKey,
      eventJson: JSON.stringify(event),
      sourceWrite: sourceWrite(event.operationKey),
    }
    const applied = await backend.mutation(recordStudyEvent, args)
    const replayed = await backend.mutation(recordStudyEvent, {
      ...args,
      sourceWrite: sourceWrite(event.operationKey, 'study:candidate:retry'),
    })
    expect(applied).toMatchObject({ kind: 'applied', replayed: false })
    expect(replayed).toEqual({ ...applied, kind: 'replayed', replayed: true, study: null })

    const conflicting = candidateObserved(event.operationKey, 'service:beta')
    await expect(backend.mutation(recordStudyEvent, {
      ...args,
      eventJson: JSON.stringify(conflicting),
      sourceWrite: sourceWrite(event.operationKey, 'study:candidate:conflict'),
    })).rejects.toThrow('study_operation_conflict')

    await expect(backend.mutation(recordStudyEvent, {
      ...args,
      expectedRevision: 0,
      operationKey: 'study:stale',
      correlationId: 'study:stale',
      eventJson: JSON.stringify(candidateObserved('study:stale', 'service:gamma')),
      sourceWrite: sourceWrite('study:stale'),
    })).rejects.toThrow('study_revision_conflict')
    await expect(backend.mutation(recordStudyEvent, {
      ...args,
      generation: 2,
      operationKey: 'study:stale-generation',
      correlationId: 'study:stale-generation',
      eventJson: JSON.stringify(candidateObserved('study:stale-generation', 'service:gamma')),
      sourceWrite: sourceWrite('study:stale-generation'),
    })).rejects.toThrow('study_generation_conflict')


    const read = await backend.query(inspectStudy, { studyId: studyIdentity.studyId, ownerSessionId: studyIdentity.ownerSessionId })
    expect(read?.journal.map((entry: StudyJournalEvent) => entry.type)).toEqual(['scan_started', 'candidate_observed'])
    expect(read?.journal[1]).toMatchObject({ candidateRef: 'service:alpha', evidenceClass: 'published_price' })
  })

  it('stores a refused result as an append-only journal event and keeps its fence metadata', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    await createFixtureStudy(backend)
    const refusal = refusalAtRevision(2, 4)
    const resultArtifact = {
      ...scanArtifact,
      status: 'failed' as const,
      revision: 2,
      treeRevision: undefined,
      rfxState: 'award' as const,
    }
    const resultArgs = {
      ...studyIdentity,
      treeRevision: 4,
      expectedRevision: 1,
      operationKey: 'study:result',
      correlationId: 'study:result',
      artifactJson: JSON.stringify(resultArtifact),
      journalEventsJson: JSON.stringify([refusal]),
      at: 10_200,
      sourceWrite: sourceWrite('study:result'),
    }
    const recorded = await backend.mutation(recordStudyResult, resultArgs)
    expect(recorded).toMatchObject({ kind: 'applied', replayed: false, study: { revision: 2, status: 'failed', treeRevision: 4 } })
    const replayed = await backend.mutation(recordStudyResult, {
      ...resultArgs,
      sourceWrite: sourceWrite('study:result', 'study:result:retry'),
    })
    expect(replayed).toMatchObject({ kind: 'replayed', replayed: true, study: null })

    const read = await backend.query(inspectStudy, { studyId: studyIdentity.studyId, ownerSessionId: studyIdentity.ownerSessionId })
    expect(read?.journal).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'refused',
        code: 'provider_unknown',
        evidenceClass: 'ae_sandbox_provider',
        generation: 1,
        revision: 2,
        treeRevision: 4,
      }),
    ]))
    expect(read?.study).toMatchObject({ revision: 2, status: 'failed', treeRevision: 4 })
  })
})
