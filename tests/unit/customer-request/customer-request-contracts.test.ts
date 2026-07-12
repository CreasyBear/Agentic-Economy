import { describe, expect, it } from 'vitest'

import {
  createCapabilityContractRegistry,
  createCustomerRequest,
  createPlanRevision,
  defineCapabilityContract,
} from '@/modules/customer-request/public'

describe('customer request contracts', () => {
  it('creates a canonical durable Request independently from replaceable Plan revisions', () => {
    const request = createCustomerRequest({
      requestId: 'request:shipping:1',
      principalId: 'principal:customer:1',
      delegatedAgentId: 'agent:customer:1',
      intent: '  Compare a courier and buy one shipping label.  ',
      createdAt: 1_000,
    })

    expect(request).toEqual({
      requestId: 'request:shipping:1',
      principalId: 'principal:customer:1',
      delegatedAgentId: 'agent:customer:1',
      intent: 'Compare a courier and buy one shipping label.',
      revision: 1,
      createdAt: 1_000,
    })
    expect(Object.isFrozen(request)).toBe(true)
  })

  it('rejects a capability that tries to make material consequence approval-free', () => {
    expect(() => defineCapabilityContract({
      capabilityContractId: 'shipping.label.purchase:v1',
      name: 'Purchase a shipping label',
      operation: 'purchase',
      input: {
        offerRef: field('provider_offer_ref', 'Provider offer'),
      },
      output: {
        labelUrl: field('url', 'Shipping label'),
      },
      consequence: {
        commitment: 'purchase',
        spend: 'quoted',
        reversibility: 'conditional',
        approval: 'none',
      },
    })).toThrowError('capability_material_consequence_requires_authority')
  })

  it('requires authority for an information query that discloses personal data', () => {
    expect(() => defineCapabilityContract({
      capabilityContractId: 'shipping.rate.query:v1',
      name: 'Query shipping rates',
      operation: 'query',
      input: {
        destinationPostcode: {
          ...field('string', 'Destination postcode'),
          disclosure: {
            classification: 'personal',
            recipient: 'selected_provider',
            purposes: ['shipping_rate_quote'],
          },
        },
      },
      output: {
        offerRef: { ...field('provider_offer_ref', 'Provider offer'), evidenceRole: 'provider_offer' },
      },
      consequence: {
        commitment: 'none',
        spend: 'none',
        reversibility: 'not_applicable',
        approval: 'none',
      },
    })).toThrowError('capability_material_consequence_requires_authority')
  })

  it('rejects a capability whose operation contradicts its commitment semantics', () => {
    expect(() => defineCapabilityContract({
      capabilityContractId: 'shipping.rate.query:v1',
      name: 'Misdeclared shipping query',
      operation: 'query',
      input: {},
      output: {},
      consequence: {
        commitment: 'purchase',
        spend: 'quoted',
        reversibility: 'conditional',
        approval: 'explicit',
      },
    })).toThrowError('capability_operation_commitment_mismatch')
  })

  it('rejects model-authored effect and authority overrides in a Plan revision', () => {
    const registry = shippingRegistry()
    const customerRequest = request()

    expect(() => createPlanRevision({
      planRevisionId: 'plan-revision:1',
      requestId: customerRequest.requestId,
      requestRevision: customerRequest.revision,
      proposedByAgentId: customerRequest.delegatedAgentId,
      createdAt: 1_100,
      actions: [{
        actionId: 'action:quote',
        capabilityContractId: 'shipping.rate.query:v1',
        dependsOn: [],
        input: { destinationPostcode: { kind: 'literal', value: '3000' } },
        effect: 'observation',
        authority: { maximumSpendMinor: 0 },
      }],
    }, registry)).toThrowError('plan_revision_invalid')
  })

  it('validates typed action outputs, declared dependencies, and provider-offer affinity', () => {
    const plan = createPlanRevision({
      planRevisionId: 'plan-revision:shipping:1',
      requestId: 'request:shipping:1',
      requestRevision: 1,
      proposedByAgentId: 'agent:customer:1',
      createdAt: 1_100,
      actions: [
        {
          actionId: 'action:quote',
          capabilityContractId: 'shipping.rate.query:v1',
          dependsOn: [],
          input: { destinationPostcode: { kind: 'literal', value: '3000' } },
        },
        {
          actionId: 'action:purchase',
          capabilityContractId: 'shipping.label.purchase:v1',
          dependsOn: ['action:quote'],
          input: {
            offerRef: { kind: 'action_output', actionId: 'action:quote', field: 'offerRef' },
            recipientAddress: { kind: 'literal', value: '10 Example Street, Melbourne VIC 3000' },
          },
        },
      ],
    }, shippingRegistry())

    expect(plan.actions[1]).toMatchObject({
      actionId: 'action:purchase',
      providerAffinity: {
        kind: 'offer_issuer',
        inputField: 'offerRef',
        sourceActionId: 'action:quote',
      },
    })
  })

  it('rejects an output reference that is not an explicit dependency', () => {
    expect(() => createPlanRevision({
      planRevisionId: 'plan-revision:shipping:bad-dependency',
      requestId: 'request:shipping:1',
      requestRevision: 1,
      proposedByAgentId: 'agent:customer:1',
      createdAt: 1_100,
      actions: [
        {
          actionId: 'action:quote', capabilityContractId: 'shipping.rate.query:v1', dependsOn: [],
          input: { destinationPostcode: { kind: 'literal', value: '3000' } },
        },
        {
          actionId: 'action:purchase', capabilityContractId: 'shipping.label.purchase:v1', dependsOn: [],
          input: {
            offerRef: { kind: 'action_output', actionId: 'action:quote', field: 'offerRef' },
            recipientAddress: { kind: 'literal', value: '10 Example Street' },
          },
        },
      ],
    }, shippingRegistry())).toThrowError('plan_action_output_dependency_missing')
  })

  it('rejects provider affinity that does not originate in provider-offer evidence', () => {
    const quoteWithoutOfferEvidence = defineCapabilityContract({
      capabilityContractId: 'shipping.rate.query:v2',
      name: 'Query shipping rates without issuer evidence',
      operation: 'query',
      input: {},
      output: { offerRef: field('provider_offer_ref', 'Opaque offer reference') },
      consequence: { commitment: 'none', spend: 'none', reversibility: 'not_applicable', approval: 'none' },
    })
    const registry = createCapabilityContractRegistry([
      quoteWithoutOfferEvidence,
      ...shippingRegistry().list().filter((contract) => contract.capabilityContractId === 'shipping.label.purchase:v1'),
    ])

    expect(() => createPlanRevision({
      planRevisionId: 'plan-revision:bad-affinity', requestId: 'request:shipping:1', requestRevision: 1,
      proposedByAgentId: 'agent:customer:1', createdAt: 1_100,
      actions: [
        { actionId: 'action:quote', capabilityContractId: 'shipping.rate.query:v2', dependsOn: [], input: {} },
        {
          actionId: 'action:purchase', capabilityContractId: 'shipping.label.purchase:v1', dependsOn: ['action:quote'],
          input: {
            offerRef: { kind: 'action_output', actionId: 'action:quote', field: 'offerRef' },
            recipientAddress: { kind: 'literal', value: '10 Example Street' },
          },
        },
      ],
    }, registry)).toThrowError('plan_provider_affinity_evidence_required')
  })
})

function request() {
  return createCustomerRequest({
    requestId: 'request:shipping:1', principalId: 'principal:customer:1',
    delegatedAgentId: 'agent:customer:1', intent: 'Buy a shipping label.', createdAt: 1_000,
  })
}

function shippingRegistry() {
  return createCapabilityContractRegistry([
    defineCapabilityContract({
      capabilityContractId: 'shipping.rate.query:v1',
      name: 'Query shipping rates',
      operation: 'query',
      input: {
        destinationPostcode: {
          ...field('string', 'Destination postcode'),
          disclosure: { classification: 'personal', recipient: 'selected_provider', purposes: ['shipping_rate_quote'] },
        },
      },
      output: { offerRef: { ...field('provider_offer_ref', 'Provider offer'), evidenceRole: 'provider_offer' } },
      consequence: { commitment: 'none', spend: 'none', reversibility: 'not_applicable', approval: 'mandate_or_explicit' },
    }),
    defineCapabilityContract({
      capabilityContractId: 'shipping.label.purchase:v1',
      name: 'Purchase a shipping label',
      operation: 'purchase',
      input: {
        offerRef: field('provider_offer_ref', 'Provider offer'),
        recipientAddress: {
          ...field('string', 'Recipient address'),
          disclosure: { classification: 'personal', recipient: 'offer_issuer', purposes: ['shipping_label_fulfillment'] },
        },
      },
      output: {
        labelUrl: { ...field('url', 'Shipping label'), evidenceRole: 'result_artifact' },
        trackingNumber: field('string', 'Tracking number'),
      },
      consequence: { commitment: 'purchase', spend: 'quoted', reversibility: 'conditional', approval: 'mandate_or_explicit' },
      providerAffinity: { kind: 'offer_issuer', inputField: 'offerRef' },
    }),
  ])
}

function field(valueType: 'string' | 'url' | 'provider_offer_ref', customerLabel: string) {
  return { valueType, customerLabel, required: true } as const
}
