import { listUIMessages } from '@convex-dev/agent'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import {
  CHAT_THREAD_SHARE_TOKEN_PATTERN,
  chatThreadShareAccessId,
  verifyChatThreadShare,
} from '@/modules/chat-sharing/share-token'
import { findChatThreadShareByAccessId } from '@/modules/chat-sharing/convex'
import { components } from '../../../_generated/api'
import type { QueryCtx } from '../../../_generated/server'
import { listSharedMessagesResult } from './contracts'
import { keyring } from './grants'
import { projectPublicMessage } from './projection'

const MAX_MESSAGE_PAGE_SIZE = 50

export const listSharedMessagesArgs = {
  shareToken: v.string(),
  paginationOpts: paginationOptsValidator,
}

function validatePaginationOpts(
  value: typeof paginationOptsValidator.type,
): typeof paginationOptsValidator.type {
  if (
    !Number.isInteger(value.numItems)
    || value.numItems < 1
    || value.numItems > MAX_MESSAGE_PAGE_SIZE
  ) {
    throw new Error('chat_message_page_size_invalid')
  }
  return value
}

export async function listSharedMessagesHandler(
  ctx: QueryCtx,
  args: { shareToken: string; paginationOpts: typeof paginationOptsValidator.type },
): Promise<typeof listSharedMessagesResult.type> {
  const shareToken = args.shareToken.trim()
  if (!CHAT_THREAD_SHARE_TOKEN_PATTERN.test(shareToken)) {
    throw new Error('shared_thread_not_found')
  }
  const grant = await findChatThreadShareByAccessId(
    ctx,
    chatThreadShareAccessId(shareToken),
  )
  const signingKey = keyring()
  if (grant === null || !verifyChatThreadShare({
    grant,
    shareToken,
    keyring: signingKey,
  })) {
    throw new Error('shared_thread_not_found')
  }
  const thread = await ctx.db
    .query('chatThreads')
    .withIndex('by_threadId', (index) => index.eq('threadId', grant.threadId))
    .unique()
  if (thread === null) throw new Error('shared_thread_not_found')

  const messages = await listUIMessages(ctx, components.agent, {
    threadId: thread.threadId,
    paginationOpts: validatePaginationOpts(args.paginationOpts),
  })
  return {
    title: thread.title,
    ...messages,
    page: messages.page.flatMap((message) => {
      const projected = projectPublicMessage(message)
      return projected === null ? [] : [projected]
    }),
  }
}
