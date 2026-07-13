import { describe, expect, it, vi } from 'vitest'

import { createJsonCustomerRequestSemanticInterpreter } from '@/modules/customer-request/semantic-interpreter'

describe('Customer Request semantic interpreter', () => {
  it('proposes only registered capability ids and typed facts without creating a route or authority', async () => {
    const generateJson = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        candidateCapabilityContractIds: ['parcel.rate:v1', 'invented.purchase:v1'],
        decisionPreference: 'lowest_maximum_price',
        facts: [
          { capabilityContractId: 'parcel.rate:v1', field: 'weight_grams', value: 1_250 },
          { capabilityContractId: 'invented.purchase:v1', field: 'maximumSpendMinor', value: 0 },
        ],
      }),
    })
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:test', transport: { generateJson }, timeoutMs: 1_000, maximumResponseBytes: 8_000,
    })

    const proposal = await interpreter.propose({
      customerJob: 'The parcel weighs 1250 grams. Compare parcel rates.',
      explicitFacts: {},
      capabilities: [
        {
          capabilityContractId: 'parcel.rate:v1', name: 'Parcel rate', operation: 'quote',
          description: 'Returns a parcel shipping rate.',
          input: [
            { field: 'weight_grams', customerLabel: 'Parcel weight', valueType: 'integer', required: true },
            { field: 'destination_postcode', customerLabel: 'Destination postcode', valueType: 'string', required: true },
          ],
          output: [{ field: 'total_minor', customerLabel: 'Total price', valueType: 'money_minor' }],
        },
        {
          capabilityContractId: 'meeting-room.availability:v1', name: 'Meeting room availability', operation: 'query',
          description: 'Checks available meeting rooms.', input: [], output: [],
        },
      ],
    })

    expect(proposal.kind).toBe('capability_candidates')
    if (proposal.kind !== 'capability_candidates') throw new Error('capability_proposal_expected')
    expect(proposal.candidateCapabilityContractIds).toEqual(['parcel.rate:v1'])
    expect(proposal.facts).toEqual({
      weight_grams: {
        value: 1_250,
        source: { kind: 'agent_inference', inferenceRef: expect.stringMatching(/^inference:/) },
      },
    })
    expect(proposal.decisionPreference).toEqual({
      objective: 'lowest_maximum_price', basis: 'extracted_from_request', evidenceRef: expect.stringMatching(/^inference:/),
    })
    expect(JSON.stringify(generateJson.mock.calls[0])).not.toMatch(/planRevision|maximumSpendMinor|approvalGrant/)
  })

  it('does not promote a same-named fact across incompatible selected capability contracts', async () => {
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:test',
      transport: { generateJson: vi.fn().mockResolvedValue({ content: JSON.stringify({
        candidateCapabilityContractIds: ['parcel.rate:v1', 'freight.rate:v1'],
        facts: [{ capabilityContractId: 'parcel.rate:v1', field: 'weight', value: 1_250 }],
      }) }) },
      timeoutMs: 1_000, maximumResponseBytes: 8_000,
    })

    const proposal = await interpreter.propose({
      customerJob: 'The parcel weighs 1250 grams.', explicitFacts: {},
      capabilities: [
        { capabilityContractId: 'parcel.rate:v1', name: 'Parcel', operation: 'quote', description: 'Parcel rate',
          input: [{ field: 'weight', customerLabel: 'Weight in grams', valueType: 'integer', required: true }], output: [] },
        { capabilityContractId: 'freight.rate:v1', name: 'Freight', operation: 'quote', description: 'Freight rate',
          input: [{ field: 'weight', customerLabel: 'Weight class', valueType: 'string', required: true }], output: [] },
      ],
    })

    expect(proposal.kind).toBe('capability_candidates')
    if (proposal.kind !== 'capability_candidates') throw new Error('capability_proposal_expected')
    expect(proposal.facts).toEqual({})
  })

  it('preserves an explicit cheapest priority when the model omits it', async () => {
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:test',
      transport: { generateJson: vi.fn().mockResolvedValue({ content: JSON.stringify({
        candidateCapabilityContractIds: ['sandbox.option.quote:v1'], facts: [],
      }) }) },
      timeoutMs: 1_000, maximumResponseBytes: 8_000,
    })

    const proposal = await interpreter.propose({
      customerJob: 'Find the cheapest connected sandbox option.', explicitFacts: {},
      capabilities: [{
        capabilityContractId: 'sandbox.option.quote:v1', name: 'Sandbox option', operation: 'quote',
        description: 'Returns a sandbox option.', input: [], output: [],
      }],
    })

    expect(proposal.kind).toBe('capability_candidates')
    if (proposal.kind !== 'capability_candidates') throw new Error('capability_proposal_expected')
    expect(proposal.decisionPreference).toEqual({
      objective: 'lowest_maximum_price', basis: 'extracted_from_request', evidenceRef: expect.stringMatching(/^inference:/),
    })
  })

  it.each([
    'Do not prioritize the cheapest option.',
    "The cheapest option isn't necessarily the best.",
    'Compare quality rather than the lowest price.',
  ])('does not invent a price priority from negated customer language: %s', async (customerJob) => {
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:test',
      transport: { generateJson: vi.fn().mockResolvedValue({ content: JSON.stringify({
        candidateCapabilityContractIds: ['sandbox.option.quote:v1'], facts: [],
      }) }) },
      timeoutMs: 1_000, maximumResponseBytes: 8_000,
    })

    const proposal = await interpreter.propose({
      customerJob, explicitFacts: {}, capabilities: [{
        capabilityContractId: 'sandbox.option.quote:v1', name: 'Sandbox option', operation: 'quote',
        description: 'Returns a sandbox option.', input: [], output: [],
      }],
    })

    expect(proposal.kind).toBe('capability_candidates')
    if (proposal.kind !== 'capability_candidates') throw new Error('capability_proposal_expected')
    expect(proposal.decisionPreference).toBeUndefined()
  })
})
