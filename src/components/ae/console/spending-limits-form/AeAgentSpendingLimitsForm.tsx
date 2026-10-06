'use client'

import { AlertCircleIcon, CheckIcon, ShieldAlertIcon } from 'lucide-react'

import { SpendingLimitInputs } from '@/components/ae/shared/SpendingLimitInputs'
import { Button } from '@/components/arc/button/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import type { AgentDetail } from '@/modules/agent-access/agent-operator-view-model'
import type {
  AgentSpendingLimitsReadResult,
  AgentSpendingLimitsResult,
} from '@/modules/agent-access/spending-policy-update'
import type { ExactAmount } from '@/modules/money/public'
import { getStatusPresentation } from '@/lib/ui/status-presentation'

import { SpendingLimitsReadout } from './components/SpendingLimitsReadout'
import { SpendingMonthlyQuotaGauge } from './components/SpendingMonthlyQuotaGauge'
import { SpendingPauseToggle } from './components/SpendingPauseToggle'
import { SpendingPolicyDiagnosticSlot } from './components/SpendingPolicyDiagnosticSlot'
import { SpendingPresetSelector } from './components/SpendingPresetSelector'
import { useAgentSpendingLimits } from './useAgentSpendingLimits'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import './SpendingPolicyComposition.css'

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
  const { view, policy, loading } = hook

  return (
    <div className="arc-market arc-spending-policy">
      <div className="arc-spending-policy-header">
        <div className="arc-spending-policy-heading">
          <span className="arc-spending-policy-title">Spending policy</span>
          {loading ? (
            <Badge variant="outline">Refreshing</Badge>
          ) : policy.kind === 'known' && view.isPaused ? (
            <Badge variant="warning" className="gap-1">
              <ShieldAlertIcon className="size-3" />
              {getStatusPresentation('paused').label}
            </Badge>
          ) : policy.kind === 'known' ? (
            <Badge variant="success" className="gap-1">
              <CheckIcon className="size-3" />
              {getStatusPresentation('active').label}
            </Badge>
          ) : (
            <Badge variant="outline">{policy.kind === 'expired' ? getStatusPresentation('expired').label : policy.kind === 'unset' ? 'Unset' : getStatusPresentation('unavailable').label}</Badge>
          )}
        </div>
        <div className="arc-spending-policy-header-actions">
          {view.showHeaderActions ? (
            <>
              <SpendingPauseToggle
                isPaused={view.isPaused}
                restoreAvailable={view.restoreAvailable}
                disabled={view.pending}
                onTogglePause={hook.handleTogglePause}
              />
              <Button type="button" variant="secondary" size="md" onClick={hook.handleStartEdit}>
                Edit limits
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="arc-spending-policy-hint" role="status">Refreshing spending policy…</p>
      ) : policy.kind === 'unavailable' ? (
        <div className="arc-spending-policy-failure" role="status">
          <span className="arc-spending-policy-hint">Spending policy unavailable. Limits cannot be edited until the current authority is verified.</span>
          <Button type="button" variant="secondary" size="md" onClick={onReadSpendingLimits === undefined ? () => window.location.reload() : hook.handleRefresh}>Refresh</Button>
        </div>
      ) : policy.kind === 'expired' ? (
        <div className="arc-spending-policy-renewal" role="status">
          <span className="arc-spending-policy-hint">Agent authority expired. Renew the connection to set new spending limits.</span>
          <a href="/agent-access" className={`${actionLinkClassName('secondary', 'md')} arc-spending-policy-renew`}>Renew connection</a>
        </div>
      ) : policy.kind === 'unset' ? (
        <p className="arc-spending-policy-hint">No spending policy set.</p>
      ) : null}
      <div className="arc-spending-policy-diagnostic" aria-live="polite">
        {view.showDiagnostic && view.diagnostic !== null ? (
          <SpendingPolicyDiagnosticSlot diagnostic={view.diagnostic} />
        ) : null}
      </div>
      {policy.kind === 'known' && !loading ? (
        <>
          <div className="arc-spending-policy-pause-notice">
            {view.isPaused ? (
              <Alert className="border-warning-ring bg-warning-subtle py-2 text-warning-foreground">
                <AlertCircleIcon className="size-4" />
                <AlertDescription className="arc-spending-policy-hint">
                  This agent is paused. New paid Calls will be refused. In-flight Calls are not cancelled.
                  {' '}
                  A$0.00 new spend authorized until you resume.
                </AlertDescription>
              </Alert>
            ) : null}
          </div>

          {view.editing ? (
            <form onSubmit={hook.handleSave} className="arc-spending-policy-form">
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
              <div className="arc-spending-policy-footer">
                <Button type="button" variant="secondary" size="md" disabled={view.pending} onClick={hook.handleCancelEdit}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="md" disabled={view.pending}>
                  {view.pending ? 'Saving...' : 'Save Limits'}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <SpendingLimitsReadout {...view.readout} />
              <SpendingMonthlyQuotaGauge {...view.quota} />
            </>
          )}
        </>
      ) : null}
    </div>
  )
}
