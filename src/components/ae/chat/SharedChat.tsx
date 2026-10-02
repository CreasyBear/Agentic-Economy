/* Arc Pro ai-chat header/thread composition with live shared transcript data.
 * Pagination cursors, privacy and read-only semantics remain caller-owned.
 * Sample composer/menus and local demo messages are omitted. */
import { useConvex, useQuery } from 'convex/react'
import { LockKeyholeIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { api } from '../../../../convex/_generated/api'
import { AeChatPage } from '@/components/ae/layout/AeChatPage'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { Button } from '@/components/arc/button/button'
import './SharedChatComposition.css'
import { Skeleton } from '@/components/ui/skeleton'
import { chatShared } from '@/lib/public/chat-ia'

import { ChatTranscript } from './ChatTranscript'
import { useChatHeaderSlot } from './chat-session/useChatHeaderSlot'
import type { TranscriptMessage } from './presentation'

const PAGE_SIZE = 20
const TRANSCRIPT_COLUMN = 'arc-market arc-chat arc-shared-column'

function projectSharedPage(
  page: readonly { id: string; role: 'user' | 'assistant'; parts: TranscriptMessage['parts'] }[],
): TranscriptMessage[] {
  return [...page].reverse().map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.parts,
  }))
}

export function SharedChat({ shareToken }: { shareToken: string }) {
  const convex = useConvex()
  const initial = useQuery(api.chatShares.listSharedMessages, {
    shareToken,
    paginationOpts: { cursor: null, numItems: PAGE_SIZE },
  })
  const [olderMessages, setOlderMessages] = useState<TranscriptMessage[]>([])
  const [continueCursor, setContinueCursor] = useState<string | undefined>()
  const [isDone, setIsDone] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    setOlderMessages([])
    setContinueCursor(undefined)
    setIsDone(true)
    setLoadingMore(false)
  }, [shareToken])

  useEffect(() => {
    if (initial === undefined) return
    if (olderMessages.length > 0) return
    setIsDone(initial.isDone)
    setContinueCursor(initial.isDone ? undefined : initial.continueCursor)
  }, [initial, olderMessages.length])

  const baseMessages: TranscriptMessage[] = initial === undefined
    ? []
    : projectSharedPage(initial.page)
  const messages = [...olderMessages, ...baseMessages]
  const slot = useChatHeaderSlot()
  const title = initial?.title ?? chatShared.fallbackTitle
  const sharedBar = (
    <div className="arc-market arc-chat arc-shared-bar">
      <LockKeyholeIcon aria-hidden="true" className="arc-shared-lock" />
      <div className="arc-shared-title-group">
        <h1 className="arc-shared-title" title={title}>{title}</h1>
        <p className={slot === null ? 'arc-shared-description' : 'sr-only'}>{chatShared.detail}</p>
      </div>
      <span className="arc-shared-read-only">{chatShared.badge}</span>
    </div>
  )

  async function onLoadMore() {
    if (continueCursor === undefined || loadingMore) return
    const cursor = continueCursor
    setLoadingMore(true)
    try {
      const next = await convex.query(api.chatShares.listSharedMessages, {
        shareToken,
        paginationOpts: { cursor, numItems: PAGE_SIZE },
      })
      setOlderMessages((current) => [...projectSharedPage(next.page), ...current])
      setIsDone(next.isDone)
      setContinueCursor(next.isDone ? undefined : next.continueCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <AeChatPage
      kind="shared"
      header={slot === null ? (
        <header className="arc-market arc-chat arc-shared-header">
          {sharedBar}
        </header>
      ) : createPortal(sharedBar, slot)}
    >
      {initial === undefined ? (
        <div className={`grid min-h-0 flex-1 content-start ${TRANSCRIPT_COLUMN}`} aria-busy="true">
          <p className="sr-only" role="status">{chatShared.loading}</p>
          <Skeleton className="h-16 w-full max-w-prose" />
          <Skeleton className="ml-auto h-16 w-full max-w-prose" />
          <Skeleton className="h-10 w-2/3 max-w-prose" />
        </div>
      ) : messages.length === 0 ? (
        <div className="arc-market arc-chat arc-shared-empty"><AeEmptyState compact title="No shared messages" description={chatShared.empty} /></div>
      ) : (
        <div className="arc-market arc-chat arc-shared-thread">
          <ChatTranscript messages={messages} readOnly />
          {isDone ? null : (
            <div className={`flex shrink-0 justify-center ${TRANSCRIPT_COLUMN}`}>
              <Button
                type="button"
                variant="secondary"
                aria-busy={loadingMore}
                disabled={loadingMore}
                onClick={() => void onLoadMore()}
              >
                {loadingMore ? chatShared.loadingMore : chatShared.loadMore}
              </Button>
            </div>
          )}
        </div>
      )}
    </AeChatPage>
  )
}
