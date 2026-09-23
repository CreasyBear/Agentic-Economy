import type { ReactNode, RefObject } from 'react'

import type { AeFact } from '@/components/ae/data/AeFactList'
import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import type {
  AgentDetail,
  AgentDirectoryItem,
  AgentDirectoryProjection,
} from '@/modules/agent-access/agent-operator-view-model'
import type { AgentConnectionReadback } from '@/modules/agent-access/public'

export type LifecycleTarget =
  | Readonly<{ kind: 'credential'; credentialRef: string; generation: number; name: string }>
  | Readonly<{ kind: 'connection'; connectionRef: string; revision: number; connectorName: string; name: string }>
  | Readonly<{ kind: 'agent'; principalRef: string; name: string }>

export type RevocationMode = 'drain' | 'freeze'

export type UseAgentSelectionParams = Readonly<{
  directoryItems: readonly AgentDirectoryItem[]
  directoryDetails: AgentDirectoryProjection['details']
  selectedPrincipalId?: string
  getAgentHref?: (principalId: string) => string
  onClearSelectedPrincipal?: () => void
}>

export type UseAgentSelectionResult = Readonly<{
  routeControlled: boolean
  selected: AgentDetail | undefined
  selectedItem: AgentDirectoryItem | undefined
  setLocalSelected: (item: AgentDirectoryItem | undefined) => void
  handleSheetOpenChange: (open: boolean) => void
}>

export type UseAgentLifecycleDialogParams = Readonly<{
  onRevokeCredential: (credentialRef: string) => void | Promise<void>
  onDisconnectAgent: (principalRef: string) => void | Promise<void>
  onDisconnectConnection?: (connectionRef: string, expectedRevision: number) => void | Promise<void>
}>

export type UseAgentLifecycleDialogResult = Readonly<{
  lifecycleTarget: LifecycleTarget | undefined
  revocationMode: RevocationMode
  revokePending: boolean
  revokeDiagnostic: Rule4Diagnostic | null
  revokeTriggerRef: RefObject<HTMLButtonElement | null>
  requestCredentialRevoke: (
    item: AgentDetail,
    credentialRef: string,
    generation: number,
    trigger: HTMLButtonElement,
  ) => void
  requestDisconnect: (item: AgentDetail, trigger: HTMLButtonElement) => void
  requestConnectionDisconnect: (
    item: AgentDetail,
    connection: AgentConnectionReadback,
    trigger: HTMLButtonElement,
  ) => void
  confirmLifecycle: () => Promise<void>
  handleLifecycleDialogOpenChange: (open: boolean) => void
  setRevocationMode: (mode: RevocationMode) => void
}>

export type AgentFactsDisclosureProps = Readonly<{
  label: string
  facts: readonly AeFact[]
  children?: ReactNode
}>

export type AgentRecordSheetProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  headerFacts?: readonly AeFact[]
  showSheetBody: boolean
  recoveryCopy?: string
  showActivityTruncatedNote: boolean
  spendingPolicyFacts: readonly AeFact[]
  spendingLimitsForm: ReactNode
  activityFacts: readonly AeFact[]
  activityTable: ReactNode
  accessFacts: readonly AeFact[]
  authorizedTools: ReactNode
  connectionReceipts: ReactNode
  technicalFacts: readonly AeFact[]
  credentialHistory: ReactNode
  agentHistory?: ReactNode
  removeAgentDisabled: boolean
  onRemoveAgent: (trigger: HTMLButtonElement) => void
}>

export type AgentLifecycleConfirmDialogProps = Readonly<{
  lifecycleTarget: LifecycleTarget | undefined
  revocationMode: RevocationMode
  revokePending: boolean
  revokeDiagnostic: Rule4Diagnostic | null
  revokeTriggerRef: RefObject<HTMLButtonElement | null>
  onOpenChange: (open: boolean) => void
  onConfirm: () => void | Promise<void>
  onRevocationModeChange: (mode: RevocationMode) => void
}>
