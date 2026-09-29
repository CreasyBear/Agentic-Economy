// Adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/messages.tsx and components/chat/message.tsx (Apache-2.0).
import { ErrorBoundary } from '@sentry/react'
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
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { chatHandoffNotice, chatLoading, chatThinking } from '@/lib/public/chat-ia'
import { readOpenUiBundle } from '@/modules/chat/openui-bundle'
import { parseChatQuoteInput } from '@/modules/chat/tool-card'

import { ChatOpenUiBundle } from './ChatOpenUiBundle'
import { UnansweredQuestion } from './UnansweredQuestion'
import { ChatClarifyPrompt } from './ChatClarifyPrompt'
import { ChatTranscriptClarify, clarifyKey, clarifyPresentation } from './ChatTranscriptClarify'
import type { ChatQuoteDraft, ChatTranscriptViewProps } from './chat-session/chat-session.contracts'
import { ChatGreeting } from './chat-session/components/ChatGreeting'
import { ChatOwnerApprovalsContainer } from './chat-session/ChatOwnerApprovalsContainer'
import { AnswerBlock } from './generative/AnswerBlock'
import { ComparisonTable } from './generative/ComparisonTable'
import { FilterChips } from './generative/FilterChips'
import { FollowUps } from './generative/FollowUps'
import { MessageActions } from './generative/MessageActions'
import { OptionsGrid } from './generative/OptionsGrid'
import { SourcesInline } from './generative/SourcesInline'
import { WorkDisclosure } from './generative/WorkDisclosure'
import type { FilterValue } from './generative/generative.contracts'
import { SearchNext, ToolCard } from './ToolCard'
import { projectGenerativeTurn, projectTranscriptTurns } from './presentation'

const TRANSCRIPT_COLUMN = 'mx-auto grid w-full content-start max-w-[1200px] grid-cols-12 gap-x-2 gap-y-5 px-[5px] py-6 sm:px-0 md:gap-y-7'

export function ChatTranscript({
  messages,
  handoffAfter,
  onSuggest,
  onRefine,
  onCompareRequest,
  onCopyAnswer,
  onEditQuestion,
  onRetryQuestion,
  onClarifyAnswer,
  onContinueSearch,
  onRepeatSearch,
  onQuoteTool,
  ownerChatEnabled = false,
  enableSpendingBusy = false,
  onEnableSpending,
  ownerChatThreadId,
  ownerChatNow,
  onFreshQuote,
  thinking = false,
  generating = false,
  clarifyDisabled = false,
  pending = false,
  readOnly = false,
}: ChatTranscriptViewProps) {
  const [comparedByTurn, setComparedByTurn] = useState<Record<string, readonly string[]>>({})
  const [filtersByTurn, setFiltersByTurn] = useState<Record<string, FilterValue>>({})
  const [selectedByTurn, setSelectedByTurn] = useState<Record<string, string | undefined>>({})
  const [quoteDraft, setQuoteDraft] = useState<ChatQuoteDraft | null>(null)
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
              const continuationIndex = turn.tools.findLastIndex((card) =>
                card.toolId === 'registry.tools.search' && card.kind === 'choices' && card.next?.action === 'next-page')
              const continuation = turn.tools[continuationIndex]
              const rawProse = bundle === null ? turn.text : bundle.prose
              const prose = continuation?.kind === 'choices' && continuation.next?.action === 'next-page'
                ? rawProse.replaceAll(continuation.next.args.cursor, '[cursor hidden]')
                : rawProse
              const view = turn.role === 'assistant' ? projectGenerativeTurn({ ...turn, text: prose }) : null
              const selected = comparedByTurn[turn.id] ?? []
              const selectedId = selectedByTurn[turn.id]
              const writing = generating && index === turns.length - 1
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
                          {writing ? <AnswerBlock view={{ markdown: prose, streaming: true }} /> : null}
                          <WorkDisclosure view={view.work} />
                          {writing ? null : <AnswerBlock view={{ markdown: prose }} />}
                          {bundle?.root ? <ChatOpenUiBundle node={bundle.root} tools={turn.tools}
                            {...(onContinueSearch === undefined ? {} : { onContinueSearch })}
                            {...(onRepeatSearch === undefined ? {} : { onRepeatSearch })}
                            signedThread={ownerChatThreadId !== undefined}
                            {...(continuation?.kind === 'choices' && continuation.next?.action === 'next-page'
                              ? { cursorToRedact: continuation.next.args.cursor } : {})} /> : null}
                          <SourcesInline view={view.sources} />
                          {view.options.options.length === 0 ? null : (
                            <>
                              {readOnly || onRefine === undefined || view.options.options.length < 3 ? null : (
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
                                view={{ ...view.options, comparedIds: readOnly ? [] : selected, ...(readOnly || selectedId === undefined ? {} : { selectedId }) }}
                                signedIn={!readOnly && ownerChatThreadId !== undefined}
                                {...(readOnly || onQuoteTool === undefined ? {} : { onQuoteSelect: (toolRef: string) =>
                                  setQuoteDraft({ turnId: turn.id, toolRef, input: '', invalid: false, submitting: false }) })}
                                {...(readOnly ? { readOnly: true } : {
                                  onSelect: (id: string) => {
                                    setSelectedByTurn((current) => ({ ...current, [turn.id]: current[turn.id] === id ? undefined : id }))
                                    const option = view.options.options.find((entry) => entry.id === id)
                                    if (option) onSuggest?.(`Tell me more about ${option.name}`)
                                  },
                                  onCompare: toggleCompare,
                                })}
                              />
                              {quoteDraft?.turnId !== turn.id || onQuoteTool === undefined || ownerChatThreadId === undefined ? null : ownerChatEnabled ? (
                                <form aria-label="Quote input" className="grid gap-intra rounded-card border border-border bg-card p-4"
                                  onSubmit={(event) => {
                                    event.preventDefault()
                                    if (quoteDraft.submitting) return
                                    const input = parseChatQuoteInput(quoteDraft.toolRef, quoteDraft.input)
                                    if (input === undefined) {
                                      setQuoteDraft({ ...quoteDraft, invalid: true })
                                      return
                                    }
                                    setQuoteDraft({ ...quoteDraft, submitting: true })
                                    void onQuoteTool(quoteDraft.toolRef, input).then((accepted) => {
                                      setQuoteDraft((current) => current?.turnId === quoteDraft.turnId
                                        && current.toolRef === quoteDraft.toolRef
                                        ? accepted ? null : { ...current, submitting: false }
                                        : current)
                                    })
                                  }}>
                                  <label htmlFor="chat-quote-input" className="text-sm font-medium">Exact Tool input (JSON object)</label>
                                  <Textarea id="chat-quote-input" value={quoteDraft.input} rows={4} maxLength={1_500}
                                    disabled={quoteDraft.submitting} aria-invalid={quoteDraft.invalid}
                                    aria-describedby={quoteDraft.invalid ? 'chat-quote-input-error' : undefined}
                                    onChange={(event) => setQuoteDraft({ ...quoteDraft, input: event.target.value, invalid: false })}
                                    placeholder='{"field":"your value"}' className="font-mono text-sm" />
                                  {quoteDraft.invalid ? <p id="chat-quote-input-error" role="alert" className="text-sm text-destructive">Enter the Tool’s exact input as a JSON object (up to 1,500 bytes).</p> : null}
                                  <p className="text-sm text-muted-foreground">A fresh Quote checks your input and price. No Call is made by this step.</p>
                                  <div className="flex flex-wrap gap-2">
                                    <Button type="submit" className="min-h-touch" disabled={quoteDraft.submitting}>
                                      {quoteDraft.submitting ? 'Requesting Quote…' : 'Get a Quote for this input'}
                                    </Button>
                                    <Button type="button" variant="ghost" className="min-h-touch" disabled={quoteDraft.submitting}
                                      onClick={() => setQuoteDraft(null)}>Cancel</Button>
                                  </div>
                                </form>
                              ) : (
                                <div className="grid gap-intra rounded-card border border-border bg-card p-4">
                                  <p className="text-sm">Turn on paying in chat to get a Quote. Every Call waits for your approval.</p>
                                  <Button type="button" className="min-h-touch" disabled={enableSpendingBusy || onEnableSpending === undefined}
                                    onClick={onEnableSpending}>Turn on paying</Button>
                                </div>
                              )}
                              {readOnly || onCompareRequest === undefined || selected.length < 2 ? null : (
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
                          {continuation?.kind === 'choices' && continuation.next?.action === 'next-page'
                            && !(bundle?.root && bundle.consumed.has(continuationIndex))
                            ? <SearchNext next={continuation.next}
                              {...(onContinueSearch === undefined ? {} : { onContinueSearch })}
                              {...(onRepeatSearch === undefined ? {} : { onRepeatSearch })}
                              signedThread={ownerChatThreadId !== undefined} /> : null}
                          {turn.tools.map((card, cardIndex) => {
                            if (bundle?.root && bundle.consumed.has(cardIndex)) return null
                            if (card.kind === 'clarify') {
                              const key = clarifyKey(turn.id, cardIndex)
                              return <ChatTranscriptClarify key={key} card={card} answer={clarify.answers.get(key)}
                                hidePending={onClarifyAnswer !== undefined && clarify.pending?.key === key} />
                            }
                            return card.toolId === 'tool.quote' || card.toolId === 'tool.call'
                              ? <ToolCard key={`${turn.id}-${card.toolId}-${cardIndex}`} projection={card} />
                              : null
                          })}
                          {!readOnly && onSuggest && !writing ? <FollowUps view={view.followUps} onPick={onSuggest} /> : null}
                          {writing ? null : <MessageActions view={{ canCopy: prose.trim().length > 0 && onCopyAnswer !== undefined, canEditQuestion: previousPrompt !== undefined && onEditQuestion !== undefined }}
                            onCopy={() => onCopyAnswer?.(prose)}
                            onEditQuestion={() => { if (previousPrompt) onEditQuestion?.(previousPrompt) }} />}
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
            {ownerChatThreadId && ownerChatNow !== undefined && onFreshQuote ? (
              <ErrorBoundary key={ownerChatThreadId} fallback={<></>}>
                <ChatOwnerApprovalsContainer threadId={ownerChatThreadId} now={ownerChatNow}
                  onFreshQuote={onFreshQuote} />
              </ErrorBoundary>
            ) : null}
            {readOnly || thinking || generating || onRetryQuestion === undefined || turns.at(-1)?.role !== 'user' ? null : (
              <UnansweredQuestion
                question={turns.findLast((turn) => turn.role === 'user')?.text ?? ''}
                onRetry={onRetryQuestion}
                {...(onEditQuestion === undefined ? {} : { onEdit: onEditQuestion })}
              />
            )}
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
