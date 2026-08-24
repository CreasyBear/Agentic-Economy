import { afterEach, describe, expect, it } from 'vitest'

import {
  emptyKeylessSource,
  operationSourceMocks,
  resetAnswerHarnessOperationAfterEach,
} from './answer-harness-operation-harness'
import type { AnswerEvent } from '@/modules/answer/public'
import type { AeSearchContext } from '@/modules/answer/search-context'
import type {
  KeylessExecutableSourcePort,
  KeylessExecutableToolDescriptor,
  OperationExecutableDescriptor,
} from '@/modules/capability-execution'
import type { JsonValue } from '@/modules/capability-contract/public'
import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import {
  setAnswerHarnessFinalizerForTests,
} from '@/modules/answer-thread/testing'
import {
  answerTurnRequestDigest,
  reserveAnswerTurn,
  streamAnswerTurn,
} from '@/modules/answer-thread/server'
import { createAnswerThreadTestStore, installAnswerThreadTestPort } from '../../helpers/answer-thread-test-port'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'

const resets: (() => void)[] = []

afterEach(() => {
  resetAnswerHarnessOperationAfterEach(resets)
})

describe('answer harness operation persistence bridge — reserve/operation', () => {
  it('does not complete a captured stream when final harness finalization fails', async () => {
    const store = createAnswerThreadTestStore()
    const turns = store.turns
    const events: AnswerEvent[] = []

    resets.push(installAnswerThreadTestPort(store))
    resets.push(setAnswerHarnessFinalizerForTests(async () => ({
      status: 'denied',
      reason: 'foreign_origin',
      message: 'forced finalization denial',
    })))
    const query = 'what is the current test value for Sydney?'
    const operationRef = `operation:v1:${'f'.repeat(64)}` as PublicOperationDescriptor['operationRef']
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
        customerAnnotations: [],
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
        surfaces: ['chat'],
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
    operationSourceMocks.readCapabilityOperationSearch.mockResolvedValue(stagedSearchResult)
    operationSourceMocks.readCapabilityOperationDetail.mockResolvedValue(stagedDetailResult)
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [
        {
          toolId: 'registry.operations.search',
          input: { query: 'current test value', limit: 3 },
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
        summary: 'The successful operation returned the current test value.',
        whatToDoNow: 'Use the returned value.',
      },
    }), { preflightRoute: 'operation' })
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    const requestDigest = answerTurnRequestDigest({
      query,
      searchContext: { mode: 'whole_catalogue', allowOutsideArea: true },
    })
    const fetchImpl = async () =>
      new Response(JSON.stringify({ value: '42' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    const admission = await reserveAnswerTurn({
      sessionId: 'session-stream-finalization-fail',
      query,
      requestDigest,
      reservationKey: 'harness:stream-finalization-fail',
      title: query,
    })
    if (admission.kind !== 'reserved') throw new Error(`fixture reservation ${admission.kind}`)

    try {
      await streamAnswerTurn(
        {
          sessionId: 'session-stream-finalization-fail',
          query,
          requestDigest,
          admission,
          searchContext: { mode: 'whole_catalogue', allowOutsideArea: true },
          sourceWriteRequest: new Request('https://ae.test/api/answer/turn', {
            method: 'POST',
            headers: { 'X-AE-Turn-Key': 'harness:stream-finalization-fail' },
          }),
          sourceWriteBody: '',
          keylessExecutableSource: source,
          operationExecuteDeps: { isPublicTarget: async () => true, fetchImpl },
        },
        ({ event }) => events.push(event),
      )
    } finally {
      restoreOpenRouter()
      await server.close()
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
    }

    expect([...turns.values()]).toHaveLength(1)
    expect(events.some((event) => event.type === 'complete')).toBe(false)
    expect(events.some((event) => event.type === 'error' && event.problem.code === 'answer_turn_persist_failed')).toBe(true)
    const stored = turns.get(admission.turnId)
    const reservationRow = store.reservations.get(admission.reservationKey)
    expect(stored?.status).toBe('error')
    expect(reservationRow).toMatchObject({ state: 'finalized', finalStatus: 'error' })
    const persistedEvidence = JSON.parse(stored?.evidenceJson ?? '{}') as {
      providers?: unknown
      toolCalls?: { toolId?: unknown; status?: unknown }[]
      answerRun?: unknown
    }
    expect(persistedEvidence.providers).toEqual(expect.any(Array))
    expect(persistedEvidence.toolCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ toolId: 'operation.execute', status: 'complete' }),
    ]))
    expect(persistedEvidence.toolCalls).toEqual(expect.any(Array))
    expect(persistedEvidence.answerRun).toEqual(expect.any(Object))
    const replay = await reserveAnswerTurn({
      sessionId: 'session-stream-finalization-fail',
      query,
      requestDigest,
      reservationKey: 'harness:stream-finalization-fail',
      title: query,
    })
    expect(replay).toMatchObject({ kind: 'replayed', state: 'finalized', finalStatus: 'error' })
  })
  it('leaves an aborted reservation pending without fabricating a durable error', async () => {
    const store = createAnswerThreadTestStore()
    resets.push(installAnswerThreadTestPort(store))
    const query = 'book now and pay today'
    const searchContext: AeSearchContext = { mode: 'whole_catalogue', allowOutsideArea: true }
    const requestDigest = answerTurnRequestDigest({ query, searchContext })
    const admission = await reserveAnswerTurn({
      sessionId: 'session-aborted-turn',
      query,
      requestDigest,
      reservationKey: 'harness:aborted-turn',
      title: query,
    })
    if (admission.kind !== 'reserved') throw new Error(`fixture reservation ${admission.kind}`)
    const abortController = new AbortController()
    abortController.abort()
    const events: AnswerEvent[] = []

    await streamAnswerTurn(
      {
        sessionId: 'session-aborted-turn',
        query,
        requestDigest,
        admission,
        searchContext,
        signal: abortController.signal,
        keylessExecutableSource: emptyKeylessSource,
      },
      ({ event }) => events.push(event),
    )

    expect(events).toEqual([])
    expect(store.turns).toHaveLength(0)
    expect(store.reservations.get(admission.reservationKey)).toMatchObject({ state: 'reserved' })
  })
})
