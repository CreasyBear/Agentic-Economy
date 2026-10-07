import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  registryToolsCompareContract,
  registryToolsDescribeContract,
  registryToolsListContract,
  registryToolsSearchContract,
} from '@/modules/registry/tool-action-contracts'

const actions = [
  registryToolsListContract,
  registryToolsSearchContract,
  registryToolsDescribeContract,
  registryToolsCompareContract,
] as const

describe('registry action JSON Schema boundary', () => {
  it('discloses semantic-search data release without adding purchase authority or approval', () => {
    expect(registryToolsSearchContract.effect).toEqual({
      class: 'disclosure', reversible: false, recipientKind: 'provider_system',
      dataClasses: ['search_query', 'candidate_summaries'], spendExposure: 'none', approval: 'none',
    })
    expect(registryToolsSearchContract.boundaries.join(' ')).toContain('configured Jev decision service')
    expect(registryToolsSearchContract.invocationContract.authorityRequirement).toBe('none')
    expect(registryToolsSearchContract.readOnly).toBe(true)
  })

  it.each(actions)('$id has representable input and output schemas', action => {
    // Output wire validation runs before the branded-ref transforms. The same
    // input view is what the action/OpenAPI generator converts to JSON Schema.
    expect(z.toJSONSchema(action.schema, { io: 'input' })).toBeDefined()
    expect(z.toJSONSchema(action.outputSchema, { io: 'input' })).toBeDefined()
  })
})
