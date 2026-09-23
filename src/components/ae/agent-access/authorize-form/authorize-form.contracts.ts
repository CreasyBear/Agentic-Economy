import type { ReactNode, RefObject } from 'react'

import { agentAuthorityModeAllows, type AgentAccessAuthorityMode } from '@/modules/agent-access/contract'
import type { AgentConsentTarget } from '@/modules/agent-access/consent-read-model'
import type { ToolChoiceSearchResult } from '@/components/ae/command-panel/market-tools-client'
import { cn } from '@/lib/utils'

export const AUTHORIZE_RADIO_CARD_CLASS = cn(
  'grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md border border-border p-3',
  'has-[[data-checked]]:border-foreground has-[[data-checked]]:bg-muted',
)

export const AUTHORIZE_RADIO_CARD_CLASS_TOUCH = cn(
  AUTHORIZE_RADIO_CARD_CLASS,
  'min-h-touch items-start px-3 py-3',
)

export type PublicAuthorityMode = Exclude<AgentAccessAuthorityMode, 'unrestricted_test_only'>

export function canSelectPublicAuthority(value: PublicAuthorityMode, ceiling: AgentAccessAuthorityMode): boolean {
  return agentAuthorityModeAllows(ceiling, value)
}

export const authorityOptions = [
  { value: 'read_only', label: 'Browse only', description: 'Discover, compare, and run free read-only Tools.' },
  { value: 'approval_required', label: 'Ask each time', description: 'Paid or consequential work comes back to you first.' },
  { value: 'spending_policy', label: 'Work within limits', description: 'Paid work stays within the exact limits shown below.' },
] as const

export type ConsentConnectionFieldsetProps = Readonly<{
  pending: boolean
  connectionTarget: 'new_agent' | 'replace_credential'
  replacementMode: 'planned' | 'compromise'
  replacementPrincipalRef?: string
  agentTargets: readonly AgentConsentTarget[]
  agentTargetsError?: string
  agentTargetsNextCursor?: string
  agentTargetsLoading: boolean
  showConnectionFieldset: boolean
  onSelectConnection: (value: 'new_agent' | 'replace_credential') => void
  onSelectReplacement: (principalRef: string) => void
  onSelectReplacementMode: (value: 'planned' | 'compromise') => void
  onLoadAgentTargets: () => void
}>

export type AuthorityModeRadioGroupProps = Readonly<{
  pending: boolean
  selectedMode: AgentAccessAuthorityMode
  ceiling: AgentAccessAuthorityMode
  onSelectMode: (value: PublicAuthorityMode) => void
}>

export type ConsentToolSearchView = Readonly<{
  pending: boolean
  result?: ToolChoiceSearchResult
  error?: string
}>

export type ConsentToolAccessFieldsetProps = Readonly<{
  pending: boolean
  toolAccess: 'all_admitted' | 'selected_tools'
  approvedToolAccess: 'all_admitted' | 'selected_tools'
  approvedToolRefs: readonly string[]
  toolQuery: string
  toolSearch: ConsentToolSearchView
  approvedToolRefSet: ReadonlySet<string>
  onApprovedToolAccessChange: (value: 'all_admitted' | 'selected_tools') => void
  onToolQueryChange: (value: string) => void
  onFindTools: () => void
  onAddApprovedTool: (toolRef: string) => void
  onRemoveApprovedTool: (toolRef: string) => void
}>

export type ConsentDecisionBarProps = Readonly<{
  approveButtonRef: RefObject<HTMLButtonElement | null>
  pending: boolean
  connectionTarget: 'new_agent' | 'replace_credential'
  replacementMode: 'planned' | 'compromise'
  agentTargetsUnavailable: boolean
  approvalLabel: string
  onApprove: () => void
  onDeny: () => void
}>

export type ConsentRequestFact = Readonly<{ label: string; value: string; mono?: boolean }>

export type ConsentRequestFactsProps = Readonly<{
  clientName: string
  environment: 'sandbox' | 'production'
  toolSelectionSummary: string
  accessSummary: string
  expiresInSeconds: number
  grantRevision: number
  grantRef: string
  toolRefs: readonly string[]
}>

export type ConsentAuthorizeRecoverySearch = Readonly<{ grant_ref: string; state?: string }>

export type ConsentOutcomeViewProps = Readonly<{
  phase: 'approved' | 'denied' | 'outcome_unknown' | 'error'
  clientName: string
  grantRef: string
  errorCode?: string
  errorReference?: string
  authorizeRecoverySearch: ConsentAuthorizeRecoverySearch
}>

export type ConsentIdleFormShellProps = Readonly<{
  clientName: string
  accessProfile: 'market' | 'provider'
  expiresInSeconds: number
  children: ReactNode
  decisionBar: ReactNode
}>
