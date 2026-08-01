import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { defineAction } from '@/modules/common/action'
import {
  actionToHarnessTool,
  findStrictToolSchemaViolation,
  resolveHarnessApproval,
  runHarnessTool,
  type HarnessToolDefinition,
} from '@/modules/harness/public'

describe('harness action tool adapter', () => {
  it('converts AE actions into read tools with schema validation', async () => {
    const action = defineAction({
      id: 'registry.search',
      name: 'Search listed businesses',
      summary: 'Search published listings.',
      boundaries: ['Read-only. Does not book, charge, dispatch, or send inquiries.'],
      schema: z.object({ query: z.string().min(1), limit: z.number().int().optional() }),
      outputSchema: z.object({ kind: z.literal('ok'), total: z.number().int() }),
      parameters: [],
      readOnly: true,
      effect: {
        class: 'observation', reversible: true, recipientKind: 'none',
        dataClasses: [], spendExposure: 'none', approval: 'none',
      },
      surfaces: ['answerThread'],
      run: async ({ data }) => ({ kind: 'ok', total: data.limit ?? 1 }),
    })

    const tool = actionToHarnessTool(action)
    expect(tool.tier).toBe('read')
    expect(tool.inputJsonSchema).toMatchObject({ type: 'object' })
    expect(resolveHarnessApproval({ tool, surface: 'answerThread' })).toMatchObject({
      policy: 'allow',
      reason: 'read_tool_auto_allowed',
    })

    const ok = await runHarnessTool({
      tool,
      input: { query: 'plumber', limit: 2 },
      surface: 'answerThread',
      toolCallId: 'tc-1',
    })
    expect(ok.result).toMatchObject({
      toolCallId: 'tc-1',
      toolId: 'registry.search',
      status: 'ok',
    })
    expect(ok.result.outputJson).toBe('{"kind":"ok","total":2}')

    const invalid = await runHarnessTool({
      tool,
      input: { query: '' },
      surface: 'answerThread',
      toolCallId: 'tc-2',
    })
    expect(invalid.result).toMatchObject({
      status: 'error',
      errorCode: 'invalid_input',
    })
  })

  it('blocks admitted writes until AE source-write context is present', async () => {
    const action = defineAction({
      id: 'inquiry.submit',
      name: 'Submit inquiry',
      summary: 'Send a qualified inquiry.',
      boundaries: ['Does not book, charge, dispatch, or auto-fulfil.'],
      schema: z.object({ body: z.string().min(1) }),
      outputSchema: z.object({ kind: z.literal('ok'), receiptId: z.string() }),
      parameters: [],
      readOnly: false,
      effect: {
        class: 'disclosure', reversible: false, recipientKind: 'business',
        dataClasses: ['query_text'], spendExposure: 'none', approval: 'approve_each',
      },
      surfaces: ['answerThread'],
      run: async () => ({ kind: 'ok', receiptId: 'receipt-1' }),
    })
    const tool = actionToHarnessTool(action)

    const withoutWriteAdmission = await runHarnessTool({
      tool,
      input: { body: 'Need help' },
      surface: 'answerThread',
      allowWrites: true,
      toolCallId: 'tc-write-1',
    })
    expect(withoutWriteAdmission.decision).toMatchObject({
      policy: 'prompt',
      reason: 'write_requires_source_admission',
    })
    expect(withoutWriteAdmission.result).toMatchObject({
      status: 'blocked',
      errorCode: 'write_requires_source_admission',
    })

    const admitted = await runHarnessTool({
      tool,
      input: { body: 'Need help' },
      surface: 'answerThread',
      allowWrites: true,
      toolCallId: 'tc-write-2',
      context: {
        sourceWriteRequest: {
          method: 'POST',
          origin: 'https://example.test',
          pathname: '/internal/answer-thread',
          bodyDigest: 'none',
        },
      },
    })
    expect(admitted.decision).toMatchObject({
      policy: 'prompt',
    })
    expect(admitted.result.status).toBe('blocked')
  })

  it('passes timeout abort signals into interruptible tool execution', async () => {
    let sawAbort = false
    const tool: HarnessToolDefinition<unknown, unknown> = {
      id: 'registry.search',
      name: 'Search listed businesses',
      summary: 'Search published listings.',
      boundaries: ['Read-only. Does not book, charge, dispatch, or send inquiries.'],
      tier: 'read',
      surfaces: ['answerThread'],
      inputSchema: z.object({ query: z.string().min(1) }) as z.ZodType<unknown>,
      outputSchema: z.object({ kind: z.literal('ok') }) as z.ZodType<unknown>,
      approval: 'allow',
      interruptible: true,
      run: ({ signal }) => new Promise((resolve) => {
        signal?.addEventListener('abort', () => {
          sawAbort = true
          resolve({ kind: 'ok' })
        }, { once: true })
      }),
    }

    const timedOut = await runHarnessTool({
      tool,
      input: { query: 'plumber' },
      surface: 'answerThread',
      timeoutMs: 1,
      toolCallId: 'tc-timeout',
    })

    expect(sawAbort).toBe(true)
    expect(timedOut.result).toMatchObject({
      toolCallId: 'tc-timeout',
      status: 'timeout',
      errorCode: 'tool_timeout',
    })
  })

  it('rejects tool object schemas that permit unspecified keys', () => {
    for (const schema of [
      {
        name: 'missing additionalProperties',
        schema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
        },
      },
      {
        name: 'additionalProperties true',
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            query: { type: 'string' },
          },
        },
      },
    ]) {
      expect(findStrictToolSchemaViolation(schema.schema), schema.name).toEqual({
        path: '$',
        reason: 'object schemas exposed as tools must set additionalProperties to false',
      })
    }
  })

  it('detects strict JSON-schema type mismatches before model exposure', () => {
    const violation = findStrictToolSchemaViolation({
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: {
          type: 'string',
          enum: ['near_me', 42],
        },
      },
    })

    expect(violation).toEqual({
      path: '$.properties.mode.enum[1]',
      reason: 'enum value 42 does not match declared type string',
    })
  })
})
