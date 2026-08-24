import { useQuery } from 'convex/react'
import { LockKeyholeIcon } from 'lucide-react'

import { api } from '../../../../convex/_generated/api'
import { Badge } from '@/components/ui/badge'

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
    <section className="mx-auto min-h-[36rem] max-w-4xl overflow-hidden rounded-xl bg-background shadow-soft" aria-label="Shared operation chat">
      <header className="flex min-h-14 items-center gap-3 border-b border-border px-4">
        <LockKeyholeIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{result?.title ?? 'Shared conversation'}</h1>
          <p className="text-xs text-muted-foreground">This shared conversation cannot be continued.</p>
        </div>
        <Badge variant="outline">Read-only</Badge>
      </header>
      {result === undefined ? (
        <p className="p-8 text-center text-sm text-muted-foreground" role="status">Loading conversation…</p>
      ) : messages.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No settled messages are available.</p>
      ) : (
        <ChatTranscript messages={messages} />
      )}
    </section>
  )
}
