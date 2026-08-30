import { describe, expect, it, vi } from 'vitest'

import {
  createOperationInvokeApplication,
  type OperationInvokeGrant,
} from '@/modules/capability-execution/operation-invoke'
import { operationEnvironmentMismatchNextAction } from '@/modules/capability-execution/operation-invoke-contracts'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import {
  fixture,
  grant,
  principal,
  runtime,
} from './operation-invoke-harness'

describe('operation.invoke admit/preflight', () => {
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
      dispatch: async () => {
        adapters += 1
        throw new Error('must_not_dispatch')
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
})
