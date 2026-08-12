/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, describe, expect, it } from 'vitest'

import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  createSourceWriteAdmission,
  sourceWriteCommandBodyDigest,
  sourceWriteCommandDigest,
  sourceWriteRequestFromAdmission,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
} from '../src/modules/security/source-write-admission'
import {
  studyArtifactSchema,
  studyJournalEventSchema,
  type StudyJournalEvent,
} from '../src/modules/study/public'
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
  initiatorOrigin: 'http://127.0.0.1:3024',
  targetOrigin: 'http://127.0.0.1:3024',
  targetPath: '/api/study',
  targetQuery: '',
} as const

async function signedStudyArgs<T extends { operationKey: string; correlationId: string }>(
  command: T,
  nonce = command.operationKey,
): Promise<T & { sourceWriteRequest: SourceWriteAdmissionRequest; sourceWrite: SourceWriteAdmission }> {
  const sourceWrite = await createSourceWriteAdmission({
    env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
    request: {
      ...SOURCE_REQUEST,
      bodyDigest: sourceWriteCommandBodyDigest(command),
    },
    scope: 'study',
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    commandDigest: sourceWriteCommandDigest(command),
    nonce,
  })
  return {
    ...command,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  }
}

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

function refusalAtRevision(
  revision: number,
  treeRevision: number,
  operationKey = 'study:refused',
  evidenceClass: StudyJournalEvent['evidenceClass'] = 'published_price',
) {
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
    evidenceClass,
    code: 'provider_unknown',
    reason: 'The labelled development provider did not return a quote.',
  })
}

async function createFixtureStudy(backend: TestConvex<typeof schema>) {
  const event = scanStarted()
  return await backend.mutation(createStudy, await signedStudyArgs({
    ...studyIdentity,
    operationKey: 'study:create',
    correlationId: 'study:create',
    artifactJson: JSON.stringify(scanArtifact),
    journalEventJson: JSON.stringify(event),
    createdAt: 10_000,
    updatedAt: 10_000,
  }))
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
  it('reads a durable historical sandbox artifact while new writes reject it', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const historicalArtifact = {
      ...scanArtifact,
      studyId: 'study:convex:historical',
      projectId: 'project:convex:historical',
      treeId: 'tree:convex:historical',
      nodeId: 'study-node:convex:historical',
      evidenceClass: 'ae_sandbox_provider' as const,
      environment: 'MOCK/DEVELOPMENT ONLY' as const,
    }
    const artifactJson = JSON.stringify(historicalArtifact)
    await backend.run(async (ctx) => {
      await ctx.db.insert('studies', {
        studyId: historicalArtifact.studyId,
        projectId: historicalArtifact.projectId,
        treeId: historicalArtifact.treeId,
        nodeId: historicalArtifact.nodeId,
        ownerSessionId: 'owner-session:convex:historical',
        generation: 1,
        revision: historicalArtifact.revision,
        treeRevision: 3,
        status: historicalArtifact.status,
        artifactJson,
        artifactDigest: canonicalDigest(historicalArtifact),
        createdAt: 10_000,
        updatedAt: 10_000,
      })
    })

    const read = await backend.query(inspectStudy, {
      studyId: historicalArtifact.studyId,
      ownerSessionId: 'owner-session:convex:historical',
    })
    const decoded = studyArtifactSchema.parse(JSON.parse(read?.study?.artifactJson ?? 'null'))
    expect(decoded).toMatchObject({
      studyId: historicalArtifact.studyId,
      evidenceClass: 'ae_sandbox_provider',
      environment: 'MOCK/DEVELOPMENT ONLY',
    })
  })

  it('rejects sandbox evidence from new study artifact and journal writes', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const sandboxArtifact = {
      ...scanArtifact,
      studyId: 'study:convex:sandbox-write',
      evidenceClass: 'ae_sandbox_provider' as const,
    }
    await expect(backend.mutation(createStudy, await signedStudyArgs({
      ...studyIdentity,
      studyId: sandboxArtifact.studyId,
      operationKey: 'study:sandbox:create',
      correlationId: 'study:sandbox:create',
      artifactJson: JSON.stringify(sandboxArtifact),
    }))).rejects.toThrow()

    await createFixtureStudy(backend)
    const sandboxEvent = refusalAtRevision(2, 4, 'study:sandbox:event', 'ae_sandbox_provider')
    await expect(backend.mutation(recordStudyEvent, await signedStudyArgs({
      ...studyIdentity,
      expectedRevision: 1,
      operationKey: sandboxEvent.operationKey,
      correlationId: sandboxEvent.operationKey,
      eventJson: JSON.stringify(sandboxEvent),
    }))).rejects.toThrow('study_evidence_class_invalid')
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
    const command = {
      ...studyIdentity,
      expectedRevision: 1,
      operationKey: event.operationKey,
      correlationId: event.operationKey,
      eventJson: JSON.stringify(event),
    }
    const args = await signedStudyArgs(command)
    const applied = await backend.mutation(recordStudyEvent, args)
    const replayed = await backend.mutation(recordStudyEvent, await signedStudyArgs(command, 'study:candidate:retry'))
    expect(applied).toMatchObject({ kind: 'applied', replayed: false })
    expect(replayed).toEqual({ ...applied, kind: 'replayed', replayed: true, study: null })

    const conflicting = candidateObserved(event.operationKey, 'service:beta')
    await expect(backend.mutation(recordStudyEvent, await signedStudyArgs({
      ...command,
      eventJson: JSON.stringify(conflicting),
    }, 'study:candidate:conflict'))).rejects.toThrow('study_operation_conflict')

    await expect(backend.mutation(recordStudyEvent, await signedStudyArgs({
      ...command,
      expectedRevision: 0,
      operationKey: 'study:stale',
      correlationId: 'study:stale',
      eventJson: JSON.stringify(candidateObserved('study:stale', 'service:gamma')),
    }))).rejects.toThrow('study_revision_conflict')
    await expect(backend.mutation(recordStudyEvent, await signedStudyArgs({
      ...command,
      generation: 2,
      operationKey: 'study:stale-generation',
      correlationId: 'study:stale-generation',
      eventJson: JSON.stringify(candidateObserved('study:stale-generation', 'service:gamma')),
    }))).rejects.toThrow('study_generation_conflict')


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
    const resultCommand = {
      ...studyIdentity,
      treeRevision: 4,
      expectedRevision: 1,
      operationKey: 'study:result',
      correlationId: 'study:result',
      artifactJson: JSON.stringify(resultArtifact),
      journalEventsJson: JSON.stringify([refusal]),
      at: 10_200,
    }
    const resultArgs = await signedStudyArgs(resultCommand)
    const recorded = await backend.mutation(recordStudyResult, resultArgs)
    expect(recorded).toMatchObject({ kind: 'applied', replayed: false, study: { revision: 2, status: 'failed', treeRevision: 4 } })
    const replayed = await backend.mutation(recordStudyResult, await signedStudyArgs(resultCommand, 'study:result:retry'))
    expect(replayed).toMatchObject({ kind: 'replayed', replayed: true, study: null })

    const read = await backend.query(inspectStudy, { studyId: studyIdentity.studyId, ownerSessionId: studyIdentity.ownerSessionId })
    expect(read?.journal).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'refused',
        code: 'provider_unknown',
        evidenceClass: 'published_price',
        generation: 1,
        revision: 2,
        treeRevision: 4,
      }),
    ]))
    expect(read?.study).toMatchObject({ revision: 2, status: 'failed', treeRevision: 4 })
  })
})
