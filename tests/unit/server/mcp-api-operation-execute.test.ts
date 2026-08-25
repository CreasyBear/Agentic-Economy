import {
  currentOperationRef,
  operationExecuteMocks,
  postMcp,
  readMcpBody,
} from './mcp-api-harness'
import { describe, expect, it } from 'vitest'

describe('MCP host adapter operation.execute tool', () => {
  it('delegates a valid MCP operation call to the canonical keyless executor once', async () => {
    operationExecuteMocks.executeKeylessOperation.mockResolvedValue({
      kind: 'ok',
      operationRef: currentOperationRef,
      capabilityId: 'weather.current',
      name: 'Current weather',
      output: { temperature: 21 },
      evidenceHash: 'evidence-hash',
    })

    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'operation-execute',
      method: 'tools/call',
      params: {
        name: 'ae_operation_execute',
        arguments: {
          operationRef: currentOperationRef,
          input: { latitude: -33.86, longitude: 151.2 },
        },
      },
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    const result = body.result as Record<string, unknown>
    expect(operationExecuteMocks.executeKeylessOperation).toHaveBeenCalledTimes(1)
    expect(operationExecuteMocks.executeKeylessOperation).toHaveBeenCalledWith({
      operationRef: currentOperationRef,
      input: { latitude: -33.86, longitude: 151.2 },
    })
    expect(result.isError).not.toBe(true)
    expect((result.structuredContent as { result?: unknown } | undefined)?.result).toEqual({
      kind: 'ok',
      operationRef: currentOperationRef,
      capabilityId: 'weather.current',
      name: 'Current weather',
      output: { temperature: 21 },
      evidenceHash: 'evidence-hash',
    })
  })

  it('fails closed when a canonical action returns invalid structured output', async () => {
    operationExecuteMocks.executeKeylessOperation.mockResolvedValue({
      kind: 'ok',
      operationRef: currentOperationRef,
    })

    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'operation-invalid-output',
      method: 'tools/call',
      params: {
        name: 'ae_operation_execute',
        arguments: {
          operationRef: currentOperationRef,
          input: {},
        },
      },
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    const result = body.result as Record<string, unknown>
    expect(result).toMatchObject({ isError: true })
    expect(result).not.toHaveProperty('structuredContent')
    expect(result.content).toEqual(expect.arrayContaining([
      { type: 'text', text: expect.stringContaining('action_output_invalid') },
    ]))
  })

  it('returns literal stale and non-keyless refusals from the canonical executor', async () => {
    operationExecuteMocks.executeKeylessOperation.mockClear()
    for (const reason of ['operation_not_found', 'operation_not_keyless'] as const) {
      operationExecuteMocks.executeKeylessOperation.mockResolvedValue({
        kind: 'refused',
        operationRef: currentOperationRef,
        reason,
      })

      const response = await postMcp({
        jsonrpc: '2.0',
        id: `operation-refusal-${reason}`,
        method: 'tools/call',
        params: {
          name: 'ae_operation_execute',
          arguments: { operationRef: currentOperationRef, input: {} },
        },
      })

      expect(response.status).toBe(200)
      const body = await readMcpBody(response)
      const result = body.result as Record<string, unknown>
      expect(result.isError).not.toBe(true)
      expect((result.structuredContent as { result?: unknown } | undefined)?.result).toMatchObject({
        kind: 'refused',
        operationRef: currentOperationRef,
        reason,
      })
    }
    expect(operationExecuteMocks.executeKeylessOperation).toHaveBeenCalledTimes(2)
  })

  it('rejects malformed input and caller-supplied execution authority before running', async () => {
    for (const argumentsValue of [
      { input: {} },
      {
        operationRef: currentOperationRef,
        input: {},
        endpointUrl: 'https://attacker.example',
        method: 'POST',
        credentialRef: 'attacker-secret',
      },
    ]) {
      const response = await postMcp({
        jsonrpc: '2.0',
        id: 'operation-invalid',
        method: 'tools/call',
        params: {
          name: 'ae_operation_execute',
          arguments: argumentsValue,
        },
      })

      expect(response.status).toBe(200)
      const body = await readMcpBody(response)
      expect(body.result).toMatchObject({ isError: true })
    }
    expect(operationExecuteMocks.executeKeylessOperation).not.toHaveBeenCalled()
  })
})
