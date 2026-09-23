'use client'

import { AlertCircleIcon, CheckIcon, ShieldAlertIcon } from 'lucide-react'

import { SpendingLimitInputs } from '@/components/ae/shared/SpendingLimitInputs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AgentDetail } from '@/modules/agent-access/agent-operator-view-model'
import type {
  AgentSpendingLimitsReadResult,
  AgentSpendingLimitsResult,
} from '@/modules/agent-access/spending-policy-update'
import type { ExactAmount } from '@/modules/money/public'

import { SpendingLimitsReadout } from './components/SpendingLimitsReadout'
import { SpendingMonthlyQuotaGauge } from './components/SpendingMonthlyQuotaGauge'
import { SpendingPauseToggle } from './components/SpendingPauseToggle'
import { SpendingPolicyDiagnosticSlot } from './components/SpendingPolicyDiagnosticSlot'
import { SpendingPresetSelector } from './components/SpendingPresetSelector'
import { useAgentSpendingLimits } from './useAgentSpendingLimits'

export type AeAgentSpendingLimitsFormProps = Readonly<{
  detail: AgentDetail
  onUpdateSpendingLimits?: (params: {
    principalRef: string
    expectedGeneration: number
    maximumSpendPerCall: ExactAmount
    maximumDailySpend: ExactAmount
    maximumMonthlySpend: ExactAmount
  }) => Promise<AgentSpendingLimitsResult>
  onReadSpendingLimits?: (principalRef: string) => Promise<AgentSpendingLimitsReadResult>
}>

export function AeAgentSpendingLimitsForm({
  detail,
  onUpdateSpendingLimits,
  onReadSpendingLimits,
}: AeAgentSpendingLimitsFormProps) {
  const hook = useAgentSpendingLimits({
    detail,
    ...(onUpdateSpendingLimits !== undefined ? { onUpdateSpendingLimits } : {}),
    ...(onReadSpendingLimits !== undefined ? { onReadSpendingLimits } : {}),
  })
  const { view } = hook

  return (
    <div className="grid min-h-[24.5rem] gap-4 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Spending policy</span>
          {view.isPaused ? (
            <Badge variant="warning" className="gap-1">
              <ShieldAlertIcon className="size-3" />
              Paused
            </Badge>
          ) : (
            <Badge variant="success" className="gap-1">
              <CheckIcon className="size-3" />
              Active
            </Badge>
          )}
        </div>
        <div className="flex min-h-touch items-center gap-2">
          {view.showHeaderActions ? (
            <>
              <SpendingPauseToggle
                isPaused={view.isPaused}
                disabled={view.pending}
                onTogglePause={hook.handleTogglePause}
              />
              <Button type="button" variant="outline" size="sm" onClick={hook.handleStartEdit} className="min-h-touch">
                Edit limits
              </Button>
            </>
          ) : (
            <span className="invisible min-h-touch min-w-[12rem]" aria-hidden />
          )}
        </div>
      </div>

      <div className="min-h-[2.75rem]">
        {view.isPaused ? (
          <Alert className="border-warning-ring bg-warning-subtle py-2 text-warning-foreground">
            <AlertCircleIcon className="size-4" />
            <AlertDescription className="text-xs">
              This agent is paused. New paid Calls will be refused. In-flight Calls are not cancelled.
              {' '}
              A$0.00 new spend authorized until you resume.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="min-h-[4.75rem] rounded-md" aria-live="polite">
        {view.showDiagnostic && view.diagnostic !== null ? (
          <SpendingPolicyDiagnosticSlot diagnostic={view.diagnostic} />
        ) : null}
      </div>

      {view.editing ? (
        <form onSubmit={hook.handleSave} className="grid gap-3">
          <SpendingLimitInputs
            presentation="editable"
            ids={{ perCall: 'per-call-spend', daily: 'daily-spend', monthly: 'monthly-spend' }}
            values={{ perCall: view.perCallStr, daily: view.dailyStr, monthly: view.monthlyStr }}
            disabled={view.pending}
            onPerCallChange={hook.setPerCallStr}
            onDailyChange={hook.setDailyStr}
            onMonthlyChange={hook.setMonthlyStr}
          />
          <SpendingMonthlyQuotaGauge {...view.quota} />
          <SpendingPresetSelector
            presets={view.presetOptions}
            selectedPresetId={view.selectedPresetId}
            disabled={view.pending}
            onSelectPreset={hook.applyPreset}
          />
          <div className="flex min-h-touch items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" disabled={view.pending} onClick={hook.handleCancelEdit} className="min-h-touch">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={view.pending} className="min-h-touch">
              {view.pending ? 'Saving...' : 'Save Limits'}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <SpendingLimitsReadout {...view.readout} />
          <SpendingMonthlyQuotaGauge {...view.quota} />
          <div className="min-h-[2.75rem]" aria-hidden />
          <div className="min-h-touch" aria-hidden />
        </>
      )}
    </div>
  )
}
