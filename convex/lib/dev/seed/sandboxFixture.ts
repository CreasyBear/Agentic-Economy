import type { JsonValue } from '@/modules/capability-contract/public'
import type { OfferingPrice } from '@/modules/catalog/public'
import type { DevSeedBusinessFixture } from '../../../../src/modules/dev/public'

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

export function sandboxToolContractMetadata(
  spec: SandboxToolSpec,
  version = 1,
): Readonly<Record<string, unknown>> {
  const requestFields = [spec.requestField, ...(spec.additionalRequestFields ?? [])]
  return {
    capabilityId: spec.capabilityId,
    version,
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

export function sandboxToolContractDocumentJson(spec: SandboxToolSpec, version = 1): string {
  return JSON.stringify({
    contractFormat: 'ae.capability-contract:v2',
    ...sandboxToolContractMetadata(spec, version),
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
