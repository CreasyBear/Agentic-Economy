import { describe, expect, it } from 'vitest'

import { freezeAgentJourneyCohort } from '@/modules/customer-request/agent-journey-cohort'

describe('agent journey cohort', () => {
  it('canonically binds every condition shared by the AE and direct paths', () => {
    const first = freezeAgentJourneyCohort(cohort())
    const reordered = freezeAgentJourneyCohort({
      ...cohort(),
      providerOrigins: [...cohort().providerOrigins].reverse(),
      authorityScope: {
        recipients: [...cohort().authorityScope.recipients].reverse(),
        purposes: [...cohort().authorityScope.purposes].reverse(),
        effects: [...cohort().authorityScope.effects].reverse(),
      },
      providerOutputs: [...cohort().providerOutputs].reverse(),
    })

    expect(first).toMatchObject({
      format: 'ae.agent-journey-cohort:v1',
      input: {
        request: 'Procure an accessible transfer and prepare a fixed quote under AUD 15.',
        customerAnswers: { passengers: 2, wheelchairAccess: true },
        providerOrigins: [
          'https://providers.example/quote',
          'https://providers.example/resolve',
        ],
        maximumTotalCost: { currency: 'AUD', amountMinor: 1_500 },
      },
    })
    expect(first.digest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(reordered).toEqual(first)
  })

  it('changes the digest when any substantive shared condition changes', () => {
    const original = freezeAgentJourneyCohort(cohort())
    const changed = freezeAgentJourneyCohort({
      ...cohort(),
      authorityScope: { ...cohort().authorityScope, effects: ['prepare_quote', 'purchase'] },
    })

    expect(changed.digest).not.toBe(original.digest)
  })
})

function cohort() {
  return {
    request: 'Procure an accessible transfer and prepare a fixed quote under AUD 15.',
    customerAnswers: { wheelchairAccess: true, passengers: 2 },
    providerOrigins: [
      'https://providers.example/resolve',
      'https://providers.example/quote',
    ],
    maximumTotalCost: { currency: 'AUD', amountMinor: 1_500 },
    authorityScope: {
      recipients: ['Sandbox Resolver', 'Sandbox Quoter'],
      purposes: ['resolve_request', 'prepare_quote'],
      effects: ['prepare_quote'],
    },
    providerOutputs: [
      { provider: 'Sandbox Resolver', digest: 'sha256:' + 'a'.repeat(64) },
      { provider: 'Sandbox Quoter', digest: 'sha256:' + 'b'.repeat(64) },
    ],
    resultUsabilityRubric: 'customer_result_and_schema_valid_evidence:v1',
  } as const
}
