import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import { defineAction, listActions } from '@/modules/actions'
import { AnswerToolIdValues } from '@/modules/answer-thread/answer-thread.schema'
import {
  AnswerModelToolIds,
  actionToHarnessTool,
  actionToHarnessToolContract,
  buildHarnessToolContracts,
  describeHarnessToolExecutionValidation,
  describeHarnessToolForAnswerModel,
  filterAnswerModelToolContracts,
  harnessToolContractToDefinition,
} from '@/modules/harness/public'

type FakeActionResult = Readonly<{ kind: string } & Record<string, unknown>>

describe('harness tool contract', () => {
  it('filters answer-model descriptors to the complete read toolset', () => {
    const contracts = buildHarnessToolContracts(listActions())
    const answerContracts = filterAnswerModelToolContracts(contracts)
    const descriptors = answerContracts.map(describeHarnessToolForAnswerModel)

    expect(answerContracts.map((contract) => contract.id)).toEqual([...AnswerModelToolIds])
    expect(AnswerModelToolIds).toEqual(AnswerToolIdValues)
    expect(answerContracts.every((contract) => contract.policy.tier === 'read')).toBe(true)
    expect(answerContracts.every((contract) => contract.schemas.providerViolations.length === 0)).toBe(true)
    expect(descriptors.map((projection) => projection.descriptor.function.name)).toEqual([...AnswerModelToolIds])
    expect(descriptors.every((projection) => projection.descriptor.type === 'function')).toBe(true)
  })

  it('projects answer-model descriptors from the canonical schema hash', () => {
    const contracts = filterAnswerModelToolContracts(buildHarnessToolContracts(listActions()))

    for (const contract of contracts) {
      const modelProjection = describeHarnessToolForAnswerModel(contract)

      expect(modelProjection.descriptorHash).toBe(contract.schemas.descriptorHash)
      expect(modelProjection.descriptor.function.parameters).toEqual(contract.schemas.inputJsonSchema)
    }
  })

  it('preserves invalid schema diagnostics for execution gating', () => {
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

    const contract = actionToHarnessToolContract(action)
    const validation = describeHarnessToolExecutionValidation(contract)
    const tool = actionToHarnessTool(action)

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
    expect(tool.providerViolations).toEqual(contract.schemas.providerViolations)
    expect(tool.strictInputSchemaViolation).toBe(validation.strictInputSchemaViolation)
    expect(tool.strictOutputSchemaViolation).toBe(validation.strictOutputSchemaViolation)
  })

})
