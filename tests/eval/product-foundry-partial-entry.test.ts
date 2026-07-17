import { describe, expect, it } from 'vitest'

import {
  customerRequestOptionsInputSchema,
  customerRequestSubmitInputSchema,
} from '../../src/modules/customer-request/agent-contract'
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
    expect(customerRequestSubmitInputSchema.safeParse({
      idempotencyKey: 'entry-eval',
      requestRef: 'request:entry-eval',
      agentRef: 'agent:entry-eval',
      request: 'Qualify these businesses for this requirement',
      routing: { network: 'ae:public' },
      candidateBusinessRefs: ['business:one', 'business:two'],
    }).success).toBe(false)

    expect(results.find(({ caseId }) => caseId === 'named-business-qualification')).toMatchObject({
      disposition: 'not_addressable',
      missingInputs: ['structured requirement', 'named business candidates'],
    })
  })

  it('keeps quote preparation behind an existing Request revision', () => {
    expect(customerRequestOptionsInputSchema.safeParse({
      revision: 1,
      idempotencyKey: 'quote-entry-eval',
      candidateBusinessRefs: ['business:one'],
      requirement: { service: 'venue' },
    }).success).toBe(false)

    expect(results.find(({ caseId }) => caseId === 'candidate-supplied-quotes')).toMatchObject({
      disposition: 'not_addressable',
      matchingSurfaces: ['Customer Request options preparation'],
      missingInputs: ['comparable requirement', 'named business candidates'],
    })
  })

  it('binds confirmation to an AE request revision and generated route', () => {
    const confirm = findAction('customerRequest.confirm')
    expect(confirm).toBeDefined()
    expect(confirm!.schema.safeParse({
      requestRef: 'request:entry-eval',
      revision: 1,
      routeRef: 'external-proposal:one',
      idempotencyKey: 'commit-entry-eval',
      providerIdentity: 'business:one',
      boundedAuthority: { currency: 'AUD', amountMinor: 10_000 },
    }).success).toBe(false)

    expect(results.find(({ caseId }) => caseId === 'external-proposal-commitment')).toMatchObject({
      disposition: 'not_addressable',
      matchingSurfaces: ['Customer Request confirmation'],
    })
  })

  it('cannot inspect or recover an external commitment through Request actions', () => {
    const inspect = findAction('customerRequest.inspectEvidence')
    const cancel = findAction('customerRequest.cancel')
    expect(inspect).toBeDefined()
    expect(cancel).toBeDefined()
    expect(inspect!.schema.safeParse({
      externalCommitmentRef: 'provider:commitment:one',
      providerIdentity: 'business:one',
    }).success).toBe(false)
    expect(cancel!.schema.safeParse({
      externalCommitmentRef: 'provider:commitment:one',
      idempotencyKey: 'recover-entry-eval',
    }).success).toBe(false)

    expect(results.find(({ caseId }) => caseId === 'external-commitment-inspection')?.disposition)
      .toBe('not_addressable')
    expect(results.find(({ caseId }) => caseId === 'external-commitment-recovery')?.disposition)
      .toBe('not_addressable')
  })
})
