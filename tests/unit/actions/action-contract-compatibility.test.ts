import { describe, expect, it } from 'vitest'

import { defineAction, resolveActionContract } from '@/modules/common/action'
import { z } from 'zod'

describe('registered action contract compatibility', () => {
  it('labels legacy actions without inferring undeclared consequential semantics', () => {
    const legacyAction = defineAction({
      id: 'test.legacyWrite',
      name: 'Legacy write',
      summary: 'Test-only legacy action.',
      boundaries: [],
      schema: z.object({ value: z.string() }),
      outputSchema: z.object({ kind: z.literal('ok') }),
      parameters: [],
      readOnly: false,
      effect: {
        class: 'external_state_change', reversible: false, recipientKind: 'none',
        dataClasses: [], spendExposure: 'none', approval: 'approve_each',
      },
      surfaces: [],
      run: async () => ({ kind: 'ok' as const }),
    })

    expect(resolveActionContract(legacyAction)).toEqual({
      version: 'legacy:v1',
      consequenceClass: 'legacy_unclassified_write',
      materialInputPaths: [],
      authorityRequirement: 'legacy_unspecified',
      retryClass: 'legacy_unspecified',
      expectedEvidence: [],
      safeContinuations: [],
      invalidationConditions: [],
      compatibility: 'derived_from_legacy_read_only_flag',
    })
  })

  it('preserves explicit immutable invocation metadata', () => {
    const classifiedAction = defineAction({
      id: 'test.classifiedRead',
      name: 'Classified read',
      summary: 'Test-only classified action.',
      boundaries: [],
      schema: z.object({ slug: z.string() }),
      outputSchema: z.object({ kind: z.literal('ok') }),
      parameters: [],
      readOnly: true,
      effect: {
        class: 'observation', reversible: true, recipientKind: 'none',
        dataClasses: [], spendExposure: 'none', approval: 'none',
      },
      surfaces: [],
      invocationContract: {
        version: '2026-07-19',
        consequenceClass: 'read_only',
        materialInputPaths: ['slug'],
        authorityRequirement: 'none',
        retryClass: 'replayable',
        expectedEvidence: ['action_result'],
        safeContinuations: ['inspect_result'],
        invalidationConditions: ['action_contract_version_changed'],
      },
      run: async () => ({ kind: 'ok' as const }),
    })

    expect(resolveActionContract(classifiedAction)).toEqual({
      ...classifiedAction.invocationContract,
      compatibility: 'explicit',
    })
  })
})
