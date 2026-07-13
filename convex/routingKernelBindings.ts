import { v, type Infer } from 'convex/values'

import { canonicalAuthorityDigest, isCanonicalAuthorityDigest } from '@/modules/routing-kernel/runtime'
import { mutation, internalMutation, internalQuery, type MutationCtx } from './_generated/server'
import { resolveAdminAuthority } from './authz'

const bindingRegistration = v.object({
  bindingId: v.string(), businessId: v.id('businesses'), nodeId: v.string(), networkId: v.string(),
  capabilityContractId: v.string(), operation: v.string(),
  admission: v.union(v.literal('admitted'), v.literal('not_admitted')),
  conformance: v.union(v.literal('conformant'), v.literal('not_conformant')),
  admissionEvidenceRefs: v.array(v.string()), conformanceEvidenceRefs: v.array(v.string()),
  queryTerms: v.array(v.string()),
  adapterFeatures: v.object({
    requestCancellation: v.union(v.literal('supported'), v.literal('unsupported')),
    quotePreparation: v.optional(v.union(v.literal('public_query'), v.literal('structured_authorized'))),
  }),
  adapterFeatureEvidenceRefs: v.array(v.string()),
  commercialRelationship: v.optional(v.object({
    kind: v.union(
      v.literal('none'), v.literal('commission'), v.literal('sponsorship'),
      v.literal('rebate'), v.literal('ownership'), v.literal('other'),
    ),
    summary: v.string(), payerName: v.optional(v.string()), beneficiaryName: v.optional(v.string()),
    compensationBasis: v.optional(v.string()),
    influencesEligibility: v.boolean(), influencesInclusion: v.boolean(), influencesOrder: v.boolean(),
    evidenceRefs: v.array(v.string()),
  })),
  endpointUrl: v.string(), credentialRef: v.string(),
})

const registrationResult = v.union(
  v.object({ kind: v.literal('registered'), bindingId: v.string() }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authorization_denied'),
      v.literal('business_not_registered'),
      v.literal('endpoint_invalid'),
      v.literal('credential_ref_invalid'),
      v.literal('evidence_refs_invalid'),
      v.literal('query_terms_invalid'),
      v.literal('commercial_relationship_invalid'),
      v.literal('binding_identity_conflict'),
    ),
  }),
)

const eligibilityResult = v.union(
  v.object({ kind: v.literal('updated'), bindingId: v.string(), registrationHash: v.string() }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authorization_denied'),
      v.literal('binding_not_found'),
      v.literal('binding_changed'),
      v.literal('evidence_refs_invalid'),
    ),
  }),
)

export const register = mutation({
  args: { registration: bindingRegistration },
  returns: registrationResult,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority({ db: ctx.db as never, auth: ctx.auth }, 'register_capability_binding')
    if (authority.kind !== 'allowed') return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    return await registerCapabilityBinding(ctx.db, args.registration, Date.now())
  },
})

export const registerInternal = internalMutation({
  args: { registration: bindingRegistration, registeredAt: v.number() },
  returns: registrationResult,
  handler: async (ctx, args) => await registerCapabilityBinding(ctx.db, args.registration, args.registeredAt),
})

export const setEligibility = mutation({
  args: {
    bindingId: v.string(),
    expectedRegistrationHash: v.string(),
    admission: v.union(v.literal('admitted'), v.literal('not_admitted')),
    conformance: v.union(v.literal('conformant'), v.literal('not_conformant')),
    admissionEvidenceRefs: v.array(v.string()),
    conformanceEvidenceRefs: v.array(v.string()),
  },
  returns: eligibilityResult,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority({ db: ctx.db as never, auth: ctx.auth }, 'register_capability_binding')
    if (authority.kind !== 'allowed') return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    if (!validEvidenceRefs(args.admissionEvidenceRefs) || !validEvidenceRefs(args.conformanceEvidenceRefs)) {
      return { kind: 'refused' as const, reason: 'evidence_refs_invalid' as const }
    }
    const existing = await ctx.db.query('routingKernelBindings').withIndex('by_bindingId', (query) => query.eq('bindingId', args.bindingId)).unique()
    if (existing === null) return { kind: 'refused' as const, reason: 'binding_not_found' as const }
    if (existing.registrationHash !== args.expectedRegistrationHash) return { kind: 'refused' as const, reason: 'binding_changed' as const }
    const nextState = {
      admission: args.admission,
      conformance: args.conformance,
      admissionEvidenceRefs: [...args.admissionEvidenceRefs],
      conformanceEvidenceRefs: [...args.conformanceEvidenceRefs],
    }
    const next = { ...nextState, updatedAt: Date.now() }
    const registrationHash = canonicalAuthorityDigest({
      bindingId: existing.bindingId, businessId: existing.businessId, nodeId: existing.nodeId,
      networkId: existing.networkId, capabilityContractId: existing.capabilityContractId,
      operation: existing.operation, queryTerms: existing.queryTerms, endpointUrl: existing.endpointUrl,
      credentialRef: existing.credentialRef, ...nextState,
      adapterFeatures: existing.adapterFeatures ?? { requestCancellation: 'unsupported' as const, quotePreparation: 'public_query' as const },
      adapterFeatureEvidenceRefs: existing.adapterFeatureEvidenceRefs ?? ['legacy:feature-profile-unsupported'],
      ...(existing.commercialRelationship === undefined ? {} : { commercialRelationship: existing.commercialRelationship }),
    })
    await ctx.db.patch(existing._id, { ...next, registrationHash })
    return { kind: 'updated' as const, bindingId: existing.bindingId, registrationHash }
  },
})

export async function registerCapabilityBinding(
  db: MutationCtx['db'],
  registration: Infer<typeof bindingRegistration>,
  registeredAt: number,
) {
    const business = await db.get(registration.businessId)
    if (business === null || business.publicStatus !== 'published' || business.claimStatus !== 'published' || business.suppressedAt !== undefined) {
      return { kind: 'refused' as const, reason: 'business_not_registered' as const }
    }
    const endpoint = safeHttpsUrl(registration.endpointUrl)
    if (endpoint === undefined) return { kind: 'refused' as const, reason: 'endpoint_invalid' as const }
    if (!/^env:[A-Z][A-Z0-9_]{1,100}$/.test(registration.credentialRef)) return { kind: 'refused' as const, reason: 'credential_ref_invalid' as const }
    if (!validEvidenceRefs(registration.admissionEvidenceRefs) || !validEvidenceRefs(registration.conformanceEvidenceRefs)
      || !validEvidenceRefs(registration.adapterFeatureEvidenceRefs)) {
      return { kind: 'refused' as const, reason: 'evidence_refs_invalid' as const }
    }
    if (registration.queryTerms.length === 0 || registration.queryTerms.length > 32 || registration.queryTerms.some((term) => term.trim().length === 0 || term.length > 100)) {
      return { kind: 'refused' as const, reason: 'query_terms_invalid' as const }
    }
    const commercialRelationship = normalizeCommercialRelationship(registration.commercialRelationship)
    if (registration.commercialRelationship !== undefined && commercialRelationship === undefined) {
      return { kind: 'refused' as const, reason: 'commercial_relationship_invalid' as const }
    }
    const normalized = {
      ...registration,
      ...(commercialRelationship === undefined ? {} : { commercialRelationship }),
      endpointUrl: endpoint.href,
      queryTerms: [...new Set(registration.queryTerms.map((term) => term.trim().toLowerCase()))].sort(),
    }
    const registrationHash = canonicalAuthorityDigest(normalized)
    const existing = await db.query('routingKernelBindings').withIndex('by_bindingId', (query) => query.eq('bindingId', normalized.bindingId)).unique()
    if (existing !== null) return existing.registrationHash === registrationHash
      ? { kind: 'registered' as const, bindingId: existing.bindingId }
      : { kind: 'refused' as const, reason: 'binding_identity_conflict' as const }
    await db.insert('routingKernelBindings', { ...normalized, registrationHash, registeredAt, updatedAt: registeredAt })
    return { kind: 'registered' as const, bindingId: normalized.bindingId }
}

export async function addCommercialRelationshipToCapabilityBinding(
  db: MutationCtx['db'],
  input: Readonly<{
    bindingId: string
    expectedRegistrationHash: string
    commercialRelationship: NonNullable<Infer<typeof bindingRegistration>['commercialRelationship']>
    updatedAt: number
  }>,
) {
  const relationship = normalizeCommercialRelationship(input.commercialRelationship)
  if (relationship === undefined) return { kind: 'refused' as const, reason: 'commercial_relationship_invalid' as const }
  const existing = await db.query('routingKernelBindings').withIndex('by_bindingId', (query) => query.eq('bindingId', input.bindingId)).unique()
  if (existing === null) return { kind: 'refused' as const, reason: 'binding_not_found' as const }
  if (existing.registrationHash !== input.expectedRegistrationHash) return { kind: 'refused' as const, reason: 'binding_changed' as const }
  if (existing.commercialRelationship !== undefined) return { kind: 'refused' as const, reason: 'commercial_relationship_already_registered' as const }
  const registrationHash = canonicalAuthorityDigest({
    bindingId: existing.bindingId, businessId: existing.businessId, nodeId: existing.nodeId,
    networkId: existing.networkId, capabilityContractId: existing.capabilityContractId,
    operation: existing.operation, admission: existing.admission, conformance: existing.conformance,
    admissionEvidenceRefs: existing.admissionEvidenceRefs, conformanceEvidenceRefs: existing.conformanceEvidenceRefs,
    queryTerms: existing.queryTerms,
    adapterFeatures: existing.adapterFeatures ?? { requestCancellation: 'unsupported' as const, quotePreparation: 'public_query' as const },
    adapterFeatureEvidenceRefs: existing.adapterFeatureEvidenceRefs ?? ['legacy:feature-profile-unsupported'],
    commercialRelationship: relationship,
    endpointUrl: existing.endpointUrl, credentialRef: existing.credentialRef,
  })
  await db.patch(existing._id, { commercialRelationship: relationship, registrationHash, updatedAt: input.updatedAt })
  return { kind: 'updated' as const, bindingId: existing.bindingId, registrationHash }
}

export const listEligible = internalQuery({
  args: { networkId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('routingKernelBindings').withIndex('by_networkId_admission_conformance', (query) => query.eq('networkId', args.networkId).eq('admission', 'admitted').eq('conformance', 'conformant')).take(257)
    if (rows.length > 256) throw new Error('eligible_binding_limit_exceeded')
    const eligible = []
    for (const row of rows) {
      if (!isCanonicalAuthorityDigest(row.registrationHash)) continue
      const business = await ctx.db.get(row.businessId)
      if (business === null || business.publicStatus !== 'published' || business.claimStatus !== 'published' || business.suppressedAt !== undefined) continue
      const { _id, _creationTime, registrationHash, registeredAt, businessId, ...registration } = row
      eligible.push({
        ...registration,
        adapterFeatures: registration.adapterFeatures ?? { requestCancellation: 'unsupported' as const, quotePreparation: 'public_query' as const },
        adapterFeatureEvidenceRefs: registration.adapterFeatureEvidenceRefs ?? ['legacy:feature-profile-unsupported'],
        admission: 'admitted' as const,
        conformance: 'conformant' as const,
        businessId: String(businessId), registrationHash, registeredAt,
      })
    }
    return eligible
  },
})

export const resolvePresentations = internalQuery({
  args: { bindingIds: v.array(v.string()) },
  returns: v.array(v.object({
    bindingId: v.string(), nodeId: v.string(), businessName: v.string(),
    commercialRelationship: v.optional(v.object({
      kind: v.union(
        v.literal('none'), v.literal('commission'), v.literal('sponsorship'),
        v.literal('rebate'), v.literal('ownership'), v.literal('other'),
      ),
      summary: v.string(), payerName: v.optional(v.string()), beneficiaryName: v.optional(v.string()),
      compensationBasis: v.optional(v.string()),
      influencesEligibility: v.boolean(), influencesInclusion: v.boolean(), influencesOrder: v.boolean(),
      evidenceRefs: v.array(v.string()),
    })),
    cancellation: v.object({
      kind: v.union(v.literal('supported'), v.literal('conditional'), v.literal('unsupported')),
      summary: v.string(),
    }),
  })),
  handler: async (ctx, args) => {
    const bindingIds = [...new Set(args.bindingIds)]
    if (bindingIds.length > 256) throw new Error('binding_presentation_limit_exceeded')
    const presentations = []
    for (const bindingId of bindingIds) {
      const row = await ctx.db.query('routingKernelBindings').withIndex('by_bindingId', (query) => query.eq('bindingId', bindingId)).unique()
      if (row === null) continue
      const business = await ctx.db.get(row.businessId)
      if (business === null || business.publicStatus !== 'published' || business.claimStatus !== 'published' || business.suppressedAt !== undefined) continue
      const commercialRelationship = normalizeStoredCommercialRelationship(row.commercialRelationship)
      presentations.push({
        bindingId: row.bindingId, nodeId: row.nodeId, businessName: business.name,
        ...(commercialRelationship === undefined ? {} : { commercialRelationship }),
        cancellation: row.adapterFeatures?.requestCancellation === 'supported'
          ? { kind: 'conditional' as const, summary: 'Cancellation depends on the selected business terms.' }
          : { kind: 'unsupported' as const, summary: 'This registered capability does not expose cancellation.' },
      })
    }
    return presentations
  },
})

export const getCurrentStructuredEvidence = internalQuery({
  args: { bindingId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query('routingKernelBindings').withIndex('by_bindingId', (query) => query.eq('bindingId', args.bindingId)).unique()
    if (row === null) return null
    const business = await ctx.db.get(row.businessId)
    if (business === null || business.publicStatus !== 'published' || business.claimStatus !== 'published'
      || business.suppressedAt !== undefined) return null
    let environment: string
    try { environment = new URL(row.endpointUrl).origin } catch { return null }
    return {
      bindingId: row.bindingId,
      nodeId: row.nodeId,
      networkId: row.networkId,
      capabilityContractId: row.capabilityContractId,
      admission: row.admission,
      conformance: row.conformance,
      registrationHash: row.registrationHash,
      environment,
      quotePreparation: row.adapterFeatures?.quotePreparation ?? 'public_query' as const,
    }
  },
})

export const setAdapterFeaturesInternal = internalMutation({
  args: {
    bindingId: v.string(), expectedRegistrationHash: v.string(),
    adapterFeatures: v.object({
      requestCancellation: v.union(v.literal('supported'), v.literal('unsupported')),
      quotePreparation: v.optional(v.union(v.literal('public_query'), v.literal('structured_authorized'))),
    }),
    adapterFeatureEvidenceRefs: v.array(v.string()), updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    if (!validEvidenceRefs(args.adapterFeatureEvidenceRefs)) return { kind: 'refused' as const, reason: 'evidence_refs_invalid' as const }
    const existing = await ctx.db.query('routingKernelBindings').withIndex('by_bindingId', (query) => query.eq('bindingId', args.bindingId)).unique()
    if (existing === null) return { kind: 'refused' as const, reason: 'binding_not_found' as const }
    if (existing.registrationHash !== args.expectedRegistrationHash) return { kind: 'refused' as const, reason: 'binding_changed' as const }
    const adapterFeatureEvidenceRefs = [...new Set(args.adapterFeatureEvidenceRefs.map((ref) => ref.trim()))].sort()
    const material = {
      bindingId: existing.bindingId, businessId: existing.businessId, nodeId: existing.nodeId, networkId: existing.networkId,
      capabilityContractId: existing.capabilityContractId, operation: existing.operation, admission: existing.admission,
      conformance: existing.conformance, admissionEvidenceRefs: existing.admissionEvidenceRefs,
      conformanceEvidenceRefs: existing.conformanceEvidenceRefs, queryTerms: existing.queryTerms,
      endpointUrl: existing.endpointUrl, credentialRef: existing.credentialRef,
      adapterFeatures: args.adapterFeatures, adapterFeatureEvidenceRefs,
      ...(existing.commercialRelationship === undefined ? {} : { commercialRelationship: existing.commercialRelationship }),
    }
    const registrationHash = canonicalAuthorityDigest(material)
    await ctx.db.patch(existing._id, { adapterFeatures: args.adapterFeatures, adapterFeatureEvidenceRefs, registrationHash, updatedAt: args.updatedAt })
    return { kind: 'updated' as const, bindingId: existing.bindingId, registrationHash }
  },
})

export const migrateAuthorityDigests = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query('routingKernelBindings').paginate({ cursor: args.cursor, numItems: 100 })
    let migrated = 0
    for (const row of page.page) {
      if (isCanonicalAuthorityDigest(row.registrationHash)) continue
      const registrationHash = canonicalAuthorityDigest({
        bindingId: row.bindingId, businessId: row.businessId, nodeId: row.nodeId, networkId: row.networkId,
        capabilityContractId: row.capabilityContractId, operation: row.operation, admission: row.admission,
        conformance: row.conformance, admissionEvidenceRefs: row.admissionEvidenceRefs,
        conformanceEvidenceRefs: row.conformanceEvidenceRefs, queryTerms: row.queryTerms,
        endpointUrl: row.endpointUrl, credentialRef: row.credentialRef,
        adapterFeatures: row.adapterFeatures ?? { requestCancellation: 'unsupported' as const, quotePreparation: 'public_query' as const },
        adapterFeatureEvidenceRefs: row.adapterFeatureEvidenceRefs ?? ['legacy:feature-profile-unsupported'],
        ...(row.commercialRelationship === undefined ? {} : { commercialRelationship: row.commercialRelationship }),
      })
      await ctx.db.patch(row._id, { registrationHash })
      migrated += 1
    }
    return { migrated, isDone: page.isDone, continueCursor: page.continueCursor }
  },
})

function safeHttpsUrl(value: string): URL | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.username === '' && url.password === '' && url.hash === '' ? url : undefined
  } catch { return undefined }
}

function validEvidenceRefs(refs: readonly string[]): boolean {
  return refs.length > 0 && refs.length <= 32 && refs.every((ref) => ref.trim().length > 0 && ref.length <= 500)
}

function normalizeCommercialRelationship(
  relationship: Infer<typeof bindingRegistration>['commercialRelationship'],
): Infer<typeof bindingRegistration>['commercialRelationship'] | undefined {
  if (relationship === undefined || !validEvidenceRefs(relationship.evidenceRefs)) return undefined
  const summary = relationship.summary.trim()
  if (summary.length === 0 || summary.length > 500) return undefined
  const optional = [relationship.payerName, relationship.beneficiaryName, relationship.compensationBasis]
  if (optional.some((value) => value !== undefined && (value.trim().length === 0 || value.length > 200))) return undefined
  if (relationship.kind === 'none') {
    if (optional.some((value) => value !== undefined)
      || relationship.influencesEligibility || relationship.influencesInclusion || relationship.influencesOrder) return undefined
  } else if (optional.some((value) => value === undefined)) return undefined
  return {
    ...relationship,
    summary,
    ...(relationship.payerName === undefined ? {} : { payerName: relationship.payerName.trim() }),
    ...(relationship.beneficiaryName === undefined ? {} : { beneficiaryName: relationship.beneficiaryName.trim() }),
    ...(relationship.compensationBasis === undefined ? {} : { compensationBasis: relationship.compensationBasis.trim() }),
    evidenceRefs: [...new Set(relationship.evidenceRefs.map((ref) => ref.trim()))].sort(),
  }
}

function normalizeStoredCommercialRelationship(
  relationship: Readonly<{
    kind?: unknown
    summary: string
    payerName?: string
    beneficiaryName?: string
    compensationBasis?: string
    influencesEligibility: boolean
    influencesInclusion: boolean
    influencesOrder: boolean
    evidenceRefs: string[]
  }> | undefined,
): Infer<typeof bindingRegistration>['commercialRelationship'] | undefined {
  if (relationship === undefined || !isCommercialRelationshipKind(relationship.kind)) return undefined
  return normalizeCommercialRelationship({ ...relationship, kind: relationship.kind })
}

function isCommercialRelationshipKind(value: unknown): value is 'none' | 'commission' | 'sponsorship' | 'rebate' | 'ownership' | 'other' {
  return value === 'none' || value === 'commission' || value === 'sponsorship'
    || value === 'rebate' || value === 'ownership' || value === 'other'
}
