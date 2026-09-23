import { paginationOptsValidator, type PaginationResult } from 'convex/server'
import type { Doc } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'
import type { BusinessActor } from '../../../src/modules/business/public'
import { chatThreadBelongsToPrincipal } from './threadOwnership'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50
export const MAX_CHAT_THREAD_TITLE_LENGTH = 80
export const ACTIVE_CHAT_GENERATION_MS = 10 * 60 * 1_000

type Owner = Extract<BusinessActor, { kind: 'authenticated_owner' }>
type PageArgs = Readonly<{
  paginationOpts?: typeof paginationOptsValidator.type
  now: number
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

export function projectThread(row: Doc<'chatThreads'>, now: number) {
  return {
    threadId: row.threadId,
    title: row.title,
    createdAt: row._creationTime,
    updatedAt: row.updatedAt,
    busy: isChatThreadBusy(row, now),
  }
}

function paginationOpts(value: typeof paginationOptsValidator.type | undefined): typeof paginationOptsValidator.type {
  const resolved = value ?? { cursor: null, numItems: DEFAULT_PAGE_SIZE }
  if (!Number.isInteger(resolved.numItems) || resolved.numItems < 1 || resolved.numItems > MAX_PAGE_SIZE) {
    throw new Error('chat_thread_page_size_invalid')
  }
  return resolved
}

function ownerPage(page: PaginationResult<Doc<'chatThreads'>>, owner: Owner, now: number) {
  return {
    ...page,
    page: page.page
      .filter(row => chatThreadBelongsToPrincipal(row, owner.canonicalAccountRef, 'clerk_owner', owner.canonicalPrincipalRef))
      .map(row => projectThread(row, now)),
  }
}

export async function listChatThreads(ctx: QueryCtx, owner: Owner, args: PageArgs) {
  const page = await ctx.db.query('chatThreads')
    .withIndex('by_ownerId_and_updatedAt', index => index.eq('ownerId', owner.canonicalAccountRef))
    .order('desc')
    .paginate(paginationOpts(args.paginationOpts))
  return ownerPage(page, owner, args.now)
}

export async function searchChatThreads(ctx: QueryCtx, owner: Owner, args: PageArgs & Readonly<{ query: string }>) {
  const search = normalizeChatThreadTitle(args.query)
  if (search.length === 0) return listChatThreads(ctx, owner, args)
  const page = await ctx.db.query('chatThreads')
    .withSearchIndex('search_title_by_ownerId', index =>
      index.search('title', search).eq('ownerId', owner.canonicalAccountRef))
    .paginate(paginationOpts(args.paginationOpts))
  return ownerPage(page, owner, args.now)
}
