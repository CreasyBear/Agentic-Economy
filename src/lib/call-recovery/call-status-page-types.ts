import type {
  CallStatusResult,
  OwnerCallStatusResult,
} from '@/modules/capability-execution/call-recovery-contracts'

export type CallStatusPageResult = OwnerCallStatusResult | Readonly<{
  kind: 'source_unavailable'
  callRef: string
}>

export type CallReconciliationForm = Readonly<{
  resolution: 'not_released' | 'released'
  source: string
  evidenceRef: string
}>

export type CallStatusPageActions = Readonly<{
  onRefresh?: () => void | Promise<void>
  refreshPending?: boolean
  autoRefresh?: boolean
  onCancel?: () => void | Promise<void>
  cancelPending?: boolean
  onReconcile?: (input: CallReconciliationForm) => void
  reconcilePending?: boolean
  reconciliationDraft?: CallReconciliationForm
  feedback?: Readonly<{ kind: 'success' | 'error'; message: string }>
}>

export type FoundCallStatus = Extract<OwnerCallStatusResult, { kind: 'found' }>

export type StatusUnchangedResult = Extract<CallStatusResult, { kind: 'unchanged' }>

export type StatusRefusedResult = Extract<CallStatusResult, { kind: 'refused' }>
