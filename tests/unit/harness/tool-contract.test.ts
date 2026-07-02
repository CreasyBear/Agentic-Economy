import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import { defineAction, listActions } from '@/modules/actions'
import {
  AnswerModelToolIds,
  PublicQuietAgentToolIds,
  actionToHarnessTool,
  actionToHarnessToolContract,
  buildHarnessToolContracts,
  buildHarnessToolEvalFixture,
  describeHarnessToolExecutionValidation,
  describeHarnessToolForAnswerModel,
  describeHarnessToolForQuietAgent,
  filterAnswerModelToolContracts,
  filterQuietAgentToolContracts,
} from '@/modules/harness/public'

type FakeActionResult = Readonly<{ kind: string } & Record<string, unknown>>

describe('harness tool contract', () => {
  it('keeps the quiet agent allowlist exact and canonically ordered', () => {
    const contracts = buildHarnessToolContracts(listActions())
    const quietContracts = filterQuietAgentToolContracts(contracts)

    expect(quietContracts.map((contract) => contract.id)).toEqual([...PublicQuietAgentToolIds])
  })

  it('filters answer-model descriptors to the registry read tools only', () => {
    const contracts = buildHarnessToolContracts(listActions())
    const answerContracts = filterAnswerModelToolContracts(contracts)
    const descriptors = answerContracts.map(describeHarnessToolForAnswerModel)

    expect(answerContracts.map((contract) => contract.id)).toEqual([...AnswerModelToolIds])
    expect(answerContracts.every((contract) => contract.policy.tier === 'read')).toBe(true)
    expect(descriptors.map((projection) => projection.descriptor.function.name)).toEqual([...AnswerModelToolIds])
    expect(descriptors.every((projection) => projection.descriptor.type === 'function')).toBe(true)
  })

  it('projects quiet and model descriptors from the same schema hash', () => {
    const contracts = filterAnswerModelToolContracts(buildHarnessToolContracts(listActions()))

    for (const contract of contracts) {
      const quietProjection = describeHarnessToolForQuietAgent(contract)
      const modelProjection = describeHarnessToolForAnswerModel(contract)
      const evalFixture = buildHarnessToolEvalFixture(contract)

      expect(quietProjection.descriptorHash).toBe(contract.schemas.descriptorHash)
      expect(modelProjection.descriptorHash).toBe(contract.schemas.descriptorHash)
      expect(evalFixture.descriptorHash).toBe(contract.schemas.descriptorHash)
      expect(quietProjection.descriptor.inputJsonSchema).toEqual(modelProjection.descriptor.function.parameters)
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
        properties: {
          mode: {
            type: 'string',
            enum: ['near_me', 42],
          },
        },
      } as unknown as z.ZodType<unknown>,
      outputSchema: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            const: false,
          },
        },
      } as unknown as z.ZodType<FakeActionResult>,
      parameters: [],
      readOnly: true,
      surfaces: ['agentTools'],
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

  it('keeps raw internal fields out of the quiet descriptor projection', () => {
    const contract = filterQuietAgentToolContracts(buildHarnessToolContracts(listActions()))[0]
    expect(contract).toBeDefined()

    const quietDescriptor = describeHarnessToolForQuietAgent(contract!).descriptor

    expect(Object.keys(quietDescriptor).sort()).toEqual([
      'boundaries',
      'hasOutputSchema',
      'id',
      'inputJsonSchema',
      'name',
      'outputJsonSchema',
      'parameters',
      'readOnly',
      'summary',
    ])
    for (const internalField of [
      'descriptorHash',
      'providerViolations',
      'providerDiagnostics',
      'inputSchema',
      'outputSchema',
      'execute',
      'policy',
      'exposure',
      'approval',
      'sourceWrite',
    ]) {
      expect(quietDescriptor).not.toHaveProperty(internalField)
    }
  })

  it('builds eval fixtures from the same contract bundle without raw runners', () => {
    const [contract] = filterQuietAgentToolContracts(buildHarnessToolContracts(listActions()))
    expect(contract).toBeDefined()

    const fixture = buildHarnessToolEvalFixture(contract!)

    expect(fixture).toMatchObject({
      schemaVersion: 1,
      toolId: contract!.id,
      descriptorHash: contract!.schemas.descriptorHash,
      exposure: {
        quietAgent: true,
      },
      policy: {
        tier: contract!.policy.tier,
      },
    })
    expect(JSON.stringify(fixture)).not.toMatch(/execute|inputSchema|outputSchema/)
  })
})
