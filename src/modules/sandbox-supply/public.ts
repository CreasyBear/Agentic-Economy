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

export const SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT = Object.freeze({
  contractFormat: 'ae.capability-contract:v2' as const,
  capabilityId: 'sandbox.reference.lookup',
  version: 3,
  name: 'Sandbox reference lookup',
  description: 'Return one labelled sandbox result for a structured request.',
  inputSchema: Object.freeze({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: Object.freeze({ requestContext: Object.freeze({ type: 'string', minLength: 1 }) }),
    required: Object.freeze(['requestContext']),
    additionalProperties: false,
  }),
  outputSchema: Object.freeze({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: Object.freeze({ optionSummary: Object.freeze({ type: 'string' }) }),
    required: Object.freeze(['optionSummary']),
    additionalProperties: false,
  }),
  customerAnnotations: Object.freeze([
    Object.freeze({
      annotationId: 'request_context', document: 'input' as const, pointer: '/requestContext',
      label: 'What should the business look up?', role: 'request' as const, inference: 'customer_required' as const,
    }),
    Object.freeze({
      annotationId: 'option_summary', document: 'output' as const, pointer: '/optionSummary',
      label: 'Option', role: 'completion_evidence' as const,
    }),
  ]),
  dataUse: Object.freeze([Object.freeze({
    effectId: 'request_release', inputPointer: '/requestContext', classification: 'public' as const,
    phase: 'preparation' as const, recipient: Object.freeze({ kind: 'candidate_binding' as const }),
    purposes: Object.freeze(['return_sandbox_result']),
  })]),
  effects: Object.freeze([Object.freeze({
    effectId: 'request_release', class: 'data_release' as const,
    authority: 'mandate_or_explicit' as const, reversibility: 'irreversible' as const,
  })]),
  evidence: Object.freeze([Object.freeze({
    evidenceId: 'option_summary', outputPointer: '/optionSummary', purpose: 'completion' as const,
  })]),
  lifecycle: Object.freeze({ idempotency: 'required' as const, recovery: 'retry_safe' as const }),
})

export const SANDBOX_V2_PRIOR_CAPABILITY_CONTRACT_DOCUMENT = Object.freeze({
  ...SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT,
  version: 2,
  customerAnnotations: Object.freeze([
    Object.freeze({
      annotationId: 'request_context', document: 'input' as const, pointer: '/requestContext',
      label: 'Lookup instruction', role: 'request' as const, inference: 'customer_required' as const,
    }),
    SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT.customerAnnotations[1],
  ]),
})

export const SANDBOX_V2_LEGACY_CAPABILITY_CONTRACT_DOCUMENT = Object.freeze({
  contractFormat: 'ae.capability-contract:v2' as const,
  capabilityId: 'sandbox.reference.lookup',
  version: 1,
  name: 'Sandbox reference lookup',
  description: 'Return one labelled sandbox result for a structured request.',
  inputSchema: Object.freeze({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: Object.freeze({ requestContext: Object.freeze({ type: 'string', minLength: 1 }) }),
    required: Object.freeze(['requestContext']),
    additionalProperties: false,
  }),
  outputSchema: Object.freeze({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: Object.freeze({ optionSummary: Object.freeze({ type: 'string' }) }),
    required: Object.freeze(['optionSummary']),
    additionalProperties: false,
  }),
  customerAnnotations: Object.freeze([
    Object.freeze({
      annotationId: 'request_context', document: 'input' as const, pointer: '/requestContext',
      label: 'Request details', role: 'request' as const,
    }),
    Object.freeze({
      annotationId: 'option_summary', document: 'output' as const, pointer: '/optionSummary',
      label: 'Option', role: 'completion_evidence' as const,
    }),
  ]),
  dataUse: Object.freeze([Object.freeze({
    effectId: 'request_release', inputPointer: '/requestContext', classification: 'public' as const,
    phase: 'preparation' as const, recipient: Object.freeze({ kind: 'candidate_binding' as const }),
    purposes: Object.freeze(['return_sandbox_result']),
  })]),
  effects: Object.freeze([Object.freeze({
    effectId: 'request_release', class: 'data_release' as const,
    authority: 'mandate_or_explicit' as const, reversibility: 'irreversible' as const,
  })]),
  evidence: Object.freeze([Object.freeze({
    evidenceId: 'option_summary', outputPointer: '/optionSummary', purpose: 'completion' as const,
  })]),
  lifecycle: Object.freeze({ idempotency: 'required' as const, recovery: 'retry_safe' as const }),
})

export const SANDBOX_PROVIDER_PROFILES = Object.freeze({
  one: Object.freeze({
    slug: 'sandbox-option-one', bindingId: 'sandbox.option.one:v1', nodeId: 'sandbox:option-one',
    priorOfferingId: 'offering:sandbox-option-one:reference-lookup',
    priorV2OfferingId: 'offering:sandbox-option-one:reference-lookup:v2',
    offeringId: 'offering:sandbox-option-one:reference-lookup:v3',
    legacyV2BindingId: 'binding:sandbox-option-one:http-json',
    priorV2BindingId: 'binding:sandbox-option-one:http-json:v2',
    v2BindingId: 'binding:sandbox-option-one:http-json:v3',
    v3BindingId: 'binding:sandbox-option-one:http-json:v4',
    label: 'Sandbox Option One', amountMinor: 1_200, latencyMs: 120,
    queryTerms: Object.freeze(['sandbox option', 'reference comparison']),
  }),
  two: Object.freeze({
    slug: 'sandbox-option-two', bindingId: 'sandbox.option.two:v1', nodeId: 'sandbox:option-two',
    priorOfferingId: 'offering:sandbox-option-two:reference-lookup',
    priorV2OfferingId: 'offering:sandbox-option-two:reference-lookup:v2',
    offeringId: 'offering:sandbox-option-two:reference-lookup:v3',
    legacyV2BindingId: 'binding:sandbox-option-two:http-json',
    priorV2BindingId: 'binding:sandbox-option-two:http-json:v2',
    v2BindingId: 'binding:sandbox-option-two:http-json:v3',
    v3BindingId: 'binding:sandbox-option-two:http-json:v4',
    label: 'Sandbox Option Two', amountMinor: 900, latencyMs: 180,
    queryTerms: Object.freeze(['sandbox option', 'reference comparison']),
  }),
})

export type SandboxProviderProfileKey = keyof typeof SANDBOX_PROVIDER_PROFILES
