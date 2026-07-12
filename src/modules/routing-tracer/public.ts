import type { CapabilityBindingAdapter } from '@/modules/routing-kernel/public'

export function createParcelLabelSimulationBindings(): readonly CapabilityBindingAdapter[] {
  return Object.freeze([
    simulationBinding({
      bindingId: 'binding:parcel-sim-economy:v1',
      nodeId: 'node:registered-business-economy',
      amountMinor: 1_145,
      latencyMs: 2_000,
    }),
    simulationBinding({
      bindingId: 'binding:parcel-sim-express:v1',
      nodeId: 'node:registered-business-express',
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
      capabilityContractId: 'capability:parcel-label-purchase:v1',
      operation: 'purchase_label',
      admission: 'admitted',
      conformance: 'conformant',
      queryTerms: Object.freeze(['parcel', 'label']),
    }),
    quote: async () => Object.freeze({
      kind: 'quoted',
      expectedCost: Object.freeze({ currency: 'AUD', amountMinor: input.amountMinor }),
      maximumCost: Object.freeze({ currency: 'AUD', amountMinor: input.amountMinor }),
      expectedLatencyMs: input.latencyMs,
      dataFields: Object.freeze(['recipient_address', 'parcel_dimensions']),
      disclosures: Object.freeze(['Simulation only; no provider effect is created.']),
    }),
    execute: async ({ rootRunId, leafRunId }) => Object.freeze({
      kind: 'effect_committed',
      providerReference: `simulation:${input.bindingId}:${leafRunId}`,
      outcome: Object.freeze({
        labelReference: `simulation-label:${rootRunId}:${leafRunId}`,
        evidenceDomain: 'simulation',
      }),
    }),
    reconcile: async () => Object.freeze({ kind: 'reconciliation_pending' }),
  })
}
