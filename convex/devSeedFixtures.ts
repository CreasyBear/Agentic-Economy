import type { JsonValue } from '@/modules/capability-contract/public'
import { DEV_SEED_BUSINESS_FIXTURES, type DevSeedBusinessFixture } from '../src/modules/dev/public'
import {
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  validateX402PaymentRequired,
} from '@/modules/capability-supply/convex'
import type { OfferingPrice } from '@/modules/catalog/public'

/*
 * The sandbox Tool's single price fact.
 *
 * `/tools/<ref>` and `ae describe` read the capability-supply publication
 * price; the business page reads the catalog Offering's `price` /
 * `pricingSummary`. Both are published below from these three constants, so a
 * reader can never be quoted two different numbers for the same Tool.
 */
const SANDBOX_TOOL_PRICING_SUMMARY = 'AUD 1.00 per Call (sandbox)'
const SANDBOX_TOOL_PRICE_AMOUNT = { currency: 'AUD', units: '1000000', exponent: 6 } as const
const SANDBOX_TOOL_OFFERING_PRICE: OfferingPrice = {
  kind: 'fixed',
  amount: { ...SANDBOX_TOOL_PRICE_AMOUNT },
  unit: 'call',
  // The sandbox fixture publishes no tax position, so neither does its twin.
  taxTreatment: 'unstated',
}

export const DEV_SEED_PRICING_BY_SLUG: Readonly<Record<string, string>> = Object.fromEntries(
  DEV_SEED_BUSINESS_FIXTURES.flatMap((fixture) => fixture.offerings.flatMap((offering) => (
    offering.pricingSummary === undefined ? [] : [[fixture.requestedSlug, offering.pricingSummary]]
  ))),
)

/**
 * The comparable twin of each seeded `pricingSummary`, authored by hand against
 * the sentence it sits beside. Nothing is parsed out of the prose at runtime:
 * the two are independent published facts, and a fixture sentence with no entry
 * here seeds prose only, exactly as it did before prices existed.
 */
const DEV_SEED_PRICE_BY_PRICING_SUMMARY: Readonly<Record<string, OfferingPrice>> = {
  'Demo price — $180 call-out, quoted before work starts': { kind: 'fixed', amount: { currency: 'AUD', units: '18000', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  'Demo price — $140 first hour, then $95 per hour': { kind: 'from', amount: { currency: 'AUD', units: '14000', exponent: 2 }, unit: 'hour', taxTreatment: 'inclusive' },
  'Demo price — $95 check-up and clean': { kind: 'fixed', amount: { currency: 'AUD', units: '9500', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  'Demo price — $350 first consultation': { kind: 'fixed', amount: { currency: 'AUD', units: '35000', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  'Demo price — $55 per hour, 3 hour minimum': { kind: 'from', amount: { currency: 'AUD', units: '5500', exponent: 2 }, unit: 'hour', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 5,000–7,000 typical wedding investment': { kind: 'from', amount: { currency: 'AUD', units: '500000', exponent: 2 }, unit: 'day', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 250 per additional hour': { kind: 'from', amount: { currency: 'AUD', units: '25000', exponent: 2 }, unit: 'hour', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 1,800 wedding coverage package': { kind: 'fixed', amount: { currency: 'AUD', units: '180000', exponent: 2 }, unit: 'day', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 4,500 base funeral service': { kind: 'fixed', amount: { currency: 'AUD', units: '450000', exponent: 2 }, unit: 'job', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 4,200 base funeral service': { kind: 'fixed', amount: { currency: 'AUD', units: '420000', exponent: 2 }, unit: 'job', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 4,800 base funeral service': { kind: 'fixed', amount: { currency: 'AUD', units: '480000', exponent: 2 }, unit: 'job', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 150 check-up and clean': { kind: 'fixed', amount: { currency: 'AUD', units: '15000', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 199 check-up, scale and clean': { kind: 'fixed', amount: { currency: 'AUD', units: '19900', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 139 check-up and clean': { kind: 'fixed', amount: { currency: 'AUD', units: '13900', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  [SANDBOX_TOOL_PRICING_SUMMARY]: SANDBOX_TOOL_OFFERING_PRICE,
}

export const DEV_SEED_PRICE_BY_SLUG: Readonly<Record<string, OfferingPrice>> = Object.fromEntries(
  Object.entries(DEV_SEED_PRICING_BY_SLUG).flatMap(([slug, summary]) => {
    const price = DEV_SEED_PRICE_BY_PRICING_SUMMARY[summary]
    return price === undefined ? [] : [[slug, price]]
  }),
)

/*
 * Sandbox reference Tools.
 *
 * A fresh local deployment has no routeable supply, so nothing can be Quoted.
 * This publishes the named sandbox Tools through the real capability-supply
 * publish command (publishCapabilityForSeed → publishBootstrapCapability →
 * publishPreparedCapabilityCommand); no capabilityPublications row is ever
 * written here directly. Every id, slug and price is fixed, so a rerun finds
 * each existing publication through by_publicationRef_and_revision and reports
 * `created: false`.
 *
 * Two Tools are seeded, each under its own business:
 *
 *  1. `sandbox-aecon-reference` — the deterministic fixture Tool. Its endpoint
 *     is not reachable from anywhere, so it proves discovery, pricing and Quote
 *     admission and nothing further.
 *  2. `sandbox-aecon-testnet` — the real Base Sepolia x402 reference provider
 *     (tools/release/package5-reference-provider). Seeded only on a deployment
 *     that carries that provider's own env, bound through `x402-fetch:v2`, and
 *     priced at the exact atomic USDC amount the provider charges, so its Call
 *     leg can actually settle.
 *
 * Sibling businesses rather than two Offerings on one business:
 * `seedBusinessOfferings` keys `pricingSummary`/`price` by business slug and
 * applies that one pair to every Offering the business publishes, so a second
 * Offering under `sandbox-aecon-reference` would be forced to carry the first
 * Tool's AUD price. The two are also genuinely different providers — different
 * endpoint, different payee, different settlement network — so one business
 * each is the truthful shape as well as the workable one.
 */
export type SandboxToolTransport = Readonly<{
  authority:
    | Readonly<{ kind: 'public_upstream' }>
    | Readonly<{ kind: 'provider_connection'; connectionRef: string; providerRef: string }>
  adapter: Readonly<{ adapterId: string; config: Readonly<Record<string, JsonValue>> }>
}>

export type SandboxToolSpec = Readonly<{
  businessSlug: string
  businessName: string
  label: string
  capabilityId: string
  summary: string
  contractDescription: string
  /** Input property the contract carries the caller's request in. */
  requestField: string
  /** Output property the completion evidence is read from. */
  resultField: string
  additionalRequestFields?: readonly string[]
  inputSchema: Readonly<Record<string, unknown>>
  outputSchema: Readonly<Record<string, unknown>>
  recovery: 'retry_safe' | 'reconcile_required'
  endpointUrl: string
  method: 'GET' | 'POST'
  pricingSummary: string
  /**
   * The publication no longer carries a display price of its own; every
   * reader derives it from this pricing config (managed_x402 for the
   * testnet Tool, fixed_aud for the reference Tool).
   */
  pricingConfig: Readonly<Record<string, JsonValue>>
  offeringPrice: OfferingPrice
  materialTerms: readonly Readonly<{ termId: string; label: string; value: string }>[]
  commercialFixture: string
  ownerMessage: string
  sourceLabel: string
  serviceAreaSummary: string
  availabilitySummary: string
  authenticationSummary: string
  accessPathSummary: string
  searchTerms: readonly string[]
  inputExamples?: readonly Readonly<{ label?: string; input: Readonly<Record<string, JsonValue>> }>[]
  /**
   * How the publication is imported. An `ae_envelope` source may only carry an
   * `http-json:v1` binding (publication/draft.ts pins one adapter per source
   * kind), so the paid Tool is imported as the `x402` source that derives its
   * own `x402-fetch:v2` binding from the provider's payment terms.
   */
  source:
    | Readonly<{ kind: 'ae_envelope'; transport: SandboxToolTransport }>
    | Readonly<{
        kind: 'x402'
        payTo: string
        connectionRef: string
        providerRef: string
        requestTimeoutMs: number
        paymentRequired: Readonly<Record<string, JsonValue>>
        providerPrice: Readonly<{ currency: string; units: string; exponent: number }>
      }>
}>

export const SANDBOX_TOOL_NETWORK_ID = 'ae:public'

export const sandboxToolOfferingId = (spec: SandboxToolSpec) => `capability-offering:${spec.businessSlug}:v1`
export const sandboxToolBindingId = (spec: SandboxToolSpec) => `capability-binding:${spec.businessSlug}:x402:v1`
export const sandboxToolAccessPathRef = (spec: SandboxToolSpec) => `access:${spec.businessSlug}:x402`
export const sandboxToolSourceRevision = (spec: SandboxToolSpec) => `seed:sandbox:${spec.businessSlug}:v1`
export const sandboxToolEvidenceRef = (spec: SandboxToolSpec) => `private:evidence:dev-seed:${spec.businessSlug}`
export const SANDBOX_TOOL_BUSINESS_SLUG = 'sandbox-aecon-reference'
export const SANDBOX_TOOL_LABEL = 'AEcon sandbox FX reference Tool'
export const SANDBOX_TOOL_CAPABILITY_ID = 'sandbox.frankfurter-fx'
// The sandbox commercial-policy fixture every sandbox money gate resolves to
// (src/modules/money/internal/commercial-policy.ts). Declared on the seeded
// Tool so the fixture the Quote path admits is visible in the seed itself.
export const SANDBOX_TOOL_COMMERCIAL_FIXTURE = 'managed_x402_deterministic_v1'

/*
 * The local owner sandbox uses Frankfurter's real public, keyless HTTPS
 * endpoint. It passes the same production transport and access-path admission
 * as any other Tool; no localhost or validator exception exists.
 */
export const SANDBOX_TOOL_ENDPOINT_URL = 'https://api.frankfurter.app/latest'

export function sandboxReferenceEndpointUrl(): string {
  return SANDBOX_TOOL_ENDPOINT_URL
}

export function sandboxReferenceToolSpec(endpointUrl: string): SandboxToolSpec {
  return {
    businessSlug: SANDBOX_TOOL_BUSINESS_SLUG,
    businessName: 'AEcon sandbox FX reference provider',
    label: SANDBOX_TOOL_LABEL,
    capabilityId: SANDBOX_TOOL_CAPABILITY_ID,
    summary: 'Current exchange rate for a currency pair from Frankfurter.',
    contractDescription: 'Return the current Frankfurter exchange rate for a base and quote currency.',
    requestField: 'from',
    resultField: 'rates',
    additionalRequestFields: ['to'],
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Base currency', pattern: '^[A-Z]{3}$' },
        to: { type: 'string', description: 'Quote currency', pattern: '^[A-Z]{3}$' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        amount: { type: 'number' },
        base: { type: 'string' },
        date: { type: 'string' },
        rates: { type: 'object', additionalProperties: { type: 'number' } },
      },
      required: ['amount', 'base', 'date', 'rates'],
      additionalProperties: false,
    },
    recovery: 'retry_safe',
    endpointUrl,
    method: 'GET',
    pricingSummary: SANDBOX_TOOL_PRICING_SUMMARY,
    pricingConfig: {
      version: 'pricing:v3',
      kind: 'fixed_aud',
      currency: 'AUD',
      exponent: 6,
      amountUnits: SANDBOX_TOOL_PRICE_AMOUNT.units,
    },
    offeringPrice: SANDBOX_TOOL_OFFERING_PRICE,
    materialTerms: [{
      termId: 'sandbox-fixture',
      label: 'Sandbox commercial fixture',
      value: SANDBOX_TOOL_COMMERCIAL_FIXTURE,
    }],
    commercialFixture: SANDBOX_TOOL_COMMERCIAL_FIXTURE,
    ownerMessage: 'Sandbox-only FX reference provider seeded for local catalogue bring-up.',
    sourceLabel: `Frankfurter public keyless FX endpoint ${endpointUrl}`,
    serviceAreaSummary: 'Public internet',
    availabilitySummary: 'Availability is checked from the public Frankfurter endpoint',
    authenticationSummary: 'Public keyless HTTPS endpoint.',
    accessPathSummary: 'Current Frankfurter exchange rate for a base and quote currency.',
    searchTerms: ['sandbox', 'foreign exchange', 'currency rate', 'frankfurter'],
    inputExamples: [{ label: 'EUR to USD', input: { from: 'EUR', to: 'USD' } }],
    source: {
      kind: 'ae_envelope',
      transport: {
        authority: { kind: 'public_upstream' },
        adapter: {
          adapterId: 'http-json:v1',
          config: {
            method: 'GET',
            query: [
              { inputPointer: '/from', parameter: 'from' },
              { inputPointer: '/to', parameter: 'to' },
            ],
            requestTimeoutMs: 5_000,
            credential: { kind: 'none' },
          },
        },
      },
    },
  }
}

/*
 * The Base Sepolia x402 reference provider.
 *
 * Every fact below except the endpoint host and the payee is the provider's
 * own published constant (tools/release/package5-reference-provider/core.ts):
 * `exact` scheme on Base Sepolia, USDC, 1000 atomic units, 60s timeout,
 * `POST /x402/execute`. The host and payee are deployment facts, so they are
 * read from the same two environment names the provider deployment itself
 * requires — never hard-coded here.
 */
export const SANDBOX_TESTNET_BUSINESS_SLUG = 'sandbox-aecon-testnet'
export const SANDBOX_TESTNET_LABEL = 'AEcon sandbox testnet reference Tool'
export const SANDBOX_TESTNET_CAPABILITY_ID = 'sandbox.aecon-testnet-reference'
export const SANDBOX_TESTNET_COMMERCIAL_FIXTURE = 'package5_reference_provider_x402_base_sepolia'
export const SANDBOX_TESTNET_ROUTE_PATH = '/x402/execute'
export const SANDBOX_TESTNET_ATOMIC_AMOUNT = '1000'
export const SANDBOX_TESTNET_USDC_EXPONENT = 6
export const SANDBOX_TESTNET_MAX_TIMEOUT_SECONDS = 60
export const SANDBOX_TESTNET_CONNECTION_REF = `connection:x402:${SANDBOX_TESTNET_BUSINESS_SLUG}`
export const SANDBOX_TESTNET_PROVIDER_REF = `provider:x402:${SANDBOX_TESTNET_BUSINESS_SLUG}`
export const SANDBOX_TESTNET_PRICING_SUMMARY = 'USDC 0.001 per Call (Base Sepolia testnet)'
export const SANDBOX_TESTNET_PRICE_AMOUNT = {
  currency: 'USDC',
  units: SANDBOX_TESTNET_ATOMIC_AMOUNT,
  exponent: SANDBOX_TESTNET_USDC_EXPONENT,
} as const
export const SANDBOX_TESTNET_OFFERING_PRICE: OfferingPrice = {
  kind: 'fixed',
  amount: { ...SANDBOX_TESTNET_PRICE_AMOUNT },
  unit: 'call',
  taxTreatment: 'unstated',
}

/*
 * The reference provider's own environment names
 * (tools/release/package5-reference-provider/api/fixture.ts). A deployment that
 * runs the paid leg has to know the same two facts the provider deployment
 * knows, so the seed reads them under the provider's names rather than minting
 * a second name for the same value.
 *
 * They are not declared in `convex/convex.config.ts`, so the typed `env` object
 * is widened for the read. Convex populates every deployment environment
 * variable regardless of declaration; declaring them there (and in
 * `.env.example`) is the follow-up that makes them typed.
 */
export const SANDBOX_TESTNET_ORIGIN_ENV = 'AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN'
export const SANDBOX_TESTNET_PAY_TO_ENV = 'AE_PACKAGE5_FIXTURE_X402_PAY_TO'

export const SANDBOX_TESTNET_SKIP_ORIGIN_MISSING = 'AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN_missing'
export const SANDBOX_TESTNET_SKIP_PAY_TO_MISSING = 'AE_PACKAGE5_FIXTURE_X402_PAY_TO_missing'

export function sandboxTestnetPaymentRequired(
  endpointUrl: string,
  payTo: string,
): Readonly<Record<string, JsonValue>> {
  return validateX402PaymentRequired({
    x402Version: 2,
    resource: { url: endpointUrl },
    accepts: [{
      scheme: 'exact',
      network: BASE_SEPOLIA_NETWORK,
      amount: SANDBOX_TESTNET_ATOMIC_AMOUNT,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      payTo,
      maxTimeoutSeconds: SANDBOX_TESTNET_MAX_TIMEOUT_SECONDS,
      extra: { name: 'USDC', version: '2' },
    }],
  }) as Readonly<Record<string, JsonValue>>
}

export function sandboxTestnetToolSpec(endpointUrl: string, payTo: string): SandboxToolSpec {
  return {
    businessSlug: SANDBOX_TESTNET_BUSINESS_SLUG,
    businessName: 'AEcon sandbox testnet reference provider',
    label: SANDBOX_TESTNET_LABEL,
    capabilityId: SANDBOX_TESTNET_CAPABILITY_ID,
    summary: 'Base Sepolia x402 reference Tool that returns one deterministic structured result.',
    contractDescription: 'Return the reference provider’s deterministic result for a structured value.',
    requestField: 'value',
    resultField: 'value',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { value: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['value'],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        sourceKind: { type: 'string' },
        value: { type: 'string' },
        provider: { type: 'string' },
      },
      required: ['sourceKind', 'value', 'provider'],
      additionalProperties: false,
    },
    // A settled x402 payment is not replayable: recovery reconciles, never retries.
    recovery: 'reconcile_required',
    endpointUrl,
    method: 'POST',
    pricingSummary: SANDBOX_TESTNET_PRICING_SUMMARY,
    // Managed x402: the buyer total is settled by a binding Quote in AUD, so
    // the publication displays `on_request` (derived from this pricing
    // config) and the provider's own atomic charge is carried below.
    pricingConfig: {
      version: 'pricing:v3',
      kind: 'managed_x402',
      effectTiming: 'payment_required_before_effect',
      sourceRequirement: {
        network: BASE_SEPOLIA_NETWORK,
        asset: BASE_SEPOLIA_USDC_ADDRESS,
        atomicUnits: SANDBOX_TESTNET_ATOMIC_AMOUNT,
      },
      pricingPolicyRef: 'pricing-policy:managed-x402-reference:v1',
      publicDisplay: 'on_request',
    },
    offeringPrice: SANDBOX_TESTNET_OFFERING_PRICE,
    materialTerms: [
      {
        termId: 'sandbox-fixture',
        label: 'Sandbox commercial fixture',
        value: SANDBOX_TESTNET_COMMERCIAL_FIXTURE,
      },
      {
        termId: 'provider-amount',
        label: 'Listed Provider amount',
        value: `${SANDBOX_TESTNET_ATOMIC_AMOUNT} atomic USDC on ${BASE_SEPOLIA_NETWORK}`,
      },
      {
        termId: 'buyer-total',
        label: 'Buyer total',
        value: 'Confirmed in AUD by a binding Quote for your input.',
      },
    ],
    commercialFixture: SANDBOX_TESTNET_COMMERCIAL_FIXTURE,
    ownerMessage: 'Base Sepolia x402 reference provider seeded for the real paid-Call proof.',
    sourceLabel: `Package 5 reference provider ${SANDBOX_TESTNET_COMMERCIAL_FIXTURE} ${endpointUrl}`,
    serviceAreaSummary: 'Base Sepolia testnet only',
    availabilitySummary: 'Always available while the reference provider deployment is up',
    authenticationSummary: 'x402 exact scheme on Base Sepolia USDC; no provider credential.',
    accessPathSummary: 'Base Sepolia x402 access path for the reference provider Tool.',
    searchTerms: ['sandbox', 'testnet', 'x402', 'base sepolia', 'usdc'],
    source: {
      kind: 'x402',
      payTo,
      connectionRef: SANDBOX_TESTNET_CONNECTION_REF,
      providerRef: SANDBOX_TESTNET_PROVIDER_REF,
      requestTimeoutMs: 30_000,
      paymentRequired: sandboxTestnetPaymentRequired(endpointUrl, payTo),
      providerPrice: { ...SANDBOX_TESTNET_PRICE_AMOUNT },
    },
  }
}

export function sandboxToolFixture(spec: SandboxToolSpec): DevSeedBusinessFixture {
  return {
    requestedSlug: spec.businessSlug,
    businessName: spec.businessName,
    category: 'API services',
    suburb: 'Sandbox',
    stateTerritory: 'External',
    ownerMessage: spec.ownerMessage,
    sourceLabel: spec.sourceLabel,
    // sandboxReferenceEndpointUrl admits HTTP only for these sandbox loopback fixtures.
    allowLoopbackSource: true,
    offerings: [{
      name: spec.label,
      category: 'API services',
      summary: spec.summary,
      serviceAreaSummary: spec.serviceAreaSummary,
      availabilitySummary: spec.availabilitySummary,
      pricingSummary: spec.pricingSummary,
      accessPaths: [],
      firstRequestMode: 'not_available_yet',
      publicDisclosure: 'This sandbox provider is reached programmatically, not by human request.',
      noContactReason: 'Sandbox fixture provider publishes no human contact path.',
    }],
  }
}

export function sandboxToolContractMetadata(spec: SandboxToolSpec): Readonly<Record<string, unknown>> {
  const requestFields = [spec.requestField, ...(spec.additionalRequestFields ?? [])]
  return {
    capabilityId: spec.capabilityId,
    version: 1,
    name: spec.label,
    description: spec.contractDescription,
    ...(spec.inputExamples === undefined ? {} : { inputExamples: spec.inputExamples }),
    customerAnnotations: [
      ...requestFields.map((field, index) => ({
        annotationId: index === 0 ? 'request' : `request_${field}`,
        document: 'input',
        pointer: `/${field}`,
        label: index === 0 ? 'Request' : field,
        role: 'request',
      })),
      { annotationId: 'result', document: 'output', pointer: `/${spec.resultField}`, label: 'Result', role: 'completion_evidence' },
    ],
    dataUse: requestFields.map((field) => ({
      effectId: `request_release_${field}`,
      inputPointer: `/${field}`,
      classification: 'personal',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['return_requested_result'],
    })),
    effects: requestFields.map((field) => ({
      effectId: `request_release_${field}`,
      class: 'data_release',
      authority: 'mandate_or_explicit',
      reversibility: 'irreversible',
    })),
    evidence: [{ evidenceId: 'result', outputPointer: `/${spec.resultField}`, purpose: 'completion' }],
    lifecycle: { idempotency: 'required', recovery: spec.recovery },
  }
}

export function sandboxToolContractDocumentJson(spec: SandboxToolSpec): string {
  return JSON.stringify({
    contractFormat: 'ae.capability-contract:v2',
    ...sandboxToolContractMetadata(spec),
    inputSchema: spec.inputSchema,
    outputSchema: spec.outputSchema,
  })
}

export type SandboxToolCatalogOrigin = Readonly<{
  kind: 'catalog_offering'
  offeringRef: string
  offeringRevision: number
  offeringSourceHash: string
  declaredAccessPathRef: string
  accessPathSourceHash: string
}>
