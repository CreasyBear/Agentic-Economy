import type { OfferingPrice } from '@/modules/catalog/public'
import { error, ok, type ModuleResult } from '@/modules/common/result'
import { quoteStandardCheckup, type CheckupQuote, type CheckupQuoteOfferingFacts } from './checkup-quote'

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

export const SANDBOX_ROUTE_RESOLVE_CAPABILITY_CONTRACT_DOCUMENT = Object.freeze({
  contractFormat: 'ae.capability-contract:v2' as const,
  capabilityId: 'sandbox.route.reference.resolve',
  version: 1,
  name: 'Resolve a sandbox service reference',
  description: 'Resolve an ordinary request into one labelled sandbox service reference.',
  inputSchema: Object.freeze({
    $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
    properties: Object.freeze({ request: Object.freeze({ type: 'string', minLength: 1 }) }),
    required: Object.freeze(['request']), additionalProperties: false,
  }),
  outputSchema: Object.freeze({
    $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
    properties: Object.freeze({ serviceReference: Object.freeze({ type: 'string', minLength: 1 }) }),
    required: Object.freeze(['serviceReference']), additionalProperties: false,
  }),
  customerAnnotations: Object.freeze([
    Object.freeze({
      annotationId: 'request', document: 'input' as const, pointer: '/request',
      label: 'What should the first business resolve?', role: 'request' as const, inference: 'allowed' as const,
    }),
    Object.freeze({
      annotationId: 'service_reference_output', semanticIdentity: 'ae.sandbox-service-reference:v1',
      document: 'output' as const, pointer: '/serviceReference', label: 'Service reference',
      role: 'completion_evidence' as const,
    }),
  ]),
  dataUse: Object.freeze([Object.freeze({
    effectId: 'resolve_request_release', inputPointer: '/request', classification: 'public' as const,
    phase: 'preparation' as const, recipient: Object.freeze({ kind: 'candidate_binding' as const }),
    purposes: Object.freeze(['resolve_sandbox_service_reference']),
  })]),
  effects: Object.freeze([Object.freeze({
    effectId: 'resolve_request_release', class: 'data_release' as const,
    authority: 'mandate_or_explicit' as const, reversibility: 'irreversible' as const,
  })]),
  evidence: Object.freeze([Object.freeze({
    evidenceId: 'service_reference', outputPointer: '/serviceReference', purpose: 'completion' as const,
  })]),
  lifecycle: Object.freeze({ idempotency: 'required' as const, recovery: 'retry_safe' as const }),
})

export const SANDBOX_ROUTE_QUOTE_CAPABILITY_CONTRACT_DOCUMENT = Object.freeze({
  contractFormat: 'ae.capability-contract:v2' as const,
  capabilityId: 'sandbox.route.service.quote',
  version: 1,
  name: 'Quote a sandbox service reference',
  description: 'Prepare one labelled sandbox quote from a resolved service reference.',
  inputSchema: Object.freeze({
    $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
    properties: Object.freeze({ serviceReference: Object.freeze({ type: 'string', minLength: 1 }) }),
    required: Object.freeze(['serviceReference']), additionalProperties: false,
  }),
  outputSchema: Object.freeze({
    $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
    properties: Object.freeze({ quoteReference: Object.freeze({ type: 'string', minLength: 1 }) }),
    required: Object.freeze(['quoteReference']), additionalProperties: false,
  }),
  customerAnnotations: Object.freeze([
    Object.freeze({
      annotationId: 'service_reference_input', semanticIdentity: 'ae.sandbox-service-reference:v1',
      document: 'input' as const, pointer: '/serviceReference', label: 'Service reference',
      role: 'constraint' as const, inference: 'customer_required' as const,
    }),
    Object.freeze({
      annotationId: 'quote_reference', document: 'output' as const, pointer: '/quoteReference',
      label: 'Quote reference', role: 'completion_evidence' as const,
    }),
  ]),
  dataUse: Object.freeze([Object.freeze({
    effectId: 'service_reference_release', inputPointer: '/serviceReference', classification: 'public' as const,
    phase: 'preparation' as const, recipient: Object.freeze({ kind: 'candidate_binding' as const }),
    purposes: Object.freeze(['prepare_sandbox_service_quote']),
  })]),
  effects: Object.freeze([Object.freeze({
    effectId: 'service_reference_release', class: 'data_release' as const,
    authority: 'explicit' as const, reversibility: 'irreversible' as const,
  })]),
  evidence: Object.freeze([Object.freeze({
    evidenceId: 'quote_reference', outputPointer: '/quoteReference', purpose: 'completion' as const,
  })]),
  lifecycle: Object.freeze({ idempotency: 'required' as const, recovery: 'reconcile_required' as const }),
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

export const SANDBOX_ROUTE_PROVIDER_PROFILES = Object.freeze({
  resolver: Object.freeze({
    slug: 'sandbox-route-resolver', label: 'Sandbox Route Resolver',
    priorOfferingId: 'offering:sandbox-route-resolver:reference-resolve:v1',
    priorBindingId: 'binding:sandbox-route-resolver:http-json:v1',
    priorV2OfferingId: 'offering:sandbox-route-resolver:reference-resolve:v2',
    priorV2BindingId: 'binding:sandbox-route-resolver:http-json:v2',
    priorV3OfferingId: 'offering:sandbox-route-resolver:reference-resolve:v3',
    priorV3BindingId: 'binding:sandbox-route-resolver:http-json:v3',
    priorV4OfferingId: 'offering:sandbox-route-resolver:reference-resolve:v4',
    priorV4BindingId: 'binding:sandbox-route-resolver:http-json:v4',
    priorV5OfferingId: 'offering:sandbox-route-resolver:reference-resolve:v5',
    priorV5BindingId: 'binding:sandbox-route-resolver:http-json:v5',
    offeringId: 'offering:sandbox-route-resolver:reference-resolve:v6',
    bindingId: 'binding:sandbox-route-resolver:http-json:v6',
    endpointPath: '/api/sandbox/providers/route-resolver',
    amountMinor: 300, queryTerms: Object.freeze(['resolve sandbox service reference', 'sandbox route']),
    contract: SANDBOX_ROUTE_RESOLVE_CAPABILITY_CONTRACT_DOCUMENT,
  }),
  quoter: Object.freeze({
    slug: 'sandbox-route-quoter', label: 'Sandbox Route Quoter',
    priorOfferingId: 'offering:sandbox-route-quoter:service-quote:v1',
    priorBindingId: 'binding:sandbox-route-quoter:http-json:v1',
    priorV2OfferingId: 'offering:sandbox-route-quoter:service-quote:v2',
    priorV2BindingId: 'binding:sandbox-route-quoter:http-json:v2',
    priorV3OfferingId: 'offering:sandbox-route-quoter:service-quote:v3',
    priorV3BindingId: 'binding:sandbox-route-quoter:http-json:v3',
    priorV4OfferingId: 'offering:sandbox-route-quoter:service-quote:v4',
    priorV4BindingId: 'binding:sandbox-route-quoter:http-json:v4',
    offeringId: 'offering:sandbox-route-quoter:service-quote:v5',
    bindingId: 'binding:sandbox-route-quoter:http-json:v5',
    endpointPath: '/api/sandbox/providers/route-quoter',
    amountMinor: 700, queryTerms: Object.freeze(['quote sandbox service reference', 'sandbox route']),
    contract: SANDBOX_ROUTE_QUOTE_CAPABILITY_CONTRACT_DOCUMENT,
  }),
})

export type SandboxProviderProfileKey = keyof typeof SANDBOX_PROVIDER_PROFILES
export type SandboxRouteProviderProfileKey = keyof typeof SANDBOX_ROUTE_PROVIDER_PROFILES

export function sandboxCheckupQuotePathForSlug(slug: string): string {
  return `/api/sandbox/${slug}/checkup-quote`
}

export function isOpenSandboxEndpoint(url: string, businessSlug: string, method?: string): boolean {
  if (method !== undefined && method !== 'POST') return false
  try {
    const parsed = new URL(url, 'https://agentic-economy.invalid')
    // The host is intentionally not checked: this endpoint is rewritten to an
    // origin-relative path and resolves only the offering's own published price
    // on the serving origin.
    return parsed.username.length === 0
      && parsed.password.length === 0
      && parsed.search.length === 0
      && parsed.hash.length === 0
      && parsed.pathname === sandboxCheckupQuotePathForSlug(businessSlug)
  } catch {
    return false
  }
}

export type CheckupQuoteOffering = Readonly<{
  name: string
  price?: OfferingPrice
  accessPaths: readonly Readonly<{
    kind: string
    url?: string
    method?: string
  }>[]
}>

export type ResolveCheckupQuoteResult = ModuleResult<
  'quoted',
  'unknown_offering' | 'ambiguous_offering',
  { quote: CheckupQuote }
>

export function resolveCheckupQuote(input: Readonly<{
  slug: string
  requestedAt: number
  offerings: readonly CheckupQuoteOffering[]
}>): ResolveCheckupQuoteResult {
  const matching = input.offerings.flatMap((offering): CheckupQuoteOfferingFacts[] => {
    const price = offering.price
    if (price?.kind !== 'fixed' || price.amountMinor === undefined) return []
    if (!offering.accessPaths.some((path) =>
      path.kind === 'external_operation'
      && path.url !== undefined
      && isOpenSandboxEndpoint(path.url, input.slug, path.method))) {
      return []
    }
    return [{
      name: offering.name,
      price: {
        currency: price.currency,
        amountMinor: price.amountMinor,
        ...(price.unit === undefined ? {} : { unit: price.unit }),
        ...(price.taxTreatment === undefined ? {} : { taxTreatment: price.taxTreatment }),
      },
    }]
  })
  if (matching.length > 1) return error('ambiguous_offering', false, {})
  const offering = matching[0]
  if (offering === undefined) return error('unknown_offering', false, {})
  return ok('quoted', {
    quote: quoteStandardCheckup({
      slug: input.slug,
      requestedAt: input.requestedAt,
      offering,
    }),
  })
}
