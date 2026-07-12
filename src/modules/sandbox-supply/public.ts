export const SANDBOX_OPTION_CAPABILITY_CONTRACT = Object.freeze({
  capabilityContractId: 'sandbox.option.quote:v1', name: 'Prepare a sandbox option', operation: 'quote' as const,
  preparation: Object.freeze({ purpose: 'sandbox_option_comparison', customerLabel: 'Compare sandbox options' }),
  input: Object.freeze({
    requestContext: Object.freeze({
      valueType: 'string' as const, customerLabel: 'Request details', required: false, decisionRelevance: 'option_selection' as const,
      disclosure: Object.freeze({
        classification: 'public' as const, phase: 'preparation' as const, recipient: 'candidate_provider' as const,
        purposes: Object.freeze(['sandbox_option_comparison']),
      }),
    }),
  }),
  output: Object.freeze({
    optionSummary: Object.freeze({
      valueType: 'string' as const, customerLabel: 'Option', required: true,
      decisionRelevance: 'option_selection' as const, evidenceRole: 'provider_offer' as const,
    }),
  }),
  consequence: Object.freeze({
    commitment: 'none' as const, spend: 'quoted' as const, reversibility: 'not_applicable' as const, approval: 'explicit' as const,
  }),
})

export const SANDBOX_PROVIDER_PROFILES = Object.freeze({
  one: Object.freeze({
    slug: 'sandbox-option-one', bindingId: 'sandbox.option.one:v1', nodeId: 'sandbox:option-one',
    label: 'Sandbox Option One', amountMinor: 1_200, latencyMs: 120,
    queryTerms: Object.freeze(['sandbox option', 'reference comparison']),
  }),
  two: Object.freeze({
    slug: 'sandbox-option-two', bindingId: 'sandbox.option.two:v1', nodeId: 'sandbox:option-two',
    label: 'Sandbox Option Two', amountMinor: 900, latencyMs: 180,
    queryTerms: Object.freeze(['sandbox option', 'reference comparison']),
  }),
})

export type SandboxProviderProfileKey = keyof typeof SANDBOX_PROVIDER_PROFILES
