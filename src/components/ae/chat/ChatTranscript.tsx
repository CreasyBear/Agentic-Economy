// Adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/messages.tsx and components/chat/message.tsx (Apache-2.0).
import { ErrorBoundary } from '@sentry/react'
import { useEffect, useRef, useState } from 'react'
import '@/components/arc/chat/ChatComposition.css'
import { ArcAiChatMessage } from '@/components/arc/blocks/ai-chat/ai-chat-message'
import messageStyles from '@/components/arc/blocks/ai-chat/ai-chat-message.module.css'
import { ArcAiChatEmptyStage } from '@/components/arc/blocks/ai-chat/ai-chat'
import { Button } from '@/components/arc/button/button'
import { ArrowDownIcon } from 'lucide-react'
import { Marker, MarkerContent } from '@/components/ui/marker'
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
  chatHandoffNotice,
  chatLoadEarlierMessages,
  chatLoading,
  chatShared,
  chatThinking,
  chatToolPanel,
} from '@/lib/public/chat-ia'
import { readOpenUiBundle } from '@/modules/chat/openui-bundle'

import { ChatOpenUiBundle } from './ChatOpenUiBundle'
import { UnansweredQuestion } from './UnansweredQuestion'
import { ChatClarifyPrompt } from './ChatClarifyPrompt'
import { ChatTranscriptClarify, clarifyKey, clarifyPresentation } from './ChatTranscriptClarify'
import type { ChatPersistedFailure, ChatTranscriptViewProps, ToolPanelSelectionState } from './chat-session/chat-session.contracts'
import type { RunIntent } from '@/modules/chat/run-request'
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
import { ToolPanel } from './tool-panel/ToolPanel'

import { RecoveryNotice } from './recovery/RecoveryNotice'
import { isRecord } from '@/modules/common/is-record'
import { parseRunRequest } from '@/modules/chat/run-request'

function readPersistedFailure(parts: readonly unknown[]): ChatPersistedFailure | undefined {
  for (const part of parts) {
    if (!isRecord(part) || !isRecord(part.data)) continue
    const reason = part.type === 'data-chat-failure' ? part.data.reason
      : part.type === 'data-ae-state' ? part.data.failureReason : undefined
    if (typeof reason !== 'string') continue
    const refsValue = part.type === 'data-chat-failure' ? part.data.callRefs : part.data.failureCallRefs
    const callRefs = Array.isArray(refsValue)
      ? refsValue.slice(0, 5).flatMap(ref => typeof ref === 'string' && ref.length > 0 ? [ref.slice(0, 200)] : [])
      : []
    return { reason, ...(callRefs.length === 0 ? {} : { callRefs }) }
  }
  return undefined
}
type ChatTranscriptProps = ChatTranscriptViewProps & Readonly<{
  onAddCredit?: (shortfall?: { units: string; exponent: number } | undefined, run?: RunIntent) => void
}>

const TRANSCRIPT_COLUMN = messageStyles.transcript
const PANEL_EXIT_DURATION_MS = 150

export function ChatTranscript({
  messages,
  handoffAfter,
  onSuggest,
  onRefine,
  onCompareRequest,
  onCopyAnswer,
  onEditQuestion,
  onNewChat,
  onRetryQuestion,
  onClarifyAnswer,
  onContinueSearch,
  onRepeatSearch,
  onRunTool,
  onAddCredit,
  ownerChatEnabled = false,
  ownerChatThreadId,
  ownerChatNow,
  onFreshQuote,
  thinking = false,
  generating = false,
  clarifyDisabled = false,
  pending = false,
  loadEarlier,
  readOnly = false,
}: ChatTranscriptProps) {
  const [comparedByTurn, setComparedByTurn] = useState<Record<string, readonly string[]>>({})
  const [filtersByTurn, setFiltersByTurn] = useState<Record<string, FilterValue>>({})
  const [selectedByTurn, setSelectedByTurn] = useState<Record<string, string | undefined>>({})
  const [panelSelection, setPanelSelection] = useState<ToolPanelSelectionState>({
    scope: '',
    selectedByTurn: {},
    closingByTurn: {},
  })
  const panelCloseTimers = useRef(new Map<string, number>())
  const panelCloseTokens = useRef(new Map<string, symbol>())
  const turns = projectTranscriptTurns(messages)
  const failuresByTurn = new Map<string, ChatPersistedFailure>()
  for (const message of messages) {
    const failure = readPersistedFailure(message.parts)
    if (failure !== undefined) failuresByTurn.set(message.id, failure)
  }
  const panelScope = ownerChatThreadId ?? turns.find(turn => turn.role === 'user')?.id ?? turns[0]?.id ?? ''
  const turnIdsKey = turns.map(turn => turn.id).join('\u0000')
  const previousPanelScope = useRef(panelScope)
  const scopedPanelSelection: ToolPanelSelectionState = panelSelection.scope === panelScope
    ? panelSelection
    : { scope: panelScope, selectedByTurn: {}, closingByTurn: {} }

  useEffect(() => {
    if (previousPanelScope.current !== panelScope) {
      for (const timer of panelCloseTimers.current.values()) window.clearTimeout(timer)
      panelCloseTimers.current.clear()
      panelCloseTokens.current.clear()
      previousPanelScope.current = panelScope
    }
    const visibleTurns = new Set(turnIdsKey.length === 0 ? [] : turnIdsKey.split('\u0000'))
    for (const [turnId, timer] of panelCloseTimers.current) {
      if (!visibleTurns.has(turnId)) {
        window.clearTimeout(timer)
        panelCloseTimers.current.delete(turnId)
        panelCloseTokens.current.delete(turnId)
      }
    }
    setPanelSelection(current => {
      const selected = current.scope === panelScope ? current.selectedByTurn : {}
      const closing = current.scope === panelScope ? current.closingByTurn : {}
      return {
        scope: panelScope,
        selectedByTurn: Object.fromEntries(Object.entries(selected).filter(([turnId]) => visibleTurns.has(turnId))),
        closingByTurn: Object.fromEntries(Object.entries(closing).filter(([turnId]) => visibleTurns.has(turnId))),
      }
    })
  }, [panelScope, turnIdsKey])

  useEffect(() => () => {
    for (const timer of panelCloseTimers.current.values()) window.clearTimeout(timer)
  }, [])

  function openPanel(turnId: string, toolRef: string): void {
    const timer = panelCloseTimers.current.get(turnId)
    if (timer !== undefined) window.clearTimeout(timer)
    panelCloseTimers.current.delete(turnId)
    panelCloseTokens.current.delete(turnId)
    setPanelSelection(current => {
      const selected = current.scope === panelScope ? current.selectedByTurn : {}
      const closing = { ...(current.scope === panelScope ? current.closingByTurn : {}) }
      delete closing[turnId]
      return {
        scope: panelScope,
        selectedByTurn: { ...selected, [turnId]: toolRef },
        closingByTurn: closing,
      }
    })
  }

  function closePanel(turnId: string, toolRef: string, panelId: string): void {
    const trigger = [...document.querySelectorAll<HTMLButtonElement>('[aria-controls]')]
      .find(button => button.getAttribute('aria-controls') === panelId)
    trigger?.focus()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const previousTimer = panelCloseTimers.current.get(turnId)
    if (previousTimer !== undefined) window.clearTimeout(previousTimer)
    if (reducedMotion) {
      panelCloseTokens.current.delete(turnId)
      setPanelSelection(current => {
        const selected = current.scope === panelScope ? current.selectedByTurn : {}
        const closing = { ...(current.scope === panelScope ? current.closingByTurn : {}) }
        delete closing[turnId]
        return { scope: panelScope, selectedByTurn: { ...selected, [turnId]: null }, closingByTurn: closing }
      })
      return
    }
    const token = Symbol()
    panelCloseTokens.current.set(turnId, token)
    setPanelSelection(current => {
      const selected = current.scope === panelScope ? current.selectedByTurn : {}
      const closing = current.scope === panelScope ? current.closingByTurn : {}
      return {
        scope: panelScope,
        selectedByTurn: { ...selected, [turnId]: null },
        closingByTurn: { ...closing, [turnId]: toolRef },
      }
    })
    const timer = window.setTimeout(() => {
      if (panelCloseTokens.current.get(turnId) !== token) return
      panelCloseTokens.current.delete(turnId)
      panelCloseTimers.current.delete(turnId)
      setPanelSelection(current => {
        if (current.scope !== panelScope || current.closingByTurn[turnId] !== toolRef) return current
        const closing = { ...current.closingByTurn }
        delete closing[turnId]
        return { ...current, closingByTurn: closing }
      })
    }, PANEL_EXIT_DURATION_MS)
    panelCloseTimers.current.set(turnId, timer)
  }

  const clarify = clarifyPresentation(turns)
  if (turns.length === 0 && pending) {
    return (
      <div className={`min-h-0 flex-1 content-start ${TRANSCRIPT_COLUMN}`} aria-busy="true">
        <p className="sr-only" role="status">{chatLoading}</p>
        <Skeleton className="h-16 w-full max-w-prose" />
        <Skeleton className="ml-auto h-16 w-full max-w-prose" />
      </div>
    )
  }
  if (turns.length === 0) {
    return (
      <ArcAiChatEmptyStage><ChatGreeting /></ArcAiChatEmptyStage>
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
            {loadEarlier === undefined ? null : (
              <div className="flex min-h-touch items-center justify-center">
                {loadEarlier.hasMore ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-touch whitespace-nowrap"
                    disabled={loadEarlier.loading}
                    aria-busy={loadEarlier.loading}
                    onClick={loadEarlier.onLoad}
                  >
                    {loadEarlier.loading ? chatShared.loadingMore : chatLoadEarlierMessages}
                  </Button>
                ) : null}
              </div>
            )}
            {turns.map((turn, index) => {
              const previousPrompt = turns.slice(0, index).findLast(message => message.role === 'user')?.text
              const bundle = turn.role === 'assistant' ? readOpenUiBundle(turn.text, turn.tools) : null
              const continuationIndex = turn.tools.findLastIndex((card) =>
                card.toolId === 'registry.tools.search' && card.kind === 'choices' && card.next?.action === 'next-page')
              const continuation = turn.tools[continuationIndex]
              const broadenStatus = turn.tools.findLast(card => card.kind === 'status' && card.next?.action === 'broaden')
              const rawProse = bundle === null ? turn.text : bundle.prose
              const prose = continuation?.kind === 'choices' && continuation.next?.action === 'next-page'
                ? rawProse.replaceAll(continuation.next.args.cursor, '[cursor hidden]')
                : rawProse
              const view = turn.role === 'assistant' ? projectGenerativeTurn({ ...turn, text: prose }) : null
              const failure = failuresByTurn.get(turn.id)
              const canEditPrompt = previousPrompt !== undefined && onEditQuestion !== undefined
                && parseRunRequest(previousPrompt) === null
              const selected = comparedByTurn[turn.id] ?? []
              const selectedId = selectedByTurn[turn.id]
              const writing = generating && index === turns.length - 1
              const userPanelChoice = scopedPanelSelection.selectedByTurn[turn.id]
              const panelRef = userPanelChoice === undefined ? view?.options.recommendedId
                : userPanelChoice === null ? undefined : userPanelChoice
              const activePanelOption = readOnly || view === null
                ? undefined
                : view.options.options.find(option => option.id === panelRef && option.quoteable)
              const closingRef = scopedPanelSelection.closingByTurn[turn.id]
              const closingPanelOption = readOnly || view === null || closingRef === undefined
                ? undefined
                : view.options.options.find(option => option.id === closingRef && option.quoteable)
              const panelOption = activePanelOption ?? closingPanelOption
              const panelOpen = activePanelOption !== undefined
              const panelId = panelOption === undefined ? undefined : `tool-panel-${turn.id}-${panelOption.id}`
              const toggleCompare = (id: string) => setComparedByTurn(current => {
                const ids = current[turn.id] ?? []
                return { ...current, [turn.id]: ids.includes(id) ? ids.filter(value => value !== id) : ids.length < 4 ? [...ids, id] : ids }
              })
              return (
              <MessageScrollerItem key={turn.id} messageId={turn.id} scrollAnchor={turn.role === 'user'} className="min-w-0">
                <ArcAiChatMessage role={turn.role} text={turn.text}>
                      {view === null ? (
                        <>
                          {readOnly || failure === undefined ? null : (
                            <RecoveryNotice reason={failure.reason} className="w-full max-w-prose"
                              {...(turn.text.length > 0 && parseRunRequest(turn.text) === null && onEditQuestion !== undefined
                                ? { onEdit: () => onEditQuestion(turn.text) } : {})}
                              {...(failure.callRefs === undefined ? {} : { callRefs: failure.callRefs })}
                              {...(onNewChat === undefined ? {} : { onNewChat })} />
                          )}
                        </>
                      ) : (
                        <div className="grid w-full min-w-0 gap-3">
                          {writing ? <AnswerBlock view={{ markdown: prose, streaming: true }} /> : null}
                          {writing ? null : <AnswerBlock view={{ markdown: prose }} />}
                          {view.options.options.length === 0 && broadenStatus?.kind === 'status'
                            && broadenStatus.next?.action === 'broaden' ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <SearchNext next={broadenStatus.next} signedThread={ownerChatThreadId !== undefined} />
                              </div>
                            ) : null}
                          {readOnly || failure === undefined ? null : (
                            <RecoveryNotice reason={failure.reason} className="w-full max-w-prose"
                              {...(failure.callRefs === undefined ? {} : { callRefs: failure.callRefs })}
                              {...(canEditPrompt ? { onEdit: () => {
                                if (previousPrompt !== undefined) onEditQuestion?.(previousPrompt)
                              } } : {})}
                              {...(onNewChat === undefined ? {} : { onNewChat })} />
                          )}
                          <WorkDisclosure view={view.work} />
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
                                {...(panelOpen && activePanelOption !== undefined ? { openToolRef: activePanelOption.id } : {})}
                                {...(panelId === undefined ? {} : { panelId })}
                                {...(readOnly ? { readOnly: true } : {
                                  onReview: (id: string) => openPanel(turn.id, id),
                                  onSelect: (id: string) => {
                                    setSelectedByTurn(current => ({ ...current, [turn.id]: current[turn.id] === id ? undefined : id }))
                                    const option = view.options.options.find(entry => entry.id === id)
                                    if (option) onSuggest?.(`Tell me more about ${option.name}`)
                                  },
                                  onCompare: toggleCompare,
                                })}
                              />
                              {panelOption === undefined || panelId === undefined ? null : (
                                <ErrorBoundary
                                  key={`${panelScope}:${turn.id}:${panelOption.id}:${panelOpen}`}
                                  fallback={
                                    <section id={panelId} data-open={panelOpen} aria-hidden={!panelOpen}
                                      aria-label="Tool input" inert={!panelOpen}
                                      className="grid gap-3 rounded-card border border-border bg-card p-4">
                                      <p role="status" className="text-sm text-muted-foreground">{chatToolPanel.unavailable}</p>
                                      <Button type="button" variant="secondary" className="min-h-touch"
                                        onClick={() => closePanel(turn.id, panelOption.id, panelId)}>{chatToolPanel.cancel}</Button>
                                    </section>
                                  }
                                >
                                  <ToolPanel key={`${panelScope}:${turn.id}:${panelOption.id}`} panelId={panelId}
                                    option={panelOption} message={previousPrompt ?? ''} open={panelOpen}
                                    {...(panelOption.id === view.options.recommendedId && view.options.recommendedBy !== undefined
                                      ? { recommendedBy: view.options.recommendedBy } : {})}
                                    runMode={ownerChatEnabled && ownerChatThreadId !== undefined && onRunTool !== undefined ? 'run' : 'add_credit'}
                                    generating={generating}
                                    focusOnOpen={panelOpen && typeof userPanelChoice === 'string'}
                                    onRun={intent => onRunTool === undefined
                                      ? Promise.resolve({ kind: 'not_submitted', reason: 'chat_unavailable' })
                                      : onRunTool(intent.toolRef, intent.input)}
                                    onAddCredit={intent => onAddCredit?.(undefined, intent)}
                                    onClose={() => closePanel(turn.id, panelOption.id, panelId)} />
                                </ErrorBoundary>
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
                              ? <ToolCard key={`${turn.id}-${card.toolId}-${cardIndex}`} projection={card} {...{ onAddCredit }} />
                              : null
                          })}
                          {!readOnly && onSuggest && !writing ? <FollowUps view={view.followUps} onPick={onSuggest} /> : null}
                          {writing ? null : <MessageActions view={{ canCopy: prose.trim().length > 0 && onCopyAnswer !== undefined, canEditQuestion: previousPrompt !== undefined && onEditQuestion !== undefined }}
                            onCopy={() => onCopyAnswer?.(prose)}
                            onEditQuestion={() => { if (previousPrompt) onEditQuestion?.(previousPrompt) }} />}
                        </div>
                      )}
                </ArcAiChatMessage>
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
        <MessageScrollerButton direction="end" aria-label="Scroll to bottom">
          <ArrowDownIcon aria-hidden="true" />
          <span className="sr-only">Scroll to bottom</span>
        </MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>
  )

}
