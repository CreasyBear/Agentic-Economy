import { v, type ObjectType } from 'convex/values'
import type { GenericDatabaseReader } from 'convex/server'
import { agentAccessConsentReservationValue } from '@/modules/agent-access/public'
import { internal } from '../../../_generated/api'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type { DataModel, Doc } from '../../../_generated/dataModel'
import { sourceWriteArgs } from '../../../sourceWriteAdmission'
import {
  parseWorkloadCronSnapshot,
  reconcileWorkloadCronSnapshot,
  workloadCronSnapshotValue,
} from '../../../workloadCron'
import { requireOAuthSourceRead, requireOAuthSourceWrite, sameStringArray } from './shared'

const flow = v.union(v.literal('device_code'), v.literal('authorization_code'))
const status = v.union(
  v.literal('pending'), v.literal('issuing'), v.literal('approved'), v.literal('denied'),
  v.literal('delivery_claimed'), v.literal('consumed'), v.literal('expired'),
)
const OAUTH_GRANT_STATUSES = ['pending', 'issuing', 'approved', 'denied', 'delivery_claimed', 'consumed', 'expired'] as const
const requestedAccessAmount = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})
const requestedAccess = v.object({
  environment: v.union(v.literal('sandbox'), v.literal('production')),
  toolAccess: v.union(v.literal('all_admitted'), v.literal('selected_tools')),
  toolRefs: v.array(v.string()),
  maximumSpendPerCall: v.optional(requestedAccessAmount),
  maximumDailySpend: v.optional(requestedAccessAmount),
  maximumMonthlySpend: v.optional(requestedAccessAmount),
  maximumConcurrentCalls: v.optional(v.number()),
  maximumCallsPerMinute: v.optional(v.number()),
  maximumCallsPerHour: v.optional(v.number()),
  expiresInSeconds: v.number(),
})
const connectionTarget = v.union(
  v.object({ kind: v.literal('new_agent'), displayName: v.string() }),
  v.object({
    kind: v.literal('replace_credential'),
    principalRef: v.string(),
    replacementMode: v.union(v.literal('planned'), v.literal('compromise')),
  }),
)
const replacement = v.object({
  principalRef: v.string(), generation: v.number(), successorCredentialRef: v.string(),
  predecessorCredentialRef: v.string(), predecessorKeyId: v.string(), successorGrantRef: v.string(),
})
const grant = v.object({
  grantRef: v.string(), revision: v.number(), flow, clientId: v.string(), redirectUri: v.optional(v.string()),
  requestedScopes: v.array(v.string()), offlineAccess: v.optional(v.literal(true)), requestedAccess, approvedAccess: requestedAccess, codeChallenge: v.optional(v.string()), codeChallengeMethod: v.optional(v.literal('S256')),
  deviceCodeHash: v.optional(v.string()), userCodeHash: v.optional(v.string()), authorizationCodeHash: v.optional(v.string()),
  status, ownerId: v.optional(v.string()), keyId: v.optional(v.string()), createdAt: v.number(), expiresAt: v.number(),
  approvedAt: v.optional(v.number()), issuanceKey: v.optional(v.string()), issuanceStartedAt: v.optional(v.number()), consumedAt: v.optional(v.number()), nextPollAt: v.optional(v.number()),
  deliveryClaimToken: v.optional(v.string()), deliveryCredentialHash: v.optional(v.string()), deliveryReplayUntil: v.optional(v.number()), displayName: v.string(), denialReason: v.optional(v.literal('access_denied')),
  connectionTarget: v.optional(connectionTarget), replacement: v.optional(replacement),
  consequenceReservation: v.optional(agentAccessConsentReservationValue),
})
const grantPatch = v.object({
  status: v.optional(status), redirectUri: v.optional(v.string()), requestedScopes: v.optional(v.array(v.string())), offlineAccess: v.optional(v.literal(true)), approvedAccess: v.optional(requestedAccess),
  codeChallenge: v.optional(v.string()), codeChallengeMethod: v.optional(v.literal('S256')),
  deviceCodeHash: v.optional(v.string()), userCodeHash: v.optional(v.string()), authorizationCodeHash: v.optional(v.string()),
  ownerId: v.optional(v.string()), keyId: v.optional(v.string()), createdAt: v.optional(v.number()), expiresAt: v.optional(v.number()),
  approvedAt: v.optional(v.number()), issuanceKey: v.optional(v.string()), issuanceStartedAt: v.optional(v.number()), consumedAt: v.optional(v.number()), nextPollAt: v.optional(v.number()),
  deliveryClaimToken: v.optional(v.string()), deliveryCredentialHash: v.optional(v.string()), deliveryReplayUntil: v.optional(v.number()), displayName: v.optional(v.string()), denialReason: v.optional(v.literal('access_denied')),
  connectionTarget: v.optional(connectionTarget), replacement: v.optional(replacement),
})
const oauthGrantCleanupResult = v.object({
  deleted: v.number(),
  cutoff: v.number(),
  rescheduled: v.boolean(),
})

export const cleanupExpiredOAuthGrantsArgs = {
  now: v.optional(v.number()),
  batchSize: v.optional(v.number()),
  workload: workloadCronSnapshotValue,
}
export const cleanupExpiredOAuthGrantsResult = oauthGrantCleanupResult
export async function cleanupExpiredOAuthGrantsHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof cleanupExpiredOAuthGrantsArgs>,
) {
  await reconcileWorkloadCronSnapshot(
    ctx,
    'cleanup expired agent access oauth grants',
    parseWorkloadCronSnapshot(args.workload),
  )
  const effectiveNow = args.now !== undefined && Number.isFinite(args.now) ? args.now : Date.now()
  const cutoff = effectiveNow - 60 * 60 * 1_000
  const batchSize = args.batchSize === undefined || !Number.isFinite(args.batchSize)
    ? 100
    : Math.min(Math.max(Math.floor(args.batchSize), 1), 200)

  let deleted = 0
  for (const status of OAUTH_GRANT_STATUSES) {
    const remaining = batchSize - deleted
    if (remaining === 0) break
    const expired = await ctx.db
      .query('agentAccessOAuthGrants')
      .withIndex('by_status_and_expiresAt', (query) => query.eq('status', status).lt('expiresAt', cutoff))
      .take(remaining)
    for (const row of expired) {
      await ctx.db.delete(row._id)
      deleted += 1
    }
  }

  const rescheduled = deleted === batchSize
  if (rescheduled) {
    await ctx.scheduler.runAfter(0, internal.workloadCron.cleanupExpiredAgentAccessOAuthGrants, {
      now: effectiveNow,
      batchSize,
    })
  }

  return { deleted, cutoff, rescheduled }
}

export const insertGrantArgs = { grant, operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs }
export const insertGrantResult = v.null()
export async function insertGrantHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof insertGrantArgs>,
) {
  await requireOAuthSourceWrite(ctx, args)
  if (args.grant.revision !== 1) {
    throw new Error('agent_access_oauth_invalid_initial_revision')
  }
  if (args.grant.consequenceReservation !== undefined) {
    throw new Error('agent_access_oauth_initial_reservation_forbidden')
  }
  const existing = await ctx.db
    .query('agentAccessOAuthGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grant.grantRef))
    .unique()
  if (existing !== null && !sameGrantMaterial(existing, args.grant)) {
    throw new Error('agent_access_oauth_grant_conflict')
  }
  await assertGrantHashesAvailable(ctx.db, args.grant, existing?._id)
  if (existing === null) {
    await ctx.db.insert('agentAccessOAuthGrants', args.grant)
  }
  return null
}

export const getGrantByHashArgs = {
  kind: v.union(v.literal('device'), v.literal('user'), v.literal('authorization')),
  hash: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
}
export const getGrantByHashResult = v.union(grant, v.null())
export async function getGrantByHashHandler(
  ctx: QueryCtx,
  args: ObjectType<typeof getGrantByHashArgs>,
) {
  await requireOAuthSourceRead(args)
  const row = args.kind === 'device'
    ? await ctx.db.query('agentAccessOAuthGrants')
      .withIndex('by_deviceCodeHash', (query) => query.eq('deviceCodeHash', args.hash))
      .unique()
    : args.kind === 'user'
      ? await ctx.db.query('agentAccessOAuthGrants')
        .withIndex('by_userCodeHash', (query) => query.eq('userCodeHash', args.hash))
        .unique()
      : await ctx.db.query('agentAccessOAuthGrants')
        .withIndex('by_authorizationCodeHash', (query) => query.eq('authorizationCodeHash', args.hash))
        .unique()
  return row === null ? null : grantFromDocument(row)
}

export const getGrantByRefArgs = { grantRef: v.string(), operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs }
export const getGrantByRefResult = v.union(grant, v.null())
export async function getGrantByRefHandler(
  ctx: QueryCtx,
  args: ObjectType<typeof getGrantByRefArgs>,
) {
  await requireOAuthSourceRead(args)
  const row = await ctx.db
    .query('agentAccessOAuthGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef))
    .unique()
  return row === null ? null : grantFromDocument(row)
}

export const updateGrantArgs = {
  grantRef: v.string(), expectedStatus: status, expectedRevision: v.number(), expectedIssuanceStartedAt: v.optional(v.number()),
  patch: grantPatch, operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs,
}
export const updateGrantResult = v.union(grant, v.null())
export async function updateGrantHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof updateGrantArgs>,
) {
  await requireOAuthSourceWrite(ctx, args)
  if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 1) {
    throw new Error('agent_access_oauth_invalid_expected_revision')
  }
  if (args.expectedStatus === 'pending' && args.patch.status === 'issuing') {
    throw new Error('agent_access_oauth_consequence_reservation_required')
  }
  const existing = await ctx.db
    .query('agentAccessOAuthGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef))
    .unique()
  if (existing === null
    || existing.status !== args.expectedStatus
    || existing.revision !== args.expectedRevision
    || (args.expectedIssuanceStartedAt !== undefined
      && existing.issuanceStartedAt !== args.expectedIssuanceStartedAt)) return null

  await assertGrantHashesAvailable(ctx.db, args.patch, existing._id)
  const patch = grantPatchDocument(args.patch)
  const pollScheduleOnly = Object.keys(patch).length === 1 && patch.nextPollAt !== undefined
  const update = pollScheduleOnly ? patch : { ...patch, revision: existing.revision + 1 }
  await ctx.db.patch(existing._id, update)
  const updated = await ctx.db.get(existing._id)
  return updated === null ? null : grantFromDocument(updated)
}

type OAuthGrantMaterial = Omit<Doc<'agentAccessOAuthGrants'>, '_id' | '_creationTime'>
type OAuthGrantPatchMaterial = Partial<Omit<OAuthGrantMaterial, 'revision'>>
type OAuthRequestedAccessMaterial = OAuthGrantMaterial['requestedAccess']
type OAuthDatabaseReader = GenericDatabaseReader<DataModel>

async function assertGrantHashesAvailable(
  db: OAuthDatabaseReader,
  candidate: Pick<OAuthGrantMaterial, 'deviceCodeHash' | 'userCodeHash' | 'authorizationCodeHash'>,
  allowedId: Doc<'agentAccessOAuthGrants'>['_id'] | undefined,
): Promise<void> {
  if (candidate.deviceCodeHash !== undefined) {
    await assertGrantHashAvailable(db, 'device', candidate.deviceCodeHash, allowedId)
  }
  if (candidate.userCodeHash !== undefined) {
    await assertGrantHashAvailable(db, 'user', candidate.userCodeHash, allowedId)
  }
  if (candidate.authorizationCodeHash !== undefined) {
    await assertGrantHashAvailable(db, 'authorization', candidate.authorizationCodeHash, allowedId)
  }
}

async function assertGrantHashAvailable(
  db: OAuthDatabaseReader,
  kind: 'device' | 'user' | 'authorization',
  hash: string,
  allowedId: Doc<'agentAccessOAuthGrants'>['_id'] | undefined,
): Promise<void> {
  const existing = kind === 'device'
    ? await db.query('agentAccessOAuthGrants')
      .withIndex('by_deviceCodeHash', (query) => query.eq('deviceCodeHash', hash))
      .unique()
    : kind === 'user'
      ? await db.query('agentAccessOAuthGrants')
        .withIndex('by_userCodeHash', (query) => query.eq('userCodeHash', hash))
        .unique()
      : await db.query('agentAccessOAuthGrants')
        .withIndex('by_authorizationCodeHash', (query) => query.eq('authorizationCodeHash', hash))
        .unique()
  if (existing !== null && existing._id !== allowedId) {
    throw new Error('agent_access_oauth_grant_conflict')
  }
}

function sameGrantMaterial(left: OAuthGrantMaterial, right: OAuthGrantMaterial): boolean {
  return left.grantRef === right.grantRef
    && left.revision === right.revision
    && left.flow === right.flow
    && left.clientId === right.clientId
    && left.redirectUri === right.redirectUri
    && sameStringArray(left.requestedScopes, right.requestedScopes)
    && left.offlineAccess === right.offlineAccess
    && sameRequestedAccess(left.requestedAccess, right.requestedAccess)
    && sameRequestedAccess(left.approvedAccess, right.approvedAccess)
    && left.codeChallenge === right.codeChallenge
    && left.codeChallengeMethod === right.codeChallengeMethod
    && left.deviceCodeHash === right.deviceCodeHash
    && left.userCodeHash === right.userCodeHash
    && left.authorizationCodeHash === right.authorizationCodeHash
    && left.status === right.status
    && left.ownerId === right.ownerId
    && left.keyId === right.keyId
    && left.createdAt === right.createdAt
    && left.expiresAt === right.expiresAt
    && left.approvedAt === right.approvedAt
    && left.issuanceKey === right.issuanceKey
    && left.consumedAt === right.consumedAt
    && left.nextPollAt === right.nextPollAt
    && left.deliveryClaimToken === right.deliveryClaimToken
    && left.deliveryCredentialHash === right.deliveryCredentialHash
    && left.deliveryReplayUntil === right.deliveryReplayUntil
    && left.displayName === right.displayName
    && left.denialReason === right.denialReason
    && JSON.stringify(left.connectionTarget) === JSON.stringify(right.connectionTarget)
    && JSON.stringify(left.replacement) === JSON.stringify(right.replacement)
    && left.consequenceReservation === undefined
    && right.consequenceReservation === undefined
    && left.issuanceStartedAt === right.issuanceStartedAt
}

function sameRequestedAccess(
  left: OAuthRequestedAccessMaterial,
  right: OAuthRequestedAccessMaterial,
): boolean {
  const sameAmount = (
    leftAmount: OAuthRequestedAccessMaterial['maximumSpendPerCall'],
    rightAmount: OAuthRequestedAccessMaterial['maximumSpendPerCall'],
  ): boolean => leftAmount === undefined || rightAmount === undefined
    ? leftAmount === rightAmount
    : leftAmount.currency === rightAmount.currency
      && leftAmount.units === rightAmount.units
      && leftAmount.exponent === rightAmount.exponent
  return left.environment === right.environment
    && left.toolAccess === right.toolAccess
    && sameStringArray(left.toolRefs, right.toolRefs)
    && sameAmount(left.maximumSpendPerCall, right.maximumSpendPerCall)
    && sameAmount(left.maximumDailySpend, right.maximumDailySpend)
    && sameAmount(left.maximumMonthlySpend, right.maximumMonthlySpend)
    && left.maximumConcurrentCalls === right.maximumConcurrentCalls
    && left.maximumCallsPerMinute === right.maximumCallsPerMinute
    && left.maximumCallsPerHour === right.maximumCallsPerHour
    && left.expiresInSeconds === right.expiresInSeconds
}

function grantPatchDocument(patch: OAuthGrantPatchMaterial): OAuthGrantPatchMaterial {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as OAuthGrantPatchMaterial
}

function grantFromDocument(row: Doc<'agentAccessOAuthGrants'>) {
  const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...value } = row
  return value
}
