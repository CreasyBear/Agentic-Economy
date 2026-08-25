import { getFunctionName } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import { runChatOperationExecute } from '../../../convex/chatExecute'
import { api } from '../../../convex/_generated/api'
import type { OperationExecuteResult } from '@/modules/capability-execution/operation-execute.functions'

const OPERATION_REF = `operation:v1:${'b'.repeat(64)}`
const OTHER_OPERATION_REF = `operation:v1:${'c'.repeat(64)}`
const SERVICE_KEY = 'chat-operation-execute-service-key-at-least-32-bytes'

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
        principalId: 'ae:server-function',
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
    )).resolves.toEqual({
      kind: 'refused',
      operationRef: OPERATION_REF,
      reason: 'operation_not_found',
    })
    expect(execute).toHaveBeenCalledOnce()
    expect(runQuery.mock.calls[0]?.[1]).toMatchObject({
      operationRef: OPERATION_REF,
      serviceAuth: {
        principalId: 'ae:server-function',
        scopes: ['capability_supply:read_executable'],
      },
    })
    expect(runQuery.mock.calls.map(([reference]) =>
      getFunctionName(reference as Parameters<typeof getFunctionName>[0]))).toEqual([
      getFunctionName(api.capabilitySupplyOperations.readKeylessExecutable),
      getFunctionName(api.capabilitySupplyOperations.detail),
    ])
  })
})
