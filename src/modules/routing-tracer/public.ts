import type { CapabilityBindingAdapter } from '@/modules/routing-kernel/application'

export function createReferenceCapabilityBindings(): readonly CapabilityBindingAdapter[] {
  return Object.freeze([
    simulationBinding({
      bindingId: 'binding:reference-standard:v1',
      nodeId: 'node:sandbox-business-standard',
      amountMinor: 1_145,
      latencyMs: 2_000,
    }),
    simulationBinding({
      bindingId: 'binding:reference-priority:v1',
      nodeId: 'node:sandbox-business-priority',
      amountMinor: 1_295,
      latencyMs: 900,
    }),
  ])
}

function simulationBinding(input: {
  bindingId: string
  nodeId: string
  amountMinor: number
  latencyMs: number
}): CapabilityBindingAdapter {
  return Object.freeze({
    binding: Object.freeze({
      bindingId: input.bindingId,
      nodeId: input.nodeId,
      networkId: 'network:au-first',
      capabilityContractId: 'capability:reference-option:v1',
      operation: 'prepare_option',
      admission: 'admitted',
      conformance: 'conformant',
      queryTerms: Object.freeze(['reference', 'option']),
    }),
    quote: async () => Object.freeze({
      kind: 'quoted',
      expectedCost: Object.freeze({ currency: 'AUD', amountMinor: input.amountMinor }),
      maximumCost: Object.freeze({ currency: 'AUD', amountMinor: input.amountMinor }),
      expectedLatencyMs: input.latencyMs,
      dataFields: Object.freeze(['request_context']),
      disclosures: Object.freeze(['Sandbox reference only; no real business effect is created.']),
    }),
    execute: async ({ rootRunId, leafRunId }) => Object.freeze({
      kind: 'effect_committed',
      providerReference: `simulation:${input.bindingId}:${leafRunId}`,
      outcome: Object.freeze({
        resultReference: `sandbox-result:${rootRunId}:${leafRunId}`,
        evidenceDomain: 'sandbox_reference',
      }),
    }),
    reconcile: async () => Object.freeze({ kind: 'reconciliation_pending' }),
  })
}
