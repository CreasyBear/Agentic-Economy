import { describe, expect, it } from 'vitest'

import {
  createNeutralRoutingKernel,
  type CapabilityBindingAdapter,
  type KernelIdFactory,
} from '@/modules/routing-kernel/application'
import { advanceCustomerPlan, createCustomerPlan, decideCustomerPlan, type CustomerPlanProposal } from '@/modules/customer-plan/public'
import { executeNextCustomerPlanAction, reconcileCustomerPlanAction } from '@/modules/customer-plan/kernel-adapter'

describe('customer plan kernel adapter', () => {
  it('executes one ready action through the neutral kernel and records its real run evidence', async () => {
    const now = 1_750_000_000_000
    const kernel = kernelFor(binding({
      capabilityContractId: 'courier.quote:v1',
      expectedCostMinor: 0,
      dataFields: ['destinationPostcode'],
      outcome: { providerQuoteRef: 'provider-quote:live-7', totalMinor: '1295' },
    }), now)
    const plan = createCustomerPlan(proposal, now)

    const result = await executeNextCustomerPlanAction(plan, {
      kernel,
      networkId: 'network:au-first',
      now: () => now,
      authorizationTtlMs: 30_000,
    })

    expect(result.kind).toBe('action_completed')
    if (result.kind !== 'action_completed') throw new Error(result.kind)
    expect(result.rootRunId).toMatch(/^root-run:/)
    expect(result.plan.actionStates).toContainEqual(expect.objectContaining({
      actionId: 'action:quote',
      status: 'completed',
      rootRunId: result.rootRunId,
      output: { providerQuoteRef: 'provider-quote:live-7', totalMinor: '1295' },
    }))
    expect(decideCustomerPlan(result.plan, now)).toMatchObject({
      kind: 'approval_required',
      actionId: 'action:purchase',
      resolvedInput: { providerQuoteRef: 'provider-quote:live-7' },
    })
  })

  it('refuses a kernel route that does not satisfy the Plan capability contract', async () => {
    const now = 1_750_000_000_000
    const kernel = kernelFor(binding({
      capabilityContractId: 'courier.purchase-label:v1',
      expectedCostMinor: 0,
      dataFields: ['destinationPostcode'],
      outcome: { labelReference: 'wrong-action' },
      queryTerms: ['courier.quote:v1'],
    }), now)

    const result = await executeNextCustomerPlanAction(createCustomerPlan(proposal, now), {
      kernel,
      networkId: 'network:au-first',
      now: () => now,
      authorizationTtlMs: 30_000,
    })

    expect(result).toEqual({
      kind: 'action_refused',
      planId: proposal.planId,
      actionId: 'action:quote',
      reason: 'capability_contract_mismatch',
    })
  })

  it('composes quote and purchase runs while holding an unknown purchase for reconciliation', async () => {
    const now = 1_750_000_000_000
    let purchaseReconciliations = 0
    const kernel = kernelFor([
      binding({
        capabilityContractId: 'courier.quote:v1', expectedCostMinor: 0,
        dataFields: ['destinationPostcode'],
        outcome: { providerQuoteRef: 'provider-quote:live-7', totalMinor: '1295' },
      }),
      binding({
        capabilityContractId: 'courier.purchase-label:v1', expectedCostMinor: 1_295,
        dataFields: ['providerQuoteRef'], outcome: {},
        execute: async () => ({ kind: 'outcome_unknown', providerReference: 'provider-purchase:7' }),
        reconcile: async () => {
          purchaseReconciliations += 1
          return {
            kind: 'effect_committed', providerReference: 'provider-purchase:7',
            outcome: { labelUrl: 'https://carrier.example/label/7', trackingNumber: 'TRACK7' },
          }
        },
      }),
    ], now)

    const quoted = await executeNextCustomerPlanAction(createCustomerPlan(proposal, now), {
      kernel, networkId: 'network:au-first', now: () => now, authorizationTtlMs: 30_000,
    })
    if (quoted.kind !== 'action_completed') throw new Error(quoted.kind)
    const approval = decideCustomerPlan(quoted.plan, now)
    if (approval.kind !== 'approval_required') throw new Error(approval.kind)
    const approved = advanceCustomerPlan(quoted.plan, {
      type: 'action_approved', actionId: approval.actionId,
      approvedByPrincipalId: proposal.principalId, approvalDigest: approval.approvalDigest,
      maximumSpendMinor: approval.maximumSpendMinor, currency: approval.currency,
      allowedDataFields: approval.dataFields, expiresAt: now + 30_000, occurredAt: now,
    })

    const purchased = await executeNextCustomerPlanAction(approved, {
      kernel, networkId: 'network:au-first', now: () => now, authorizationTtlMs: 30_000,
    })
    if (purchased.kind === 'action_refused') throw new Error(purchased.reason)
    expect(purchased).toMatchObject({ kind: 'action_outcome_unknown' })
    if (purchased.kind !== 'action_outcome_unknown') throw new Error(purchased.kind)
    expect(decideCustomerPlan(purchased.plan, now)).toMatchObject({
      kind: 'action_required', actionId: 'action:purchase', reason: 'outcome_unknown',
    })

    const reconciled = await reconcileCustomerPlanAction(purchased.plan, { kernel, now: () => now + 1_000 })
    expect(purchaseReconciliations).toBe(1)
    expect(reconciled.kind).toBe('action_completed')
    if (reconciled.kind !== 'action_completed') throw new Error(reconciled.kind)
    expect(decideCustomerPlan(reconciled.plan, now + 1_000)).toEqual({
      kind: 'plan_completed',
      planId: proposal.planId,
      output: {
        'action:quote': { providerQuoteRef: 'provider-quote:live-7', totalMinor: '1295' },
        'action:purchase': { labelUrl: 'https://carrier.example/label/7', trackingNumber: 'TRACK7' },
      },
    })
  })
})

const proposal: CustomerPlanProposal = {
  planId: 'plan:shipping-label:kernel',
  principalId: 'principal:customer:1',
  agentId: 'agent:customer:1',
  intent: 'Compare a courier quote, then buy a label after I approve it.',
  actions: [
    {
      actionId: 'action:quote',
      capabilityContractId: 'courier.quote:v1',
      effect: 'observation',
      dependsOn: [],
      input: { destinationPostcode: { kind: 'literal', value: '3000' } },
      authority: { maximumSpendMinor: 0, currency: 'AUD', dataFields: ['destinationPostcode'] },
    },
    {
      actionId: 'action:purchase',
      capabilityContractId: 'courier.purchase-label:v1',
      effect: 'consequential',
      dependsOn: ['action:quote'],
      input: { providerQuoteRef: { kind: 'action_output', actionId: 'action:quote', field: 'providerQuoteRef' } },
      authority: { maximumSpendMinor: 1_500, currency: 'AUD', dataFields: ['providerQuoteRef'] },
    },
  ],
}

function kernelFor(adapter: CapabilityBindingAdapter | readonly CapabilityBindingAdapter[], now: number) {
  let sequence = 0
  const ids: KernelIdFactory = { next: (prefix) => `${prefix}:${++sequence}` }
  return createNeutralRoutingKernel({
    now: () => now,
    executionMode: 'simulation',
    ids,
    quoteTtlMs: 60_000,
    bindings: Array.isArray(adapter) ? adapter : [adapter],
  })
}

function binding(input: {
  capabilityContractId: string
  expectedCostMinor: number
  dataFields: readonly string[]
  outcome: Readonly<Record<string, string>>
  queryTerms?: readonly string[]
  execute?: CapabilityBindingAdapter['execute']
  reconcile?: CapabilityBindingAdapter['reconcile']
}): CapabilityBindingAdapter {
  return {
    binding: {
      bindingId: `binding:${input.capabilityContractId}`,
      nodeId: 'node:courier',
      networkId: 'network:au-first',
      capabilityContractId: input.capabilityContractId,
      operation: input.capabilityContractId,
      admission: 'admitted',
      conformance: 'conformant',
      queryTerms: input.queryTerms ?? [input.capabilityContractId],
    },
    quote: async () => ({
      kind: 'quoted',
      expectedCost: { currency: 'AUD', amountMinor: input.expectedCostMinor },
      maximumCost: { currency: 'AUD', amountMinor: input.expectedCostMinor },
      expectedLatencyMs: 10,
      dataFields: input.dataFields,
      disclosures: [],
    }),
    execute: input.execute ?? (async () => ({ kind: 'effect_committed', providerReference: 'provider:run:1', outcome: input.outcome })),
    reconcile: input.reconcile ?? (async () => ({ kind: 'reconciliation_pending' })),
  }
}
