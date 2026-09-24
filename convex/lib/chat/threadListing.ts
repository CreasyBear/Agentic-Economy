import { paginationOptsValidator, type PaginationResult } from 'convex/server'
import type { Doc } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'
import type { BusinessActor } from '../../../src/modules/business/public'
import type { MutationCtx } from '../../_generated/server'
import { resolveBusinessActor } from '../../authz'
import { resolveCurrentAgentAuthority } from '../capabilityExecution/callLifecycle/agentCallAuthority'
import { resolveCanonicalAgentContext } from '../authority/canonicalAgent/authority'
import type { TurnActor } from './turnHandlers'
import { chatThreadBelongsToPrincipal } from './threadOwnership'

const MAX_PAGE_SIZE = 50
export const MAX_CHAT_THREAD_TITLE_LENGTH = 80
export const ACTIVE_CHAT_GENERATION_MS = 10 * 60 * 1_000

type Owner = Extract<BusinessActor, { kind: 'authenticated_owner' }>
type PageArgs = Readonly<{
  paginationOpts: typeof paginationOptsValidator.type
  now: number
}>

export type ChatThreadSummary = Readonly<{
  threadId: string
  title: string
  createdAt: number
  updatedAt: number
  busy: boolean
}>


export function normalizeChatThreadTitle(title: string): string {
  return Array.from(title.trim().replace(/\s+/gu, ' '))
    .slice(0, MAX_CHAT_THREAD_TITLE_LENGTH)
    .join('')
}

export function isChatThreadBusy(row: Doc<'chatThreads'>, now: number): boolean {
  return row.activePromptMessageId !== undefined
    && row.activeStartedAt !== undefined
    && row.activeStartedAt > now - ACTIVE_CHAT_GENERATION_MS
}

export function projectThread(row: Doc<'chatThreads'>, now: number): ChatThreadSummary {
  return {
    threadId: row.threadId,
    title: row.title,
    createdAt: row._creationTime,
    updatedAt: row.updatedAt,
    busy: isChatThreadBusy(row, now),
  }
}

function paginationOpts(value: typeof paginationOptsValidator.type): typeof paginationOptsValidator.type {
  if (!Number.isInteger(value.numItems) || value.numItems < 1 || value.numItems > MAX_PAGE_SIZE) {
    throw new Error('chat_thread_page_size_invalid')
  }
  return value
}

async function ownerPage(ctx: QueryCtx, page: PaginationResult<Doc<'chatThreads'>>, owner: Owner, now: number): Promise<PaginationResult<ChatThreadSummary>> {
  const ownerChat = await resolveOwnerChatActor(ctx)
  return {
    ...page,
    page: page.page
      .filter(row => chatThreadBelongsToPrincipal(row, owner.canonicalAccountRef, 'clerk_owner', owner.canonicalPrincipalRef)
        || ownerChat !== null && chatThreadBelongsToPrincipal(row, owner.canonicalAccountRef, 'agent_key', ownerChat.principalRef))
      .map(row => projectThread(row, now)),
  }
}
/** A Clerk session may start only the owner's explicit, live, approval-only chat grant. */
export async function resolveOwnerChatActor(ctx: Pick<QueryCtx, 'auth' | 'db'> | MutationCtx): Promise<TurnActor | null> {
  const owner = await resolveBusinessActor(ctx)
  if (owner.kind !== 'authenticated_owner') throw new Error('unauthenticated')
  const rows = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_ownerId_and_lifecycle', q => q
      .eq('ownerId', owner.canonicalAccountRef).eq('lifecycle', 'active')).take(100)
  const matches = rows.filter(row => row.applicationRef === 'ae-owner-chat')
  if (matches.length !== 1) return null
  const [row] = matches
  if (row === undefined || row.authorityMode !== 'approval_required') return null
  const canonical = await resolveCanonicalAgentContext(ctx, row.credentialId, Date.now())
  if (canonical?.principalRef !== row.principalId || canonical.accountRef !== owner.canonicalAccountRef) return null
  const current = await resolveCurrentAgentAuthority(ctx, {
    principalId: row.principalId, ownerId: row.ownerId, credentialId: row.credentialId,
    applicationRef: row.applicationRef, environment: row.environment,
    scopes: row.scopes, authorityMode: row.authorityMode,
  }, Date.now(), { kind: 'receipt_list' })
  if (current === null) return null
  return {
    kind: 'agent_key', principalRef: row.principalId, accountRef: owner.canonicalAccountRef,
    credentialLocator: row.credentialId, grantRef: current.grantRef, origin: 'owner_chat',
  }
}

export async function listChatThreads(ctx: QueryCtx, owner: Owner, args: PageArgs): Promise<PaginationResult<ChatThreadSummary>> {
  const page = await ctx.db.query('chatThreads')
    .withIndex('by_ownerId_and_updatedAt', index => index.eq('ownerId', owner.canonicalAccountRef))
    .order('desc')
    .paginate(paginationOpts(args.paginationOpts))
  return await ownerPage(ctx, page, owner, args.now)
}

export async function searchChatThreads(ctx: QueryCtx, owner: Owner, args: PageArgs & Readonly<{ query: string }>): Promise<PaginationResult<ChatThreadSummary>> {
  const search = normalizeChatThreadTitle(args.query)
  if (search.length === 0) return listChatThreads(ctx, owner, args)
  const page = await ctx.db.query('chatThreads')
    .withSearchIndex('search_title_by_ownerId', index =>
      index.search('title', search).eq('ownerId', owner.canonicalAccountRef))
    .paginate(paginationOpts(args.paginationOpts))
  return await ownerPage(ctx, page, owner, args.now)
}
