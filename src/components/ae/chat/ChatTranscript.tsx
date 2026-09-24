import { Bubble, BubbleContent, BubbleGroup } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
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
  chatLoading,
  chatSuggestions,
  chatThinking,
} from '@/lib/public/chat-ia'
import { readOpenUiBundle } from '@/modules/chat/openui-bundle'
import type { ToolCardProjection } from '@/modules/chat/tool-card'

import { ChatAssistantText } from './ChatAssistantText'
import { ChatOpenUiBundle } from './ChatOpenUiBundle'
import { ChatClarifyPrompt } from './ChatClarifyPrompt'
import type { ChatTranscriptViewProps } from './chat-session/chat-session.contracts'
import { ChatApprovalCards } from './chat-session/components/ChatApprovalCards'
import { ToolCard } from './ToolCard'
import { projectTranscriptTurns, type TranscriptTurn } from './presentation'

const TRANSCRIPT_COLUMN = 'mx-auto w-full max-w-3xl gap-section px-gutter py-section'

type ClarifyCard = Extract<ToolCardProjection, { kind: 'clarify' }>

function clarifyKey(turnId: string, cardIndex: number): string {
  return `${turnId}:${cardIndex}`
}

function clarifyPresentation(turns: readonly TranscriptTurn[]) {
  const answers = new Map<string, string>()
  let pending: (ClarifyCard & { key: string }) | null = null
  for (const turn of turns) {
    if (turn.role === 'user' && turn.text.trim().length > 0 && pending !== null && pending.answer === undefined) {
      answers.set(pending.key, turn.text.trim())
      pending = null
    }
    if (turn.role !== 'assistant') continue
    for (const [cardIndex, card] of turn.tools.entries()) {
      if (card.kind !== 'clarify') continue
      const key = clarifyKey(turn.id, cardIndex)
      if (card.answer !== undefined) {
        answers.set(key, card.answer)
        pending = null
        continue
      }
      pending = { ...card, key }
    }
  }
  return { answers, pending }
}

function renderClarify(
  turnId: string,
  card: Extract<ToolCardProjection, { kind: 'clarify' }>,
  cardIndex: number,
  answer: string | undefined,
  hidePending: boolean,
) {
  const key = clarifyKey(turnId, cardIndex)
  if (answer === undefined) {
    if (hidePending) return null
    return <p key={key} className="text-sm text-muted-foreground">{card.question}</p>
  }
  return (
    <p key={key} className="text-sm text-muted-foreground">
      <span>{card.question}</span>
      {' '}
      <span className="font-medium text-foreground">{answer}</span>
    </p>
  )
}

export function ChatTranscript({
  messages,
  handoffAfter,
  onSuggest,
  onClarifyAnswer,
  ownerChatCards = [],
  approvalProblem,
  onApproveCall,
  onDenyCall,
  onFreshQuote,
  thinking = false,
  clarifyDisabled = false,
  pending = false,
}: ChatTranscriptViewProps) {
  const turns = projectTranscriptTurns(messages)
  const clarify = clarifyPresentation(turns)

  if (turns.length === 0 && pending) {
    return (
      <div className={`grid min-h-0 flex-1 content-start ${TRANSCRIPT_COLUMN}`} aria-busy="true">
        <p className="sr-only" role="status">{chatLoading}</p>
        <Skeleton className="h-16 w-full max-w-prose" />
        <Skeleton className="ml-auto h-16 w-full max-w-prose" />
      </div>
    )
  }
  if (turns.length === 0) {
    return (
      <Empty className="min-h-0 flex-1 border-0">
        <EmptyHeader className="max-w-prose gap-related">
          <EmptyTitle>{chatEmpty.title}</EmptyTitle>
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
            className={TRANSCRIPT_COLUMN}
            role="log"
            aria-label="Chat transcript"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {turns.map((turn, index) => {
              const bundle = turn.role === 'assistant' ? readOpenUiBundle(turn.text, turn.tools) : null
              const prose = bundle === null ? turn.text : bundle.prose
              const consumed = bundle !== null && bundle.root !== null ? bundle.consumed : new Set<number>()
              return (
              <MessageScrollerItem
                key={turn.id}
                messageId={turn.id}
                scrollAnchor={turn.role === 'user'}
              >
                <article aria-label={turn.role === 'user' ? 'You' : 'Assistant'}>
                  <Message align={turn.role === 'user' ? 'end' : 'start'}>
                    <MessageContent>
                      {bundle !== null && bundle.root !== null ? (
                        <>
                          {prose.length === 0 ? null : (
                            <Bubble variant="ghost" align="start">
                              <BubbleContent><ChatAssistantText text={prose} /></BubbleContent>
                            </Bubble>
                          )}
                          <ChatOpenUiBundle node={bundle.root} tools={turn.tools} />
                          {turn.tools.length === 0 ? null : (
                            <BubbleGroup className="w-full">
                              {turn.tools.map((card, cardIndex) => {
                                if (consumed.has(cardIndex)) return null
                                if (card.kind === 'clarify') {
                                  const key = clarifyKey(turn.id, cardIndex)
                                  return renderClarify(
                                    turn.id,
                                    card,
                                    cardIndex,
                                    clarify.answers.get(key),
                                    onClarifyAnswer !== undefined && clarify.pending?.key === key,
                                  )
                                }
                                return (
                                  <ToolCard
                                    key={`${turn.id}-${card.toolId}-${cardIndex}`}
                                    projection={card}
                                  />
                                )
                              })}
                            </BubbleGroup>
                          )}
                        </>
                      ) : turn.blocks.map((block, blockIndex) => {
                        switch (block.kind) {
                          case 'text':
                            return (
                              <Bubble
                                key={`${turn.id}-text-${blockIndex}`}
                                variant={turn.role === 'user' ? 'outline' : 'ghost'}
                                align={turn.role === 'user' ? 'end' : 'start'}
                              >
                                {turn.role === 'user'
                                  ? <BubbleContent className="whitespace-pre-wrap">{block.text}</BubbleContent>
                                  : <BubbleContent><ChatAssistantText text={block.text} /></BubbleContent>}
                              </Bubble>
                            )
                          case 'tool': {
                            const card = turn.tools[block.index]
                            if (card === undefined) return null
                            if (card.kind === 'clarify') {
                              const key = clarifyKey(turn.id, block.index)
                              return renderClarify(
                                turn.id,
                                card,
                                block.index,
                                clarify.answers.get(key),
                                onClarifyAnswer !== undefined && clarify.pending?.key === key,
                              )
                            }
                            return (
                              <ToolCard
                                key={`${turn.id}-${card.toolId}-${block.index}`}
                                projection={card}
                              />
                            )
                          }
                          default: {
                            const exhaustive: never = block
                            return exhaustive
                          }
                        }
                      })}
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
              )
            })}
            {ownerChatCards.some(card => card.kind === 'pending') ? (
              <a href="#owner-chat-pending" className="w-fit text-sm underline underline-offset-4 focus-visible:outline-2">
                Review pending Call
              </a>
            ) : null}
            {onApproveCall && onDenyCall && onFreshQuote ? (
              <ChatApprovalCards cards={ownerChatCards}
                {...(approvalProblem === undefined ? {} : { problem: approvalProblem })}
                onApprove={onApproveCall} onDeny={onDenyCall} onFreshQuote={onFreshQuote} />
            ) : null}
            {thinking ? (
              <MessageScrollerItem messageId="thinking">
                <p className="text-sm text-muted-foreground" role="status">{chatThinking}</p>
              </MessageScrollerItem>
            ) : null}
          </MessageScrollerContent>
          {clarify.pending === null || onClarifyAnswer === undefined ? null : (
            <ChatClarifyPrompt
              question={clarify.pending.question}
              choices={clarify.pending.choices}
              disabled={clarifyDisabled}
              onAnswer={onClarifyAnswer}
            />
          )}
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
