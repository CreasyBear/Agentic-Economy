import { Bubble, BubbleContent, BubbleGroup } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import { Marker, MarkerContent } from '@/components/ui/marker'
import { Message, MessageContent } from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { Skeleton } from '@/components/ui/skeleton'
import {
  chatEmpty,
  chatHandoffNotice,
  chatSuggestions,
} from '@/lib/public/chat-ia'

import { OperationCard } from './OperationCard'
import { projectTranscriptTurns, type TranscriptMessage } from './presentation'

export function ChatTranscript({
  messages,
  handoffAfter,
  onSuggest,
  pending = false,
}: {
  messages: readonly TranscriptMessage[]
  handoffAfter?: number
  onSuggest?: (prompt: string) => void
  /** True while the thread's first page is still loading with nothing cached. */
  pending?: boolean
}) {
  const turns = projectTranscriptTurns(messages)

  if (turns.length === 0 && pending) {
    return (
      <div className="grid min-h-0 flex-1 content-start gap-intra p-gutter" aria-busy="true">
        <p className="sr-only" role="status">{chatEmpty.title}</p>
        <Skeleton className="h-16 w-full max-w-prose" />
        <Skeleton className="ml-auto h-16 w-full max-w-prose" />
      </div>
    )
  }
  if (turns.length === 0) {
    return (
      <Empty className="min-h-0 flex-1 border-0">
        <EmptyHeader className="max-w-prose gap-related">
          <h1 className="text-balance font-display text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
            {chatEmpty.title}
          </h1>
          <EmptyDescription>{chatEmpty.description}</EmptyDescription>
        </EmptyHeader>
        {onSuggest === undefined ? null : (
          <EmptyContent className="max-w-prose flex-row flex-wrap justify-center gap-related">
            {chatSuggestions.map((suggestion) => (
              <Button
                key={suggestion.prompt}
                type="button"
                variant="outline"
                className="min-h-touch"
                onClick={() => onSuggest(suggestion.prompt)}
              >
                {suggestion.label}
              </Button>
            ))}
          </EmptyContent>
        )}
      </Empty>
    )
  }

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="flex-1">
        <MessageScrollerViewport>
          <MessageScrollerContent
            className="mx-auto w-full max-w-3xl gap-section px-gutter py-section"
            role="log"
            aria-label="Chat transcript"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {turns.map((turn, index) => (
              <MessageScrollerItem
                key={turn.id}
                messageId={turn.id}
                scrollAnchor={turn.role === 'user'}
              >
                <article aria-label={turn.role === 'user' ? 'You' : 'Assistant'}>
                  <Message align={turn.role === 'user' ? 'end' : 'start'}>
                    <MessageContent>
                      {turn.text.length === 0 ? null : (
                        <Bubble
                          variant={turn.role === 'user' ? 'outline' : 'ghost'}
                          align={turn.role === 'user' ? 'end' : 'start'}
                        >
                          <BubbleContent className="whitespace-pre-wrap">{turn.text}</BubbleContent>
                        </Bubble>
                      )}
                      {turn.tools.length === 0 ? null : (
                        <BubbleGroup className="w-full">
                          {turn.tools.map((card, cardIndex) => (
                            <OperationCard
                              key={`${turn.id}-${card.toolId}-${cardIndex}`}
                              projection={card}
                            />
                          ))}
                        </BubbleGroup>
                      )}
                    </MessageContent>
                  </Message>
                </article>
                {handoffAfter === index + 1 ? (
                  <div className="mt-related">
                    <Marker variant="separator" role="status">
                      <MarkerContent>{chatHandoffNotice}</MarkerContent>
                    </Marker>
                  </div>
                ) : null}
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
