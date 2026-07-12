import { internalMutation, internalQuery } from './_generated/server'
import { v, type Infer } from 'convex/values'

import { preparationAuthorityDigest } from '@/modules/customer-request/preparation-authority'

const recipientKind = v.union(
  v.literal('candidate_provider'), v.literal('selected_provider'), v.literal('offer_issuer'), v.literal('named_recipient'),
)
const authority = v.object({
  authorityId: v.string(), authorityVersion: v.number(), authorityDigest: v.string(),
  principalId: v.string(), delegatedAgentId: v.string(), requestId: v.string(), requestRevision: v.number(),
  mode: v.union(v.literal('single_use'), v.literal('standing')), status: v.union(v.literal('active'), v.literal('revoked')),
  verification: v.object({ evidenceRef: v.string(), issuerId: v.string(), signerId: v.string(), keyId: v.string() }),
  permittedFields: v.array(v.string()), permittedRecipientKinds: v.array(recipientKind),
  permittedRecipientBindingIds: v.array(v.string()), permittedPurposes: v.array(v.string()),
  maximumRecipients: v.number(), maximumExposures: v.number(), maximumOperations: v.number(),
  grantedAt: v.number(), expiresAt: v.number(),
})
const allocation = v.object({
  allocationId: v.string(), operationKey: v.string(), authorityUseKey: v.string(), allocationDigest: v.string(),
  authorityId: v.string(), authorityVersion: v.number(), authorityDigest: v.string(),
  requestId: v.string(), requestRevision: v.number(), planRevisionId: v.string(), actionId: v.string(), capabilityContractId: v.string(),
  recipient: v.object({ nodeId: v.string(), bindingId: v.string(), name: v.string(), kind: recipientKind }),
  purpose: v.string(), purposeLabel: v.string(), fields: v.array(v.string()),
  fieldCategories: v.array(v.object({ field: v.string(), label: v.string() })), allocatedAt: v.number(),
})
const allocationResult = v.union(
  v.object({ kind: v.literal('allocated'), allocationId: v.string(), disposition: v.literal('allocated') }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authority_state_conflict'), v.literal('authority_request_mismatch'), v.literal('authority_request_revision_mismatch'),
      v.literal('authority_field_denied'), v.literal('authority_recipient_denied'), v.literal('authority_purpose_denied'),
      v.literal('authority_expired'), v.literal('authority_revoked'), v.literal('authority_not_yet_valid'),
      v.literal('authority_recipient_capacity_exceeded'), v.literal('authority_exposure_capacity_exceeded'),
      v.literal('authority_operation_capacity_exceeded'), v.literal('authority_allocation_conflict'),
    ),
  }),
)
const storedAllocation = v.object({
  allocationId: v.string(), operationKey: v.string(), authorityUseKey: v.string(), allocationDigest: v.string(),
  authorityId: v.string(), authorityVersion: v.number(), authorityDigest: v.string(),
  requestId: v.string(), requestRevision: v.number(), planRevisionId: v.string(), actionId: v.string(), capabilityContractId: v.string(),
  recipient: v.object({ nodeId: v.string(), bindingId: v.string(), name: v.string(), kind: recipientKind }),
  purpose: v.string(), purposeLabel: v.string(), fields: v.array(v.string()),
  fieldCategories: v.array(v.object({ field: v.string(), label: v.string() })),
  disposition: v.union(v.literal('allocated'), v.literal('released'), v.literal('not_released'), v.literal('uncertain')),
  allocatedAt: v.number(), resolvedAt: v.optional(v.number()), providerEvidenceRef: v.optional(v.string()),
  uncertainAt: v.optional(v.number()), reconciledAt: v.optional(v.number()),
})
const disclosureActivity = v.object({
  recipientName: v.string(), dataCategories: v.array(v.string()), purpose: v.string(),
  status: v.union(v.literal('released'), v.literal('not_released'), v.literal('uncertain')),
  recordedAt: v.number(), inspectionRef: v.string(),
})

export const recordAuthority = internalMutation({
  args: { authority, recordedAt: v.number() },
  returns: v.object({ kind: v.literal('recorded'), authorityId: v.string() }),
  handler: async (ctx, args) => {
    validateAuthority(args.authority)
    const existing = await ctx.db.query('customerRequestPreparationAuthorities')
      .withIndex('by_authorityId', (query) => query.eq('authorityId', args.authority.authorityId)).unique()
    if (existing !== null) {
      if (existing.authorityVersion !== args.authority.authorityVersion || existing.authorityDigest !== args.authority.authorityDigest) {
        throw new Error('preparation_authority_identity_conflict')
      }
      if (!sameAuthorityMaterial(existing, args.authority)) throw new Error('preparation_authority_material_conflict')
      if (existing.status === 'revoked' && args.authority.status === 'active') throw new Error('preparation_authority_revocation_irreversible')
      await ctx.db.patch(existing._id, { status: args.authority.status, updatedAt: args.recordedAt })
      return { kind: 'recorded' as const, authorityId: existing.authorityId }
    }
    await ctx.db.insert('customerRequestPreparationAuthorities', {
      ...args.authority, permittedFields: sortedUnique(args.authority.permittedFields),
      permittedRecipientKinds: sortedUnique(args.authority.permittedRecipientKinds),
      permittedRecipientBindingIds: sortedUnique(args.authority.permittedRecipientBindingIds),
      permittedPurposes: sortedUnique(args.authority.permittedPurposes),
      consumedRecipients: 0, consumedExposures: 0, consumedOperations: 0,
      recordedAt: args.recordedAt, updatedAt: args.recordedAt,
    })
    return { kind: 'recorded' as const, authorityId: args.authority.authorityId }
  },
})

export const allocate = internalMutation({
  args: allocation,
  returns: allocationResult,
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('customerRequestPreparationDisclosureAllocations')
      .withIndex('by_operationKey', (query) => query.eq('operationKey', args.operationKey)).unique()
    if (existing !== null) {
      return existing.allocationDigest === args.allocationDigest
        ? { kind: 'allocated' as const, allocationId: existing.allocationId, disposition: 'allocated' as const }
        : { kind: 'refused' as const, reason: 'authority_allocation_conflict' as const }
    }
    const current = await ctx.db.query('customerRequestPreparationAuthorities')
      .withIndex('by_authorityId', (query) => query.eq('authorityId', args.authorityId)).unique()
    if (current === null || current.authorityVersion !== args.authorityVersion || current.authorityDigest !== args.authorityDigest) {
      return { kind: 'refused' as const, reason: 'authority_state_conflict' as const }
    }
    if (current.requestId !== args.requestId) return { kind: 'refused' as const, reason: 'authority_request_mismatch' as const }
    if (current.requestRevision !== args.requestRevision) return { kind: 'refused' as const, reason: 'authority_request_revision_mismatch' as const }
    if (current.status !== 'active') return { kind: 'refused' as const, reason: 'authority_revoked' as const }
    if (current.grantedAt > args.allocatedAt) return { kind: 'refused' as const, reason: 'authority_not_yet_valid' as const }
    if (current.expiresAt <= args.allocatedAt) return { kind: 'refused' as const, reason: 'authority_expired' as const }
    const fields = sortedUnique(args.fields)
    const categoryFields = sortedUnique(args.fieldCategories.map((item) => item.field))
    if (fields.length === 0 || fields.some((field) => !current.permittedFields.includes(field))
      || JSON.stringify(fields) !== JSON.stringify(categoryFields)
      || args.fieldCategories.some((item) => item.label.trim().length === 0)) {
      return { kind: 'refused' as const, reason: 'authority_field_denied' as const }
    }
    if (!current.permittedRecipientKinds.includes(args.recipient.kind)
      || !current.permittedRecipientBindingIds.includes(args.recipient.bindingId)) {
      return { kind: 'refused' as const, reason: 'authority_recipient_denied' as const }
    }
    if (!current.permittedPurposes.includes(args.purpose) || args.purposeLabel.trim().length === 0) {
      return { kind: 'refused' as const, reason: 'authority_purpose_denied' as const }
    }

    const recipient = await ctx.db.query('customerRequestPreparationDisclosureRecipients')
      .withIndex('by_authorityId_and_recipientBindingId', (query) => query
        .eq('authorityId', args.authorityId).eq('recipientBindingId', args.recipient.bindingId)).unique()
    if (recipient === null && current.consumedRecipients >= current.maximumRecipients) {
      return { kind: 'refused' as const, reason: 'authority_recipient_capacity_exceeded' as const }
    }
    const missingExposures = []
    for (const field of fields) {
      const exposure = await ctx.db.query('customerRequestPreparationDisclosureExposures')
        .withIndex('by_authorityId_and_recipientBindingId_and_purpose_and_field', (query) => query
          .eq('authorityId', args.authorityId).eq('recipientBindingId', args.recipient.bindingId)
          .eq('purpose', args.purpose).eq('field', field)).unique()
      if (exposure === null) missingExposures.push(field)
    }
    if (current.consumedExposures + missingExposures.length > current.maximumExposures) {
      return { kind: 'refused' as const, reason: 'authority_exposure_capacity_exceeded' as const }
    }
    const existingUse = await ctx.db.query('customerRequestPreparationAuthorityUses')
      .withIndex('by_authorityId_and_authorityUseKey', (query) => query
        .eq('authorityId', args.authorityId).eq('authorityUseKey', args.authorityUseKey)).unique()
    const isNewAuthorityUse = existingUse === null
    if (isNewAuthorityUse && current.consumedOperations >= current.maximumOperations) {
      return { kind: 'refused' as const, reason: 'authority_operation_capacity_exceeded' as const }
    }

    await ctx.db.insert('customerRequestPreparationDisclosureAllocations', {
      allocationId: args.allocationId, allocationDigest: args.allocationDigest, operationKey: args.operationKey, authorityUseKey: args.authorityUseKey,
      authorityId: args.authorityId, authorityVersion: args.authorityVersion, authorityDigest: args.authorityDigest,
      requestId: args.requestId, requestRevision: args.requestRevision, planRevisionId: args.planRevisionId,
      actionId: args.actionId, capabilityContractId: args.capabilityContractId,
      recipientNodeId: args.recipient.nodeId, recipientBindingId: args.recipient.bindingId,
      recipientName: args.recipient.name, recipientKind: args.recipient.kind,
      purpose: args.purpose, purposeLabel: args.purposeLabel, fields,
      fieldCategories: args.fieldCategories.map((item) => ({ ...item })),
      disposition: 'allocated', allocatedAt: args.allocatedAt,
    })
    if (recipient === null) {
      await ctx.db.insert('customerRequestPreparationDisclosureRecipients', {
        authorityId: args.authorityId, recipientBindingId: args.recipient.bindingId, firstAllocatedAt: args.allocatedAt,
      })
    }
    if (existingUse === null) {
      await ctx.db.insert('customerRequestPreparationAuthorityUses', {
        authorityId: args.authorityId, authorityUseKey: args.authorityUseKey, firstAllocatedAt: args.allocatedAt,
      })
    }
    for (const field of missingExposures) {
      await ctx.db.insert('customerRequestPreparationDisclosureExposures', {
        authorityId: args.authorityId, recipientBindingId: args.recipient.bindingId,
        purpose: args.purpose, field, firstAllocatedAt: args.allocatedAt,
      })
    }
    await ctx.db.patch(current._id, {
      consumedRecipients: current.consumedRecipients + (recipient === null ? 1 : 0),
      consumedExposures: current.consumedExposures + missingExposures.length,
      consumedOperations: current.consumedOperations + (isNewAuthorityUse ? 1 : 0),
      updatedAt: args.allocatedAt,
    })
    return { kind: 'allocated' as const, allocationId: args.allocationId, disposition: 'allocated' as const }
  },
})

export const getAllocation = internalQuery({
  args: { allocationId: v.string() },
  returns: v.union(storedAllocation, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('customerRequestPreparationDisclosureAllocations')
      .withIndex('by_allocationId', (query) => query.eq('allocationId', args.allocationId)).unique()
    return row === null ? null : allocationFromRow(row)
  },
})

export const listRequestDisclosureActivity = internalQuery({
  args: { requestId: v.string(), requestRevision: v.number(), limit: v.number() },
  returns: v.array(disclosureActivity),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 100) throw new Error('disclosure_activity_limit_invalid')
    const rows = await ctx.db.query('customerRequestPreparationDisclosureAllocations')
      .withIndex('by_requestId_and_requestRevision', (query) => query
        .eq('requestId', args.requestId).eq('requestRevision', args.requestRevision))
      .order('desc')
      .take(args.limit)
    return rows.map((row) => ({
      recipientName: row.recipientName,
      dataCategories: row.fieldCategories.map((item) => item.label),
      purpose: row.purposeLabel,
      status: row.disposition === 'allocated' ? 'uncertain' as const : row.disposition,
      recordedAt: row.resolvedAt ?? row.allocatedAt,
      inspectionRef: row.allocationId,
    }))
  },
})

export const authorizeRelease = internalQuery({
  args: { allocationId: v.string(), now: v.number() },
  returns: v.union(
    v.object({ kind: v.literal('authorized'), allocation: storedAllocation }),
    v.object({
      kind: v.literal('refused'),
      reason: v.union(v.literal('authority_revoked'), v.literal('authority_expired'), v.literal('authority_state_conflict')),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('customerRequestPreparationDisclosureAllocations')
      .withIndex('by_allocationId', (query) => query.eq('allocationId', args.allocationId)).unique()
    if (row === null || row.disposition !== 'allocated') {
      return { kind: 'refused' as const, reason: 'authority_state_conflict' as const }
    }
    const current = await ctx.db.query('customerRequestPreparationAuthorities')
      .withIndex('by_authorityId', (query) => query.eq('authorityId', row.authorityId)).unique()
    if (current === null || current.authorityVersion !== row.authorityVersion || current.authorityDigest !== row.authorityDigest) {
      return { kind: 'refused' as const, reason: 'authority_state_conflict' as const }
    }
    if (current.status !== 'active') return { kind: 'refused' as const, reason: 'authority_revoked' as const }
    if (current.expiresAt <= args.now) return { kind: 'refused' as const, reason: 'authority_expired' as const }
    return { kind: 'authorized' as const, allocation: allocationFromRow(row) }
  },
})

export const resolve = internalMutation({
  args: {
    allocationId: v.string(), disposition: v.union(v.literal('released'), v.literal('not_released'), v.literal('uncertain')),
    resolvedAt: v.number(), providerEvidenceRef: v.optional(v.string()),
  },
  returns: storedAllocation,
  handler: async (ctx, args) => {
    const row = await ctx.db.query('customerRequestPreparationDisclosureAllocations')
      .withIndex('by_allocationId', (query) => query.eq('allocationId', args.allocationId)).unique()
    if (row === null) throw new Error('preparation_allocation_not_found')
    if (row.disposition !== 'allocated') {
      if (row.disposition !== args.disposition || row.providerEvidenceRef !== args.providerEvidenceRef) {
        throw new Error('preparation_allocation_resolution_conflict')
      }
      return allocationFromRow(row)
    }
    await ctx.db.patch(row._id, {
      disposition: args.disposition, resolvedAt: args.resolvedAt,
      ...(args.disposition === 'uncertain' ? { uncertainAt: args.resolvedAt } : {}),
      ...(args.providerEvidenceRef === undefined ? {} : { providerEvidenceRef: args.providerEvidenceRef }),
    })
    return {
      ...allocationFromRow(row), disposition: args.disposition, resolvedAt: args.resolvedAt,
      ...(args.providerEvidenceRef === undefined ? {} : { providerEvidenceRef: args.providerEvidenceRef }),
    }
  },
})

export const reconcileReleased = internalMutation({
  args: { allocationId: v.string(), providerEvidenceRef: v.string(), reconciledAt: v.number() },
  returns: storedAllocation,
  handler: async (ctx, args) => {
    if (args.providerEvidenceRef.trim().length === 0) throw new Error('preparation_reconciliation_evidence_required')
    const row = await ctx.db.query('customerRequestPreparationDisclosureAllocations')
      .withIndex('by_allocationId', (query) => query.eq('allocationId', args.allocationId)).unique()
    if (row === null) throw new Error('preparation_allocation_not_found')
    if (row.disposition === 'released') {
      if (row.providerEvidenceRef !== args.providerEvidenceRef) throw new Error('preparation_allocation_reconciliation_conflict')
      return allocationFromRow(row)
    }
    if (row.disposition !== 'uncertain') throw new Error('preparation_allocation_not_uncertain')
    await ctx.db.patch(row._id, {
      disposition: 'released', providerEvidenceRef: args.providerEvidenceRef,
      resolvedAt: args.reconciledAt, reconciledAt: args.reconciledAt,
    })
    return allocationFromRow({
      ...row, disposition: 'released', providerEvidenceRef: args.providerEvidenceRef,
      resolvedAt: args.reconciledAt, reconciledAt: args.reconciledAt,
    })
  },
})

function validateAuthority(input: Infer<typeof authority>) {
  const { authorityDigest, status: _status, verification: _verification, ...material } = input
  if (!Number.isSafeInteger(input.authorityVersion) || input.authorityVersion < 1
    || !Number.isSafeInteger(input.requestRevision) || input.requestRevision < 1
    || !validLimit(input.maximumRecipients) || !validLimit(input.maximumExposures) || !validLimit(input.maximumOperations)
    || input.maximumRecipients < 1 || input.maximumExposures < 1 || input.maximumOperations < 1
    || (input.mode === 'single_use' && input.maximumOperations !== 1)
    || input.expiresAt <= input.grantedAt || input.permittedFields.length === 0
    || input.permittedRecipientKinds.length === 0 || input.permittedRecipientBindingIds.length === 0
    || input.permittedPurposes.length === 0 || input.permittedFields.length > 128
    || preparationAuthorityDigest(material) !== authorityDigest) throw new Error('preparation_authority_invalid')
}

function validLimit(value: number) { return Number.isSafeInteger(value) && value >= 0 }
function sortedUnique<Value extends string>(values: readonly Value[]): Value[] { return [...new Set(values)].sort() }
function sameAuthorityMaterial(
  existing: Readonly<{
    principalId: string; delegatedAgentId: string; requestId: string; requestRevision: number
    mode: 'single_use' | 'standing'; permittedFields: string[]
    permittedRecipientKinds: ('candidate_provider' | 'selected_provider' | 'offer_issuer' | 'named_recipient')[]
    permittedRecipientBindingIds: string[]; permittedPurposes: string[]
    maximumRecipients: number; maximumExposures: number; maximumOperations: number; grantedAt: number; expiresAt: number
    verification: Readonly<{ evidenceRef: string; issuerId: string; signerId: string; keyId: string }>
  }>,
  candidate: Infer<typeof authority>,
) {
  return existing.principalId === candidate.principalId && existing.delegatedAgentId === candidate.delegatedAgentId
    && existing.requestId === candidate.requestId && existing.requestRevision === candidate.requestRevision
    && existing.mode === candidate.mode && existing.maximumRecipients === candidate.maximumRecipients
    && existing.maximumExposures === candidate.maximumExposures && existing.maximumOperations === candidate.maximumOperations
    && existing.grantedAt === candidate.grantedAt && existing.expiresAt === candidate.expiresAt
    && JSON.stringify(existing.verification) === JSON.stringify(candidate.verification)
    && JSON.stringify(existing.permittedFields) === JSON.stringify(sortedUnique(candidate.permittedFields))
    && JSON.stringify(existing.permittedRecipientKinds) === JSON.stringify(sortedUnique(candidate.permittedRecipientKinds))
    && JSON.stringify(existing.permittedRecipientBindingIds) === JSON.stringify(sortedUnique(candidate.permittedRecipientBindingIds))
    && JSON.stringify(existing.permittedPurposes) === JSON.stringify(sortedUnique(candidate.permittedPurposes))
}
function allocationFromRow(row: {
  allocationId: string; operationKey: string; authorityUseKey: string; allocationDigest: string
  authorityId: string; authorityVersion: number; authorityDigest: string
  requestId: string; requestRevision: number; planRevisionId: string; actionId: string; capabilityContractId: string
  recipientNodeId: string; recipientBindingId: string; recipientName: string
  recipientKind: 'candidate_provider' | 'selected_provider' | 'offer_issuer' | 'named_recipient'
  purpose: string; purposeLabel: string; fields: string[]; fieldCategories: { field: string; label: string }[]
  disposition: 'allocated' | 'released' | 'not_released' | 'uncertain'
  allocatedAt: number; resolvedAt?: number; providerEvidenceRef?: string; uncertainAt?: number; reconciledAt?: number
}): Infer<typeof storedAllocation> {
  return {
    allocationId: row.allocationId, operationKey: row.operationKey, authorityUseKey: row.authorityUseKey, allocationDigest: row.allocationDigest,
    authorityId: row.authorityId, authorityVersion: row.authorityVersion, authorityDigest: row.authorityDigest,
    requestId: row.requestId, requestRevision: row.requestRevision, planRevisionId: row.planRevisionId,
    actionId: row.actionId, capabilityContractId: row.capabilityContractId,
    recipient: {
      nodeId: row.recipientNodeId, bindingId: row.recipientBindingId, name: row.recipientName, kind: row.recipientKind,
    },
    purpose: row.purpose, purposeLabel: row.purposeLabel, fields: row.fields,
    fieldCategories: row.fieldCategories, disposition: row.disposition, allocatedAt: row.allocatedAt,
    ...(row.resolvedAt === undefined ? {} : { resolvedAt: row.resolvedAt }),
    ...(row.providerEvidenceRef === undefined ? {} : { providerEvidenceRef: row.providerEvidenceRef }),
    ...(row.uncertainAt === undefined ? {} : { uncertainAt: row.uncertainAt }),
    ...(row.reconciledAt === undefined ? {} : { reconciledAt: row.reconciledAt }),
  }
}
