import { internalMutation } from './_generated/server'
import { v } from 'convex/values'

import { buildDevSeedCatalogState } from '../src/modules/dev/public'
import { persistDevSeedCatalogState } from './devSeedStore'
import { runtimeDb } from './source_state'
import { registerCapabilityContract } from './customerRequestCapabilityContracts'
import { registerCapabilityContractDocument } from './capabilityContractDocuments'
import {
  registerCapabilityBindingCommand,
  registerCapabilityOfferingCommand,
} from './capabilitySupply'
import { addCommercialRelationshipToCapabilityBinding, registerCapabilityBinding } from './routingKernelBindings'
import { encodeCapabilityContractDocument } from '@/modules/capability-contract-registry/public'
import {
  SANDBOX_OPTION_CAPABILITY_CONTRACT,
  SANDBOX_PROVIDER_PROFILES,
  SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT,
} from '@/modules/sandbox-supply/public'

export const seedDevCatalog = internalMutation({
  args: {},
  returns: v.object({
    seededSlugs: v.array(v.string()),
    ownerClerkUserId: v.string(),
    ownerId: v.string(),
    supportRecordId: v.string(),
    businessIdsBySlug: v.record(v.string(), v.string()),
    sandboxBindings: v.array(v.string()),
    sandboxV2Bindings: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const bundle = buildDevSeedCatalogState()
    const result = await persistDevSeedCatalogState(runtimeDb(ctx.db), bundle)
    const sandboxBindings = await registerSandboxSupply(ctx.db, Date.now())
    const sandboxV2Bindings = await registerSandboxV2Supply(ctx.db, Date.now())
    return {
      ...result,
      seededSlugs: [...result.seededSlugs],
      sandboxBindings,
      sandboxV2Bindings,
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
    const registration = {
      bindingId: profile.bindingId, businessId: business._id, nodeId: profile.nodeId, networkId: 'ae:public',
      capabilityContractId: SANDBOX_OPTION_CAPABILITY_CONTRACT.capabilityContractId, operation: SANDBOX_OPTION_CAPABILITY_CONTRACT.operation,
      admission: 'admitted' as const, conformance: 'conformant' as const,
      admissionEvidenceRefs: ['seed:sandbox-labelled-business'], conformanceEvidenceRefs: ['seed:production-protocol-contract-test'],
      queryTerms: [...profile.queryTerms], adapterFeatures: { requestCancellation: 'unsupported' as const, quotePreparation: 'structured_authorized' as const },
      adapterFeatureEvidenceRefs: ['seed:structured-quote-handler'],
      commercialRelationship: {
        kind: 'none' as const, summary: 'Sandbox verification has no payment, sponsorship, rebate, or ownership relationship.',
        influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
        evidenceRefs: ['seed:sandbox-commercial-neutrality'],
      },
      endpointUrl: new URL(`/api/sandbox/capability?profile=${profileKey}`, siteUrl).href,
      credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
    }
    let result = await registerCapabilityBinding(db, registration, registeredAt)
    if (result.kind === 'refused' && result.reason === 'binding_identity_conflict') {
      const existing = await db.query('routingKernelBindings').withIndex('by_bindingId', (query) => query.eq('bindingId', profile.bindingId)).unique()
      if (existing !== null && existing.commercialRelationship === undefined) {
        const upgraded = await addCommercialRelationshipToCapabilityBinding(db, {
          bindingId: profile.bindingId, expectedRegistrationHash: existing.registrationHash,
          commercialRelationship: registration.commercialRelationship, updatedAt: registeredAt,
        })
        if (upgraded.kind === 'updated') result = await registerCapabilityBinding(db, registration, registeredAt)
      }
    }
    if (result.kind !== 'registered') throw new Error(`sandbox_binding_registration_${result.reason}`)
    registered.push(result.bindingId)
  }
  return registered
}

async function registerSandboxV2Supply(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
  registeredAt: number,
): Promise<string[]> {
  const encoded = encodeCapabilityContractDocument(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT)
  const contract = await registerCapabilityContractDocument(db, encoded.documentJson, registeredAt)
  if (contract.kind !== 'registered') throw new Error(`sandbox_v2_contract_registration_${contract.reason}`)
  const siteUrl = process.env.AE_SITE_URL?.trim() || 'https://agentic-economy-phi.vercel.app'
  const registered: string[] = []
  for (const [profileKey, profile] of Object.entries(SANDBOX_PROVIDER_PROFILES)) {
    const business = await db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', profile.slug)).unique()
    if (business === null) throw new Error(`sandbox_v2_business_missing_${profile.slug}`)
    const commandContext = {
      correlationId: `seed:capability-supply:${profile.slug}`,
      reasonCode: 'labelled_sandbox_source_registration',
      evidenceRefs: ['seed:sandbox-labelled-business'],
    }
    const offering = await registerCapabilityOfferingCommand(db, {
      actor: { kind: 'system', ref: 'system:dev-seed' },
      context: { ...commandContext, operationKey: `seed:capability-offering:${profile.offeringId}` },
      registration: {
        offeringId: profile.offeringId,
        businessId: business._id,
        networkId: 'ae:public',
        contractRef: contract.ref,
        presentation: {
          label: profile.label,
          summary: 'Labelled sandbox supply for source and contract verification only.',
          price: { kind: 'fixed', currency: 'AUD', amountMinor: profile.amountMinor },
          materialTerms: [{ termId: 'sandbox_only', label: 'Environment', value: 'Sandbox only; not real supply.' }],
          commercialRelationship: {
            kind: 'none',
            summary: 'Sandbox verification has no payment, sponsorship, rebate, or ownership relationship.',
            influencesEligibility: false,
            influencesInclusion: false,
            influencesOrder: false,
            evidenceRefs: ['seed:sandbox-commercial-neutrality'],
          },
        },
        searchTerms: [...profile.queryTerms],
        registrationEvidenceRefs: ['seed:sandbox-labelled-business'],
      },
    }, registeredAt)
    if (offering.kind !== 'registered') throw new Error(`sandbox_v2_offering_registration_${offering.reason}`)
    const binding = await registerCapabilityBindingCommand(db, {
      actor: { kind: 'system', ref: 'system:dev-seed' },
      context: { ...commandContext, operationKey: `seed:capability-binding:${profile.v2BindingId}` },
      registration: {
        bindingId: profile.v2BindingId,
        offeringId: profile.offeringId,
        networkId: 'ae:public',
        contractRef: contract.ref,
        endpointUrl: new URL(`/api/sandbox/capability?profile=${profileKey}`, siteUrl).href,
        credentialRef: `env:AE_SANDBOX_PROVIDER_${profileKey.toUpperCase()}_KEY`,
        continuation: { kind: 'single_response', evidenceRefs: ['seed:sandbox-single-response'] },
        cancellation: { kind: 'unsupported', evidenceRefs: ['seed:sandbox-no-cancellation'] },
        adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
        registrationEvidenceRefs: ['seed:production-v2-registration-path'],
      },
    }, registeredAt)
    if (binding.kind !== 'registered') throw new Error(`sandbox_v2_binding_registration_${binding.reason}`)
    registered.push(binding.bindingId)
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
