import { describe, expect, it } from 'vitest'

import { findAction } from '@/modules/actions'
import { actionToOpenRouterTool } from '@/modules/answer/internal/action-to-tool-spec'

describe('actionToOpenRouterTool', () => {
  it('projects the action summary and boundaries into the tool description', () => {
    const action = findAction('registry.search')
    expect(action).toBeDefined()

    const spec = actionToOpenRouterTool(action!)
    expect(spec.type).toBe('function')
    expect(spec.function.name).toBe('registry_search')
    expect(spec.function.description).toContain(action!.summary)
    expect(spec.function.description).toContain('Boundaries:')
  })
  it('preserves the canonical operationRefs array schema for compare', () => {
    const spec = actionToOpenRouterTool(findAction('registry.operations.compare')!)

    expect(spec.function.parameters).toMatchObject({
      type: 'object',
      properties: {
        operationRefs: {
          type: 'array',
          items: {
            type: 'string',
            pattern: '^operation:v1:[0-9a-f]{64}$',
          },
          minItems: 1,
          maxItems: 4,
        },
      },
      required: ['operationRefs'],
      additionalProperties: false,
    })
  })

  it('preserves the canonical operation composition schema for inspectPlan', () => {
    const spec = actionToOpenRouterTool(findAction('registry.operations.inspectPlan')!)

    expect(spec.function.parameters).toMatchObject({
      type: 'object',
      properties: {
        operationRefs: {
          type: 'array',
          items: {
            type: 'string',
            pattern: '^operation:v1:[0-9a-f]{64}$',
          },
          minItems: 1,
          maxItems: 4,
        },
        mappingRefs: {
          type: 'array',
          items: {
            type: 'string',
            pattern: '^mapping:v1:[0-9a-f]{64}$',
          },
          maxItems: 32,
        },
        expiresInMs: {
          type: 'integer',
          minimum: 1_000,
          maximum: 86_400_000,
        },
      },
      required: ['operationRefs'],
      additionalProperties: false,
    })
})
})
