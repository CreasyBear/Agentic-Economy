import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import {
  actionToToolContract,
  describeActionToolExecutionValidation,
  describeActionToolForModel,
  findAction,
  findStrictToolSchemaViolation,
  type ActionToolContract,
  defineAction,
} from '@/modules/actions'
import { ANSWER_READ_TOOL_IDS } from '@/modules/answer-thread/tooling'

type FakeActionResult = Readonly<{ kind: string } & Record<string, unknown>>

describe('action tool contract', () => {
  it('projects model descriptors from the canonical schema hash', () => {
    const contracts = ANSWER_READ_TOOL_IDS.map((actionId) => {
      const action = findAction(actionId)
      expect(action).toBeDefined()
      return actionToToolContract(action!)
    })

    const descriptors = contracts.map(describeActionToolForModel)

    for (const [index, contract] of contracts.entries()) {
      const modelProjection = descriptors[index]!

      expect(modelProjection.descriptorHash).toBe(contract.schemas.descriptorHash)
      expect(modelProjection.descriptor.function.parameters).toEqual(contract.schemas.inputJsonSchema)
    }

    expect(descriptors.map((projection) => projection.descriptor.function.name)).toEqual(ANSWER_READ_TOOL_IDS)
    expect(descriptors.every((projection) => projection.descriptor.type === 'function')).toBe(true)
  })

  it('builds canonical operation read contracts and preserves full input schemas', () => {
    for (const actionId of ['registry.operations.compare', 'registry.operations.inspectPlan'] as const) {
      const action = findAction(actionId)
      expect(action).toBeDefined()
      expect(() => actionToToolContract(action!)).not.toThrow('canonical_digest_value_invalid')

      const contract = actionToToolContract(action!)
      const projection = describeActionToolForModel(contract)

      expect(contract.schemas.descriptorHash).toMatch(/^sha256:[0-9a-f]{64}$/)
      expect(contract.schemas.inputJsonSchema).toBeDefined()
      expect(projection.descriptor.function.parameters).toEqual(contract.schemas.inputJsonSchema)
      expect(contract.readOnly).toBe(true)
      expect(contract.surfaces).toEqual(action!.surfaces)
    }
  })

  it('preserves invalid provider diagnostics for execution gating', () => {
    const action = defineAction({
      id: 'registry.search',
      name: 'Search listed businesses',
      summary: 'Search published listings.',
      boundaries: ['Read-only. Does not book, charge, dispatch, or send inquiries.'],
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          mode: {
            type: 'string',
            enum: ['near_me', 42],
          },
        },
      } as unknown as z.ZodType<unknown>,
      outputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: {
            type: 'string',
            const: false,
          },
        },
      } as unknown as z.ZodType<FakeActionResult>,
      parameters: [],
      readOnly: true,
      effect: {
        class: 'observation', reversible: true, recipientKind: 'none',
        dataClasses: [], spendExposure: 'none', approval: 'none',
      },
      surfaces: ['answerThread'],
      invocationContract: {
        version: 'registry.search:v1',
        consequenceClass: 'read_only',
        materialInputPaths: ['mode'],
        authorityRequirement: 'none',
        retryClass: 'replayable',
        expectedEvidence: [],
        safeContinuations: [],
        invalidationConditions: [],
      },
      run: async (): Promise<FakeActionResult> => ({ kind: 'ok' }),
    })

    const contract = actionToToolContract(action)
    const validation = describeActionToolExecutionValidation(contract)

    expect(contract.schemas.providerViolations).toEqual([
      'input schema at $.properties.mode.enum[1]: enum value 42 does not match declared type string',
      'output schema at $.properties.kind.const: const value false does not match declared type string',
    ])
    expect(validation.strictInputSchemaViolation).toBe(
      'enum value 42 does not match declared type string',
    )
    expect(validation.strictOutputSchemaViolation).toBe(
      'const value false does not match declared type string',
    )
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

  it('executes action runs without harness instrumentation', async () => {
    const seen: { input?: unknown; context?: unknown } = {}
    const action = defineAction({
      id: 'registry.search',
      name: 'Search listed businesses',
      summary: 'Search published listings.',
      boundaries: ['Read-only. Does not book, charge, dispatch, or send inquiries.'],
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      } as unknown as z.ZodType<unknown>,
      outputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { kind: { type: 'string' } },
      } as unknown as z.ZodType<FakeActionResult>,
      parameters: [],
      readOnly: true,
      effect: {
        class: 'observation', reversible: true, recipientKind: 'none',
        dataClasses: [], spendExposure: 'none', approval: 'none',
      },
      surfaces: ['answerThread'],
      invocationContract: {
        version: 'registry.search:v1',
        consequenceClass: 'read_only',
        materialInputPaths: [],
        authorityRequirement: 'none',
        retryClass: 'replayable',
        expectedEvidence: [],
        safeContinuations: [],
        invalidationConditions: [],
      },
      run: async ({ data, context }): Promise<FakeActionResult> => {
        seen.input = data
        seen.context = context
        return { kind: 'ok' }
      },
    })
    const context = { correlationId: 'context' }
    const input = { marker: 'input' }
    const contract: ActionToolContract = actionToToolContract(action)

    await expect(contract.execute({ input, context })).resolves.toEqual({ kind: 'ok' })
    expect(seen).toEqual({ input, context })
  })
})
