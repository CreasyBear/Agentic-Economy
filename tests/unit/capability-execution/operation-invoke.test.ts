import { describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'


import {
  createOperationInvokeApplication,
  type OperationInvokeGrant,
  type OperationInvokeRuntime,
} from '@/modules/capability-execution/operation-invoke'
import {
  operationEnvironmentMismatchNextAction,
  type OperationInvokeResult,
} from '@/modules/capability-execution/operation-invoke-contracts'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import {
  createPublicOperationRef,
  materializePublishedOperation,
  materializeRuntimePublishedOperation,
} from '@/modules/capability-supply/public'
import { buildDevelopmentPublishedOperationEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { projectOuterResult, run } from '../../../convex/capabilityOperationInvocationWorker'

const principal: AgentAccessPrincipal = {
  principalId: 'principal:test',
  ownerId: 'owner:test',
  credentialId: 'credential:test',
  applicationRef: 'application:test',
  environment: 'sandbox',
  scopes: ['market_operations:invoke'],
  authorityMode: 'approve_each',
}

const grant: OperationInvokeGrant = {
  grantRef: 'grant:test',
  principalId: principal.principalId,
  ownerId: principal.ownerId,
  applicationRef: principal.applicationRef,
  credentialId: principal.credentialId,
  environment: principal.environment,
  generation: 1,
  policyDigest: 'sha256:test-policy',
  expiresAt: Number.MAX_SAFE_INTEGER,
  lifecycle: 'active',
  operationAccess: 'all_admitted',
}
function fixture(runtimeEnvironment: AgentAccessPrincipal['environment'] = 'sandbox') {
  const evidence = buildDevelopmentPublishedOperationEvidence()
  const operation = runtimeEnvironment === 'sandbox'
    ? evidence.operation
    : materializePublishedOperation({
        ...evidence.sourceMaterial,
        publication: {
          ...evidence.sourceMaterial.publication,
          runtimeEnvironment,
        },
      })
  const operationRef = createPublicOperationRef({
    operationId: operation.operationId,
    publicationRef: operation.identity.publicationRef,
    publicationRevision: operation.identity.publicationRevision,
    contractRef: operation.contract.ref,
  })
  return { operation, operationRef, descriptor: materializeRuntimePublishedOperation(operation) }
}

type RuntimeOverrides = Partial<Omit<OperationInvokeRuntime, 'currentOperation'>> & {
  currentOperation?: NonNullable<OperationInvokeRuntime['currentOperation']>
  withoutCurrentOperation?: boolean
}

function runtime(
  overrides: RuntimeOverrides = {},
  runtimeEnvironment: AgentAccessPrincipal['environment'] = 'sandbox',
): OperationInvokeRuntime {
  const { operation, operationRef, descriptor } = fixture(runtimeEnvironment)
  const base: OperationInvokeRuntime = {
    policy: {
      readGrant: async () => ({ kind: 'granted', grant }),
      evaluateAuthority: async ({ operationRef: requestedOperationRef, descriptor: currentDescriptor }) => ({
        kind: 'needs_authority',
        authorityRequest: {
          kind: 'approve_each',
          operationRef: requestedOperationRef,
          consequence: currentDescriptor.consequenceClass,
          retryClass: currentDescriptor.retryClass,
          dataFields: currentDescriptor.materialInputPointers,
        },
      }),
    },
    idempotency: {
      reserve: async (input) => ({ kind: 'reserved', reservation: input }),
      abandon: async () => ({ kind: 'abandoned' as const }),
    },
    currentOperation: async () => ({ operation, operationRef, descriptor }),
    createAdapter: async () => {
      throw new Error('adapter_not_reached_in_preflight_test')
    },
    sourceCommands: {
      leaseOwner: (_host, invocationRef) => `operation-invoke:${invocationRef}`,
      reconciliationEvidence: () => undefined,
    },
  }
  const { withoutCurrentOperation, ...overrideValues } = overrides
  const merged: OperationInvokeRuntime = { ...base, ...overrideValues }
  if (withoutCurrentOperation !== true) return merged
  const { currentOperation: _currentOperation, ...runtimeWithoutCurrentOperation } = merged
  return runtimeWithoutCurrentOperation
}


function outerDispatch(operationRef: string): Parameters<typeof projectOuterResult>[1] {
  return {
    invocationRef: 'operation-invocation:test',
    principalId: principal.principalId,
    ownerId: principal.ownerId,
    credentialId: principal.credentialId,
    applicationRef: principal.applicationRef,
    environment: principal.environment,
    state: 'pending',
    operationRef,
    idempotencyKey: 'idem:test',
    inputDigest: 'sha256:test-input',
    requestDigest: 'sha256:test-request',
    grantGeneration: 1,
    policyDigest: grant.policyDigest,
    grantExpiresAt: grant.expiresAt,
    grantRef: grant.grantRef,
    operationJson: '{}',
    inputJson: '{}',
  }
}

function canonicalProjectionSnapshot(operationRef: string, operationId: string, contractVersion: number) {
  const invocationRef = 'operation-invocation:test'
  const attemptRef = `operation-attempt:${invocationRef}:1`
  const recordedAt = '2026-08-09T00:00:00.000Z'
  const leaseExpiresAt = '2026-08-09T00:01:00.000Z'
  const actor = { callerRef: principal.credentialId, principalRef: principal.principalId }
  return {
    control: {
      invocationRef,
      invocationVersion: 1,
      sourceRef: `operation-invocation-source:${invocationRef}`,
      control: {
        invocationRef,
        invocationVersion: 1,
        origin: { kind: 'standalone' as const, ...actor },
        owner: actor,
        action: { id: operationId, contractVersion: String(contractVersion) },
        desired: { state: 'invoke' as const },
        authority: { reference: 'authority:test', expiresAt: leaseExpiresAt },
        acceptedAuthority: { kind: 'approve_each' as const, authorityRef: 'authority:test' },
        freshness: { state: 'current' as const, observedAt: recordedAt },
        control: {
          state: 'leased' as const,
          attemptRef,
          effectGeneration: 1,
          leaseOwner: 'operation-worker:test',
          leaseExpiresAt,
          release: 'not_started' as const,
        },
      },
      currentAttemptRef: attemptRef,
      currentEffectGeneration: 1,
      updatedAt: recordedAt,
    },
    attempt: {
      invocationRef,
      attemptRef,
      attemptNumber: 1,
      actor,
      effectGeneration: 1,
      lease: { owner: 'operation-worker:test', expiresAt: leaseExpiresAt },
      idempotency: {
        operationKey: operationRef,
        materialInputDigest: 'sha256:test-input',
        effectIdentity: 'sha256:test-effect',
      },
      release: { state: 'not_released' as const },
      outcome: { state: 'running' as const },
      recordedAt,
    },
  }
}

function validOutput() {
  return {
    data: {
      BTC: {
        symbol: 'BTC',
        quote: {
          USD: {
            price: 1,
            last_updated: '2026-08-09T00:00:00.000Z',
          },
        },
      },
    },
  }
}
describe('operation.invoke application service', () => {
  it('refuses malformed operation references before grant or source reads', async () => {
    let grants = 0
    let currentReads = 0
    const service = createOperationInvokeApplication(runtime({
      policy: {
        ...runtime().policy,
        readGrant: async () => {
          grants += 1
          return { kind: 'granted', grant }
        },
      },
      currentOperation: async () => {
        currentReads += 1
        return undefined
      },
    }))

    const result = await service.invokeOperation({
      principal,
      correlationId: 'correlation:invalid-ref',
      input: { operationRef: 'not-an-operation-ref', input: {}, idempotencyKey: 'idem:invalid-ref' },
    })

    expect(result).toEqual({ kind: 'refused', code: 'operation_ref_invalid', retryable: false })
    expect(grants).toBe(0)
    expect(currentReads).toBe(0)
  })

  it('refuses stale publication material before constructing an adapter', async () => {
    const { operationRef, descriptor, operation } = fixture()
    let adapters = 0
    const staleDescriptor = {
      ...descriptor,
      target: { ...descriptor.target, publicationRevision: descriptor.target.publicationRevision + 1 },
    }
    const service = createOperationInvokeApplication(runtime({
      currentOperation: async () => ({ operation, operationRef, descriptor: staleDescriptor }),
      createAdapter: async () => {
        adapters += 1
        throw new Error('must_not_construct_adapter')
      },
    }))

    const result = await service.invokeOperation({
      principal,
      correlationId: 'correlation:stale-revision',
      input: { operationRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:stale-revision' },
    })

    expect(result).toMatchObject({ kind: 'refused', operationRef, code: 'operation_not_current', retryable: false })
    expect(adapters).toBe(0)
  })

  it('cleans unique preflight refusals so a later valid call is admitted', async () => {
    const { operationRef, descriptor, operation } = fixture()
    const staleDescriptor = {
      ...descriptor,
      target: { ...descriptor.target, publicationRevision: descriptor.target.publicationRevision + 1 },
    }
    const invalidDescriptor = { ...descriptor, validateInput: () => false }
    let mode: 'stale' | 'invalid' | 'valid' = 'stale'
    const reservations = new Map<string, unknown>()
    const service = createOperationInvokeApplication(runtime({
      currentOperation: async () => (
        mode === 'stale'
          ? { operation, operationRef, descriptor: staleDescriptor }
          : mode === 'invalid'
            ? { operation, operationRef, descriptor: invalidDescriptor }
            : { operation, operationRef, descriptor }
      ),
      idempotency: {
        reserve: async (reservation) => {
          reservations.set(reservation.idempotencyKey, reservation)
          return { kind: 'reserved' as const, reservation }
        },
        abandon: async (reservation) => {
          if (!reservations.has(reservation.idempotencyKey)) return { kind: 'not_found' as const }
          reservations.delete(reservation.idempotencyKey)
          return { kind: 'abandoned' as const }
        },
      },
      policy: {
        ...runtime().policy,
        evaluateAuthority: async () => ({
          kind: 'approved' as const,
          basis: { kind: 'approve_each' as const, authorityRef: 'authority:valid' },
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        }),
      },
      dispatch: async () => ({ kind: 'enqueued' as const }),
    }))
    const invoke = (requestPrincipal: AgentAccessPrincipal, idempotencyKey: string) => service.invokeOperation({
      principal: requestPrincipal,
      correlationId: `correlation:${idempotencyKey}`,
      input: { operationRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey },
    })

    for (const idempotencyKey of ['idem:stale-one', 'idem:stale-two', 'idem:stale-three']) {
      await expect(invoke(principal, idempotencyKey)).resolves.toMatchObject({ kind: 'refused', code: 'operation_not_current' })
    }
    mode = 'invalid'
    for (const idempotencyKey of ['idem:invalid-one', 'idem:invalid-two', 'idem:invalid-three']) {
      await expect(invoke(principal, idempotencyKey)).resolves.toMatchObject({ kind: 'refused', code: 'input_invalid' })
    }
    mode = 'valid'
    const productionPrincipal: AgentAccessPrincipal = { ...principal, environment: 'production' }
    for (const idempotencyKey of ['idem:environment-one', 'idem:environment-two', 'idem:environment-three']) {
      await expect(invoke(productionPrincipal, idempotencyKey)).resolves.toMatchObject({ kind: 'refused', code: 'environment_mismatch' })
    }
    expect(reservations.size).toBe(0)

    await expect(invoke(principal, 'idem:valid-after-preflight')).resolves.toMatchObject({ kind: 'pending', operationRef })
    expect(reservations.size).toBe(1)
  })

  it('rejects contract-invalid input before authority or provider execution', async () => {
    const { operationRef, descriptor, operation } = fixture()
    let authorityReads = 0
    const invalidDescriptor = { ...descriptor, validateInput: () => false }
    const service = createOperationInvokeApplication(runtime({
      currentOperation: async () => ({ operation, operationRef, descriptor: invalidDescriptor }),
      policy: {
        ...runtime().policy,
        evaluateAuthority: async () => {
          authorityReads += 1
          return { kind: 'needs_authority', authorityRequest: {
            kind: 'approve_each',
            operationRef,
            consequence: 'read_only',
            retryClass: 'replayable',
            dataFields: [],
          } }
        },
      },
    }))

    const result = await service.invokeOperation({
      principal,
      correlationId: 'correlation:input-invalid',
      input: { operationRef, input: {}, idempotencyKey: 'idem:input-invalid' },
    })

    expect(result).toMatchObject({ kind: 'refused', operationRef, code: 'input_invalid', retryable: false })
    expect(authorityReads).toBe(0)
  })

  it('keeps authority-needed reservations pending and replayable', async () => {
    const { operationRef, descriptor, operation } = fixture()
    let adapters = 0
    let reservation: Parameters<NonNullable<OperationInvokeRuntime['idempotency']['reserve']>>[0] | undefined
    const abandon = vi.fn(async () => ({ kind: 'abandoned' as const }))
    const service = createOperationInvokeApplication(runtime({
      currentOperation: async () => ({ operation, operationRef, descriptor }),
      createAdapter: async () => {
        adapters += 1
        throw new Error('must_not_construct_adapter')
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
      input: { operationRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:authority' },
    }
    const first = await service.invokeOperation({ ...request, correlationId: 'correlation:authority-first' })
    const replay = await service.invokeOperation({ ...request, correlationId: 'correlation:authority-replay' })

    expect(first).toMatchObject({ kind: 'needs_authority', invocationRef: reservation?.invocationRef, operationRef })
    expect(replay).toMatchObject({ kind: 'needs_authority', invocationRef: reservation?.invocationRef, operationRef })
    if (first.kind === 'needs_authority' && replay.kind === 'needs_authority') {
      expect(replay.authorityRequest).toEqual(first.authorityRequest)
    }
    expect(adapters).toBe(0)
    expect(abandon).not.toHaveBeenCalled()
  })
  it('abandons a newly reserved keyless refusal', async () => {
    const { operationRef } = fixture()
    const abandon = vi.fn(async () => ({ kind: 'abandoned' as const }))
    const service = createOperationInvokeApplication(runtime({
      withoutCurrentOperation: true,
      executeKeyless: async () => ({
        kind: 'error' as const,
        operationRef,
        code: 'provider_error' as const,
        retryable: true,
        reason: 'provider unavailable',
      }),
      idempotency: {
        reserve: async (reservation) => ({ kind: 'reserved' as const, reservation }),
        abandon,
      },
    }))

    const result = await service.invokeOperation({
      principal,
      correlationId: 'correlation:keyless-refusal',
      input: { operationRef, input: {}, idempotencyKey: 'idem:keyless-refusal' },
    })

    expect(result).toMatchObject({ kind: 'refused', operationRef, code: 'provider_refused', retryable: true })
    expect(abandon).toHaveBeenCalledOnce()
    expect(abandon).toHaveBeenCalledWith(expect.objectContaining({
      principalId: principal.principalId,
      ownerId: principal.ownerId,
      credentialId: principal.credentialId,
      applicationRef: principal.applicationRef,
      operationRef,
      idempotencyKey: 'idem:keyless-refusal',
    }))
  })

  it('abandons when the authority reader throws after reservation', async () => {
    const abandon = vi.fn(async () => ({ kind: 'abandoned' as const }))
    const service = createOperationInvokeApplication(runtime({
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

    const { operationRef } = fixture()
    const result = await service.invokeOperation({
      principal,
      correlationId: 'correlation:authority-reader-failure',
      input: { operationRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:authority-reader-failure' },
    })

    expect(result).toMatchObject({ kind: 'refused', operationRef, code: 'authority_reader_unavailable', retryable: true })
    expect(abandon).toHaveBeenCalledOnce()
  })

  it('abandons when the fallback adapter factory throws before dispatch', async () => {
    const abandon = vi.fn(async () => ({ kind: 'abandoned' as const }))
    const { operationRef } = fixture()
    const service = createOperationInvokeApplication(runtime({
      idempotency: {
        reserve: async (reservation) => ({ kind: 'reserved' as const, reservation }),
        abandon,
      },
      policy: {
        ...runtime().policy,
        evaluateAuthority: async () => ({
          kind: 'approved' as const,
          basis: { kind: 'approve_each' as const, authorityRef: 'authority:fallback' },
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        }),
      },
      createAdapter: async () => {
        throw new Error('adapter_unavailable')
      },
    }))

    const result = await service.invokeOperation({
      principal,
      correlationId: 'correlation:fallback-failure',
      input: { operationRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:fallback-failure' },
    })

    expect(result).toMatchObject({ kind: 'refused', operationRef, code: 'invocation_runtime_unavailable', retryable: true })
    expect(abandon).toHaveBeenCalledOnce()
  })

  it('requires reconciliation when enqueue starts before reservation abandonment wins', async () => {
    const abandon = vi.fn(async () => ({ kind: 'dispatch_started' as const }))
    const { operationRef } = fixture()
    const service = createOperationInvokeApplication(runtime({
      idempotency: {
        reserve: async (reservation) => ({ kind: 'reserved' as const, reservation }),
        abandon,
      },
      policy: {
        ...runtime().policy,
        evaluateAuthority: async () => ({
          kind: 'approved' as const,
          basis: { kind: 'approve_each' as const, authorityRef: 'authority:race' },
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        }),
      },
      dispatch: async () => ({ kind: 'refused' as const, code: 'invocation_runtime_unavailable', retryable: true }),
    }))

    const result = await service.invokeOperation({
      principal,
      correlationId: 'correlation:dispatch-race',
      input: { operationRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:dispatch-race' },
    })

    expect(result).toMatchObject({ kind: 'reconciliation_required', operationRef })
    expect(abandon).toHaveBeenCalledOnce()
  })

  it('releases a replayed workless reservation after crash-before-dispatch and fresh refusal', async () => {
    const { operationRef, descriptor, operation } = fixture()
    type Reservation = Parameters<NonNullable<OperationInvokeRuntime['idempotency']['reserve']>>[0]
    let storedReservation: Reservation | undefined
    let reserveCalls = 0
    let authorityFailure = false
    let crashBeforeDispatch = true
    const abandon = vi.fn(async () => {
      storedReservation = undefined
      return { kind: 'abandoned' as const }
    })
    const service = createOperationInvokeApplication(runtime({
      currentOperation: async () => ({ operation, operationRef, descriptor }),
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
        evaluateAuthority: async ({ operationRef: requestedOperationRef, descriptor: currentDescriptor }) => {
          if (authorityFailure) throw new Error('authority_store_unavailable')
          return {
            kind: 'needs_authority' as const,
            authorityRequest: {
              kind: 'approve_each' as const,
              operationRef: requestedOperationRef,
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
      input: { operationRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:replayed-workless' },
    }
    const first = await service.invokeOperation(request)
    expect(first).toMatchObject({ kind: 'refused', operationRef, code: 'invocation_runtime_unavailable', retryable: true })

    authorityFailure = true
    const replay = await service.invokeOperation({ ...request, correlationId: 'correlation:replayed-workless-refusal' })
    expect(replay).toMatchObject({ kind: 'refused', operationRef, code: 'authority_reader_unavailable', retryable: true })
    expect(abandon).toHaveBeenCalledOnce()
    expect(storedReservation).toBeUndefined()

    authorityFailure = false
    const fresh = await service.invokeOperation({ ...request, correlationId: 'correlation:replayed-workless-fresh' })
    expect(fresh).toMatchObject({ kind: 'needs_authority', operationRef })
    expect(abandon).toHaveBeenCalledOnce()
    expect(reserveCalls).toBe(2)
  })
  it('keeps a replay recoverable when authoritative readback is unavailable', async () => {
    const { operationRef } = fixture()
    const abandon = vi.fn(async () => ({ kind: 'abandoned' as const }))
    const evaluateAuthority = vi.fn(runtime().policy.evaluateAuthority)
    const service = createOperationInvokeApplication(runtime({
      idempotency: {
        reserve: async (reservation) => ({ kind: 'replayed' as const, reservation }),
        abandon,
      },
      policy: {
        ...runtime().policy,
        evaluateAuthority,
      },
    }))

    const result = await service.invokeOperation({
      principal,
      correlationId: 'correlation:replay-readback-unavailable',
      input: { operationRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:replay-readback-unavailable' },
    })

    expect(result).toMatchObject({ kind: 'refused', operationRef, code: 'invocation_runtime_unavailable', retryable: true })
    expect(evaluateAuthority).not.toHaveBeenCalled()
    expect(abandon).not.toHaveBeenCalled()
  })

  it('returns pending from durable dispatch without constructing the development adapter', async () => {
    const { operationRef, descriptor } = fixture()
    let dispatches = 0
    let adapters = 0
    let reservation: Parameters<NonNullable<OperationInvokeRuntime['idempotency']['reserve']>>[0] | undefined
    let persistedResult: OperationInvokeResult | undefined
    const service = createOperationInvokeApplication(runtime({
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
          basis: { kind: 'approve_each' as const, authorityRef: 'authority:test' },
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        }),
      },
      dispatch: async (input) => {
        dispatches += 1
        expect(input.invocationRef).toContain('operation-invocation:')
        expect(input.operation.operationId).toBe(descriptor.id)
        return { kind: 'enqueued' as const, retryAfterMs: 2_000 }
      },
      createAdapter: async () => {
        adapters += 1
        throw new Error('development_adapter_must_not_run')
      },
    }))

    const request = {
      principal,
      correlationId: 'correlation:durable-dispatch',
      input: { operationRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:durable-dispatch' },
    }
    const result = await service.invokeOperation(request)
    persistedResult = result
    const replay = await service.invokeOperation({ ...request, correlationId: 'correlation:durable-dispatch-replay' })

    expect(result).toMatchObject({
      kind: 'pending',
      operationRef,
      retryAfterMs: 2_000,
    })
    expect(replay).toEqual(result)
    expect(dispatches).toBe(1)
    expect(adapters).toBe(0)
  })
  it('keeps an explicitly unknown durable dispatch outcome reconcilable without abandoning the reservation', async () => {
    const { operationRef } = fixture()
    const abandon = vi.fn(async () => ({ kind: 'abandoned' as const }))
    const dispatch = vi.fn(async () => ({ kind: 'outcome_unknown' as const }))
    const service = createOperationInvokeApplication(runtime({
      idempotency: {
        reserve: async (reservation) => ({ kind: 'reserved' as const, reservation }),
        abandon,
      },
      policy: {
        ...runtime().policy,
        evaluateAuthority: async () => ({
          kind: 'approved' as const,
          basis: { kind: 'approve_each' as const, authorityRef: 'authority:dispatch-ambiguity' },
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        }),
      },
      dispatch,
    }))

    const result = await service.invokeOperation({
      principal,
      correlationId: 'correlation:dispatch-ambiguity',
      input: { operationRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:dispatch-ambiguity' },
    })

    expect(result).toMatchObject({
      kind: 'reconciliation_required',
      operationRef,
      evidence: {
        effectGeneration: 1,
        retry: 'reconcile_before_retry',
        evidenceSource: `operation:${operationRef}`,
      },
    })
    if (result.kind === 'reconciliation_required') {
      expect(result.invocationRef).toContain('operation-invocation:')
      expect(result.evidence.attemptRef).toBe(`operation-attempt:${result.invocationRef}:1`)
    }
    expect(dispatch).toHaveBeenCalledOnce()
    expect(abandon).not.toHaveBeenCalled()
  })

  it('abandons the reservation when durable dispatch rejects before enqueue commits', async () => {
    const abandon = vi.fn(async () => ({ kind: 'abandoned' as const }))
    const { operationRef } = fixture()
    const service = createOperationInvokeApplication(runtime({
      idempotency: {
        reserve: async (reservation) => ({ kind: 'reserved' as const, reservation }),
        abandon,
      },
      policy: {
        ...runtime().policy,
        evaluateAuthority: async () => ({
          kind: 'approved' as const,
          basis: { kind: 'approve_each' as const, authorityRef: 'authority:enqueue-failure' },
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        }),
      },
      dispatch: async () => {
        throw new Error('enqueue_mutation_failed')
      },
    }))

    const result = await service.invokeOperation({
      principal,
      correlationId: 'correlation:enqueue-failure',
      input: { operationRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:enqueue-failure' },
    })

    expect(result).toMatchObject({
      kind: 'refused',
      operationRef,
      code: 'invocation_runtime_unavailable',
      retryable: true,
    })
    expect(abandon).toHaveBeenCalledOnce()
  })

  it('resumes orchestration when a replayed reservation has no persisted result', async () => {
    const { operationRef } = fixture()
    let reservation: Parameters<NonNullable<OperationInvokeRuntime['idempotency']['reserve']>>[0] | undefined
    let dispatches = 0
    const service = createOperationInvokeApplication(runtime({
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
          basis: { kind: 'approve_each' as const, authorityRef: 'authority:resume' },
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
      input: { operationRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:empty-replay' },
    }

    const first = await service.invokeOperation(request)
    const resumed = await service.invokeOperation({ ...request, correlationId: 'correlation:empty-replay-resumed' })

    expect(first.kind).toBe('pending')
    expect(resumed.kind).toBe('pending')
    expect(dispatches).toBe(2)
  })
  it('replays the exact result and rejects changed material for one idempotency key', async () => {
    const { operationRef, descriptor, operation } = fixture()
    const reservations = new Map<string, { inputDigest: string; requestDigest: string; invocationRef: string }>()
    let persistedResult: OperationInvokeResult | undefined
    const service = createOperationInvokeApplication(runtime({
      currentOperation: async () => ({ operation, operationRef, descriptor }),
      idempotency: {
        reserve: async (input) => {
          const prior = reservations.get(input.idempotencyKey)
          if (prior === undefined) {
            reservations.set(input.idempotencyKey, input)
            return { kind: 'reserved', reservation: input }
          }
          return prior.requestDigest === input.requestDigest
            ? { kind: 'replayed', reservation: { ...input, invocationRef: prior.invocationRef } }
            : { kind: 'conflict' }
        },
        readReplay: async () => persistedResult,
        abandon: async () => ({ kind: 'abandoned' as const }),
      },
    }))

    const first = await service.invokeOperation({
      principal,
      correlationId: 'correlation:idempotency-1',
      input: { operationRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:stable' },
    })
    persistedResult = first
    const replay = await service.invokeOperation({
      principal,
      correlationId: 'correlation:idempotency-2',
      input: { operationRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:stable' },
    })
    const conflict = await service.invokeOperation({
      principal,
      correlationId: 'correlation:idempotency-3',
      input: { operationRef, input: { symbol: 'BTC', convert: 'EUR' }, idempotencyKey: 'idem:stable' },
    })

    expect(replay).toEqual(first)
    expect(conflict).toMatchObject({ kind: 'refused', operationRef, code: 'idempotency_conflict', retryable: false })
    expect(canonicalDigest(first)).toBe(canonicalDigest(replay))
  })
  it('keeps a valid partial response reconcilable instead of completing it', async () => {
    const { operation, operationRef, descriptor } = fixture()
    const snapshot = canonicalProjectionSnapshot(operationRef, operation.operationId, operation.identity.contractVersion)
    const runQuery = vi.fn(async (reference: unknown) => {
      const path = typeof reference === 'string' ? reference : getFunctionName(reference as never)
      if (path === 'actionInvocationControl:readControl') return snapshot.control
      if (path === 'actionInvocationControl:readAttempt') return snapshot.attempt
      throw new Error(`unexpected_query:${path}`)
    })
    const runMutation = vi.fn().mockResolvedValue({ kind: 'recorded' })
    const ctx = { runQuery, runMutation } as unknown as Parameters<typeof projectOuterResult>[0]

    await projectOuterResult(
      ctx,
      outerDispatch(operationRef),
      operation,
      descriptor,
      {
        transport: 'http',
        disposition: 'partial',
        releaseStarted: true,
        requestDigest: 'sha256:request',
        responseDigest: 'sha256:response',
        outputJson: JSON.stringify(validOutput()),
      },
      '2026-08-09T00:00:00.000Z',
    )

    expect(runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projection: expect.objectContaining({
          state: 'reconciliation_required',
          dispatchState: 'reconciliation_required',
          attemptRef: 'operation-attempt:operation-invocation:test:1',
          result: expect.objectContaining({
            kind: 'reconciliation_required',
            evidence: expect.objectContaining({
              attemptRef: 'operation-attempt:operation-invocation:test:1',
              effectGeneration: 1,
              retry: 'reconcile_before_retry',
            }),
          }),
        }),
      }),
    )
  })

  it('keeps a released schema-invalid response reconcilable instead of refusing pre-release', async () => {
    const { operation, operationRef, descriptor } = fixture()
    const snapshot = canonicalProjectionSnapshot(operationRef, operation.operationId, operation.identity.contractVersion)
    const runQuery = vi.fn(async (reference: unknown) => {
      const path = typeof reference === 'string' ? reference : getFunctionName(reference as never)
      if (path === 'actionInvocationControl:readControl') return snapshot.control
      if (path === 'actionInvocationControl:readAttempt') return snapshot.attempt
      throw new Error(`unexpected_query:${path}`)
    })
    const runMutation = vi.fn().mockResolvedValue({ kind: 'recorded' })
    const ctx = { runQuery, runMutation } as unknown as Parameters<typeof projectOuterResult>[0]

    await projectOuterResult(
      ctx,
      outerDispatch(operationRef),
      operation,
      descriptor,
      {
        transport: 'http',
        disposition: 'succeeded',
        releaseStarted: true,
        requestDigest: 'sha256:request',
        responseDigest: 'sha256:response',
        outputJson: JSON.stringify({ unexpected: true }),
      },
      '2026-08-09T00:00:00.000Z',
    )
    expect(runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projection: expect.objectContaining({
          state: 'reconciliation_required',
          dispatchState: 'reconciliation_required',
          result: expect.objectContaining({ kind: 'reconciliation_required' }),
        }),
      }),
    )
  })
  it('allows a production principal to reach authority and dispatch for a production operation', async () => {
    const { operationRef, descriptor, operation } = fixture('production')
    const productionPrincipal: AgentAccessPrincipal = { ...principal, environment: 'production' }
    const productionGrant: OperationInvokeGrant = { ...grant, environment: 'production' }
    const evaluateAuthority = vi.fn(async () => ({
      kind: 'approved' as const,
      basis: { kind: 'approve_each' as const, authorityRef: 'authority:production' },
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    }))
    const dispatch = vi.fn(async () => ({ kind: 'enqueued' as const }))
    const service = createOperationInvokeApplication(runtime({
      policy: {
        ...runtime().policy,
        readGrant: async () => ({ kind: 'granted', grant: productionGrant }),
        evaluateAuthority,
      },
      currentOperation: async () => ({ operation, operationRef, descriptor }),
      dispatch,
    }, 'production'))

    const result = await service.invokeOperation({
      principal: productionPrincipal,
      correlationId: 'correlation:production-production',
      input: { operationRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:production-production' },
    })

    expect(result).toMatchObject({ kind: 'pending', operationRef })
    expect(evaluateAuthority).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('refuses production principals before authority or dispatch for development evidence', async () => {
    const { operationRef, descriptor, operation } = fixture()
    const productionPrincipal: AgentAccessPrincipal = { ...principal, environment: 'production' }
    const productionGrant: OperationInvokeGrant = { ...grant, environment: 'production' }
    const evaluateAuthority = vi.fn(runtime().policy.evaluateAuthority)
    const dispatch = vi.fn(async () => ({ kind: 'enqueued' as const }))
    const service = createOperationInvokeApplication(runtime({
      policy: {
        ...runtime().policy,
        readGrant: async () => ({ kind: 'granted', grant: productionGrant }),
        evaluateAuthority,
      },
      currentOperation: async () => ({ operation, operationRef, descriptor }),
      dispatch,
    }))

    const result = await service.invokeOperation({
      principal: productionPrincipal,
      correlationId: 'correlation:production-development-evidence',
      input: { operationRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:production-development-evidence' },
    })

    expect(result).toEqual({
      kind: 'refused',
      operationRef,
      code: 'environment_mismatch',
      retryable: false,
      nextAction: operationEnvironmentMismatchNextAction,
    })
    expect(evaluateAuthority).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('refuses persisted production dispatch before worker provider readers for development evidence', async () => {
    const { operation, operationRef } = fixture()
    const productionPrincipal: AgentAccessPrincipal = { ...principal, environment: 'production' }
    const dispatch = {
      invocationRef: 'operation-invocation:worker-environment',
      principalId: productionPrincipal.principalId,
      ownerId: productionPrincipal.ownerId,
      credentialId: productionPrincipal.credentialId,
      applicationRef: productionPrincipal.applicationRef,
      environment: productionPrincipal.environment,
      state: 'pending' as const,
      operationRef,
      idempotencyKey: 'idem:worker-environment',
      inputDigest: 'sha256:worker-input',
      requestDigest: 'sha256:worker-request',
      grantGeneration: 1,
      operationJson: JSON.stringify(operation),
      inputJson: JSON.stringify({ symbol: 'BTC', convert: 'USD' }),
      dispatchState: 'enqueued' as const,
    }
    const principalRow = {
      ...productionPrincipal,
      lifecycle: 'active' as const,
      grantGeneration: 1,
    }
    const runQuery = vi.fn()
      .mockResolvedValueOnce(dispatch)
      .mockResolvedValueOnce(dispatch)
      .mockResolvedValueOnce(principalRow)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ operationJson: JSON.stringify(operation) })
    const runMutation = vi.fn(async (_reference: unknown, _args: Record<string, unknown>) => ({ kind: 'accepted' as const }))
    const workerAction = run as unknown as {
      _handler: (ctx: unknown, args: { invocationRef: string }) => Promise<unknown>
    }
    const handler = workerAction._handler

    const result = await handler({ runQuery, runMutation }, { invocationRef: dispatch.invocationRef })

    expect(result).toEqual({ kind: 'recorded' })
    expect(runQuery).toHaveBeenCalledTimes(6)
    expect(runMutation.mock.calls[0]?.[1]).toMatchObject({
      state: 'refused',
      dispatchState: 'failed',
      result: {
        kind: 'refused',
        operationRef,
        code: 'environment_mismatch',
        retryable: false,
        nextAction: operationEnvironmentMismatchNextAction,
      },
    })
  })
})
