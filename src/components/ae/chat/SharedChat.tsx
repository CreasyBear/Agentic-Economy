/* ReUI chat shell with live shared transcript data.
 * Pagination cursors, privacy and read-only semantics remain caller-owned.
 * Sample composer/menus and local demo messages are omitted. */
import { useConvex, useQuery } from 'convex/react'
import { LockKeyholeIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useWorkspacePresentationVisible } from '@/lib/client/workspace-presentation'
import { api } from '../../../../convex/_generated/api'
import { AeChatPage } from '@/components/ae/layout/AeChatPage'
import { AeEmptyState } from '@/components/ae/shared/empty-state/AeEmptyState'
import { ReuiChatHeader } from '@/components/ae/shared/reui-pro/ai-chat/ai-chat'
import { AeAlert as Alert } from '@/components/ae/shared/alert/AeAlert'
import { Button } from '@/components/arc/button/button'
import './SharedChatComposition.css'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import { degrade } from '@/lib/observability/degrade'
import { chatShared } from '@/lib/public/chat-ia'

import { ChatTranscript } from './ChatTranscript'
import { useChatHeaderSlot } from './chat-session/useChatHeaderSlot'
import type { TranscriptMessage } from './presentation'

const PAGE_SIZE = 20
const TRANSCRIPT_COLUMN = 'arc-market arc-chat arc-shared-column'

type SharedMessageRequest = { shareToken: string; cursor: string }

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
  return <SharedChatThread key={shareToken} shareToken={shareToken} />
}

function SharedChatThread({ shareToken }: { shareToken: string }) {
  const convex = useConvex()
  const initial = useQuery(api.chatShares.listSharedMessages, {
    shareToken,
    paginationOpts: { cursor: null, numItems: PAGE_SIZE },
  })
  const [olderMessages, setOlderMessages] = useState<TranscriptMessage[]>([])
  const [continueCursor, setContinueCursor] = useState<string | undefined>()
  const [isDone, setIsDone] = useState(true)
  const [loadMoreStatus, setLoadMoreStatus] = useState<'idle' | 'loading' | 'failed'>('idle')
  const mounted = useRef(false)
  const inFlightRequest = useRef<SharedMessageRequest | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      inFlightRequest.current = null
    }
  }, [])

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
  const loadingMore = loadMoreStatus === 'loading'
  const slot = useChatHeaderSlot()
  const visible = useWorkspacePresentationVisible()
  const title = initial?.title ?? chatShared.fallbackTitle
  const sharedBar = <ReuiChatHeader title={title} description={chatShared.detail}
    leading={<LockKeyholeIcon aria-hidden="true" size={18} />}
    actions={<span className="text-xs text-muted-foreground">{chatShared.badge}</span>} />

  async function onLoadMore(): Promise<void> {
    if (!mounted.current || continueCursor === undefined || inFlightRequest.current !== null) return
    const request: SharedMessageRequest = { shareToken, cursor: continueCursor }
    inFlightRequest.current = request
    setLoadMoreStatus('loading')
    try {
      const outcome = await convex.query(api.chatShares.listSharedMessages, {
        shareToken: request.shareToken,
        paginationOpts: { cursor: request.cursor, numItems: PAGE_SIZE },
      }).then(
        page => ({ kind: 'available' as const, page }),
        cause => ({ kind: 'unavailable' as const, cause }),
      )
      if (!mounted.current || inFlightRequest.current !== request) return
      if (outcome.kind === 'unavailable') {
        degrade(outcome.cause, undefined, {
          site: 'SharedChat.loadMore',
          reason: 'source_unavailable',
        })
        setLoadMoreStatus('failed')
        return
      }
      setOlderMessages(current => [...projectSharedPage(outcome.page.page), ...current])
      setIsDone(outcome.page.isDone)
      setContinueCursor(outcome.page.isDone ? undefined : outcome.page.continueCursor)
      setLoadMoreStatus('idle')
    } finally {
      if (mounted.current && inFlightRequest.current === request) {
        inFlightRequest.current = null
        setLoadMoreStatus(current => current === 'loading' ? 'idle' : current)
      }
    }
  }

  return (
    <AeChatPage
      kind="shared"
      header={!visible ? null : slot === null ? (
        <header className="arc-market arc-chat arc-shared-header">
          {sharedBar}
        </header>
      ) : createPortal(sharedBar, slot)}
    >
      {initial === undefined ? (
        <div className={`grid min-h-0 flex-1 content-start ${TRANSCRIPT_COLUMN}`} aria-busy="true">
          <p className="sr-only" role="status">{chatShared.loading}</p>
          <div aria-hidden="true" className="h-16 w-full max-w-prose"><Skeleton lines={2} /></div>
          <div aria-hidden="true" className="ml-auto h-16 w-full max-w-prose"><Skeleton lines={2} /></div>
          <div aria-hidden="true" className="h-10 w-2/3 max-w-prose"><Skeleton lines={1} /></div>
        </div>
      ) : messages.length === 0 ? (
        <div className="arc-market arc-chat arc-shared-empty"><AeEmptyState compact title="No shared messages" description={chatShared.empty} /></div>
      ) : (
        <div className="arc-market arc-chat arc-shared-thread">
          <ChatTranscript messages={messages} readOnly />
          {isDone ? null : (
            <div className={`grid shrink-0 gap-related ${TRANSCRIPT_COLUMN}`}>
              <Alert
                aria-label={chatShared.loadMoreErrorTitle}
                title={chatShared.loadMoreErrorTitle}
                tone="warning"
                open={loadMoreStatus === 'failed'}
              >
                {chatShared.loadMoreErrorDescription}
              </Alert>
              <Button
                type="button"
                variant="secondary"
                className="justify-self-center"
                aria-busy={loadingMore}
                disabled={loadingMore}
                onClick={() => void onLoadMore()}
              >
                {loadingMore ? chatShared.loadingMore : loadMoreStatus === 'failed' ? chatShared.retryLoadMore : chatShared.loadMore}
              </Button>
            </div>
          )}
        </div>
      )}
    </AeChatPage>
  )
}
