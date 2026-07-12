import { v, type Infer } from 'convex/values'

import { canonicalAuthorityDigest, isCanonicalAuthorityDigest } from '@/modules/routing-kernel/runtime'
import { internalMutation, internalQuery, mutation, type MutationCtx } from './_generated/server'
import { resolveAdminAuthority } from './authz'

const grantInput = v.object({
  grantId: v.string(), agentId: v.string(), principalId: v.string(), networkIds: v.array(v.string()),
  maximumSpendMinor: v.number(), currency: v.string(), allowedDataFields: v.array(v.string()),
  protectedFieldSetId: v.string(), maximumDisclosureAttempts: v.number(), maximumDisclosureExposures: v.number(),
  allowedRecipientBindingIds: v.array(v.string()), allowedDisclosurePurposes: v.array(v.string()),
  expiresAt: v.number(), evidenceRefs: v.array(v.string()),
})
const refusalReason = v.union(
  v.literal('authorization_denied'), v.literal('grant_invalid'), v.literal('grant_identity_conflict'),
  v.literal('grant_not_found'), v.literal('grant_changed'),
)
const result = v.union(
  v.object({ kind: v.literal('registered'), grantId: v.string(), grantHash: v.string() }),
  v.object({ kind: v.literal('revoked'), grantId: v.string(), grantHash: v.string() }),
  v.object({ kind: v.literal('refused'), reason: refusalReason }),
)

export const register = mutation({
  args: { grant: grantInput }, returns: result,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority({ db: ctx.db as never, auth: ctx.auth }, 'register_capability_binding')
    if (authority.kind !== 'allowed') return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    return await registerGrant(ctx.db, args.grant, Date.now())
  },
})

export const registerInternal = internalMutation({
  args: { grant: grantInput, issuedAt: v.number() },
  returns: result,
  handler: async (ctx, args) => await registerGrant(ctx.db, args.grant, args.issuedAt),
})

export const revoke = mutation({
  args: { grantId: v.string(), expectedGrantHash: v.string(), evidenceRefs: v.array(v.string()) }, returns: result,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority({ db: ctx.db as never, auth: ctx.auth }, 'register_capability_binding')
    if (authority.kind !== 'allowed') return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    return await revokeGrant(ctx.db, args, Date.now())
  },
})

export const revokeInternal = internalMutation({
  args: { grantId: v.string(), expectedGrantHash: v.string(), evidenceRefs: v.array(v.string()), revokedAt: v.number() },
  returns: result,
  handler: async (ctx, args) => await revokeGrant(ctx.db, args, args.revokedAt),
})

export const resolve = internalQuery({
  args: { agentId: v.string(), networkId: v.optional(v.string()), now: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('routingKernelAgentGrants')
      .withIndex('by_agentId_status', (query) => query.eq('agentId', args.agentId).eq('status', 'active'))
      .take(257)
    if (rows.length > 256) throw new Error('agent_grant_limit_exceeded')
    const current = rows.filter((grant) => grant.expiresAt > args.now
      && (args.networkId === undefined || grant.networkIds.includes(args.networkId)))
    if (current.length !== 1) return null
    const grant = current.at(0)
    if (grant === undefined) return null
    if (!isCanonicalAuthorityDigest(grant.grantHash) || grant.grantHash !== activeGrantHash(grant)) return null
    const { _id, _creationTime, ...publicGrant } = grant
    return publicGrant
  },
})

export const resolveBudgetAuthority = internalQuery({
  args: { sourceGrantId: v.string(), networkId: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query('routingKernelBudgetAuthorities')
      .withIndex('by_sourceGrantId_networkId', (query) => query.eq('sourceGrantId', args.sourceGrantId).eq('networkId', args.networkId))
      .unique()
    if (row === null || row.budgetContract !== 'cumulative_v1' || row.status !== 'active' || row.expiresAt <= args.now) return null
    const { _id, _creationTime, ...authority } = row
    return authority
  },
})

export const resolveDataAuthorizationBudget = internalQuery({
  args: { sourceGrantId: v.string(), networkId: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query('routingKernelDataAuthorizationBudgets')
      .withIndex('by_sourceGrantId_networkId', (query) => query.eq('sourceGrantId', args.sourceGrantId).eq('networkId', args.networkId))
      .unique()
    if (row === null || row.dataContract !== 'cumulative_v1' || row.status !== 'active' || row.expiresAt <= args.now) return null
    const { _id, _creationTime, ...budget } = row
    return budget
  },
})

export const migrateBudgetAuthorities = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query('routingKernelAgentGrants').paginate({ cursor: args.cursor, numItems: 100 })
    let migrated = 0
    for (const grant of page.page) for (const networkId of grant.networkIds) {
      const existing = await ctx.db.query('routingKernelBudgetAuthorities')
        .withIndex('by_sourceGrantId_networkId', (query) => query.eq('sourceGrantId', grant.grantId).eq('networkId', networkId))
        .unique()
      if (existing !== null) continue
      await ctx.db.insert('routingKernelBudgetAuthorities', budgetAuthorityForGrant(grant, networkId, Date.now(), true))
      migrated += 1
    }
    return { migrated, isDone: page.isDone, continueCursor: page.continueCursor }
  },
})

export const migrateDataAuthorizationBudgets = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query('routingKernelAgentGrants').paginate({ cursor: args.cursor, numItems: 100 })
    let current = 0
    let quarantined = 0
    for (const grant of page.page) for (const networkId of grant.networkIds) {
      const existing = await ctx.db.query('routingKernelDataAuthorizationBudgets')
        .withIndex('by_sourceGrantId_networkId', (query) => query.eq('sourceGrantId', grant.grantId).eq('networkId', networkId)).unique()
      if (existing !== null) continue
      const hasCurrentContract = grant.protectedFieldSetId !== undefined && grant.maximumDisclosureAttempts !== undefined
        && grant.maximumDisclosureExposures !== undefined && grant.allowedRecipientBindingIds !== undefined
        && grant.allowedDisclosurePurposes !== undefined
      if (hasCurrentContract) {
        const protectedFieldSetId = grant.protectedFieldSetId
        const maximumDisclosureAttempts = grant.maximumDisclosureAttempts
        const maximumDisclosureExposures = grant.maximumDisclosureExposures
        const allowedRecipientBindingIds = grant.allowedRecipientBindingIds
        const allowedDisclosurePurposes = grant.allowedDisclosurePurposes
        if (protectedFieldSetId === undefined || maximumDisclosureAttempts === undefined
          || maximumDisclosureExposures === undefined || allowedRecipientBindingIds === undefined
          || allowedDisclosurePurposes === undefined) throw new Error('current_data_authorization_contract_incomplete')
        await ctx.db.insert('routingKernelDataAuthorizationBudgets', dataAuthorizationBudgetForGrant({
          ...grant, protectedFieldSetId, maximumDisclosureAttempts,
          maximumDisclosureExposures, allowedRecipientBindingIds,
          allowedDisclosurePurposes,
        }, networkId, Date.now()))
        current += 1
      } else {
        const now = Date.now()
        await ctx.db.insert('routingKernelDataAuthorizationBudgets', {
          dataContract: 'legacy_quarantined',
          dataAuthorizationBudgetRef: `data-budget:${canonicalAuthorityDigest({ sourceGrantId: grant.grantId, networkId, migration: 'legacy_quarantine' })}`,
          sourceGrantId: grant.grantId, agentId: grant.agentId, principalId: grant.principalId, networkId,
          protectedFieldSetId: 'legacy-unbound', permittedFields: [], permittedRecipientBindingIds: [], permittedPurposes: [],
          maximumAttempts: 0, maximumExposures: 0, reservedAttempts: 0, reservedExposures: 0, consumedAttempts: 0, consumedExposures: 0,
          expiresAt: grant.expiresAt, status: 'revoked', revision: 0, createdAt: now, updatedAt: now,
        })
        quarantined += 1
      }
    }
    return { current, quarantined, isDone: page.isDone, continueCursor: page.continueCursor }
  },
})

export const quarantineLegacyBudgetAuthorities = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query('routingKernelBudgetAuthorities').paginate({ cursor: args.cursor, numItems: 100 })
    let quarantined = 0
    let anchored = 0
    for (const authority of page.page) {
      if (authority.budgetContract !== undefined) continue
      const reservation = await ctx.db.query('routingKernelSpendReservations')
        .withIndex('by_budgetAuthorityRef_state', (query) => query.eq('budgetAuthorityRef', authority.budgetAuthorityRef))
        .first()
      if (reservation === null) {
        await ctx.db.patch(authority._id, {
          budgetContract: 'legacy_quarantined', maximumGrossMinor: 0, reservedGrossMinor: 0,
          committedGrossMinor: 0, status: 'revoked', revision: authority.revision + 1, updatedAt: Date.now(),
        })
        quarantined += 1
      } else {
        await ctx.db.patch(authority._id, { budgetContract: 'cumulative_v1', updatedAt: Date.now() })
        anchored += 1
      }
    }
    return { quarantined, anchored, isDone: page.isDone, continueCursor: page.continueCursor }
  },
})

export const migrateAuthorityDigests = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query('routingKernelAgentGrants').paginate({ cursor: args.cursor, numItems: 100 })
    let migrated = 0
    for (const row of page.page) {
      if (isCanonicalAuthorityDigest(row.grantHash)) continue
      const grantHash = row.status === 'active'
        ? canonicalAuthorityDigest({
            grantId: row.grantId, agentId: row.agentId, principalId: row.principalId, networkIds: row.networkIds,
            maximumSpendMinor: row.maximumSpendMinor, currency: row.currency, allowedDataFields: row.allowedDataFields,
            expiresAt: row.expiresAt, evidenceRefs: row.evidenceRefs,
          })
        : canonicalAuthorityDigest({
            migration: 'legacy_fnv32_revocation_reanchor', grantId: row.grantId, agentId: row.agentId,
            principalId: row.principalId, status: row.status, evidenceRefs: row.evidenceRefs,
            revokedAt: row.revokedAt ?? row.updatedAt,
          })
      await ctx.db.patch(row._id, { grantHash, updatedAt: Date.now() })
      migrated += 1
    }
    return { migrated, isDone: page.isDone, continueCursor: page.continueCursor }
  },
})

function normalizeGrant(input: Infer<typeof grantInput>) {
  const currency = input.currency.trim().toUpperCase()
  if (!validStrings([input.grantId, input.agentId, input.principalId], 3, 3, 300)) return undefined
  if (!validStrings(input.networkIds, 1, 32, 200) || !validStrings(input.evidenceRefs, 1, 32, 500)) return undefined
  if (!validStrings(input.allowedDataFields, 0, 128, 200)) return undefined
  if (!validStrings([input.protectedFieldSetId], 1, 1, 300)
    || !validStrings(input.allowedRecipientBindingIds, 1, 128, 300)
    || !validStrings(input.allowedDisclosurePurposes, 1, 128, 300)
    || !Number.isSafeInteger(input.maximumDisclosureAttempts) || input.maximumDisclosureAttempts < 0
    || !Number.isSafeInteger(input.maximumDisclosureExposures) || input.maximumDisclosureExposures < 0
    || input.maximumDisclosureExposures > input.maximumDisclosureAttempts) return undefined
  if (!/^[A-Z]{3}$/.test(currency) || !Number.isSafeInteger(input.maximumSpendMinor) || input.maximumSpendMinor < 0 || input.expiresAt <= Date.now()) return undefined
  return { ...input, currency, networkIds: [...new Set(input.networkIds.map((value) => value.trim()))].sort(), allowedDataFields: [...new Set(input.allowedDataFields.map((value) => value.trim()))].sort(), allowedRecipientBindingIds: [...new Set(input.allowedRecipientBindingIds.map((value) => value.trim()))].sort(), allowedDisclosurePurposes: [...new Set(input.allowedDisclosurePurposes.map((value) => value.trim()))].sort(), evidenceRefs: [...new Set(input.evidenceRefs.map((value) => value.trim()))].sort() }
}

async function registerGrant(db: MutationCtx['db'], input: Infer<typeof grantInput>, issuedAt: number) {
  const normalized = normalizeGrant(input)
  if (normalized === undefined || !Number.isSafeInteger(issuedAt) || issuedAt < 0) return { kind: 'refused' as const, reason: 'grant_invalid' as const }
  const grantHash = canonicalAuthorityDigest(normalized)
  const existing = await db.query('routingKernelAgentGrants').withIndex('by_grantId', (query) => query.eq('grantId', normalized.grantId)).unique()
  if (existing !== null) return existing.grantHash === grantHash && existing.status === 'active'
    ? { kind: 'registered' as const, grantId: existing.grantId, grantHash: existing.grantHash }
    : { kind: 'refused' as const, reason: 'grant_identity_conflict' as const }
  await db.insert('routingKernelAgentGrants', { ...normalized, status: 'active', grantHash, issuedAt, updatedAt: issuedAt })
  for (const networkId of normalized.networkIds) {
    await db.insert('routingKernelBudgetAuthorities', budgetAuthorityForGrant(normalized, networkId, issuedAt))
    await db.insert('routingKernelDataAuthorizationBudgets', dataAuthorizationBudgetForGrant(normalized, networkId, issuedAt))
  }
  return { kind: 'registered' as const, grantId: normalized.grantId, grantHash }
}

async function revokeGrant(
  db: MutationCtx['db'],
  args: Readonly<{ grantId: string; expectedGrantHash: string; evidenceRefs: string[] }>,
  now: number,
) {
  if (!validStrings(args.evidenceRefs, 1, 32, 500) || !Number.isSafeInteger(now) || now < 0) return { kind: 'refused' as const, reason: 'grant_invalid' as const }
  const existing = await db.query('routingKernelAgentGrants').withIndex('by_grantId', (query) => query.eq('grantId', args.grantId)).unique()
  if (existing === null) return { kind: 'refused' as const, reason: 'grant_not_found' as const }
  if (existing.status !== 'active' || existing.grantHash !== activeGrantHash(existing)
    || existing.grantHash !== args.expectedGrantHash) return { kind: 'refused' as const, reason: 'grant_changed' as const }
  const evidenceRefs = [...args.evidenceRefs].sort()
  const grantHash = canonicalAuthorityDigest({ previousGrantHash: existing.grantHash, status: 'revoked', evidenceRefs, revokedAt: now })
  await db.patch(existing._id, { status: 'revoked', evidenceRefs, revokedAt: now, updatedAt: now, grantHash })
  const budgets = await db.query('routingKernelBudgetAuthorities').withIndex('by_sourceGrantId_networkId', (query) => query.eq('sourceGrantId', existing.grantId)).collect()
  for (const budget of budgets) await db.patch(budget._id, { status: 'revoked', revision: budget.revision + 1, updatedAt: now })
  const dataBudgets = await db.query('routingKernelDataAuthorizationBudgets').withIndex('by_sourceGrantId_networkId', (query) => query.eq('sourceGrantId', existing.grantId)).collect()
  for (const budget of dataBudgets) await db.patch(budget._id, { status: 'revoked', revision: budget.revision + 1, updatedAt: now })
  return { kind: 'revoked' as const, grantId: existing.grantId, grantHash }
}

function activeGrantHash(grant: Partial<Infer<typeof grantInput>>): string {
  if (grant.grantId === undefined || grant.agentId === undefined || grant.principalId === undefined
    || grant.networkIds === undefined || grant.maximumSpendMinor === undefined || grant.currency === undefined
    || grant.allowedDataFields === undefined || grant.protectedFieldSetId === undefined
    || grant.maximumDisclosureAttempts === undefined || grant.maximumDisclosureExposures === undefined
    || grant.allowedRecipientBindingIds === undefined || grant.allowedDisclosurePurposes === undefined
    || grant.expiresAt === undefined || grant.evidenceRefs === undefined) return ''
  return canonicalAuthorityDigest({
    grantId: grant.grantId, agentId: grant.agentId, principalId: grant.principalId,
    networkIds: grant.networkIds, maximumSpendMinor: grant.maximumSpendMinor, currency: grant.currency,
    allowedDataFields: grant.allowedDataFields, protectedFieldSetId: grant.protectedFieldSetId,
    maximumDisclosureAttempts: grant.maximumDisclosureAttempts,
    maximumDisclosureExposures: grant.maximumDisclosureExposures,
    allowedRecipientBindingIds: grant.allowedRecipientBindingIds,
    allowedDisclosurePurposes: grant.allowedDisclosurePurposes,
    expiresAt: grant.expiresAt, evidenceRefs: grant.evidenceRefs,
  })
}

function validStrings(values: readonly string[], min: number, max: number, length: number): boolean {
  return values.length >= min && values.length <= max && values.every((value) => value.trim().length > 0 && value.length <= length)
}

function budgetAuthorityForGrant(
  grant: Readonly<{ grantId: string; agentId: string; principalId: string; maximumSpendMinor: number; currency: string; expiresAt: number; status?: 'active' | 'revoked' }>,
  networkId: string,
  now: number,
  legacy = false,
) {
  return {
    budgetContract: legacy ? 'legacy_quarantined' as const : 'cumulative_v1' as const,
    budgetAuthorityRef: `budget-authority:${canonicalAuthorityDigest({ sourceGrantId: grant.grantId, networkId, currency: grant.currency, railProfileId: 'provider-cost-v1' })}`,
    sourceGrantId: grant.grantId, agentId: grant.agentId, principalId: grant.principalId, networkId,
    railProfileId: 'provider-cost-v1' as const, currency: grant.currency, maximumGrossMinor: legacy ? 0 : grant.maximumSpendMinor,
    reservedGrossMinor: 0, committedGrossMinor: 0, expiresAt: grant.expiresAt,
    status: legacy ? 'revoked' as const : grant.status ?? 'active', revision: 0, createdAt: now, updatedAt: now,
  }
}

function dataAuthorizationBudgetForGrant(
  grant: Readonly<{ grantId: string; agentId: string; principalId: string; allowedDataFields: string[]; protectedFieldSetId: string; maximumDisclosureAttempts: number; maximumDisclosureExposures: number; allowedRecipientBindingIds: string[]; allowedDisclosurePurposes: string[]; expiresAt: number }>,
  networkId: string,
  now: number,
) {
  return {
    dataContract: 'cumulative_v1' as const,
    dataAuthorizationBudgetRef: `data-budget:${canonicalAuthorityDigest({ sourceGrantId: grant.grantId, networkId, protectedFieldSetId: grant.protectedFieldSetId })}`,
    sourceGrantId: grant.grantId, agentId: grant.agentId, principalId: grant.principalId, networkId,
    protectedFieldSetId: grant.protectedFieldSetId, permittedFields: grant.allowedDataFields,
    permittedRecipientBindingIds: grant.allowedRecipientBindingIds, permittedPurposes: grant.allowedDisclosurePurposes,
    maximumAttempts: grant.maximumDisclosureAttempts, maximumExposures: grant.maximumDisclosureExposures,
    reservedAttempts: 0, reservedExposures: 0, consumedAttempts: 0, consumedExposures: 0, expiresAt: grant.expiresAt, status: 'active' as const,
    revision: 0, createdAt: now, updatedAt: now,
  }
}
