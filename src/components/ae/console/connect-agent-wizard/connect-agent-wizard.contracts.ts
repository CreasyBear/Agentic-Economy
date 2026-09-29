import type { Ref } from 'react'

import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import type {
  AgentAccessKeyIssueResult,
  IssuedAgentAccessReveal,
} from '@/modules/agent-access/issue-key.contracts'

export type ConnectAgentEnvironment = 'sandbox' | 'production'

export type ConnectAgentAuthorityMode =
  | 'spending_policy'
  | 'read_only'
  | 'approval_required'

export type ConnectAgentWizardIssuePort = (
  args: { data: Record<string, unknown> },
) => Promise<AgentAccessKeyIssueResult>

export type ConnectAgentWizardDraft = Readonly<{
  name: string
  environment: ConnectAgentEnvironment
  authorityMode: ConnectAgentAuthorityMode
  perCallAmount: string
  dailyAmount: string
  monthlyAmount: string
}>

export type ConnectAgentWizardPorts = Readonly<{
  open?: boolean
  onOpenChange: (open: boolean) => void
  onIssue: ConnectAgentWizardIssuePort
  onSuccess?: (reveal: IssuedAgentAccessReveal) => void
  initialDraft?: ConnectAgentWizardDraft
  onDraftChange?: (draft: ConnectAgentWizardDraft) => void
}>

export type ConnectAgentWizardViewState = Readonly<{
  name: string
  nameLength: number
  isNameValid: boolean
  nameInvalid: boolean
  environment: ConnectAgentEnvironment
  authorityMode: ConnectAgentAuthorityMode
  perCallAmount: string
  dailyAmount: string
  monthlyAmount: string
  diagnostic: Rule4Diagnostic | null
  isSubmitting: boolean
  spendingPresentation: 'editable' | 'sandbox-static'
}>

export type AgentNameFieldProps = Readonly<{
  value: string
  disabled: boolean
  invalid?: boolean
  inputRef?: Ref<HTMLInputElement>
  onChange: (value: string) => void
}>

export type EnvironmentRadioCardsProps = Readonly<{
  value: ConnectAgentEnvironment
  disabled: boolean
  onChange: (value: ConnectAgentEnvironment) => void
}>

export type AuthorityModeRadioCardsProps = Readonly<{
  value: ConnectAgentAuthorityMode
  disabled: boolean
  onChange: (value: ConnectAgentAuthorityMode) => void
}>
