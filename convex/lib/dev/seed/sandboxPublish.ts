import type { Id } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC_ADDRESS } from '@/modules/capability-supply/convex'
import { publishCapabilityForSeed } from '../../../capabilitySupplyPublish'
import { SANDBOX_TOOL_NETWORK_ID, sandboxToolBindingId, sandboxToolContractDocumentJson, sandboxToolContractMetadata, sandboxToolOfferingId, sandboxToolSourceRevision, type SandboxToolCatalogOrigin, type SandboxToolSpec, type SandboxToolTransport } from './sandboxFixture'
import type { SeededSandboxTool } from './contracts' 

export async function createSandboxToolPublication(
  ctx: MutationCtx,
  spec: SandboxToolSpec,
  evidenceRefs: readonly string[],
  businessId: Id<'businesses'>,
  origin: SandboxToolCatalogOrigin,
  now: number,
): Promise<SeededSandboxTool & Readonly<{ created: true }>> {
  const commercialRelationship = {
    kind: 'none' as const,
    summary: 'Sandbox fixture supply with no commercial influence.',
    influencesEligibility: false,
    influencesInclusion: false,
    influencesOrder: false,
    evidenceRefs: [...evidenceRefs],
  }
  const presentation = {
    label: spec.label,
    summary: spec.summary,
    materialTerms: spec.materialTerms.map((term) => ({ ...term })),
    commercialRelationship,
  }
  // What the Tool publishes. For managed x402 that is `on_request`: the buyer
  // total is a binding Quote, not a listed number.
  const offering = {
    offeringId: sandboxToolOfferingId(spec),
    networkId: SANDBOX_TOOL_NETWORK_ID,
    origin,
    presentation: { ...presentation },
    searchTerms: [...spec.searchTerms],
    registrationEvidenceRefs: [...evidenceRefs],
  }
  const published = await publishCapabilityForSeed(ctx, {
    businessId: String(businessId),
    runtimeEnvironment: 'sandbox',
    source: sandboxToolPublicationSource(spec, presentation, evidenceRefs),
    sourceRevision: sandboxToolSourceRevision(spec),
    pricingConfig: { ...spec.pricingConfig },
    offering,
    // The x402 importer derives its own `x402-fetch:v2` binding from the
    // provider's payment terms; only the envelope Tool declares one here.
    ...(spec.source.kind === 'ae_envelope'
      ? { binding: sandboxToolEnvelopeBinding(spec, spec.source.transport, evidenceRefs) }
      : {}),
    origin,
    operationKey: `seed:sandbox-tool-publish:${spec.businessSlug}:v1`,
    correlationId: `seed:sandbox-tool:${spec.businessSlug}`,
    reasonCode: 'dev_seed_sandbox_tool',
    evidenceRefs: [...evidenceRefs],
    now,
  })
  if (published.kind === 'refused') {
    throw new Error(`dev_seed_sandbox_tool_publish_refused:${published.reason}`)
  }
  return {
    created: true,
    publicationRef: published.publicationRef,
    publicationRevision: published.publicationRevision,
    toolRef: published.toolRef,
  }
}

function sandboxToolEnvelopeBinding(
  spec: SandboxToolSpec,
  transport: SandboxToolTransport,
  evidenceRefs: readonly string[],
) {
  return {
    bindingId: sandboxToolBindingId(spec),
    endpointUrl: spec.endpointUrl,
    authority: { ...transport.authority },
    continuation: { kind: 'single_response' as const, evidenceRefs: [...evidenceRefs] },
    cancellation: { kind: 'unsupported' as const, evidenceRefs: [...evidenceRefs] },
    adapter: {
      adapterId: transport.adapter.adapterId,
      config: { ...transport.adapter.config },
    },
    registrationEvidenceRefs: [...evidenceRefs],
  }
}

/**
 * The import the publish command normalizes.
 *
 * The x402 importer checks the *submitted* commercial price against the
 * provider's own resource price, so the source carries the atomic USDC amount
 * while the published Offering above carries `on_request`.
 */
export function sandboxToolPublicationSource(
  spec: SandboxToolSpec,
  presentation: Readonly<Record<string, unknown>>,
  evidenceRefs: readonly string[],
  contractVersion = 1,
): unknown {
  const offeringId = sandboxToolOfferingId(spec)
  if (spec.source.kind === 'ae_envelope') {
    return {
      kind: 'ae_envelope',
      documentJson: sandboxToolContractDocumentJson(spec, contractVersion),
      offering: {
        offeringId,
        networkId: SANDBOX_TOOL_NETWORK_ID,
        presentation: { ...presentation },
        searchTerms: [...spec.searchTerms],
        registrationEvidenceRefs: [...evidenceRefs],
      },
      binding: sandboxToolEnvelopeBinding(spec, spec.source.transport, evidenceRefs),
      evidenceRefs: [...evidenceRefs],
    }
  }
  const source = spec.source
  return {
    kind: 'x402',
    resource: {
      resourceUrl: spec.endpointUrl,
      price: { ...source.providerPrice },
      method: spec.method,
      scheme: 'exact',
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      payTo: source.payTo,
      routeAmountExponent: source.providerPrice.exponent,
      assetAmountExponent: source.providerPrice.exponent,
      paymentRequired: source.paymentRequired,
      inputSchema: spec.inputSchema,
      outputSchema: spec.outputSchema,
    },
    contract: sandboxToolContractMetadata(spec, contractVersion),
    commercial: {
      offering: {
        offeringId,
        networkId: SANDBOX_TOOL_NETWORK_ID,
        presentation: { ...presentation, price: { kind: 'fixed', amount: { ...source.providerPrice } } },
        searchTerms: [...spec.searchTerms],
        registrationEvidenceRefs: [...evidenceRefs],
      },
      bindingId: sandboxToolBindingId(spec),
      authority: {
        kind: 'provider_connection',
        connectionRef: source.connectionRef,
        providerRef: source.providerRef,
      },
      registrationEvidenceRefs: [...evidenceRefs],
      requestTimeoutMs: source.requestTimeoutMs,
    },
    evidenceRefs: [...evidenceRefs],
  }
}
