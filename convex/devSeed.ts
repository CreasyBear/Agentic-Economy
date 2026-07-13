import { internalMutation } from './_generated/server'
import { v } from 'convex/values'

import { buildDevSeedCatalogState } from '../src/modules/dev/public'
import { persistDevSeedCatalogState } from './devSeedStore'
import { runtimeDb } from './source_state'
import { registerCapabilityContract } from './customerRequestCapabilityContracts'
import { registerCapabilityBinding } from './routingKernelBindings'
import { SANDBOX_OPTION_CAPABILITY_CONTRACT, SANDBOX_PROVIDER_PROFILES } from '@/modules/sandbox-supply/public'

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
  const contract = await registerCapabilityContract(db, writableSandboxContract(), registeredAt)
  if (contract.kind !== 'registered') throw new Error(`sandbox_contract_registration_${contract.reason}`)
  const siteUrl = process.env.AE_SITE_URL?.trim() || 'https://agentic-economy-phi.vercel.app'
  const profiles = Object.entries(SANDBOX_PROVIDER_PROFILES)
  const registered: string[] = []
  for (const [profileKey, profile] of profiles) {
    const business = await db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', profile.slug)).unique()
    if (business === null) throw new Error(`sandbox_business_missing_${profile.slug}`)
    const result = await registerCapabilityBinding(db, {
      bindingId: profile.bindingId, businessId: business._id, nodeId: profile.nodeId, networkId: 'ae:public',
      capabilityContractId: SANDBOX_OPTION_CAPABILITY_CONTRACT.capabilityContractId, operation: SANDBOX_OPTION_CAPABILITY_CONTRACT.operation,
      admission: 'admitted', conformance: 'conformant',
      admissionEvidenceRefs: ['seed:sandbox-labelled-business'], conformanceEvidenceRefs: ['seed:production-protocol-contract-test'],
      queryTerms: [...profile.queryTerms], adapterFeatures: { requestCancellation: 'unsupported', quotePreparation: 'structured_authorized' },
      adapterFeatureEvidenceRefs: ['seed:structured-quote-handler'],
      commercialRelationship: {
        kind: 'none' as const, summary: 'Sandbox verification has no payment, sponsorship, rebate, or ownership relationship.',
        influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
        evidenceRefs: ['seed:sandbox-commercial-neutrality'],
      },
      endpointUrl: new URL(`/api/sandbox/capability?profile=${profileKey}`, siteUrl).href,
      credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
    }, registeredAt)
    if (result.kind !== 'registered') throw new Error(`sandbox_binding_registration_${result.reason}`)
    registered.push(result.bindingId)
  }
  return registered
}

function writableSandboxContract() {
  const contract = SANDBOX_OPTION_CAPABILITY_CONTRACT
  return {
    ...contract,
    preparation: { ...contract.preparation },
    input: Object.fromEntries(Object.entries(contract.input).map(([field, definition]) => [field, {
      ...definition, disclosure: { ...definition.disclosure, purposes: [...definition.disclosure.purposes] },
    }])),
    output: Object.fromEntries(Object.entries(contract.output).map(([field, definition]) => [field, { ...definition }])),
    consequence: { ...contract.consequence },
  }
}
