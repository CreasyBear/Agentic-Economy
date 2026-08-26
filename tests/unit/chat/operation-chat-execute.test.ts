import { getFunctionName } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import { execute as chatExecute, runChatOperationExecute } from '../../../convex/chatExecute'
import { api } from '../../../convex/_generated/api'
import type { OperationExecuteResult } from '@/modules/capability-execution/operation-execute.functions'

const OPERATION_REF = `operation:v1:${'b'.repeat(64)}`
const OTHER_OPERATION_REF = `operation:v1:${'c'.repeat(64)}`
const SERVICE_KEY = 'chat-operation-execute-service-key-at-least-32-bytes'
const SERVICE_AUTHORITY = {
  principalId: `prn_${'1'.repeat(32)}`,
  ownerId: `acc_${'2'.repeat(32)}`,
  credentialId: `crd_${'3'.repeat(32)}`,
} as const

const sourceUnavailable = {
  kind: 'error',
  operationRef: OPERATION_REF,
  code: 'source_unavailable',
  retryable: true,
  reason: 'The executable descriptor source is unavailable.',
} as const

const wireDescriptor = {
  operationRef: OPERATION_REF,
  capabilityId: 'exchange.latest',
  name: 'Latest exchange rate',
  endpointUrl: 'https://rates.example.test/latest',
  authority: { kind: 'keyless' as const },
  adapterId: 'http-json:v1',
  method: 'GET' as const,
  price: { kind: 'on_request' as const },
  effects: [],
  requestTimeoutMs: 2_000,
  inputSchemaJson: JSON.stringify({
    type: 'object',
    properties: { base: { type: 'string' } },
    required: ['base'],
    additionalProperties: false,
  }),
  outputSchemaJson: JSON.stringify({
    type: 'object',
    properties: { rate: { type: 'number' } },
    required: ['rate'],
    additionalProperties: false,
  }),
  provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
}

describe('Operation chat keyless adapter', () => {
  it('denies before descriptor or network work when current Principal and Account do not reconcile', async () => {
    const runQuery = vi.fn(async () => null)
    const handler = (chatExecute as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler
    const authority = {
      principalRef: `prn_${'1'.repeat(32)}`,
      accountRef: `acc_${'2'.repeat(32)}`,
      legacyOwnerId: 'owners:chat-execute',
      legacyOwnerLocator: 'user_chat_execute',
      revision: {
        binding: 1, credential: 1, principal: 1, account: 1, access: 1,
        currentOwnership: 1, currentOwnerPrincipal: 1, compatibilityUpdatedAt: 1,
      },
      provenance: {
        providerNamespace: 'clerk/user',
        bindingRef: `eib_${'3'.repeat(32)}`,
        credentialRef: `crd_${'4'.repeat(32)}`,
        credentialGeneration: 1,
        accessKind: 'ownership',
        accessRef: `own_${'5'.repeat(32)}`,
        currentOwnershipRef: `own_${'5'.repeat(32)}`,
        resolvedAt: 1,
      },
    }

    await expect(handler({ runQuery }, {
      operationRef: OPERATION_REF,
      input: {},
      authority,
    })).resolves.toEqual({
      kind: 'error',
      operationRef: OPERATION_REF,
      code: 'source_unavailable',
      retryable: false,
      reason: 'Current Principal and Account authority is unavailable.',
    })
    expect(runQuery).toHaveBeenCalledOnce()
  })

  it('signs the registered handler descriptor read with reconciled Principal, Account, and credential', async () => {
    const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY
    const authority = {
      principalRef: SERVICE_AUTHORITY.principalId,
      accountRef: SERVICE_AUTHORITY.ownerId,
      legacyOwnerId: 'owners:chat-execute-current',
      legacyOwnerLocator: 'user_chat_execute_current',
      revision: {
        binding: 1, credential: 1, principal: 1, account: 1, access: 1,
        currentOwnership: 1, currentOwnerPrincipal: 1, compatibilityUpdatedAt: 1,
      },
      provenance: {
        providerNamespace: 'clerk/user',
        bindingRef: `eib_${'4'.repeat(32)}`,
        credentialRef: SERVICE_AUTHORITY.credentialId,
        credentialGeneration: 1,
        accessKind: 'ownership',
        accessRef: `own_${'5'.repeat(32)}`,
        currentOwnershipRef: `own_${'5'.repeat(32)}`,
        resolvedAt: 1,
      },
    }
    const runQuery = vi.fn(async (reference: unknown, _args?: unknown) => {
      const name = getFunctionName(reference as Parameters<typeof getFunctionName>[0])
      if (name === 'interactiveAuthority:reconcileScheduledInteractiveAuthority') return authority
      if (name === getFunctionName(api.capabilitySupplyOperations.readKeylessExecutable)) return null
      if (name === getFunctionName(api.capabilitySupplyOperations.detail)) {
        return {
          kind: 'not_found',
          schemaVersion: 'registry-operations:v1',
          operationRef: OPERATION_REF,
          navigation: [],
        }
      }
      throw new Error(`Unexpected query: ${name}`)
    })
    const handler = (chatExecute as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler

    try {
      await expect(handler({ runQuery }, {
        operationRef: OPERATION_REF,
        input: {},
        authority,
      })).resolves.toEqual({
        kind: 'refused',
        operationRef: OPERATION_REF,
        reason: 'operation_not_found',
      })
    } finally {
      if (previousServiceKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
      else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousServiceKey
    }
    expect(runQuery.mock.calls[1]?.[1]).toMatchObject({
      serviceAuth: {
        principalId: SERVICE_AUTHORITY.principalId,
        ownerId: SERVICE_AUTHORITY.ownerId,
        credentialId: SERVICE_AUTHORITY.credentialId,
      },
    })
  })

  it('fails closed when the descriptor credential is missing', async () => {
    const runQuery = vi.fn()
    const execute = vi.fn()

    await expect(runChatOperationExecute(
      { runQuery } as unknown as Parameters<typeof runChatOperationExecute>[0],
      { operationRef: OPERATION_REF, input: {} },
      execute,
    )).resolves.toEqual(sourceUnavailable)
    expect(runQuery).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()

    await expect(runChatOperationExecute(
      { runQuery } as unknown as Parameters<typeof runChatOperationExecute>[0],
      { operationRef: OPERATION_REF, input: {} },
    )).resolves.toEqual(sourceUnavailable)
  })

  it('fails closed when the trimmed descriptor credential is too short', async () => {
    const runQuery = vi.fn()
    const execute = vi.fn()

    await expect(runChatOperationExecute(
      { runQuery } as unknown as Parameters<typeof runChatOperationExecute>[0],
      { operationRef: OPERATION_REF, input: {} },
      execute,
      '      short credential      ',
    )).resolves.toEqual(sourceUnavailable)
    expect(runQuery).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects a descriptor whose operationRef does not match the signed request', async () => {
    const runQuery = vi.fn(async (_reference: unknown, _args?: unknown) => ({
      ...wireDescriptor,
      operationRef: OTHER_OPERATION_REF,
    }))
    const networkExecution = vi.fn()
    const execute = vi.fn(async (input, source): Promise<OperationExecuteResult> => {
      const descriptor = await source.read(input.operationRef)
      if (descriptor !== null) await networkExecution(descriptor)
      return { kind: 'refused', operationRef: input.operationRef, reason: 'operation_not_found' }
    })

    await expect(runChatOperationExecute(
      { runQuery } as unknown as Parameters<typeof runChatOperationExecute>[0],
      { operationRef: OPERATION_REF, input: {} },
      execute,
      SERVICE_KEY,
      SERVICE_AUTHORITY,
    )).resolves.toEqual({
      kind: 'refused',
      operationRef: OPERATION_REF,
      reason: 'operation_not_found',
    })
    expect(networkExecution).not.toHaveBeenCalled()
    expect(runQuery).toHaveBeenCalledOnce()
    expect(runQuery.mock.calls[0]?.[1]).toMatchObject({
      operationRef: OPERATION_REF,
      serviceAuth: {
        principalId: SERVICE_AUTHORITY.principalId,
        ownerId: SERVICE_AUTHORITY.ownerId,
        credentialId: SERVICE_AUTHORITY.credentialId,
        scopes: ['capability_supply:read_executable'],
      },
    })
  })

  it('feeds the existing keyless executor from an authenticated native descriptor read', async () => {
    const runQuery = vi.fn(async (reference: unknown, _args?: unknown) => {
      const name = getFunctionName(reference as Parameters<typeof getFunctionName>[0])
      if (name === getFunctionName(api.capabilitySupplyOperations.readKeylessExecutable)) {
        return wireDescriptor
      }
      if (name === getFunctionName(api.capabilitySupplyOperations.detail)) {
        return {
          kind: 'not_found',
          schemaVersion: 'registry-operations:v1',
          operationRef: OPERATION_REF,
          navigation: [],
        }
      }
      throw new Error(`Unexpected query: ${name}`)
    })
    const execute = vi.fn(async (input, source): Promise<OperationExecuteResult> => {
      expect(input).toEqual({ operationRef: OPERATION_REF, input: { base: 'AUD' } })
      await expect(source.read(OPERATION_REF)).resolves.toMatchObject({
        operationRef: OPERATION_REF,
        endpointUrl: 'https://rates.example.test/latest',
        inputSchema: { required: ['base'] },
        outputSchema: { required: ['rate'] },
      })
      await expect(source.readPublic?.(OPERATION_REF)).resolves.toBeNull()
      return { kind: 'refused', operationRef: OPERATION_REF, reason: 'operation_not_found' }
    })

    await expect(runChatOperationExecute(
      { runQuery } as unknown as Parameters<typeof runChatOperationExecute>[0],
      { operationRef: OPERATION_REF, input: { base: 'AUD' } },
      execute,
      SERVICE_KEY,
      SERVICE_AUTHORITY,
    )).resolves.toEqual({
      kind: 'refused',
      operationRef: OPERATION_REF,
      reason: 'operation_not_found',
    })
    expect(execute).toHaveBeenCalledOnce()
    expect(runQuery.mock.calls[0]?.[1]).toMatchObject({
      operationRef: OPERATION_REF,
      serviceAuth: {
        principalId: SERVICE_AUTHORITY.principalId,
        ownerId: SERVICE_AUTHORITY.ownerId,
        credentialId: SERVICE_AUTHORITY.credentialId,
        scopes: ['capability_supply:read_executable'],
      },
    })
    expect(runQuery.mock.calls.map(([reference]) =>
      getFunctionName(reference as Parameters<typeof getFunctionName>[0]))).toEqual([
      getFunctionName(api.capabilitySupplyOperations.readKeylessExecutable),
      getFunctionName(api.capabilitySupplyOperations.detail),
    ])
  })

  it('exercises the complete registered descriptor source without changing keyless outcomes', async () => {
    const publicOperation = {
      operationRef: OPERATION_REF,
      operationId: 'reference-operation',
      callVia: '/api/v1/operations/invoke',
      paymentLane: 'brokered',
      contract: {
        capabilityId: 'reference.lookup',
        version: 1,
        inputJsonSchema: '{"type":"object","properties":{},"required":[],"additionalProperties":false}',
        outputJsonSchema: '{"type":"object","properties":{},"required":[],"additionalProperties":false}',
        customerAnnotations: [],
      },
      business: { businessId: 'business:reference', slug: 'reference-business', name: 'Reference Business' },
      offering: {
        offeringRef: 'offering:reference',
        revision: 1,
        label: 'Reference lookup',
        summary: 'Reference lookup operation.',
      },
      summary: 'Reference lookup operation.',
      commercial: {
        price: { kind: 'on_request' },
        materialTerms: [],
        relationship: { kind: 'none', summary: 'No commercial relationship.' },
      },
      dataUse: [],
      effects: [],
      evidence: [],
      cancellation: { kind: 'unsupported' },
      recovery: { idempotency: 'not_applicable', recovery: 'retry_safe' },
      authentication: { kind: 'keyless' },
      transport: { method: 'POST', requestTimeoutMs: 1_000 },
      provenance: { publisher: 'ae_curated_external', sourceKind: 'ae_envelope' },
      availability: { posture: 'integrated' },
      navigation: [],
    } as const
    const descriptorWithoutOutput = {
      ...wireDescriptor,
      outputSchemaJson: undefined,
    }
    const runQuery = vi.fn(async (reference: unknown) => {
      const name = getFunctionName(reference as Parameters<typeof getFunctionName>[0])
      if (name === getFunctionName(api.capabilitySupplyOperations.readKeylessExecutable)) {
        return descriptorWithoutOutput
      }
      if (name === getFunctionName(api.capabilitySupplyOperations.detail)) {
        return { kind: 'found', schemaVersion: 'registry-operations:v1', operation: publicOperation }
      }
      throw new Error(`Unexpected query: ${name}`)
    })
    const execute = vi.fn(async (input, source): Promise<OperationExecuteResult> => {
      await expect(source.list()).resolves.toEqual([])
      await expect(source.search('reference')).resolves.toEqual([])
      await expect(source.read(input.operationRef)).resolves.toMatchObject({
        operationRef: OPERATION_REF,
        inputSchema: { required: ['base'] },
      })
      await expect(source.readPublic?.(input.operationRef)).resolves.toMatchObject({
        operationRef: OPERATION_REF,
      })
      return { kind: 'refused', operationRef: input.operationRef, reason: 'operation_not_found' }
    })

    await expect(runChatOperationExecute(
      { runQuery } as unknown as Parameters<typeof runChatOperationExecute>[0],
      { operationRef: OPERATION_REF, input: {} },
      execute,
      SERVICE_KEY,
      SERVICE_AUTHORITY,
    )).resolves.toMatchObject({ kind: 'refused', reason: 'operation_not_found' })

    const invalidSchemaExecute = vi.fn(async (input, source): Promise<OperationExecuteResult> => {
      await expect(source.read(input.operationRef)).rejects.toThrow('keyless_operation_schema_invalid')
      return { kind: 'refused', operationRef: input.operationRef, reason: 'operation_not_found' }
    })
    await expect(runChatOperationExecute(
      {
        runQuery: vi.fn(async () => ({ ...wireDescriptor, inputSchemaJson: '[]' })),
      } as unknown as Parameters<typeof runChatOperationExecute>[0],
      { operationRef: OPERATION_REF, input: {} },
      invalidSchemaExecute,
      SERVICE_KEY,
      SERVICE_AUTHORITY,
    )).resolves.toMatchObject({ kind: 'refused', reason: 'operation_not_found' })
  })
})
