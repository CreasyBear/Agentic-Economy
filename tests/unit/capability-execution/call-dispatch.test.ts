import { describe, expect, it, vi } from 'vitest'

import {
  createCallApplication,
  type CallGrant,
  type CallRuntime,
} from '@/modules/capability-execution/call-authority'
import type { CallResult } from '@/modules/capability-execution/call-contracts'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  fixture,
  grant,
  principal,
  runtime,
} from './call-harness'

const QUOTE_REF = `operation-commitment:v1:${'0'.repeat(64)}`
const DECISION_PRICE = { currency: 'AUD', exponent: 6, units: '10000' } as const

describe('call dispatch', () => {
  it('keeps authority-needed reservations pending and replayable', async () => {
    const { operationRef: toolRef, descriptor, operation } = fixture()
    let adapters = 0
    let reservation: Parameters<NonNullable<CallRuntime['idempotency']['reserve']>>[0] | undefined
    const abandon = vi.fn(async () => ({ kind: 'abandoned' as const }))
    const service = createCallApplication(runtime({
      currentTool: async () => ({ operation, toolRef, descriptor }),
      dispatch: async () => {
        adapters += 1
        throw new Error('must_not_dispatch')
      },
      idempotency: {
        reserve: async (input) => {
          if (reservation === undefined) {
            reservation = input
            return { kind: 'reserved' as const, reservation: input }
          }
          return { kind: 'replayed' as const, reservation }
        },
        abandon,
        readReplay: async () => undefined,
      },
    }))

    const request = {
      principal,
      input: { quoteRef: QUOTE_REF, decisionPrice: DECISION_PRICE, toolRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:authority' },
    }
    const first = await service.callTool({ ...request, correlationId: 'correlation:authority-first' })
    const replay = await service.callTool({ ...request, correlationId: 'correlation:authority-replay' })

    expect(first).toMatchObject({ kind: 'needs_authority', callRef: reservation?.callRef, toolRef })
    expect(replay).toMatchObject({ kind: 'needs_authority', callRef: reservation?.callRef, toolRef })
    if (first.kind === 'needs_authority' && replay.kind === 'needs_authority') {
      expect(replay.authorityRequest).toEqual(first.authorityRequest)
    }
    expect(adapters).toBe(0)
    expect(abandon).not.toHaveBeenCalled()
  })
  it('abandons when the authority reader throws after reservation', async () => {
    const abandon = vi.fn(async () => ({ kind: 'abandoned' as const }))
    const service = createCallApplication(runtime({
      idempotency: {
        reserve: async (reservation) => ({ kind: 'reserved' as const, reservation }),
        abandon,
      },
      policy: {
        ...runtime().policy,
        evaluateAuthority: async () => {
          throw new Error('authority_store_unavailable')
        },
      },
    }))

    const { operationRef: toolRef } = fixture()
    const result = await service.callTool({
      principal,
      correlationId: 'correlation:authority-reader-failure',
      input: { quoteRef: QUOTE_REF, decisionPrice: DECISION_PRICE, toolRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:authority-reader-failure' },
    })

    expect(result).toMatchObject({ kind: 'refused', toolRef, code: 'authority_reader_unavailable', retryable: true })
    expect(abandon).toHaveBeenCalledOnce()
  })

  it('abandons when the fallback adapter factory throws before dispatch', async () => {
    const abandon = vi.fn(async () => ({ kind: 'abandoned' as const }))
    const { operationRef: toolRef } = fixture()
    const service = createCallApplication(runtime({
      idempotency: {
        reserve: async (reservation) => ({ kind: 'reserved' as const, reservation }),
        abandon,
      },
      policy: {
        ...runtime().policy,
        evaluateAuthority: async () => ({
          kind: 'approved' as const,
          basis: { kind: 'approval_required' as const, authorityRef: 'authority:fallback' },
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        }),
      },
      dispatch: async () => {
        throw new Error('adapter_unavailable')
      },
    }))

    const result = await service.callTool({
      principal,
      correlationId: 'correlation:fallback-failure',
      input: { quoteRef: QUOTE_REF, decisionPrice: DECISION_PRICE, toolRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:fallback-failure' },
    })

    expect(result).toMatchObject({ kind: 'refused', toolRef, code: 'invocation_runtime_unavailable', retryable: true })
    expect(abandon).toHaveBeenCalledOnce()
  })

  it('requires reconciliation when enqueue starts before reservation abandonment wins', async () => {
    const abandon = vi.fn(async () => ({ kind: 'dispatch_started' as const }))
    const { operationRef: toolRef } = fixture()
    const service = createCallApplication(runtime({
      idempotency: {
        reserve: async (reservation) => ({ kind: 'reserved' as const, reservation }),
        abandon,
      },
      policy: {
        ...runtime().policy,
        evaluateAuthority: async () => ({
          kind: 'approved' as const,
          basis: { kind: 'approval_required' as const, authorityRef: 'authority:race' },
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        }),
      },
      dispatch: async () => ({ kind: 'refused' as const, code: 'invocation_runtime_unavailable', retryable: true }),
    }))

    const result = await service.callTool({
      principal,
      correlationId: 'correlation:dispatch-race',
      input: { quoteRef: QUOTE_REF, decisionPrice: DECISION_PRICE, toolRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:dispatch-race' },
    })

    expect(result).toMatchObject({ kind: 'reconciliation_required', toolRef })
    expect(abandon).toHaveBeenCalledOnce()
  })

  it('releases a replayed workless reservation after crash-before-dispatch and fresh refusal', async () => {
    const { operationRef: toolRef, descriptor, operation } = fixture()
    type Reservation = Parameters<NonNullable<CallRuntime['idempotency']['reserve']>>[0]
    let storedReservation: Reservation | undefined
    let reserveCalls = 0
    let authorityFailure = false
    let crashBeforeDispatch = true
    const abandon = vi.fn(async () => {
      storedReservation = undefined
      return { kind: 'abandoned' as const }
    })
    const service = createCallApplication(runtime({
      currentTool: async () => ({ operation, toolRef, descriptor }),
      idempotency: {
        reserve: async (input) => {
          if (storedReservation === undefined) {
            reserveCalls += 1
            storedReservation = input
            if (crashBeforeDispatch) {
              crashBeforeDispatch = false
              throw new Error('crash_before_dispatch')
            }
            return { kind: 'reserved' as const, reservation: input }
          }
          const replayReservation = storedReservation
          if (replayReservation === undefined) throw new Error('reservation_missing')
          return { kind: 'replayed' as const, reservation: replayReservation }
        },
        abandon,
        readReplay: async () => undefined,
      },
      policy: {
        ...runtime().policy,
        evaluateAuthority: async ({ toolRef: requestedToolRef, descriptor: currentDescriptor }) => {
          if (authorityFailure) throw new Error('authority_store_unavailable')
          return {
            kind: 'needs_authority' as const,
            authorityRequest: {
              kind: 'approval_required' as const,
              toolRef: requestedToolRef,
              consequence: currentDescriptor.consequenceClass,
              retryClass: currentDescriptor.retryClass,
              dataFields: currentDescriptor.materialInputPointers,
            },
          }
        },
      },
    }))

    const request = {
      principal,
      correlationId: 'correlation:replayed-workless',
      input: { quoteRef: QUOTE_REF, decisionPrice: DECISION_PRICE, toolRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:replayed-workless' },
    }
    const first = await service.callTool(request)
    expect(first).toMatchObject({ kind: 'refused', toolRef, code: 'invocation_runtime_unavailable', retryable: true })

    authorityFailure = true
    const replay = await service.callTool({ ...request, correlationId: 'correlation:replayed-workless-refusal' })
    expect(replay).toMatchObject({ kind: 'refused', toolRef, code: 'authority_reader_unavailable', retryable: true })
    expect(abandon).toHaveBeenCalledOnce()
    expect(storedReservation).toBeUndefined()

    authorityFailure = false
    const fresh = await service.callTool({ ...request, correlationId: 'correlation:replayed-workless-fresh' })
    expect(fresh).toMatchObject({ kind: 'needs_authority', toolRef })
    expect(abandon).toHaveBeenCalledOnce()
    expect(reserveCalls).toBe(2)
  })
  it('keeps a replay recoverable when authoritative readback is unavailable', async () => {
    const { operationRef: toolRef } = fixture()
    const abandon = vi.fn(async () => ({ kind: 'abandoned' as const }))
    const evaluateAuthority = vi.fn(runtime().policy.evaluateAuthority)
    const service = createCallApplication(runtime({
      idempotency: {
        reserve: async (reservation) => ({ kind: 'replayed' as const, reservation }),
        abandon,
      },
      policy: {
        ...runtime().policy,
        evaluateAuthority,
      },
    }))

    const result = await service.callTool({
      principal,
      correlationId: 'correlation:replay-readback-unavailable',
      input: { quoteRef: QUOTE_REF, decisionPrice: DECISION_PRICE, toolRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:replay-readback-unavailable' },
    })

    expect(result).toMatchObject({ kind: 'refused', toolRef, code: 'invocation_runtime_unavailable', retryable: true })
    expect(evaluateAuthority).not.toHaveBeenCalled()
    expect(abandon).not.toHaveBeenCalled()
  })

  it('returns pending from durable dispatch without constructing the development adapter', async () => {
    const { operationRef: toolRef, descriptor } = fixture()
    let dispatches = 0
    let adapters = 0
    let reservation: Parameters<NonNullable<CallRuntime['idempotency']['reserve']>>[0] | undefined
    let persistedResult: CallResult | undefined
    const service = createCallApplication(runtime({
      retryAfterMs: 2_000,
      idempotency: {
        reserve: async (input) => {
          if (reservation === undefined) {
            reservation = input
            return { kind: 'reserved' as const, reservation: input }
          }
          return { kind: 'replayed' as const, reservation }
        },
        abandon: async () => ({ kind: 'abandoned' as const }),
        readReplay: async () => persistedResult,
      },
      policy: {
        ...runtime().policy,
        evaluateAuthority: async () => ({
          kind: 'approved' as const,
          basis: { kind: 'approval_required' as const, authorityRef: 'authority:test' },
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        }),
      },
      dispatch: async (input) => {
        dispatches += 1
        expect(input.callRef).toContain('operation-invocation:')
        expect(input.operation.operationId).toBe(descriptor.id)
        return { kind: 'enqueued' as const, retryAfterMs: 2_000 }
      },

    }))

    const request = {
      principal,
      correlationId: 'correlation:durable-dispatch',
      input: { quoteRef: QUOTE_REF, decisionPrice: DECISION_PRICE, toolRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:durable-dispatch' },
    }
    const result = await service.callTool(request)
    persistedResult = result
    const replay = await service.callTool({ ...request, correlationId: 'correlation:durable-dispatch-replay' })

    expect(result).toMatchObject({
      kind: 'pending',
      toolRef,
      retryAfterMs: 2_000,
    })
    expect(replay).toEqual(result)
    expect(dispatches).toBe(1)
    expect(adapters).toBe(0)
  })
  it('keeps an explicitly unknown durable dispatch outcome reconcilable without abandoning the reservation', async () => {
    const { operationRef: toolRef } = fixture()
    const abandon = vi.fn(async () => ({ kind: 'abandoned' as const }))
    const dispatch = vi.fn(async () => ({ kind: 'outcome_unknown' as const }))
    const service = createCallApplication(runtime({
      idempotency: {
        reserve: async (reservation) => ({ kind: 'reserved' as const, reservation }),
        abandon,
      },
      policy: {
        ...runtime().policy,
        evaluateAuthority: async () => ({
          kind: 'approved' as const,
          basis: { kind: 'approval_required' as const, authorityRef: 'authority:dispatch-ambiguity' },
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        }),
      },
      dispatch,
    }))

    const result = await service.callTool({
      principal,
      correlationId: 'correlation:dispatch-ambiguity',
      input: { quoteRef: QUOTE_REF, decisionPrice: DECISION_PRICE, toolRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:dispatch-ambiguity' },
    })

    expect(result).toMatchObject({
      kind: 'reconciliation_required',
      toolRef,
      evidence: {
        effectGeneration: 1,
        retry: 'reconcile_before_retry',
        evidenceSource: `operation:${toolRef}`,
      },
    })
    if (result.kind === 'reconciliation_required') {
      expect(result.callRef).toContain('operation-invocation:')
      expect(result.evidence.attemptRef).toBe(`operation-attempt:${result.callRef}:1`)
    }
    expect(dispatch).toHaveBeenCalledOnce()
    expect(abandon).not.toHaveBeenCalled()
  })

  it('abandons the reservation when durable dispatch rejects before enqueue commits', async () => {
    const abandon = vi.fn(async () => ({ kind: 'abandoned' as const }))
    const { operationRef: toolRef } = fixture()
    const service = createCallApplication(runtime({
      idempotency: {
        reserve: async (reservation) => ({ kind: 'reserved' as const, reservation }),
        abandon,
      },
      policy: {
        ...runtime().policy,
        evaluateAuthority: async () => ({
          kind: 'approved' as const,
          basis: { kind: 'approval_required' as const, authorityRef: 'authority:enqueue-failure' },
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        }),
      },
      dispatch: async () => {
        throw new Error('enqueue_mutation_failed')
      },
    }))

    const result = await service.callTool({
      principal,
      correlationId: 'correlation:enqueue-failure',
      input: { quoteRef: QUOTE_REF, decisionPrice: DECISION_PRICE, toolRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:enqueue-failure' },
    })

    expect(result).toMatchObject({
      kind: 'refused',
      toolRef,
      code: 'invocation_runtime_unavailable',
      retryable: true,
    })
    expect(abandon).toHaveBeenCalledOnce()
  })

  it('resumes orchestration when a replayed reservation has no persisted result', async () => {
    const { operationRef: toolRef } = fixture()
    let reservation: Parameters<NonNullable<CallRuntime['idempotency']['reserve']>>[0] | undefined
    let dispatches = 0
    const service = createCallApplication(runtime({
      idempotency: {
        reserve: async (input) => {
          if (reservation === undefined) {
            reservation = input
            return { kind: 'reserved' as const, reservation: input }
          }
          return { kind: 'replayed' as const, reservation }
        },
        readReplay: async () => undefined,
        abandon: async () => ({ kind: 'abandoned' as const }),
      },
      policy: {
        ...runtime().policy,
        evaluateAuthority: async () => ({
          kind: 'approved' as const,
          basis: { kind: 'approval_required' as const, authorityRef: 'authority:resume' },
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        }),
      },
      dispatch: async () => {
        dispatches += 1
        return { kind: 'enqueued' as const }
      },
    }))
    const request = {
      principal,
      correlationId: 'correlation:empty-replay',
      input: { quoteRef: QUOTE_REF, decisionPrice: DECISION_PRICE, toolRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:empty-replay' },
    }

    const first = await service.callTool(request)
    const resumed = await service.callTool({ ...request, correlationId: 'correlation:empty-replay-resumed' })

    expect(first.kind).toBe('pending')
    expect(resumed.kind).toBe('pending')
    expect(dispatches).toBe(2)
  })
  it('replays the exact result and rejects changed material for one idempotency key', async () => {
    const { operationRef: toolRef, descriptor, operation } = fixture()
    const reservations = new Map<string, { inputDigest: string; requestDigest: string; callRef: string }>()
    let persistedResult: CallResult | undefined
    const service = createCallApplication(runtime({
      currentTool: async () => ({ operation, toolRef, descriptor }),
      idempotency: {
        reserve: async (input) => {
          const prior = reservations.get(input.idempotencyKey)
          if (prior === undefined) {
            reservations.set(input.idempotencyKey, input)
            return { kind: 'reserved', reservation: input }
          }
          return prior.requestDigest === input.requestDigest
            ? { kind: 'replayed', reservation: { ...input, callRef: prior.callRef } }
            : { kind: 'conflict' }
        },
        readReplay: async () => persistedResult,
        abandon: async () => ({ kind: 'abandoned' as const }),
      },
    }))

    const first = await service.callTool({
      principal,
      correlationId: 'correlation:idempotency-1',
      input: { quoteRef: QUOTE_REF, decisionPrice: DECISION_PRICE, toolRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:stable' },
    })
    persistedResult = first
    const replay = await service.callTool({
      principal,
      correlationId: 'correlation:idempotency-2',
      input: { quoteRef: QUOTE_REF, decisionPrice: DECISION_PRICE, toolRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:stable' },
    })
    const conflict = await service.callTool({
      principal,
      correlationId: 'correlation:idempotency-3',
      input: { quoteRef: QUOTE_REF, decisionPrice: DECISION_PRICE, toolRef, input: { symbol: 'BTC', convert: 'EUR' }, idempotencyKey: 'idem:stable' },
    })

    expect(replay).toEqual(first)
    expect(conflict).toMatchObject({ kind: 'refused', toolRef, code: 'idempotency_conflict', retryable: false })
    expect(canonicalDigest(first)).toBe(canonicalDigest(replay))
  })
  it('allows a production principal to reach authority and dispatch for a production operation', async () => {
    const { operationRef: toolRef, descriptor, operation } = fixture('production')
    const productionPrincipal: AgentAccessPrincipal = { ...principal, environment: 'production' }
    const productionGrant: CallGrant = { ...grant, environment: 'production' }
    const evaluateAuthority = vi.fn(async () => ({
      kind: 'approved' as const,
      basis: { kind: 'approval_required' as const, authorityRef: 'authority:production' },
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    }))
    const dispatch = vi.fn(async () => ({ kind: 'enqueued' as const }))
    const service = createCallApplication(runtime({
      policy: {
        ...runtime().policy,
        readGrant: async () => ({ kind: 'granted', grant: productionGrant }),
        evaluateAuthority,
      },
      currentTool: async () => ({ operation, toolRef, descriptor }),
      dispatch,
    }, 'production'))

    const result = await service.callTool({
      principal: productionPrincipal,
      correlationId: 'correlation:production-production',
      input: { quoteRef: QUOTE_REF, decisionPrice: DECISION_PRICE, toolRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:production-production' },
    })

    expect(result).toMatchObject({ kind: 'pending', toolRef })
    expect(evaluateAuthority).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledTimes(1)
  })
})
