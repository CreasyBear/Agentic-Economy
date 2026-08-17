import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import {
  actionToToolContract,
  defineAction,
  describeActionToolExecutionValidation,
  findAction,
  listActions,
} from '@/modules/actions'
import { ANSWER_READ_TOOL_IDS } from '@/modules/answer-thread/tooling'
import {
  actionToHarnessTool,
  actionToHarnessToolContract,
  buildHarnessToolContracts,
  filterAnswerModelToolContracts,
} from '@/modules/harness/public'

type FakeActionResult = Readonly<{ kind: string } & Record<string, unknown>>

describe('harness tool contract', () => {
  it('filters answer-model contracts to the complete read toolset', () => {
    const contracts = buildHarnessToolContracts(listActions())
    const answerContracts = filterAnswerModelToolContracts(contracts)

    expect(answerContracts.map((contract) => contract.id)).toEqual(ANSWER_READ_TOOL_IDS)
    expect(answerContracts.every((contract) => contract.policy.tier === 'read')).toBe(true)
    expect(answerContracts.every((contract) => contract.exposure.answerModel)).toBe(true)
    expect(answerContracts.every((contract) => contract.schemas.providerViolations.length === 0)).toBe(true)
  })

  it('preserves action schema diagnostics through the harness adapter', () => {
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

    const actionContract = actionToToolContract(action)
    const contract = actionToHarnessToolContract(action)
    const validation = describeActionToolExecutionValidation(actionContract)
    const tool = actionToHarnessTool(action)

    expect(tool.providerViolations).toEqual(contract.schemas.providerViolations)
    expect(tool.strictInputSchemaViolation).toBe(validation.strictInputSchemaViolation)
    expect(tool.strictOutputSchemaViolation).toBe(validation.strictOutputSchemaViolation)
  })

  it('projects action identity into harness policy and exposure', () => {
    const action = findAction('registry.operations.compare')
    expect(action).toBeDefined()

    const contract = actionToHarnessToolContract(action!)

    expect(contract.exposure).toEqual({
      surfaces: action!.surfaces,
      answerModel: true,
      publicProjection: 'sanitized-counts',
    })
    expect(contract.policy).toMatchObject({
      tier: 'read',
      approval: {
        mode: 'owner-ui',
        policy: 'allow',
        reason: 'owner_read_requires_auth',
      },
      concurrency: 'shared',
      interruptible: true,
      loadMode: 'discoverable',
      hidden: true,
    })
  })
})
