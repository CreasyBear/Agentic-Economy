import type { ReactNode } from 'react'

import type { AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import type { AgentAccessSearch, LifecycleCommand, LifecycleIssue } from '@/modules/agent-access/agent-lifecycle.view-model'
import type {
  AgentSpendingLimitsReadResult,
  AgentSpendingLimitsResult,
} from '@/modules/agent-access/spending-policy-update'
import type { ExactAmount } from '@/modules/money/public'
import type { PendingCallApproval } from '@/modules/capability-execution/call-approval.functions'
import type { AgentFirstUseState } from '@/modules/agent-access/public'
import type { AgentOnboardingRequest } from '@/modules/agent-access/public'

export type AeAgentAccessHomeProps = Readonly<{
  canonicalBaseUrl: string
  initialDirectory: AgentDirectoryProjection
  initialDirectoryUnavailable?: boolean
  initialOnboarding?: AgentOnboardingRequest
  search: AgentAccessSearch
}>

export type ApprovalDecision = Readonly<{ callRef: string; decision: 'approve' | 'deny' }>

export type AeAgentAccessHomeView = Readonly<{
  canonicalBaseUrl: string
  search: AgentAccessSearch
  directory: AgentDirectoryProjection
  loading: boolean
  loadingMore: boolean
  directoryError: string | undefined
  directoryAlertTitle: string
  onDirectoryRetry: () => void
  directoryRetryLabel: string
  lifecycleIssue: LifecycleIssue | undefined
  lifecyclePending: LifecycleCommand | undefined
  onLifecycleRetry: () => void
  lifecycleRetryLabel: string
  load: () => Promise<void>
  loadMore: () => void
  firstUse: AgentFirstUseState
  onboarding: AgentOnboardingRequest | undefined
  liveUpdates: 'current' | 'delayed'
  getAgentHref: (principalId: string) => string
  clearSelectedPrincipal: () => void
  onDisconnectAgent: (principalRef: string) => void | Promise<void>
  onDisconnectConnection: (connectionRef: string, expectedRevision: number) => void | Promise<void>
  onRenameAgent: (principalRef: string, expectedRevision: number, displayName: string) => Promise<boolean>
  onUpdateSpendingLimits: (params: {
    principalRef: string
    expectedGeneration: number
    maximumSpendPerCall: ExactAmount
    maximumDailySpend: ExactAmount
    maximumMonthlySpend: ExactAmount
  }) => Promise<AgentSpendingLimitsResult>
  onReadSpendingLimits: (principalRef: string) => Promise<AgentSpendingLimitsReadResult>
  onConnectNewAgent: () => void
  onSetupStep: (step: 'closed' | 'choose' | 'oauth') => void
  onSetupAppChange: (setupApp: NonNullable<AgentAccessSearch['setupApp']> | undefined) => void
  accessUnavailable: boolean
  approvals: readonly PendingCallApproval[]
  approvalsLoading: boolean
  approvalsError: string | undefined
  approvalDecision: ApprovalDecision | undefined
  approvalStatus: string | undefined
  onRetryApprovals: () => void
  onDecideApproval: (callRef: string, toolRef: string, decision: 'approve' | 'deny') => void
  currentPaginationIssue: boolean
  paginationButtonLabel: string
  showSetup: boolean
  onToggleShowSetup: () => void
  addAnotherToggleLabel: string
  agentHistoryPrincipalRef: string | undefined
}>

export type HomeDirectoryRecoveryAlertProps = Readonly<{
  title: string
  message: string
  retryLabel: string
  loading: boolean
  onRetry: () => void
}>

export type HomeLifecycleIssueAlertProps = Readonly<{
  issue: LifecycleIssue
  retryLabel: string
  retryDisabled: boolean
  onRetry: () => void
}>

export type HomeEmptyInstallPanelProps = Readonly<{
  canonicalBaseUrl: string
  checkingConnection: boolean
  resumeToolRef?: string
  onCheckConnection: () => void
  onConnectNewAgent: () => void
}>

export type HomeResumeToolSectionProps = Readonly<{
  search?: AgentAccessSearch
  firstUse: AgentFirstUseState
  liveUpdates: 'current' | 'delayed'
  resumeTool?: string
  onConnect: () => void
  onCheck: () => void
  checking: boolean
}>

export type HomeDirectoryPaginationProps = Readonly<{
  showIssueMessage: boolean
  buttonLabel: string
  loadingMore: boolean
  onLoadMore: () => void
}>

export type HomeAddAnotherAgentProps = Readonly<{
  showSetup: boolean
  toggleLabel: string
  onToggle: () => void
  installPanel: ReactNode
}>
