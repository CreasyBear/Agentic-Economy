// Adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/messages.tsx and components/chat/message.tsx (Apache-2.0).
import { useState } from 'react'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import { ArrowDownIcon } from 'lucide-react'
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
import { chatHandoffNotice, chatLoading, chatThinking } from '@/lib/public/chat-ia'
import { readOpenUiBundle } from '@/modules/chat/openui-bundle'
import type { ToolCardProjection } from '@/modules/chat/tool-card'

import { ChatOpenUiBundle } from './ChatOpenUiBundle'
import { ChatClarifyPrompt } from './ChatClarifyPrompt'
import type { ChatTranscriptViewProps } from './chat-session/chat-session.contracts'
import { ChatGreeting } from './chat-session/components/ChatGreeting'
import { ChatApprovalCards } from './chat-session/components/ChatApprovalCards'
import { AnswerBlock } from './generative/AnswerBlock'
import { ComparisonTable } from './generative/ComparisonTable'
import { FilterChips } from './generative/FilterChips'
import { FollowUps } from './generative/FollowUps'
import { MessageActions } from './generative/MessageActions'
import { OptionsGrid } from './generative/OptionsGrid'
import { SourcesInline } from './generative/SourcesInline'
import { WorkDisclosure } from './generative/WorkDisclosure'
import type { FilterValue } from './generative/generative.contracts'
import { ToolCard } from './ToolCard'
import { projectGenerativeTurn, projectTranscriptTurns, type TranscriptTurn } from './presentation'

const TRANSCRIPT_COLUMN = 'mx-auto grid w-full max-w-[1200px] grid-cols-12 gap-x-2 gap-y-5 px-[5px] py-6 sm:px-0 md:gap-y-7'

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
  onRefine,
  onCompareRequest,
  onCopyAnswer,
  onRetry,
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
  const [comparedByTurn, setComparedByTurn] = useState<Record<string, readonly string[]>>({})
  const [filtersByTurn, setFiltersByTurn] = useState<Record<string, FilterValue>>({})
  const [selectedByTurn, setSelectedByTurn] = useState<Record<string, string | undefined>>({})
  const turns = projectTranscriptTurns(messages)
  const clarify = clarifyPresentation(turns)

  if (turns.length === 0 && pending) {
    return (
      <div className={`min-h-0 flex-1 content-start ${TRANSCRIPT_COLUMN} [&>*]:col-span-12 md:[&>*]:col-start-3 md:[&>*]:col-span-8`} aria-busy="true">
        <p className="sr-only" role="status">{chatLoading}</p>
        <Skeleton className="h-16 w-full max-w-prose" />
        <Skeleton className="ml-auto h-16 w-full max-w-prose" />
      </div>
    )
  }
  if (turns.length === 0) {
    return (
      <div className="relative min-h-0 w-full flex-1 bg-background">
        <div className="absolute inset-x-0 top-[38.2%] mx-auto grid w-full max-w-[1200px] -translate-y-1/2 grid-cols-12 gap-x-2 px-[5px] sm:px-0">
          <div className="col-span-12 min-w-0 md:col-start-3 md:col-span-8">
            <ChatGreeting />
          </div>
        </div>
      </div>
    )
  }

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="flex-1 bg-background">
        <MessageScrollerViewport className="touch-pan-y md:[scrollbar-gutter:stable_both-edges]">
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
              const view = turn.role === 'assistant' ? projectGenerativeTurn({ ...turn, text: prose }) : null
              const selected = comparedByTurn[turn.id] ?? []
              const selectedId = selectedByTurn[turn.id]
              const previousPrompt = turns.slice(0, index).findLast((message) => message.role === 'user')?.text
              const toggleCompare = (id: string) => setComparedByTurn((current) => {
                const ids = current[turn.id] ?? []
                return { ...current, [turn.id]: ids.includes(id) ? ids.filter((value) => value !== id) : ids.length < 4 ? [...ids, id] : ids }
              })
              return (
              <MessageScrollerItem key={turn.id} messageId={turn.id} scrollAnchor={turn.role === 'user'} className="col-span-12 min-w-0 md:col-start-3 md:col-span-8">
                <article aria-label={turn.role === 'user' ? 'You' : 'Assistant'} className="group/message w-full">
                  <Message align={turn.role === 'user' ? 'end' : 'start'}>
                    <MessageContent>
                      {view === null ? (
                        <Bubble variant="muted" align="end" className="max-w-[80%]">
                          <BubbleContent className="rounded-2xl rounded-br-lg border border-border/30 bg-secondary px-3.5 py-2 text-base leading-relaxed whitespace-pre-wrap break-words">{turn.text}</BubbleContent>
                        </Bubble>
                      ) : (
                        <div className="grid w-full min-w-0 gap-3">
                          <WorkDisclosure view={view.work} />
                          <AnswerBlock view={{ markdown: prose }} />
                          {bundle?.root ? <ChatOpenUiBundle node={bundle.root} tools={turn.tools} /> : null}
                          <SourcesInline view={view.sources} />
                          {view.options.options.length === 0 ? null : (
                            <>
                              {onRefine === undefined || view.options.options.length < 3 ? null : (
                                <FilterChips
                                  view={{ value: filtersByTurn[turn.id] ?? { readyOnly: false }, prices: ['under 1¢'], networks: [], categories: [], count: view.options.options.length }}
                                  onChange={(filter) => {
                                    setFiltersByTurn((current) => ({ ...current, [turn.id]: filter }))
                                    const terms = [
                                      filter.readyOnly ? 'only ready-to-use tools' : '',
                                      filter.price ? `${filter.price} per call` : '',
                                      filter.network ? `on ${filter.network}` : '',
                                      filter.category ? `in ${filter.category}` : '',
                                    ].filter(Boolean)
                                    onRefine(`Refine the previous options: ${terms.length ? terms.join(', ') : 'show all available options'}.`)
                                  }}
                                />
                              )}
                              <OptionsGrid
                                view={{ ...view.options, comparedIds: selected, ...(selectedId === undefined ? {} : { selectedId }) }}
                                onSelect={(id) => {
                                  setSelectedByTurn((current) => ({ ...current, [turn.id]: current[turn.id] === id ? undefined : id }))
                                  const option = view.options.options.find((entry) => entry.id === id)
                                  if (option) onSuggest?.(`Tell me more about ${option.name}`)
                                }}
                                onCompare={toggleCompare}
                              />
                              {onCompareRequest === undefined || selected.length < 2 ? null : (
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button type="button" variant="secondary" className="min-h-touch" onClick={() => onCompareRequest(`Compare ${selected.map((id) => view.options.options.find((option) => option.id === id)?.name).filter(Boolean).join(' and ')} for my use case.`)}>
                                    Compare {selected.length} selected
                                  </Button>
                                  {selected.length === 4 ? <span role="status" className="text-sm text-muted-foreground">Choose up to four.</span> : null}
                                </div>
                              )}
                            </>
                          )}
                          {view.comparison ? <ComparisonTable view={view.comparison} /> : null}
                          {turn.tools.map((card, cardIndex) => {
                            if (bundle?.root && bundle.consumed.has(cardIndex)) return null
                            if (card.kind === 'clarify') {
                              const key = clarifyKey(turn.id, cardIndex)
                              return renderClarify(turn.id, card, cardIndex, clarify.answers.get(key),
                                onClarifyAnswer !== undefined && clarify.pending?.key === key)
                            }
                            return card.toolId === 'tool.quote' || card.toolId === 'tool.call'
                              ? <ToolCard key={`${turn.id}-${card.toolId}-${cardIndex}`} projection={card} />
                              : null
                          })}
                          {onSuggest ? <FollowUps view={view.followUps} onPick={onSuggest} /> : null}
                          <MessageActions view={{ canCopy: prose.trim().length > 0 && onCopyAnswer !== undefined, canRetry: previousPrompt !== undefined && onRetry !== undefined }}
                            onCopy={() => onCopyAnswer?.(prose)}
                            onRetry={() => { if (previousPrompt) onRetry?.(previousPrompt) }} />
                        </div>
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
              <MessageScrollerItem messageId="thinking" className="col-span-12 md:col-start-3 md:col-span-8">
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
        <MessageScrollerButton direction="end" aria-label="Scroll to bottom">
          <ArrowDownIcon aria-hidden="true" />
          <span className="sr-only">Scroll to bottom</span>
        </MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
