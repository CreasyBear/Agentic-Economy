import { describe, expect, it } from 'vitest'

import {
  advanceCustomerPlan,
  createCustomerPlan,
  decideCustomerPlan,
  type CustomerPlanProposal,
} from '@/modules/customer-plan/public'

const proposal: CustomerPlanProposal = {
  planId: 'plan:shipping-label:1',
  principalId: 'principal:customer:1',
  agentId: 'agent:customer:1',
  intent: 'Buy a courier label under AUD 15 and return the tracking link.',
  actions: [
    {
      actionId: 'action:quote',
      capabilityContractId: 'courier.quote:v1',
      effect: 'observation',
      dependsOn: [],
      input: {
        parcelWeightGrams: { kind: 'literal', value: '1200' },
        destinationPostcode: { kind: 'literal', value: '3000' },
      },
      authority: { maximumSpendMinor: 0, currency: 'AUD', dataFields: ['destinationPostcode'] },
    },
    {
      actionId: 'action:purchase',
      capabilityContractId: 'courier.purchase-label:v1',
      effect: 'consequential',
      dependsOn: ['action:quote'],
      input: {
        providerQuoteRef: { kind: 'action_output', actionId: 'action:quote', field: 'providerQuoteRef' },
        recipientAddress: { kind: 'literal', value: '10 Example Street, Melbourne VIC 3000' },
      },
      authority: { maximumSpendMinor: 1_500, currency: 'AUD', dataFields: ['providerQuoteRef', 'recipientAddress'] },
    },
  ],
}

describe('customer plan', () => {
  it('chains an observation into a separately approved consequential action', () => {
    let plan = createCustomerPlan(proposal, 1_000)

    expect(decideCustomerPlan(plan, 1_000)).toEqual({
      kind: 'action_ready',
      planId: proposal.planId,
      actionId: 'action:quote',
      capabilityContractId: 'courier.quote:v1',
      effect: 'observation',
      input: { parcelWeightGrams: '1200', destinationPostcode: '3000' },
      authority: { maximumSpendMinor: 0, currency: 'AUD', dataFields: ['destinationPostcode'] },
    })

    plan = advanceCustomerPlan(plan, {
      type: 'action_completed',
      actionId: 'action:quote',
      rootRunId: 'root-run:quote',
      output: { providerQuoteRef: 'provider-quote:7', totalMinor: '1295' },
      occurredAt: 1_100,
    })

    const approval = decideCustomerPlan(plan, 1_100)
    expect(approval).toMatchObject({
      kind: 'approval_required',
      planId: proposal.planId,
      actionId: 'action:purchase',
      maximumSpendMinor: 1_500,
      currency: 'AUD',
      dataFields: ['providerQuoteRef', 'recipientAddress'],
      resolvedInput: { providerQuoteRef: 'provider-quote:7', recipientAddress: '10 Example Street, Melbourne VIC 3000' },
    })
    if (approval.kind !== 'approval_required') throw new Error('Expected approval request.')

    plan = advanceCustomerPlan(plan, {
      type: 'action_approved',
      actionId: 'action:purchase',
      approvedByPrincipalId: proposal.principalId,
      approvalDigest: approval.approvalDigest,
      maximumSpendMinor: 1_500,
      currency: 'AUD',
      allowedDataFields: ['providerQuoteRef', 'recipientAddress'],
      expiresAt: 2_000,
      occurredAt: 1_200,
    })

    expect(decideCustomerPlan(plan, 1_300)).toMatchObject({
      kind: 'action_ready',
      actionId: 'action:purchase',
      effect: 'consequential',
      input: { providerQuoteRef: 'provider-quote:7', recipientAddress: '10 Example Street, Melbourne VIC 3000' },
      approvalDigest: approval.approvalDigest,
    })
  })

  it('holds an unknown action for intervention and never releases it again', () => {
    let plan = approvedPurchasePlan()
    plan = advanceCustomerPlan(plan, {
      type: 'action_outcome_unknown',
      actionId: 'action:purchase',
      rootRunId: 'root-run:purchase',
      occurredAt: 1_300,
    })

    expect(decideCustomerPlan(plan, 1_400)).toEqual({
      kind: 'action_required',
      planId: proposal.planId,
      actionId: 'action:purchase',
      reason: 'outcome_unknown',
      rootRunId: 'root-run:purchase',
    })

    plan = advanceCustomerPlan(plan, {
      type: 'action_reconciled',
      actionId: 'action:purchase',
      rootRunId: 'root-run:purchase',
      output: { labelUrl: 'https://carrier.example/label/7', trackingNumber: 'TRACK7' },
      occurredAt: 1_400,
    })

    expect(decideCustomerPlan(plan, 1_400)).toEqual({
      kind: 'plan_completed',
      planId: proposal.planId,
      output: {
        'action:quote': { providerQuoteRef: 'provider-quote:7', totalMinor: '1295' },
        'action:purchase': { labelUrl: 'https://carrier.example/label/7', trackingNumber: 'TRACK7' },
      },
    })
  })

  it('distinguishes an asynchronous running action from an unknown outcome', () => {
    let plan = approvedPurchasePlan()
    plan = advanceCustomerPlan(plan, {
      type: 'action_started',
      actionId: 'action:purchase',
      rootRunId: 'root-run:purchase',
      occurredAt: 1_300,
    })

    expect(decideCustomerPlan(plan, 1_400)).toEqual({
      kind: 'action_waiting',
      planId: proposal.planId,
      actionId: 'action:purchase',
      rootRunId: 'root-run:purchase',
    })

    plan = advanceCustomerPlan(plan, {
      type: 'action_reconciled',
      actionId: 'action:purchase',
      rootRunId: 'root-run:purchase',
      output: { labelUrl: 'https://carrier.example/label/7' },
      occurredAt: 1_500,
    })
    expect(decideCustomerPlan(plan, 1_500).kind).toBe('plan_completed')
  })

  it('does not let the proposing agent approve a consequential action', () => {
    let plan = quotedPlan()
    const approval = decideCustomerPlan(plan, 1_100)
    if (approval.kind !== 'approval_required') throw new Error('Expected approval request.')

    expect(() => advanceCustomerPlan(plan, {
      type: 'action_approved',
      actionId: 'action:purchase',
      approvedByPrincipalId: proposal.agentId,
      approvalDigest: approval.approvalDigest,
      maximumSpendMinor: 1_500,
      currency: 'AUD',
      allowedDataFields: ['providerQuoteRef', 'recipientAddress'],
      expiresAt: 2_000,
      occurredAt: 1_200,
    })).toThrowError('customer_plan_approval_principal_mismatch')
  })

  it('will not release a consequential action after its approval expires', () => {
    const plan = approvedPurchasePlan()

    expect(decideCustomerPlan(plan, 2_000)).toEqual({
      kind: 'approval_required',
      planId: proposal.planId,
      actionId: 'action:purchase',
      approvalDigest: expect.any(String),
      maximumSpendMinor: 1_500,
      currency: 'AUD',
      dataFields: ['providerQuoteRef', 'recipientAddress'],
      resolvedInput: {
        providerQuoteRef: 'provider-quote:7',
        recipientAddress: '10 Example Street, Melbourne VIC 3000',
      },
    })
  })
})

function quotedPlan() {
  let plan = createCustomerPlan(proposal, 1_000)
  return advanceCustomerPlan(plan, {
    type: 'action_completed', actionId: 'action:quote', rootRunId: 'root-run:quote',
    output: { providerQuoteRef: 'provider-quote:7', totalMinor: '1295' }, occurredAt: 1_100,
  })
}

function approvedPurchasePlan() {
  let plan = quotedPlan()
  const approval = decideCustomerPlan(plan, 1_100)
  if (approval.kind !== 'approval_required') throw new Error('Expected approval request.')
  return advanceCustomerPlan(plan, {
    type: 'action_approved', actionId: 'action:purchase', approvedByPrincipalId: proposal.principalId,
    approvalDigest: approval.approvalDigest,
    maximumSpendMinor: 1_500, currency: 'AUD', allowedDataFields: ['providerQuoteRef', 'recipientAddress'],
    expiresAt: 2_000, occurredAt: 1_200,
  })
}
