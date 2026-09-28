import type { Infer } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { resolveInteractiveAuthorityContext } from '../../principalAccount/interactiveAuthority/factResolution'
import { InteractiveAuthorityError } from '../../principalAccount/interactiveAuthority/errors'
import { verifyMarketAgentPrincipal, type AgentAccessPrincipalValue } from '../../agentAccess/principals/verification'
import { requireSourceRead, requireSourceWrite } from '../../security/sourceWrite/admission'
import { savedIdentityValue, savedListResultValue, savedRemoveResultValue, savedSaveResultValue } from './contracts'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { readCurrentPublishedTool } from '../../capabilitySupply/currentTool/reads'
import { activeDirectoryGeneration } from '../directoryIndex/rows'

const LIMIT = 100
export type SavedIdentityValue = Infer<typeof savedIdentityValue>
type AccessCtx = QueryCtx | MutationCtx

async function ownerSession(ctx: AccessCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return null
  try {
    const owner = await resolveInteractiveAuthorityContext(ctx.db, identity)
    return owner.provenance.accessKind === 'ownership' ? owner.accountRef : null
  } catch (error) {
    if (error instanceof InteractiveAuthorityError) return null
    throw error
  }
}

type AgentArgs = {
  agentPrincipal: AgentAccessPrincipalValue
  operationKey: string
  correlationId: string
  sourceWrite?: Infer<typeof sourceWriteArgs.sourceWrite>
  sourceWriteRequest?: Infer<typeof sourceWriteArgs.sourceWriteRequest>
}
async function agentOwner(ctx: AccessCtx, args: AgentArgs, write: boolean): Promise<string | null> {
  const source = write && 'scheduler' in ctx
    ? await requireSourceWrite(ctx, args, 'protected_action')
    : await requireSourceRead(args, 'protected_action')
  if (source.kind === 'rejected') return null
  const principal = await verifyMarketAgentPrincipal(ctx, args.agentPrincipal)
  return principal.kind === 'allowed' ? principal.ownerId : null
}

export async function ownerList(ctx: QueryCtx): Promise<Infer<typeof savedListResultValue>> {
  const ownerId = await ownerSession(ctx)
  return ownerId === null ? { kind: 'error', code: 'unauthenticated' } : await list(ctx, ownerId)
}
export async function agentList(ctx: QueryCtx, args: AgentArgs): Promise<Infer<typeof savedListResultValue>> {
  const ownerId = await agentOwner(ctx, args, false)
  return ownerId === null ? { kind: 'error', code: 'unauthenticated' } : await list(ctx, ownerId)
}
async function list(ctx: AccessCtx, ownerId: string): Promise<Infer<typeof savedListResultValue>> {
  const rows = await ctx.db.query('marketSavedTools')
    .withIndex('by_owner_created', q => q.eq('ownerId', ownerId)).order('desc').take(LIMIT)
  return { kind: 'available', items: rows.map(row => ({ identity: { kind: row.kind, identityRef: row.identityRef }, createdAt: row.createdAt })) }
}

function validIdentity(identity: SavedIdentityValue): boolean {
  if (identity.kind === 'ae_callable') return /^operation:v1:[0-9a-f]{64}$/u.test(identity.identityRef)
  if (identity.identityRef.length > 8192) return false
  if (!URL.canParse(identity.identityRef)) return false
  const url = new URL(identity.identityRef)
  return url.protocol === 'https:' && url.username === '' && url.password === ''
}
/** Final transactional freshness check: no public mutation may trust a server-function preflight. */
async function currentIdentity(ctx: MutationCtx, identity: SavedIdentityValue): Promise<'current' | 'not_found' | 'source_unavailable'> {
  if (identity.kind === 'ae_callable') {
    return await readCurrentPublishedTool(ctx, identity.identityRef) === undefined ? 'not_found' : 'current'
  }
  const generation = await activeDirectoryGeneration(ctx)
  if (generation === null) return 'source_unavailable'
  const documentId = `registry:${canonicalDigest({ source: 'coinbase', resource: identity.identityRef }).slice(7)}`
  const entry = await ctx.db.query('marketExternalRegistryEntries')
    .withIndex('by_generation_and_documentId', q => q.eq('generation', generation.generation).eq('documentId', documentId)).unique()
  if (entry === null || entry.source !== 'coinbase' || (entry.endpointUrl ?? entry.sourceUrl) !== identity.identityRef) return 'not_found'
  const selected = await ctx.db.query('marketDirectorySearchEntries')
    .withIndex('by_generation_and_network_and_resource', q =>
      q.eq('generation', generation.generation).eq('network', '*').eq('resource', identity.identityRef)).unique()
  if (selected?.entryId !== entry._id) return 'not_found'
  if (selected.sourceRouteRef !== undefined) {
    const admitted = await ctx.db.query('capabilityPublications')
      .withIndex('by_sourceRouteRef_and_disposition', q =>
        q.eq('sourceRouteRef', selected.sourceRouteRef).eq('disposition', 'current')).unique()
    if (admitted !== null) return 'not_found'
  }
  return 'current'
}

async function save(ctx: MutationCtx, ownerId: string, identity: SavedIdentityValue): Promise<Infer<typeof savedSaveResultValue>> {
  if (!validIdentity(identity)) return { kind: 'refused', code: 'invalid_identity' }
  const existing = await ctx.db.query('marketSavedTools').withIndex('by_owner_kind_ref', q =>
    q.eq('ownerId', ownerId).eq('kind', identity.kind).eq('identityRef', identity.identityRef)).unique()
  if (existing !== null) return { kind: 'already_saved', identity, createdAt: existing.createdAt }
  const rows = await ctx.db.query('marketSavedTools').withIndex('by_owner_created', q => q.eq('ownerId', ownerId)).take(LIMIT)
  if (rows.length >= LIMIT) return { kind: 'refused', code: 'limit_reached' }
  const current = await currentIdentity(ctx, identity)
  if (current !== 'current') return { kind: 'refused', code: current }
  const createdAt = Date.now()
  await ctx.db.insert('marketSavedTools', { ownerId, kind: identity.kind, identityRef: identity.identityRef, createdAt })
  return { kind: 'saved', identity, createdAt }
}
export async function ownerSave(ctx: MutationCtx, identity: SavedIdentityValue): Promise<Infer<typeof savedSaveResultValue>> {
  const ownerId = await ownerSession(ctx)
  return ownerId === null ? { kind: 'refused', code: 'unauthenticated' } : await save(ctx, ownerId, identity)
}
export async function agentSave(ctx: MutationCtx, args: AgentArgs & { identity: SavedIdentityValue }): Promise<Infer<typeof savedSaveResultValue>> {
  const ownerId = await agentOwner(ctx, args, true)
  return ownerId === null ? { kind: 'refused', code: 'unauthenticated' } : await save(ctx, ownerId, args.identity)
}
async function remove(ctx: MutationCtx, ownerId: string, identity: SavedIdentityValue): Promise<Infer<typeof savedRemoveResultValue>> {
  if (!validIdentity(identity)) return { kind: 'not_found' }
  const existing = await ctx.db.query('marketSavedTools').withIndex('by_owner_kind_ref', q =>
    q.eq('ownerId', ownerId).eq('kind', identity.kind).eq('identityRef', identity.identityRef)).unique()
  if (existing === null) return { kind: 'not_found' }
  await ctx.db.delete(existing._id)
  return { kind: 'removed' }
}
export async function ownerRemove(ctx: MutationCtx, identity: SavedIdentityValue): Promise<Infer<typeof savedRemoveResultValue>> {
  const ownerId = await ownerSession(ctx)
  return ownerId === null ? { kind: 'error', code: 'unauthenticated' } : await remove(ctx, ownerId, identity)
}
export async function agentRemove(ctx: MutationCtx, args: AgentArgs & { identity: SavedIdentityValue }): Promise<Infer<typeof savedRemoveResultValue>> {
  const ownerId = await agentOwner(ctx, args, true)
  return ownerId === null ? { kind: 'error', code: 'unauthenticated' } : await remove(ctx, ownerId, args.identity)
}
