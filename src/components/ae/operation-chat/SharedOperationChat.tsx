import { useQuery } from 'convex/react'
import { LockKeyholeIcon } from 'lucide-react'

import { api } from '../../../../convex/_generated/api'
import { AeChatPage } from '@/components/ae/layout/AeChatPage'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { chatShared } from '@/lib/public/chat-ia'

import { ChatTranscript } from './ChatTranscript'
import type { TranscriptMessage } from './presentation'

export function SharedOperationChat({ shareToken }: { shareToken: string }) {
  const result = useQuery(api.chatShares.listSharedMessages, {
    shareToken,
    paginationOpts: { cursor: null, numItems: 20 },
  })
  const messages: TranscriptMessage[] = [...(result?.page ?? [])].reverse().map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.parts,
  })) ?? []

  return (
    <AeChatPage
      kind="shared"
      header={
        <header className="flex min-h-14 items-center gap-related border-b border-border px-gutter">
          <LockKeyholeIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">{result?.title ?? chatShared.fallbackTitle}</h1>
            <p className="text-xs text-muted-foreground">{chatShared.detail}</p>
          </div>
          <Badge variant="outline">{chatShared.badge}</Badge>
        </header>
      }
    >
      {result === undefined ? (
        <div className="grid min-h-0 flex-1 content-start gap-intra p-gutter" aria-busy="true">
          <p className="sr-only" role="status">{chatShared.loading}</p>
          <Skeleton className="h-16 w-full max-w-prose" />
          <Skeleton className="ml-auto h-16 w-full max-w-prose" />
          <Skeleton className="h-10 w-2/3 max-w-prose" />
        </div>
      ) : messages.length === 0 ? (
        <Empty className="min-h-0 flex-1 border-0">
          <EmptyHeader>
            <EmptyDescription>{chatShared.empty}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ChatTranscript messages={messages} />
      )}
    </AeChatPage>
  )
}
