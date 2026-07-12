import { internalMutation } from './_generated/server'
import { v } from 'convex/values'

import { buildDevSeedCatalogState } from '../src/modules/dev/public'
import { persistDevSeedCatalogState } from './devSeedStore'
import { runtimeDb } from './source_state'
import { registerCapabilityContract } from './customerRequestCapabilityContracts'
import { registerCapabilityBinding } from './routingKernelBindings'

const sandboxCapabilityContract = {
  capabilityContractId: 'sandbox.option.quote:v1', name: 'Prepare a sandbox option', operation: 'quote' as const,
  preparation: { purpose: 'sandbox_option_comparison', customerLabel: 'Compare sandbox options' },
  input: {
    requestContext: { valueType: 'string' as const, customerLabel: 'Request details', required: true, decisionRelevance: 'option_selection' as const },
  },
  output: {
    optionSummary: { valueType: 'string' as const, customerLabel: 'Option', required: true, decisionRelevance: 'option_selection' as const, evidenceRole: 'provider_offer' as const },
  },
  consequence: { commitment: 'none' as const, spend: 'quoted' as const, reversibility: 'not_applicable' as const, approval: 'none' as const },
}

export const seedDevCatalog = internalMutation({
  args: {},
  returns: v.object({
    seededSlugs: v.array(v.string()),
    ownerClerkUserId: v.string(),
    ownerId: v.string(),
    supportRecordId: v.string(),
    businessIdsBySlug: v.record(v.string(), v.string()),
    sandboxBindings: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const bundle = buildDevSeedCatalogState()
    const result = await persistDevSeedCatalogState(runtimeDb(ctx.db), bundle)
    const sandboxBindings = await registerSandboxSupply(ctx.db, Date.now())
    return {
      ...result,
      seededSlugs: [...result.seededSlugs],
      sandboxBindings,
    }
  },
})

async function registerSandboxSupply(db: Parameters<typeof registerCapabilityContract>[0], registeredAt: number): Promise<string[]> {
  const contract = await registerCapabilityContract(db, sandboxCapabilityContract, registeredAt)
  if (contract.kind !== 'registered') throw new Error(`sandbox_contract_registration_${contract.reason}`)
  const siteUrl = process.env.AE_SITE_URL?.trim() || 'https://agentic-economy-phi.vercel.app'
  const profiles = [
    { slug: 'sandbox-option-one', bindingId: 'sandbox.option.one:v1', nodeId: 'sandbox:option-one', profile: 'one', terms: ['sandbox option', 'reference comparison'] },
    { slug: 'sandbox-option-two', bindingId: 'sandbox.option.two:v1', nodeId: 'sandbox:option-two', profile: 'two', terms: ['sandbox option', 'reference comparison'] },
  ] as const
  const registered: string[] = []
  for (const profile of profiles) {
    const business = await db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', profile.slug)).unique()
    if (business === null) throw new Error(`sandbox_business_missing_${profile.slug}`)
    const result = await registerCapabilityBinding(db, {
      bindingId: profile.bindingId, businessId: business._id, nodeId: profile.nodeId, networkId: 'ae:public',
      capabilityContractId: sandboxCapabilityContract.capabilityContractId, operation: sandboxCapabilityContract.operation,
      admission: 'admitted', conformance: 'conformant',
      admissionEvidenceRefs: ['seed:sandbox-labelled-business'], conformanceEvidenceRefs: ['seed:production-protocol-contract-test'],
      queryTerms: [...profile.terms], adapterFeatures: { requestCancellation: 'unsupported', quotePreparation: 'structured_authorized' },
      adapterFeatureEvidenceRefs: ['seed:structured-quote-handler'],
      endpointUrl: new URL(`/api/sandbox/capability?profile=${profile.profile}`, siteUrl).href,
      credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
    }, registeredAt)
    if (result.kind !== 'registered') throw new Error(`sandbox_binding_registration_${result.reason}`)
    registered.push(result.bindingId)
  }
  return registered
}
