import { afterEach, describe, expect, it } from 'vitest'

import { runAnswerToolCall } from '@/modules/answer-thread/internal/tool-runner'
import { toAnswerSource } from '@/modules/answer/public'
import {
  buildPublicThreadProjection,
  type AnswerThreadRecord,
  type AnswerTurnRecord,
} from '@/modules/answer-thread/public'
import {
  appendAnswerTurnWithToolCalls,
  readTurnToolCalls,
  setAnswerThreadPortForTests,
  setAnswerToolCallPortForTests,
} from '@/modules/answer-thread/testing'
import type { AnswerToolCallRecord } from '@/modules/answer-thread/tooling'
import { HarnessRunLoop } from '@/modules/harness/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

const offeringV2Business = {
  schemaVersion: 'public-business-catalog-api:v2',
  businessId: 'business:profile-pair',
  slug: 'profile-pair',
  name: 'Profile Pair',
  category: 'Mixed demonstration',
  suburb: 'Perth',
  stateTerritory: 'WA',
  publishedPhone: '+61 8 0000 0000',
  publicUrl: '/profile-pair',
  observedAt: 1_725_000_000_000,
  disposition: 'current',
  offerings: [
    {
      offeringRef: 'offering:professional',
      revision: 7,
      name: 'Website discovery',
      category: 'Professional service',
      summary: 'A bounded discovery engagement.',
      comparison: {
        schemaVersion: 'offering-comparison:v1',
        profile: {
          profileId: 'professional_service:v1',
          scopeBasis: known('Discovery and recommendation'),
          priceBasis: known({
            description: 'Fixed discovery fee',
            currency: 'AUD',
            amountMinor: 125_000,
            unit: 'total',
          }),
          timingBasis: known('Two weeks'),
          serviceArea: known('Perth'),
        },
      },
      accessPaths: [],
      support: { integrated: false, aeSupportedAction: false },
    },
    {
      offeringRef: 'offering:machine',
      revision: 11,
      name: 'Current inventory feed',
      category: 'Machine data',
      summary: 'A read-only inventory feed.',
      comparison: {
        schemaVersion: 'offering-comparison:v1',
        profile: {
          profileId: 'machine_data:v1',
          interfaceFormat: known('rest_json'),
          requestMethod: known('GET'),
          authentication: known('api_key'),
          priceBasis: known({
            description: 'Per request',
            currency: 'AUD',
            amountMinor: 2,
            unit: 'request',
          }),
          freshnessOrUpdateCadence: known('Updated every hour'),
        },
      },
      accessPaths: [],
      support: {
        integrated: true,
        aeSupportedAction: false,
        observedAt: 1_724_999_000_000,
        validUntil: 1_725_086_400_000,
      },
    },
  ],
  accessSummary: {
    humanRequest: false,
    externalOperation: false,
    aeSupportedAction: false,
  },
} as const satisfies PublicBusinessCatalogApiV2Dto

describe('answerToolCalls persistence', () => {
  let resetThreadPort: () => void
  let resetToolCallPort: () => void

  afterEach(() => {
    resetToolCallPort()
    resetThreadPort()
  })

  it('buffers tool-call records in memory and persists them with the turn', async () => {
    const threads = new Map<string, AnswerThreadRecord>()
    const turns = new Map<string, AnswerTurnRecord>()
    const toolCalls = new Map<string, AnswerToolCallRecord>()

    resetThreadPort = setAnswerThreadPortForTests({
      createThread: async (args) => {
        const now = Date.now()
        threads.set(args.threadId, {
          threadId: args.threadId,
          pseudonymousSessionId: args.pseudonymousSessionId,
          title: args.title,
          sharePolicy: 'public',
          createdAt: now,
          updatedAt: now,
        })
        return { threadId: args.threadId }
      },
      appendTurn: async (args) => {
        turns.set(args.turnId, { ...args, createdAt: Date.now() })
        return { turnId: args.turnId }
      },
      appendTurnWithToolCalls: async (args) => {
        const { toolCalls: inputToolCalls, ...turnArgs } = args
        turns.set(args.turnId, { ...turnArgs, createdAt: Date.now() })
        for (const call of inputToolCalls) {
          toolCalls.set(call.toolCallId, {
            ...call,
            turnId: args.turnId,
            createdAt: Date.now(),
          })
        }
        return { turnId: args.turnId, insertedToolCalls: inputToolCalls.length }
      },
      listSessionThreads: async () => ({ threads: [] }),
      getPublicThreadProjection: async (threadId) => {
        const thread = threads.get(threadId)
        if (thread === undefined) {
          return null
        }
        return buildPublicThreadProjection(
          thread,
          [...turns.values()].filter((turn) => turn.threadId === threadId),
        )
      },
      getThreadTurns: async (threadId) => ({
        turns: [...turns.values()].filter((turn) => turn.threadId === threadId),
      }),
    })

    resetToolCallPort = setAnswerToolCallPortForTests({
      appendToolCalls: async (args) => {
        for (const call of args.toolCalls) {
          toolCalls.set(call.toolCallId, {
            ...call,
            turnId: args.turnId,
            createdAt: Date.now(),
          })
        }
        return { inserted: args.toolCalls.length }
      },
      readTurnToolCalls: async (turnId) => ({
        toolCalls: [...toolCalls.values()]
          .filter((call) => call.turnId === turnId)
          .sort((a, b) => a.seq - b.seq),
      }),
    })

    const threadId = 'thread-tool-1'
    const turnId = 'turn-tool-1'

    // Orchestrator pattern: create thread, then atomically append the turn and
    // its buffered tool calls before emitting a terminal complete event.
    await createThread(threadId, 'session-1', 'after hours plumber Preston')
    const buffered: AnswerToolCallRecord[] = [
      buildToolCall('tc-1', turnId, 1, 'registry.search', ['parramatta-emergency-plumbing'], 1),
      buildToolCall('tc-2', turnId, 2, 'registry.detail', ['parramatta-emergency-plumbing'], 1),
    ]
    await appendAnswerTurnWithToolCalls({
      turnId,
      threadId,
      pseudonymousSessionId: 'session-1',
      seq: 1,
      query: 'after hours plumber Preston',
      intent: 'refine_search',
      evidenceJson: JSON.stringify({
        providers: [],
        allowedSlugs: [],
        agentJsonUrl: '/api/businesses/search?q=plumber',
      }),
      snapshotHash: 'hash-1',
      proseJson: JSON.stringify({ oneLine: 'Honest copy', summary: 'Summary', nextStep: 'Next' }),
      artifactKindsJson: '[]',
      status: 'complete',
      toolCalls: buffered.map((record) => ({
        toolCallId: record.toolCallId,
        seq: record.seq,
        toolId: record.toolId,
        inputJson: record.inputJson,
        resultSummaryJson: record.resultSummaryJson,
        resultJson: record.resultJson,
        resultHash: record.resultHash,
        status: record.status,
      })),
    })

    const stored = await readTurnToolCalls(turnId)
    expect(stored.toolCalls.map((call) => call.toolCallId)).toEqual(['tc-1', 'tc-2'])
    expect(stored.toolCalls[0]?.toolId).toBe('registry.search')
  })

  it('keeps tool-call evidence out of the public thread projection', async () => {
    const thread: AnswerThreadRecord = {
      threadId: 'thread-share-1',
      pseudonymousSessionId: 'session-1',
      title: 'after hours plumber Preston',
      sharePolicy: 'public',
      createdAt: 1_000,
      updatedAt: 2_000,
    }
    const turn: AnswerTurnRecord = {
      turnId: 'turn-share-1',
      threadId: 'thread-share-1',
      seq: 1,
      query: 'after hours plumber Preston',
      intent: 'refine_search',
      evidenceJson: JSON.stringify({
        providers: [],
        allowedSlugs: [],
        agentJsonUrl: '/api/businesses/search?q=plumber',
        toolCalls: [buildToolCall('tc-1', 'turn-share-1', 1, 'registry.search', [], 0)],
        harnessRun: {
          summary: {
            run: { status: 'ok' },
            tools: { byName: { 'registry.search': { total: 1 } } },
          },
          coverage: { toolsInvoked: ['registry.search'] },
        },
      }),
      snapshotHash: 'hash-1',
      proseJson: JSON.stringify({ oneLine: 'Honest copy', summary: 'Summary', nextStep: 'Next' }),
      artifactKindsJson: '[]',
      status: 'complete',
      createdAt: 1_500,
    }

    const projection = buildPublicThreadProjection(thread, [turn])
    const serialized = JSON.stringify(projection)

    // Artifacts + query text only — no raw prompts, gate logs, or tool traces.
    expect(serialized).not.toMatch(/toolCalls|resultSummaryJson|inputJson|resultHash|harnessRun|toolsInvoked|registry\.search|registry\.detail/)
    expect(projection.turns[0]?.query).toBe('after hours plumber Preston')
    expect(projection.turns[0]?.oneLine).toBe('Honest copy')
    expect(projection.turns[0]?.answerCheckSummary).toEqual({
      catalogSearches: 1,
      listingsRead: 0,
      listedBusinesses: 0,
      checksPassed: 2,
      checksFailed: 0,
      elapsedMs: 0,
    })
  })
})

describe('Offering-v2 answer consumption', () => {
  it('preserves exact revisions and both closed profiles in the Answer source without rebuilding services', () => {
    const source = toAnswerSource(offeringV2Business, 1)

    expect(source.sourceKind).toBe('offering_v2')
    expect(source.business).toEqual({
      businessId: offeringV2Business.businessId,
      slug: offeringV2Business.slug,
      name: offeringV2Business.name,
      category: offeringV2Business.category,
      suburb: offeringV2Business.suburb,
      stateTerritory: offeringV2Business.stateTerritory,
      publicUrl: offeringV2Business.publicUrl,
      observedAt: offeringV2Business.observedAt,
      disposition: 'current',
      accessSummary: offeringV2Business.accessSummary,
    })
    expect(source.offerings).toEqual(offeringV2Business.offerings)
    expect(source.offerings.map((offering) => [
      offering.offeringRef,
      offering.revision,
      offering.comparison?.profile.profileId,
    ])).toEqual([
      ['offering:professional', 7, 'professional_service:v1'],
      ['offering:machine', 11, 'machine_data:v1'],
    ])
    expect(source).not.toHaveProperty('services')
    expect(source).not.toHaveProperty('serviceArea')
    expect(source).not.toHaveProperty('hoursLabel')
    expect(source).not.toHaveProperty('availabilityLabel')
    expect(source).not.toHaveProperty('trustLabel')
    expect(source).not.toHaveProperty('responseTimeLabel')
    expect(source).not.toHaveProperty('nextStepLabel')
    expect(source).not.toHaveProperty('inquiryUrl')
    expect(source).not.toHaveProperty('publishedPhone')
  })

  it('carries the strict Offering result through the Answer Thread tool runner unchanged', async () => {
    const harnessLoop = new HarnessRunLoop()

    const result = await runAnswerToolCall({
      toolId: 'registry.detail',
      input: { slug: offeringV2Business.slug },
      turnId: 'turn-offering-v2',
      seq: 1,
      harnessLoop,
      actionContext: {
        developmentOnlyRegistryDetailAdapter: async () => ({
          kind: 'found',
          schemaVersion: 'public-business-catalog-api:v2',
          business: offeringV2Business,
        }),
      },
    })

    expect(result.record.status, result.record.resultSummaryJson).toBe('complete')
    expect(result.providers).toEqual([])
    expect(result.offeringSources[0]?.offerings).toEqual(offeringV2Business.offerings)
    expect(JSON.parse(result.record.resultJson)).toEqual({
      kind: 'found',
      schemaVersion: 'public-business-catalog-api:v2',
      business: offeringV2Business,
    })
  })
})

async function createThread(threadId: string, sessionId: string, title: string): Promise<void> {
  const { createAnswerThread } = await import('@/modules/answer-thread/answer-thread.functions')
  await createAnswerThread({ threadId, pseudonymousSessionId: sessionId, title })
}

function buildToolCall(
  toolCallId: string,
  turnId: string,
  seq: number,
  toolId: AnswerToolCallRecord['toolId'],
  slugs: readonly string[],
  count: number,
): AnswerToolCallRecord {
  return {
    toolCallId,
    turnId,
    seq,
    toolId,
    inputJson: JSON.stringify({ query: 'parramatta' }),
    resultSummaryJson: JSON.stringify({ slugs, count }),
    resultJson: JSON.stringify({ kind: 'ok', items: slugs.map((slug) => ({ slug })) }),
    resultHash: 'hash:tool',
    status: 'complete',
    createdAt: 1_000,
  }
}

function known<T>(value: T) {
  return {
    kind: 'known' as const,
    value,
    source: { kind: 'business_supplied' as const },
    observedAt: 1_724_999_000_000,
  }
}
