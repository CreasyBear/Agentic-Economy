import type { Doc, Id } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC_ADDRESS } from '@/modules/capability-supply/convex'
import { refreshCapabilityCommand } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { publicationPorts } from '../../../capabilitySupplyPublish'
import { DEV_SEED_CATALOG_ACCOUNT_REF, DEV_SEED_CATALOG_PUBLISHER_REF } from './authority'
import { sandboxToolPublicationSource } from './sandboxPublish'
import { SANDBOX_TESTNET_BUSINESS_SLUG, SANDBOX_TESTNET_CAPABILITY_ID } from './sandboxTestnet'
import { SANDBOX_TOOL_NETWORK_ID, sandboxToolBindingId, sandboxToolContractDocumentJson, sandboxToolEvidenceRef, sandboxToolOfferingId, type SandboxToolCatalogOrigin, type SandboxToolSpec } from './sandboxFixture'
import type { SeededSandboxTool } from './contracts' 

export async function refreshLegacySandboxTestnetPublication(
  ctx: MutationCtx,
  spec: SandboxToolSpec,
  legacy: Doc<'capabilityPublications'>,
  origin: SandboxToolCatalogOrigin,
  evidenceRefs: readonly string[],
  now: number,
): Promise<SeededSandboxTool> {
  if (spec.businessSlug !== SANDBOX_TESTNET_BUSINESS_SLUG) {
    return {
      created: false,
      publicationRef: legacy.publicationRef,
      publicationRevision: legacy.revision,
      toolRef: legacy.toolRef,
    }
  }
  const publications = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => query
      .eq('publicationRef', legacy.publicationRef))
    .collect()
  const current = publications.filter((publication) => publication.disposition === 'current')
  if (current.length !== 1) throw new Error('dev_seed_sandbox_testnet_current_revision_conflict')
  const active = current[0]
  if (active === undefined) throw new Error('dev_seed_sandbox_testnet_current_revision_missing')
  await assertExactSandboxTestnetPublicationMaterial(ctx, spec, active, legacy.businessId, origin)

  const desiredDocumentJson = sandboxToolContractDocumentJson(spec, 2)
  if (active.revision === 2) {
    const desiredContract = await ctx.db.query('capabilityContractDocuments')
      .withIndex('by_capabilityId_and_version', (query) => query
        .eq('capabilityId', SANDBOX_TESTNET_CAPABILITY_ID)
        .eq('version', 2))
      .unique()
    if (active.version !== 2
      || desiredContract === null
      || active.contractDigest !== desiredContract.contractDigest
      || canonicalDigest(JSON.parse(desiredContract.documentJson)) !== canonicalDigest(JSON.parse(desiredDocumentJson))) {
      throw new Error('dev_seed_sandbox_testnet_revision_two_drift')
    }
    await admitExactSandboxTestnetRevision(ctx, active, evidenceRefs, now)
    return {
      created: false,
      publicationRef: active.publicationRef,
      publicationRevision: active.revision,
      toolRef: active.toolRef,
    }
  }
  if (active._id !== legacy._id || active.revision !== 1 || active.version !== 1
    || active.offeringId !== sandboxToolOfferingId(spec)
    || active.bindingId !== sandboxToolBindingId(spec)) {
    throw new Error('dev_seed_sandbox_testnet_legacy_material_drift')
  }
  const legacyContract = await ctx.db.query('capabilityContractDocuments')
    .withIndex('by_capabilityId_and_version', (query) => query
      .eq('capabilityId', SANDBOX_TESTNET_CAPABILITY_ID)
      .eq('version', 1))
    .unique()
  if (legacyContract === null
    || legacyContract.contractDigest !== active.contractDigest
  ) {
    throw new Error('dev_seed_sandbox_testnet_legacy_contract_drift')
  }
  if (canonicalDigest(JSON.parse(legacyContract.documentJson))
    === canonicalDigest(JSON.parse(sandboxToolContractDocumentJson(spec, 1)))) {
    return {
      created: false,
      publicationRef: active.publicationRef,
      publicationRevision: active.revision,
      toolRef: active.toolRef,
    }
  }
  const { inputExamples: _inputExamples, ...legacySpec } = spec
  if (canonicalDigest(JSON.parse(legacyContract.documentJson))
      !== canonicalDigest(JSON.parse(sandboxToolContractDocumentJson(legacySpec, 1)))) {
    throw new Error('dev_seed_sandbox_testnet_legacy_contract_drift')
  }

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
  const publication = await publicationPorts(ctx).loadPublicationAtRevision(active.publicationRef, 1)
  if (publication === null) throw new Error('dev_seed_sandbox_testnet_legacy_publication_missing')
  const result = await refreshCapabilityCommand({
    publication,
    source: sandboxToolPublicationSource(spec, presentation, evidenceRefs, 2) as Parameters<
      typeof refreshCapabilityCommand
    >[0]['source'],
    offering: {
      offeringId: sandboxToolOfferingId(spec),
      networkId: SANDBOX_TOOL_NETWORK_ID,
      origin,
      presentation,
      searchTerms: [...spec.searchTerms],
      registrationEvidenceRefs: [...evidenceRefs],
    },
    operationKey: `seed:sandbox-tool-refresh:${spec.businessSlug}:v2`,
    correlationId: `seed:sandbox-tool:${spec.businessSlug}`,
    reasonCode: 'dev_seed_sandbox_tool_contract_example',
    evidenceRefs: [...evidenceRefs],
    now,
  }, publicationPorts(ctx))
  if (result.kind !== 'refreshed' || result.revision !== 2 || result.disposition !== 'current') {
    throw new Error(`dev_seed_sandbox_testnet_refresh_${result.kind === 'refused' ? result.reason : 'invalid'}`)
  }
  const refreshed = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => query
      .eq('publicationRef', active.publicationRef)
      .eq('revision', 2))
    .unique()
  if (refreshed === null) throw new Error('dev_seed_sandbox_testnet_refresh_missing')
  await admitExactSandboxTestnetRevision(ctx, refreshed, evidenceRefs, now)
  return {
    created: false,
    publicationRef: refreshed.publicationRef,
    publicationRevision: refreshed.revision,
    toolRef: refreshed.toolRef,
  }
}

async function admitExactSandboxTestnetRevision(
  ctx: MutationCtx,
  publication: Doc<'capabilityPublications'>,
  evidenceRefs: readonly string[],
  now: number,
): Promise<void> {
  const ports = publicationPorts(ctx)
  const [offering, binding] = await Promise.all([
    ports.loadOfferingByOfferingId(publication.offeringId),
    ports.loadBindingByBindingId(publication.bindingId),
  ])
  if (offering === null || binding === null) {
    throw new Error('dev_seed_sandbox_testnet_refresh_supply_missing')
  }
  if (offering.status === 'active'
    && binding.admission === 'admitted'
    && binding.conformance === 'conformant') return
  const pristineEvidence = offering.admissionEvidenceRefs.length === 0
    && binding.admissionEvidenceRefs.length === 0
    && binding.conformanceEvidenceRefs.length === 0
  if (offering.status !== 'inactive'
    || binding.admission !== 'not_admitted'
    || binding.conformance !== 'not_conformant'
    || !pristineEvidence) {
    throw new Error('dev_seed_sandbox_testnet_refresh_eligibility_not_pristine')
  }
  const admitted = await ports.setEligibility({
    offeringId: offering.offeringId,
    bindingId: binding.bindingId,
    contractRef: {
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
    },
    decision: 'admit',
    expectedOfferingRegistrationHash: offering.registrationHash,
    expectedBindingRegistrationHash: binding.registrationHash,
    admissionEvidenceRefs: [...evidenceRefs],
    conformanceEvidenceRefs: [...evidenceRefs],
  }, now)
  if (admitted.kind !== 'eligible') {
    throw new Error(`dev_seed_sandbox_testnet_refresh_admission_${
      admitted.kind === 'refused' ? admitted.reason : admitted.kind
    }`)
  }
}

async function assertExactSandboxTestnetPublicationMaterial(
  ctx: MutationCtx,
  spec: SandboxToolSpec,
  publication: Doc<'capabilityPublications'>,
  expectedBusinessId: Id<'businesses'>,
  origin: SandboxToolCatalogOrigin,
): Promise<void> {
  if (spec.source.kind !== 'x402'
    || publication.capabilityId !== SANDBOX_TESTNET_CAPABILITY_ID
    || publication.businessId !== expectedBusinessId
    || publication.runtimeEnvironment !== 'sandbox'
    || publication.sourceKind !== 'x402'
    || publication.publisherRef !== DEV_SEED_CATALOG_PUBLISHER_REF
    || publication.authorityMode !== 'ae_curated_external'
    || publication.pricingConfigJson === undefined
    || canonicalDigest(JSON.parse(publication.pricingConfigJson)) !== canonicalDigest(spec.pricingConfig)) {
    throw new Error('dev_seed_sandbox_testnet_material_drift')
  }
  const [business, offering, binding] = await Promise.all([
    ctx.db.get(publication.businessId),
    ctx.db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId)).unique(),
    ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId)).unique(),
  ])
  const expectedPresentation = {
    label: spec.label,
    summary: spec.summary,
    materialTerms: spec.materialTerms.map((term) => ({ ...term })),
    commercialRelationship: {
      kind: 'none',
      summary: 'Sandbox fixture supply with no commercial influence.',
      influencesEligibility: false,
      influencesInclusion: false,
      influencesOrder: false,
      evidenceRefs: [sandboxToolEvidenceRef(spec)],
    },
  }
  if (business === null
    || business.owningAccountRef !== DEV_SEED_CATALOG_ACCOUNT_REF
    || offering === null
    || offering.capabilityId !== publication.capabilityId
    || offering.version !== publication.version
    || offering.contractDigest !== publication.contractDigest
    || offering.networkId !== SANDBOX_TOOL_NETWORK_ID
    || canonicalDigest(offering.origin ?? null) !== canonicalDigest(origin)
    || canonicalDigest(offering.presentation) !== canonicalDigest(expectedPresentation)
    || canonicalDigest(offering.searchTerms) !== canonicalDigest(spec.searchTerms)
    || binding === null
    || binding.capabilityId !== publication.capabilityId
    || binding.version !== publication.version
    || binding.contractDigest !== publication.contractDigest
    || binding.endpointUrl !== spec.endpointUrl
    || binding.networkId !== SANDBOX_TOOL_NETWORK_ID
    || binding.authority.kind !== 'provider_connection'
    || binding.authority.connectionRef !== spec.source.connectionRef
    || binding.authority.providerRef !== spec.source.providerRef
    || binding.adapterId !== 'x402-fetch:v2') {
    throw new Error('dev_seed_sandbox_testnet_supply_drift')
  }
  const config = JSON.parse(binding.configJson) as Record<string, unknown>
  if (config.method !== spec.method
    || config.network !== BASE_SEPOLIA_NETWORK
    || config.asset !== BASE_SEPOLIA_USDC_ADDRESS
    || config.payTo !== spec.source.payTo
    || config.scheme !== 'exact'
    || config.requestTimeoutMs !== spec.source.requestTimeoutMs
    || config.routeAmountExponent !== spec.source.providerPrice.exponent
    || config.assetAmountExponent !== spec.source.providerPrice.exponent
    || typeof config.paymentRequiredJson !== 'string'
    || canonicalDigest(JSON.parse(config.paymentRequiredJson))
      !== canonicalDigest(spec.source.paymentRequired)) {
    throw new Error('dev_seed_sandbox_testnet_transport_drift')
  }
}
