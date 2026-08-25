import { describe, expect, it } from 'vitest'

import { findAction } from '../../src/modules/actions'
import {
  CURRENT_PARTIAL_ENTRY_SURFACES,
  evaluatePartialEntry,
  PARTIAL_ENTRY_CASES,
} from '../../eval/product-foundry/partial-entry'

describe('AE partial workflow entry', () => {
  const results = evaluatePartialEntry(PARTIAL_ENTRY_CASES, CURRENT_PARTIAL_ENTRY_SURFACES)

  it('supports business discovery without Customer Request lineage', () => {
    expect(results.find(({ caseId }) => caseId === 'public-business-discovery')).toMatchObject({
      disposition: 'independent_current',
      matchingSurfaces: ['registry.search / registry.detail'],
    })
  })

  it('does not let a caller constrain Request interpretation to supplied candidates', () => {
    expect(results.find(({ caseId }) => caseId === 'named-business-qualification')).toMatchObject({
      disposition: 'not_addressable',
      missingInputs: ['structured requirement', 'named business candidates'],
    })
  })

  it('keeps quote preparation behind an existing Request revision', () => {
    expect(results.find(({ caseId }) => caseId === 'candidate-supplied-quotes')).toMatchObject({
      disposition: 'not_addressable',
      matchingSurfaces: ['Customer Request options preparation'],
      missingInputs: ['comparable requirement', 'named business candidates'],
    })
  })

  it('binds confirmation to an AE request revision and generated route', () => {
    expect(findAction('customerRequest.confirm')).toBeUndefined()

    expect(results.find(({ caseId }) => caseId === 'external-proposal-commitment')).toMatchObject({
      disposition: 'not_addressable',
      matchingSurfaces: ['Customer Request confirmation'],
    })
  })

  it('cannot inspect or recover an external commitment through Request actions', () => {
    expect(findAction('customerRequest.inspectEvidence')).toBeUndefined()
    expect(findAction('customerRequest.cancel')).toBeUndefined()

    expect(results.find(({ caseId }) => caseId === 'external-commitment-inspection')?.disposition)
      .toBe('not_addressable')
    expect(results.find(({ caseId }) => caseId === 'external-commitment-recovery')?.disposition)
      .toBe('not_addressable')
  })
})
