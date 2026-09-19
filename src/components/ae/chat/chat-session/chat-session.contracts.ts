import type { ReactNode } from 'react'

import type { ChatStatus, TranscriptMessage } from '../presentation'

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
  busy: boolean
}>

export type ChatHistoryProps = Readonly<{
  idPrefix: string
  activeThreadId: string | null
  threads: readonly ChatHistoryThread[]
  search: string
  busy: boolean
  /** True while the thread list's first page loads with nothing cached yet. */
  historyPending?: boolean
  onSearch(value: string): void
  onOpen(threadId: string): void
  onRename(threadId: string, title: string): Promise<boolean>
  onDelete(threadId: string): Promise<boolean>
  onNewChat(): void
}>

export type ChatHeaderProps = Readonly<{
  authenticated: boolean
  threadId: string | null
  busy: boolean
  shareState?: 'none' | 'active' | 'revoked'
  sharePath: string | null
  copied: boolean
  mobileHistory: ReactNode
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
  onPromptChange(value: string): void
  onSubmit(): void
}>

export type ChatTranscriptViewProps = Readonly<{
  messages: readonly TranscriptMessage[]
  pending?: boolean
  handoffAfter?: number
  onSuggest?: (prompt: string) => void
}>

export type ChatHeaderViewProps = Omit<ChatHeaderProps, 'mobileHistory'>

export type ChatSessionModel = Readonly<{
  showHistoryRail: boolean
  createHistoryPanel(idPrefix: string): ReactNode
  header: ChatHeaderViewProps
  composer: ChatComposerProps
  transcript: ChatTranscriptViewProps
  pageBusy: boolean
}>
