import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import type { SpendingPresetId } from '@/modules/agent-access/spending-policy.view-model'

export type SpendingMonthlyQuotaGaugeProps = Readonly<{
  label: string
  toneClass: string
  approachingCopy?: string
  progressValue: number
  progressAriaLabel: string
}>

export type SpendingPresetOption = Readonly<{
  id: SpendingPresetId
  label: string
}>

export type SpendingPresetSelectorProps = Readonly<{
  presets: readonly SpendingPresetOption[]
  selectedPresetId: SpendingPresetId | null
  disabled: boolean
  onSelectPreset: (presetId: SpendingPresetId) => void
}>

export type SpendingPauseToggleProps = Readonly<{
  isPaused: boolean
  restoreAvailable: boolean
  disabled: boolean
  onTogglePause: () => void
}>

export type SpendingLimitsReadoutProps = Readonly<{
  perCallDisplay: string
  dailyDisplay: string
  monthlyDisplay: string
}>

export type UseAgentSpendingLimitsInput = Readonly<{
  canUpdate: boolean
}>

export type AgentSpendingLimitsViewState = Readonly<{
  isPaused: boolean
  restoreAvailable: boolean
  editing: boolean
  pending: boolean
  diagnostic: Rule4Diagnostic | null
  perCallStr: string
  dailyStr: string
  monthlyStr: string
  selectedPresetId: SpendingPresetId | null
  quota: SpendingMonthlyQuotaGaugeProps
  readout: SpendingLimitsReadoutProps
  presetOptions: readonly SpendingPresetOption[]
  showHeaderActions: boolean
  showDiagnostic: boolean
}>
