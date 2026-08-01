/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, describe, expect, it } from 'vitest'

import { createSourceWriteAdmission, sourceWriteBodyDigest } from '../src/modules/security/source-write-admission'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const decisionMapsApi = anyApi.decisionMaps!
const SOURCE_WRITE_SECRET = 'decision-map-local-source-write-secret'
const OWNER_SESSION_ID = 'session:owner'
const SOURCE_REQUEST = {
  method: 'POST',
  origin: 'http://127.0.0.1:3024',
  pathname: '/api/answer/turn',
  bodyDigest: sourceWriteBodyDigest(undefined),
}

const draft = {
  version: 'decisionMap_v1' as const,
  goalText: 'Choose the first wedding planning step',
  summary: 'A shallow map of the decisions that matter first.',
  assumptions: [{ id: 'date', label: 'Wedding date', value: 'Next October', source: 'inferred' as const }],
  nodes: [
    { id: 'venue', kind: 'area' as const, label: 'Venue', parentId: null, status: 'queued' as const, dependsOn: [], constraintRefs: [] },
    {
      id: 'guest-list', kind: 'decision' as const, label: 'Guest list', parentId: 'venue', status: 'ready' as const,
      dependsOn: [], constraintRefs: ['date'],
      options: [
        { id: 'small', label: 'Keep it small', summary: 'Prioritise a smaller celebration.' },
        { id: 'full', label: 'Invite all 120', summary: 'Plan around the full guest count.' },
      ],
      recommendedOptionId: 'full', reason: 'The guest count is already known.', unlocks: [], parkTrigger: 'Park until the guest count changes.',
    },
    {
      id: 'venue-style', kind: 'decision' as const, label: 'Venue style', parentId: 'venue', status: 'queued' as const,
      dependsOn: ['guest-list'], constraintRefs: [],
      options: [
        { id: 'indoor', label: 'Indoor', summary: 'Keep weather out of the plan.' },
        { id: 'outdoor', label: 'Outdoor', summary: 'Use an outdoor setting.' },
      ],
      recommendedOptionId: 'indoor', reason: 'The guest count should shape venue capacity first.', unlocks: [], parkTrigger: 'Park until the guest list is settled.',
    },
    { id: 'food', kind: 'area' as const, label: 'Food', status: 'fog' as const, dependsOn: [], constraintRefs: [] },
    { id: 'music', kind: 'area' as const, label: 'Music', status: 'fog' as const, dependsOn: [], constraintRefs: [] },
  ],
}

const operation = (operationKey: string, nonce = operationKey) => createSourceWriteAdmission({
  env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
  request: SOURCE_REQUEST,
  scope: 'answer_thread',
  operationKey,
  correlationId: operationKey,
  nonce,
})

function createArgs(operationKey = 'map:create', nonce = operationKey) {
  return {
    projectId: 'project:one',
    threadId: 'thread:one',
    ownerSessionId: OWNER_SESSION_ID,
    draftJson: JSON.stringify(draft),
    operationKey,
    correlationId: operationKey,
    sourceWrite: operation(operationKey, nonce),
    createdAt: 1_000,
  }
}

async function createMap(backend: TestConvex<typeof schema>) {
  return await backend.mutation(decisionMapsApi.create!, createArgs())
}

describe('decision map Convex store', () => {
  const previousSecret = process.env.AE_SOURCE_WRITE_SECRET

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AE_SOURCE_WRITE_SECRET
    else process.env.AE_SOURCE_WRITE_SECRET = previousSecret
  })

  it('creates and reads one canonical snapshot, then replays an exact choice', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const created = await createMap(backend)
    expect(created).toMatchObject({ kind: 'applied', replayed: false, snapshot: { generation: 0, revision: 1 } })

    const read = await backend.query(decisionMapsApi.getByThread!, { threadId: 'thread:one', ownerSessionId: OWNER_SESSION_ID })
    expect(read?.snapshot).toEqual(created.snapshot)
    expect(read?.events).toHaveLength(1)
    await expect(backend.query(decisionMapsApi.getByThread!, {
      threadId: 'thread:one',
      ownerSessionId: 'session:other',
    })).resolves.toBeNull()
    const forbiddenKey = 'map:forbidden'
    await expect(backend.mutation(decisionMapsApi.recordChoice!, {
      projectId: 'project:one',
      threadId: 'thread:one',
      ownerSessionId: 'session:other',
      expectedGeneration: 0,
      expectedRevision: 1,
      decisionId: 'guest-list',
      choice: 'lock',
      operationKey: forbiddenKey,
      correlationId: forbiddenKey,
      sourceWrite: operation(forbiddenKey),
    })).rejects.toThrow('decision_map_forbidden')

    const choice = {
      projectId: 'project:one', threadId: 'thread:one', expectedGeneration: 0, expectedRevision: 1,
      ownerSessionId: OWNER_SESSION_ID,
      decisionId: 'guest-list', choice: 'lock' as const, operationKey: 'map:choice', at: 2_000,
    }
    const applied = await backend.mutation(decisionMapsApi.recordChoice!, {
      ...choice, correlationId: choice.operationKey, sourceWrite: operation(choice.operationKey, 'choice-one'),
    })
    const replayed = await backend.mutation(decisionMapsApi.recordChoice!, {
      ...choice, correlationId: choice.operationKey, sourceWrite: operation(choice.operationKey, 'choice-two'),
    })
    expect(applied).toMatchObject({ kind: 'applied', replayed: false, snapshot: { revision: 2 } })
    expect(replayed).toEqual({ ...applied, kind: 'replayed', replayed: true })
  })

  it('refuses stale fences and returns the exact constraint ripple', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    await createMap(backend)
    const choiceKey = 'map:choice:stale'
    await backend.mutation(decisionMapsApi.recordChoice!, {
      projectId: 'project:one', threadId: 'thread:one', expectedGeneration: 0, expectedRevision: 1,
      ownerSessionId: OWNER_SESSION_ID,
      decisionId: 'guest-list', choice: 'lock', operationKey: choiceKey, correlationId: choiceKey,
      sourceWrite: operation(choiceKey),
    })

    const staleKey = 'map:stale'
    await expect(backend.mutation(decisionMapsApi.recordChoice!, {
      projectId: 'project:one', threadId: 'thread:one', expectedGeneration: 0, expectedRevision: 1,
      ownerSessionId: OWNER_SESSION_ID,
      decisionId: 'guest-list', choice: 'lock', operationKey: staleKey, correlationId: staleKey,
      sourceWrite: operation(staleKey),
    })).rejects.toThrow('That decision map revision is stale.')

    const changeKey = 'map:constraint'
    const changed = await backend.mutation(decisionMapsApi.recordConstraintChange!, {
      projectId: 'project:one', threadId: 'thread:one', expectedGeneration: 0, expectedRevision: 2,
      ownerSessionId: OWNER_SESSION_ID,
      assumptionId: 'date', value: 'Next November', operationKey: changeKey, correlationId: changeKey,
      sourceWrite: operation(changeKey),
    })
    expect(changed).toMatchObject({
      kind: 'applied', snapshot: { generation: 1, revision: 3 },
      changedDetail: 'Updated Wedding date from “Next October” to “Next November”.',
      affectedNodeIds: ['guest-list', 'venue-style'],
      reopenedNodeIds: ['guest-list'],
    })
  })

  it('accepts the largest valid authored map within the bounded event envelope', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const text = 'x'.repeat(500)
    const label = 'L'.repeat(240)
    const areas = ['area-1', 'area-2', 'area-3'].map((id) => ({
      id,
      kind: 'area' as const,
      label,
      summary: text,
      status: 'queued' as const,
      dependsOn: [],
      constraintRefs: [],
    }))
    const decisions = Array.from({ length: 3 }, (_, index) => ({
      id: `decision-${index + 1}`,
      kind: 'decision' as const,
      label,
      summary: text,
      status: index === 0 ? 'ready' as const : 'queued' as const,
      parentId: areas[0]!.id,
      dependsOn: index === 0 ? [] : ['decision-1'],
      constraintRefs: ['date'],
      options: Array.from({ length: 4 }, (__, optionIndex) => ({
        id: `option-${index + 1}-${optionIndex + 1}`,
        label,
        summary: text,
      })),
      recommendedOptionId: `option-${index + 1}-1`,
      reason: text,
      unlocks: [],
      parkTrigger: text,
    }))
    const assumptions = Array.from({ length: 5 }, (_, index) => ({
      id: index === 0 ? 'date' : `assumption-${index + 1}`,
      label,
      value: text,
      source: 'inferred' as const,
    }))
    const draftJson = JSON.stringify({ ...draft, goalText: text, summary: text, assumptions, nodes: [...areas, ...decisions] })
    const created = await backend.mutation(decisionMapsApi.create!, { ...createArgs('map:large'), draftJson })
    expect(created).toMatchObject({ kind: 'applied', snapshot: { revision: 1 } })
    const read = await backend.query(decisionMapsApi.getByThread!, {
      threadId: 'thread:one',
      ownerSessionId: OWNER_SESSION_ID,
    })
    expect(new TextEncoder().encode(read!.events[0]!.payloadJson).byteLength).toBeGreaterThan(32_768)
  })

  it('bounds event reads even when the journal contains more rows', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    await createMap(backend)
    await backend.run(async (ctx) => {
      for (let seq = 2; seq <= 200; seq += 1) {
        await ctx.db.insert('decisionMapEvents', {
          projectId: 'project:one', threadId: 'thread:one', generation: 0, revision: 1, seq,
          kind: 'choice_recorded', operationKey: `test:${seq}`, payloadJson: '{}', payloadDigest: `digest:${seq}`, at: seq,
        })
      }
    })
    const read = await backend.query(decisionMapsApi.getByThread!, { threadId: 'thread:one', ownerSessionId: OWNER_SESSION_ID })
    expect(read?.events).toHaveLength(128)
    expect(read?.events.at(-1)?.seq).toBe(128)
  })
})
