import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AnswerEvent } from '@/modules/answer/public'
import type {
  KeylessExecutableSourcePort,
  KeylessExecutableToolDescriptor,
  OperationExecutableDescriptor,
} from '@/modules/capability-execution'
import type * as AnswerThreadTooling from '@/modules/answer-thread/tooling'
import type { JsonValue } from '@/modules/capability-contract/public'
import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  answerTurnRequestDigest,
  reserveAnswerTurn,
  streamAnswerTurn,
} from '@/modules/answer-thread/server'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
} from '../../helpers/answer-thread-test-port'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'

const answerToolMocks = vi.hoisted(() => ({
  runAnswerToolCall: vi.fn(),
}))

vi.mock('@/modules/answer-thread/tooling', async (importOriginal) => {
  const actual = await importOriginal<typeof AnswerThreadTooling>()
  return {
    ...actual,
    runAnswerToolCall: answerToolMocks.runAnswerToolCall,
  }
})

const resets: (() => void)[] = []

afterEach(() => {
  while (resets.length > 0) resets.pop()?.()
  answerToolMocks.runAnswerToolCall.mockReset()
})
describe('answer turn execution lease durability', () => {
  it('keeps a fresh replay out of the model and operation loop while the creator is live', async () => {
    const store = createAnswerThreadTestStore()
    resets.push(installAnswerThreadTestPort(store))
    const operationRef = `operation:v1:${'a'.repeat(64)}` as PublicOperationDescriptor['operationRef']
    const descriptor: KeylessExecutableToolDescriptor = {
      operationRef,
      capabilityId: 'test.current-value',
      name: 'Test current value',
      summary: 'Return the current test value for a city.',
      searchTerms: ['current test value', 'test value'],
      inputExamples: [{ label: 'Sydney', input: { city: 'Sydney' } }],
      inputSchema: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
        additionalProperties: false,
      },
    }
    const executable: OperationExecutableDescriptor = {
      operationRef,
      capabilityId: descriptor.capabilityId,
      name: descriptor.name,
      endpointUrl: 'https://api.example.test/current',
      authority: { kind: 'keyless' },
      adapterId: 'http-json:v1',
      price: {
        kind: 'fixed',
        amount: { currency: 'USD', units: '0', exponent: 2 },
      },
      effects: [],
      method: 'GET',
      query: [{ inputPointer: '/city', parameter: 'city' }],
      requestTimeoutMs: 5_000,
      inputSchema: descriptor.inputSchema,
      provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
    }
    const source: KeylessExecutableSourcePort = {
      list: async () => [descriptor],
      read: async (ref) => ref === operationRef ? executable : null,
      search: async () => [operationRef],
    }
    const publicOperation = {
      operationRef,
      operationId: descriptor.capabilityId,
      callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
      paymentLane: 'brokered',
      contract: {
        capabilityId: descriptor.capabilityId,
        version: 1,
        inputJsonSchema: descriptor.inputSchema as Record<string, JsonValue>,
        outputJsonSchema: {
          type: 'object',
          properties: { value: { type: 'string' } },
          required: ['value'],
          additionalProperties: false,
        },
        customerAnnotations: [{
          annotationId: 'city',
          document: 'input',
          pointer: '/city',
          label: 'City',
          role: 'request',
        }],
      },
      business: {
        businessId: 'business:test',
        slug: 'test-provider',
        name: 'Test provider',
      },
      offering: {
        offeringRef: 'offering:test.current-value',
        revision: 1,
        label: descriptor.name,
        summary: descriptor.summary,
      },
      summary: descriptor.summary,
      commercial: {
        price: {
          kind: 'fixed',
          amount: { currency: 'USD', units: '0', exponent: 2 },
        },
        materialTerms: [],
        relationship: {
          kind: 'none',
          summary: 'No published commercial relationship.',
        },
      },
      dataUse: [],
      effects: [],
      evidence: [],
      cancellation: { kind: 'unsupported' },
      recovery: { idempotency: 'not_applicable', recovery: 'retry_safe' },
      authentication: { kind: 'keyless' },
      transport: { method: 'GET', requestTimeoutMs: 5_000 },
      provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
      availability: { posture: 'routeable' },
      navigation: [{
        relation: 'execute',
        method: 'POST',
        actionId: 'operation.execute',
        authentication: 'none',
        surfaces: ['answerThread'],
      }],
    } satisfies PublicOperationDescriptor
    const stagedSearchResult = {
      kind: 'ok' as const,
      schemaVersion: 'registry-operations:v1' as const,
      query: 'current test value',
      items: [publicOperation],
      matchedCount: 1,
      ranking: [{ operationRef, rank: 1, score: 1 }],
      pagination: { limit: 3, hasMore: false },
      navigation: [],
    }
    const stagedDetailResult = {
      kind: 'found' as const,
      schemaVersion: 'registry-operations:v1' as const,
      operation: publicOperation,
    }
    answerToolMocks.runAnswerToolCall.mockImplementation(async (callInput: {
      toolId: string
      input: unknown
      turnId: string
      seq: number
    }) => {
      const result = callInput.toolId === 'registry.operations.search'
        ? stagedSearchResult
        : callInput.toolId === 'registry.operations.detail'
          ? stagedDetailResult
          : undefined
      if (result === undefined) {
        throw new Error(`unexpected_read_tool:${callInput.toolId}`)
      }
      const resultJson = JSON.stringify(result)
      return {
        record: {
          toolCallId: `call-${callInput.seq}`,
          turnId: callInput.turnId,
          seq: callInput.seq,
          toolId: callInput.toolId,
          inputJson: JSON.stringify(callInput.input),
          resultSummaryJson: JSON.stringify({ slugs: [], count: 0 }),
          resultJson,
          resultHash: canonicalDigest(resultJson).toString(),
          status: 'complete',
          createdAt: Date.now(),
        },
        providers: [],
        allowedSlugs: new Set<string>(),
        timings: [],
        resultJson,
      }
    })
    const modelServer = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [
        {
          toolId: 'registry.operations.search',
          input: { query: 'current test value' },
        },
        {
          toolId: 'registry.operations.detail',
          input: { operationRef },
        },
        {
          toolId: 'operation.execute',
          input: { operationRef, input: { city: 'Sydney' } },
        },
      ],
      prose: {
        oneLine: 'The current test value for Sydney is 42.',
        summary: 'The operation returned the current test value.',
        whatToDoNow: 'Use the returned value.',
      },
    }), { preflightRoute: 'operation' })
    const restoreOpenRouter = modelServer.installEnv()
    const previousLocalBypass = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousViteConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL

    const operationStarted = Promise.withResolvers<void>()
    const releaseOperation = Promise.withResolvers<void>()
    let operationCalls = 0
    const fetchImpl = async () => {
      operationCalls += 1
      operationStarted.resolve()
      await releaseOperation.promise
      return new Response(JSON.stringify({ value: '42' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    const query = 'What is the current test value for Sydney?'
    const requestDigest = answerTurnRequestDigest({ query })
    const reservationKey = 'answer-lease:concurrency'
    const firstAdmission = await reserveAnswerTurn({
      sessionId: 'answer-lease-session',
      query,
      requestDigest,
      reservationKey,
      title: query,
    })
    if (firstAdmission.kind !== 'reserved') throw new Error(`expected creator reservation, got ${firstAdmission.kind}`)

    const firstEvents: AnswerEvent[] = []
    const firstRun = streamAnswerTurn(
      {
        sessionId: 'answer-lease-session',
        query,
        requestDigest,
        admission: firstAdmission,
        keylessExecutableSource: source,
        operationExecuteDeps: { isPublicTarget: async () => true, fetchImpl },
      },
      ({ event }) => firstEvents.push(event),
    )
    try {
      await operationStarted.promise
      const modelRequestsBeforeReplay = modelServer.requests.length
      const replayAdmission = await reserveAnswerTurn({
        sessionId: 'answer-lease-session',
        query,
        requestDigest,
        reservationKey,
        title: query,
      })
      expect(replayAdmission).toMatchObject({
        kind: 'in_progress',
        threadId: firstAdmission.threadId,
        turnId: firstAdmission.turnId,
        turnSeq: firstAdmission.turnSeq,
        generation: firstAdmission.generation,
      })
      if (replayAdmission.kind !== 'in_progress') throw new Error('expected in-progress replay admission')

      const replayEvents: AnswerEvent[] = []
      await streamAnswerTurn(
        {
          sessionId: 'answer-lease-session',
          query,
          requestDigest,
          admission: replayAdmission,
          keylessExecutableSource: source,
          operationExecuteDeps: { isPublicTarget: async () => true, fetchImpl },
        },
        ({ event }) => replayEvents.push(event),
      )
      expect(replayEvents.map((event) => event.type)).toEqual(['thread', 'thinking', 'pending'])
      expect(modelServer.requests.length).toBe(modelRequestsBeforeReplay)
      expect(operationCalls).toBe(1)
    } finally {
      releaseOperation.resolve()
      await firstRun
      restoreOpenRouter()
      await modelServer.close()
      if (previousLocalBypass === undefined) delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      else process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalBypass
      if (previousConvexUrl === undefined) delete process.env.CONVEX_URL
      else process.env.CONVEX_URL = previousConvexUrl
      if (previousViteConvexUrl === undefined) delete process.env.VITE_CONVEX_URL
      else process.env.VITE_CONVEX_URL = previousViteConvexUrl
    }
  })
})
