import type { ReactNode } from 'react'

import type { ChatStatus, TranscriptMessage } from '../presentation'
import type { QuoteConfirmationView, CallOutcomeView } from '@/components/ae/shared/object-family.contracts'
import type { RegistryNextAction } from '@/modules/registry/tool-choice-contracts'
import type { RunIntent } from '@/modules/chat/run-request'
import type { ChatRecoveryReason } from '../recovery/recovery.contracts'

export type ChatRunResult =
  | Readonly<{ kind: 'submitted' }>
  | Readonly<{ kind: 'not_submitted'; reason: ChatRecoveryReason | 'unknown' }>
  | Readonly<{ kind: 'outcome_unknown'; callRefs?: readonly string[] }>


export type ChatPersistedFailure = Readonly<{
  reason: string
  callRefs?: readonly string[]
}>
export type ChatPendingResume =
  | Readonly<{ kind: 'run'; run: RunIntent }>
  | Readonly<{ kind: 'ask'; ask: string }>

export type ToolPanelSelectionState = Readonly<{
  scope: string
  selectedByTurn: Readonly<Record<string, string | null>>
  closingByTurn: Readonly<Record<string, string>>
}>

export type ChatProps = Readonly<{
  threadId: string | null
  initialPrompt?: string
  onThreadCreated(threadId: string): void
  onNewChat(): void
  onOpenThread?(threadId: string): void
}>

export type ChatHistoryThread = Readonly<{
  threadId: string
  title: string
  createdAt: number
  busy: boolean
}>

export type ChatHistoryProps = Readonly<{
  idPrefix: string
  activeThreadId: string | null
  threads: readonly ChatHistoryThread[]
  search: string
  busy: boolean
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?(): void
  /** True while the thread list's first page loads with nothing cached yet. */
  historyPending?: boolean
  onSearch(value: string): void
  onOpen(threadId: string): void
  onRename(threadId: string, title: string): Promise<boolean>
  onDelete(threadId: string): Promise<boolean>
  onNewChat(): void
}>
export type ChatHistoryPanelProps = ChatHistoryProps
export type ChatHistoryPanelContainerProps = Readonly<{
  idPrefix: string
  activeThreadId: string | null
  now: number
  busy: boolean
  onOpen(threadId: string): void
  onNewChat(): void
  onRename(threadId: string, title: string): Promise<boolean>
  onDelete(threadId: string): Promise<boolean>
}>

export type ChatOwnerApprovalsProps = Readonly<{
  cards: readonly OwnerChatCard[]
  problem: string
  onApprove(callRef: string): void
  onDeny(callRef: string): void
  onFreshQuote(callRef: string): void
}>
export type ChatOwnerApprovalsContainerProps = Readonly<{
  threadId: string
  now: number
  onFreshQuote(toolName: string, inputSummary: string): void
}>


export type ChatHeaderProps = Readonly<{
  authenticated: boolean
  threadId: string | null
  threadTitle: string | null
  busy: boolean
  shareState?: 'none' | 'active' | 'revoked'
  sharePath: string | null
  copied: boolean
  ownerChatEnabled?: boolean
  enableProblem?: string
  balanceLabel?: string | undefined
  balanceDescription?: string | undefined
  onEnableSpending?: () => void
  mobileHistory: ReactNode
  mobileOpen: boolean
  onMobileOpenChange(open: boolean): void
  onToggleHistory(): void
  onNewChat(): void
  onIssueShare(): void
  onRevokeShare(): void
  onCopyShare(): void
}>

export type ChatComposerProps = Readonly<{
  prompt: string
  busy: boolean
  disabled: boolean
  error: string
  errorReference?: string
  browseMarketOnError: boolean
  status: ChatStatus
  anonymousMessageCount?: number
  anonymousMessageLimitReached: boolean
  recovery?: ChatRecoveryReason | 'unknown'
  onPromptChange(value: string): void
  onSubmit(): void
  onRetry?: () => void
  onEditLast?: () => void
  onNewChat?: () => void
  onStop?: () => void
}>

export type OwnerChatCard =
  | Readonly<{ kind: 'pending'; turnRef: string; view: QuoteConfirmationView }>
  | Readonly<{ kind: 'result'; turnRef: string; view: CallOutcomeView }>
  | Readonly<{ kind: 'unavailable'; turnRef: string; callRef: string; toolName: string; inputSummary: string; quoteLabel: string; reason: string }>

export type ChatQuoteDraft = Readonly<{ turnId: string; toolRef: string; input: string; invalid: boolean; submitting: boolean }>

export type ChatTranscriptViewProps = Readonly<{
  messages: readonly TranscriptMessage[]
  pending?: boolean
  handoffAfter?: number
  thinking?: boolean
  generating?: boolean
  clarifyDisabled?: boolean
  onSuggest?: (prompt: string) => void
  onStarter?: (prompt: string) => void
  onRefine?: (prompt: string) => void
  onCompareRequest?: (prompt: string) => void
  onCopyAnswer?: (answer: string) => void
  onEditQuestion?: (prompt: string) => void
  onRetryQuestion?: (prompt: string) => void
  onNewChat?: () => void
  onClarifyAnswer?: (answer: string) => void
  onContinueSearch?: (next: Extract<RegistryNextAction, { action: 'next-page' }>) => void
  onRepeatSearch?: (query: string) => void
  onRunTool?: (toolRef: string, input: RunIntent['input']) => Promise<ChatRunResult>
  ownerChatEnabled?: boolean
  enableSpendingBusy?: boolean
  onEnableSpending?: () => void
  ownerChatThreadId?: string
  ownerChatNow?: number
  onFreshQuote?: (toolName: string, inputSummary: string) => void
  loadEarlier?: Readonly<{ hasMore: boolean; loading: boolean; onLoad: () => void }>
  readOnly?: boolean
}>

export type ChatHeaderViewProps = Omit<ChatHeaderProps, 'mobileHistory' | 'mobileOpen' | 'onMobileOpenChange' | 'onToggleHistory'>
export type ChatSessionModel = Readonly<{
  showHistoryRail: boolean
  /** Signed-out private thread: keep the URL and offer sign-in instead of a new chat. */
  signInToThread?: Readonly<{ href: string }>
  createHistoryPanel(idPrefix: string, onNavigate?: () => void): ReactNode
  header: ChatHeaderViewProps
  composer: ChatComposerProps
  transcript: ChatTranscriptViewProps
  lastUserText(): string | undefined
  /** newThread: start a fresh thread, e.g. right after paying turns on (owner-chat turns need their own thread). */
  submitText(text: string, newThread?: boolean): void
  onRunTool(toolRef: string, input: RunIntent['input']): Promise<ChatRunResult>
  retryLastRequest(): void
  pageBusy: boolean
}>

export type ChatLayoutProps = Readonly<{
  model: ChatSessionModel
  ownerChatEnabled?: boolean
  enableSpendingBusy?: boolean
  onEnableSpending?: () => void
  onAddCredit?: (shortfall?: { units: string; exponent: number } | undefined, run?: RunIntent) => void
  balanceLabel?: string | undefined
  balanceDescription?: string | undefined
}>
