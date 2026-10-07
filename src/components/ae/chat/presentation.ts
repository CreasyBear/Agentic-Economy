import { isRecord } from '@/modules/common/is-record'
import { CHAT_UNFINISHED_ANSWER, containsChatProtocolMarkup } from '@/modules/chat/search-presentation'
import {
  CHAT_TOOL_NAME_MAP,
  projectToolCard,
  serializeToolCard,
  type ToolCardProjection,
} from '@/modules/chat/tool-card'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
import { projectComparison, projectOptionsFromCard, projectSourcesFromCards, projectWorkFromCards } from './generative/generative.view-model'
import type { ComparisonTableView, FollowUpsView, OptionsGridView, SourcesInlineView, WorkDisclosureView } from './generative/generative.contracts'
import type { RegistryNextAction } from '@/modules/registry/tool-choice-contracts'
import type { ChatRecoveryReason } from './recovery/recovery.contracts'
import { readChatRecoveryReason } from './recovery/recovery.view-model'

export type SearchNextProps = Readonly<{
  next?: RegistryNextAction
  onContinueSearch?: (next: Extract<RegistryNextAction, { action: 'registry.tools.search' }> & { args: { cursor: string } }) => void
  signedThread?: boolean
  onRepeatSearch?: (query: string) => void
}>
export type ToolCardProps = Readonly<{
  projection: ToolCardProjection
  onContinueSearch?: SearchNextProps['onContinueSearch']
  signedThread?: boolean
  onRepeatSearch?: SearchNextProps['onRepeatSearch']
}>


export {
  CHAT_TOOL_IDS,
  projectToolCard,
  type ChatToolId,
  type ToolCardProjection,
  type ToolChoiceRow,
  type ToolFact,
} from '@/modules/chat/tool-card'

export type ChatStatus =
  | ''
  | 'Sending message…'
  | 'Getting a response…'
  | 'Message sent.'
  | 'Response complete.'
  | 'Conversation renamed.'
  | 'Conversation deleted.'
  | 'Read-only share link ready.'
  | 'Share link revoked.'
  | 'Answer copied.'
  | 'New chat ready.'
  | 'Share link copied.'
  | 'Call approved. Checking its result.'
  | 'Call declined; it was not dispatched.'
  | 'Paying is on.'

export type ChatFailurePresentation = Readonly<{
  message: string
  reason: ChatRecoveryReason | 'unknown'
  reference?: string
  browseMarket: boolean
}>

class AnonymousChatResponseError extends Error {
  constructor(
    readonly code: string | undefined,
    readonly reference: string | undefined,
    readonly status: number,
  ) {
    super(code ?? 'chat_unavailable')
    this.name = 'AnonymousChatResponseError'
  }
}

function boundedRequestReference(value: string | null): string | undefined {
  const trimmed = value?.trim()
  if (trimmed === undefined || trimmed.length === 0 || /[^\u0020-\u007e]/u.test(trimmed)) {
    return undefined
  }
  return Array.from(trimmed).slice(0, 200).join('')
}

/**
 * Keeps the anonymous HTTP failure code and correlation reference available to
 * the UI instead of letting the AI SDK flatten them into an opaque Error.
 */
export async function fetchAnonymousChat(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await globalThis.fetch(input, init)
  if (response.ok) return response

  let code: string | undefined
  try {
    const body = await response.clone().json() as unknown
    if (isRecord(body) && typeof body.code === 'string') code = body.code
  } catch (cause) {
    // The status and request reference still provide a truthful recovery path.
    captureRouteException(cause, { site: 'fetchAnonymousChat' }, 'warning')
  }
  throw new AnonymousChatResponseError(
    code,
    boundedRequestReference(response.headers.get('x-ae-request-id')),
    response.status,
  )
}
export type TranscriptMessage = Readonly<{
  id: string
  role: 'user' | 'assistant'
  parts: readonly unknown[]
}>

const anonymousHandoffs = new Map<string, readonly TranscriptMessage[]>()
const MAX_ANONYMOUS_HANDOFFS = 20
const MAX_ANONYMOUS_HANDOFF_MESSAGES = 12
const MAX_ANONYMOUS_HANDOFF_BYTES = 16 * 1024
const MAX_ANONYMOUS_HANDOFF_TEXT = 8_000

export type TranscriptBlock =
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'tool'; index: number }>

/**
 * One walk over message parts.
 * Text chunks in one step stay one run. A rendered tool ends that run so the
 * card stays between the prose that preceded it and the prose that follows.
 * A step boundary or a tool part that does not render inserts a paragraph in
 * the flat text and in the open run. Blank assistant text is omitted.
 * Private reasoning, sources, and malformed parts stay excluded.
 */
function projectTurnContent(parts: readonly unknown[]): Readonly<{
  text: string
  tools: readonly ToolCardProjection[]
  blocks: readonly TranscriptBlock[]
}> {
  let text = ''
  let run = ''
  let newStep = false
  const tools: ToolCardProjection[] = []
  const blocks: TranscriptBlock[] = []

  const flushRun = () => {
    if (run.length === 0) return
    blocks.push({ kind: 'text', text: run })
    run = ''
  }

  for (const part of parts) {
    if (!isRecord(part)) continue
    const card = projectToolCard(part)
    if (card !== null) {
      flushRun()
      blocks.push({ kind: 'tool', index: tools.length })
      tools.push(card)
      newStep = text.length > 0
      continue
    }
    if (part.type === 'step-start' || (typeof part.type === 'string' && part.type.startsWith('tool-'))) {
      newStep = text.length > 0
      continue
    }
    if (part.type !== 'text' || typeof part.text !== 'string' || part.text.trim().length === 0) continue
    const paragraph = newStep && text.length > 0 && !text.endsWith('\n\n') && !part.text.startsWith('\n\n')
    if (paragraph) {
      text += '\n\n'
      if (run.length > 0) run += '\n\n'
    }
    text += part.text
    run += part.text
    newStep = false
  }
  flushRun()
  return { text, tools, blocks }
}

export function textFromParts(parts: readonly unknown[]): string {
  return projectTurnContent(parts).text
}

export type TranscriptTurn = Readonly<{
  id: string
  role: 'user' | 'assistant'
  text: string
  tools: readonly ToolCardProjection[]
  blocks: readonly TranscriptBlock[]
}>

export function projectTranscriptTurns(messages: readonly TranscriptMessage[]): readonly TranscriptTurn[] {
  return messages.map((message) => {
    const content = projectTurnContent(message.parts)
    const invalidAnswer = message.role === 'assistant' && containsChatProtocolMarkup(content.text)
    return {
      id: message.id,
      role: message.role,
      text: invalidAnswer ? CHAT_UNFINISHED_ANSWER : content.text,
      tools: content.tools,
      blocks: invalidAnswer
        ? [{ kind: 'text' as const, text: CHAT_UNFINISHED_ANSWER }, ...content.blocks.filter(block => block.kind === 'tool')]
        : content.blocks,
    }
  })
}

/** Project one assistant turn without promoting a search card into an answer. */
export function projectGenerativeTurn(turn: TranscriptTurn): Readonly<{
  work: WorkDisclosureView
  sources: SourcesInlineView
  options: OptionsGridView
  comparison: ComparisonTableView | null
  followUps: FollowUpsView
}> {
  const searched = turn.tools.filter((card) => card.kind === 'choices'
    && (card.toolId === 'registry.tools.search' || card.toolId === 'registry.tools.list'
      || card.toolId === 'registry.tools.describe'))
  const compared = turn.tools.findLast((card): card is Extract<ToolCardProjection, { kind: 'choices' }> =>
    card.kind === 'choices' && card.toolId === 'registry.tools.compare')
  const searchedOptions = searched.flatMap((card) => card.kind === 'choices'
    ? [projectOptionsFromCard(card, [], Date.now(), card.recommendation)]
    : [])
  // Later returned facts replace the earlier shortlist for the same reference.
  const visibleOptions = [...new Map(searchedOptions.flatMap((view) => view.options)
    .map((option) => [option.id, option])).values()]
  const recommended = searchedOptions.find((view) => view.recommendedId !== undefined
    && visibleOptions.some((option) => option.id === view.recommendedId && option.quoteable === true))
  const options: OptionsGridView = {
    comparedIds: [],
    options: visibleOptions,
    ...(recommended?.recommendedId === undefined || recommended.recommendedBy === undefined ? {} : {
      recommendedId: recommended.recommendedId,
      recommendedBy: recommended.recommendedBy,
    }),
  }
  const comparedOptions = compared === undefined ? [] : projectOptionsFromCard(compared).options.map((option) => {
    const row = compared.choices.find((choice) => choice.toolRef === option.id)
    return row?.price === undefined || (row.priceValidUntil !== undefined && row.priceValidUntil <= Date.now())
      ? option
      : { ...option, facts: { ...option.facts, Price: { value: row.price, source: 'Registry listing' } } }
  })
  return {
    work: projectWorkFromCards(turn.tools.filter((card) => card.kind !== 'clarify' && card.toolId !== 'tool.quote' && card.toolId !== 'tool.call')),
    sources: projectSourcesFromCards(turn.tools),
    options,
    comparison: comparedOptions.length > 1 ? projectComparison(comparedOptions) : null,
    followUps: { suggestions: [] },
  }
}

function clarifyQuestion(parts: readonly unknown[]): string | undefined {
  const toolType = `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['chat.clarify']}`
  for (const part of parts) {
    if (!isRecord(part) || part.type !== toolType || !isRecord(part.input)) continue
    const question = typeof part.input.question === 'string' ? part.input.question.trim() : ''
    if (question.length > 0) return question
  }
  return undefined
}

// Transport may include compact public card identities for conversational reads.
// These are untrusted hints, never authority or a substitute for fresh Tool facts.
// Display and saved plain transcripts keep their existing prose-only projection.
export function projectAnonymousTranscript(messages: readonly TranscriptMessage[], includeToolReferences = false) {
  return messages.flatMap((message) => {
    const prose = textFromParts(message.parts).trim()
    const question = clarifyQuestion(message.parts)
    const text = question === undefined || prose.includes(question)
      ? prose
      : [prose, question].filter((part) => part.length > 0).join('\n\n')
    const choices = !includeToolReferences || message.role !== 'assistant' ? [] : message.parts.flatMap(part => {
      const card = projectToolCard(part)
      return card?.kind === 'choices' ? card.choices.filter(choice =>
        card.toolRefs.includes(choice.toolRef) || choice.access === 'external_listing') : []
    }).slice(0, 4).map(({ title, toolRef }) => ({ title: title.slice(0, 200), toolRef }))
    const content = choices.length === 0 ? text
      : [text, `Tool cards shown (reference data): ${JSON.stringify(choices)}`].filter(Boolean).join('\n\n')
    return content.length === 0 ? [] : [{ role: message.role, content }]
  })
}

export function anonymousRequestSize(messages: readonly TranscriptMessage[]): number {
  return new TextEncoder().encode(JSON.stringify({ messages: projectAnonymousTranscript(messages, true) })).byteLength
}

function projectAnonymousHandoff(messages: readonly TranscriptMessage[]): readonly TranscriptMessage[] {
  const projected: TranscriptMessage[] = []
  for (const [index, message] of messages.slice(0, MAX_ANONYMOUS_HANDOFF_MESSAGES).entries()) {
    const parts: unknown[] = []
    for (const part of message.parts) {
      if (isRecord(part) && part.type === 'text' && typeof part.text === 'string') {
        const text = Array.from(part.text).slice(0, MAX_ANONYMOUS_HANDOFF_TEXT).join('')
        if (text.length > 0) parts.push({ type: 'text', text })
        continue
      }
      const card = projectToolCard(part)
      if (card === null) continue
      const stored = serializeToolCard(card)
      if (stored !== null) parts.push(stored)
    }
    if (parts.length === 0) continue
    const projectedMessage: TranscriptMessage = {
      id: `anonymous-handoff-${index}`,
      role: message.role,
      parts,
    }
    const candidate = [...projected, projectedMessage]
    if (new TextEncoder().encode(JSON.stringify(candidate)).byteLength <= MAX_ANONYMOUS_HANDOFF_BYTES) {
      projected.push(projectedMessage)
    }
  }
  return projected
}

export function rememberAnonymousChatHandoff(
  threadId: string,
  messages: readonly TranscriptMessage[],
): void {
  const projected = projectAnonymousHandoff(messages)
  if (projected.length === 0) return
  if (anonymousHandoffs.size >= MAX_ANONYMOUS_HANDOFFS) {
    const oldestThreadId = anonymousHandoffs.keys().next().value as string | undefined
    if (oldestThreadId !== undefined) anonymousHandoffs.delete(oldestThreadId)
  }
  anonymousHandoffs.set(threadId, projected)
}

export function readAnonymousChatHandoff(threadId: string): readonly TranscriptMessage[] {
  return anonymousHandoffs.get(threadId) ?? []
}

export function clearAnonymousChatHandoff(threadId: string): void {
  anonymousHandoffs.delete(threadId)
}

export function projectChatFailure(error: unknown): ChatFailurePresentation {
  if (error instanceof AnonymousChatResponseError) {
    if (error.code === 'rate_limited' || error.status === 429) {
      return {
        message: 'You’ve reached the chat limit. Try again later.',
        reason: 'rate_limited',
        ...(error.reference === undefined ? {} : { reference: error.reference }),
        browseMarket: true,
      }
    }
    const reason = readChatRecoveryReason(error.code)
    return {
      message: 'Chat is unavailable right now. Your message was not added.',
      reason: reason === 'unknown' ? 'chat_unavailable' : reason,
      ...(error.reference === undefined ? {} : { reference: error.reference }),
      browseMarket: true,
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('rate_limited')) {
    return { message: 'You’ve reached the chat limit. Try again later.', reason: 'rate_limited', browseMarket: false }
  }
  if (message.includes('thread_busy')) {
    return {
      message: 'This conversation is already responding. Wait a moment and try again.',
      reason: 'thread_busy',
      browseMarket: false,
    }
  }
  if (message.includes('anonymous_message_limit')) {
    return { message: 'This browser conversation has reached its message limit.', reason: 'anonymous_message_limit', browseMarket: false }
  }
  if (message.includes('anonymous_size_limit')) {
    return { message: 'This browser conversation is full.', reason: 'anonymous_size_limit', browseMarket: false }
  }
  return {
    message: 'Chat is temporarily unavailable. Try again shortly.',
    reason: readChatRecoveryReason(message),
    browseMarket: false,
  }
}

export function friendlyChatError(error: unknown): string {
  return projectChatFailure(error).message
}
