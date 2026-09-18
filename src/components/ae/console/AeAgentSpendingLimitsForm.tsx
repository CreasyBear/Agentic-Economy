'use client'

import { useState } from 'react'
import { AlertCircleIcon, CheckIcon, PauseIcon, PlayIcon, ShieldAlertIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { toast } from '@/lib/ui/toast'
import type { AgentDetail } from '@/modules/agent-access/agent-operator-view-model'
import {
  compareExactAmounts,
  formatDisplayAmount,
  parseDecimalExactAmount,
  type ExactAmount,
} from '@/modules/money/public'
import type {
  AgentSpendingLimitsReadResult,
  AgentSpendingLimitsResult,
} from '@/modules/agent-access/spending-policy-update'

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

type SpendingDiagnostic = Readonly<{
  title: string
  financialImpact: string
  nextStep: string
}>

type SpendingPresetId = 'conservative' | 'balanced' | 'intensive'

const FINANCIAL_SAFE_LIMITS_UNCHANGED =
  'A$0.00 deducted — your balance is safe. Current limits were not changed.'

const SPENDING_PRESETS: Readonly<
  Record<
    SpendingPresetId,
    Readonly<{ label: string; perCall: string; daily: string; monthly: string }>
  >
> = {
  conservative: { label: 'Conservative', perCall: '2', daily: '10', monthly: '50' },
  balanced: { label: 'Balanced', perCall: '5', daily: '25', monthly: '100' },
  intensive: { label: 'Intensive', perCall: '20', daily: '100', monthly: '500' },
}

const PRESET_CHIP_CLASS =
  'inline-flex min-h-touch items-center rounded-full border border-border bg-container px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

function exactAmountToDecimal(amount: ExactAmount | undefined, fallback: string): string {
  if (amount === undefined) return fallback
  const units = BigInt(amount.units)
  if (amount.exponent === 0) return units.toString()
  const factor = 10n ** BigInt(amount.exponent)
  const integerPart = units / factor
  const fractionalPart = units % factor
  if (fractionalPart === 0n) return integerPart.toString()
  const fractionStr = fractionalPart.toString().padStart(amount.exponent, '0').replace(/0+$/, '')
  return `${integerPart}.${fractionStr}`
}

function isAgentSpendingPaused(detail: AgentDetail): boolean {
  const budget = detail.grant?.budget
  if (!budget) return false
  return (
    budget.maximumSpendPerCall.units === '0'
    && budget.maximumDailySpend.units === '0'
    && budget.maximumMonthlySpend.units === '0'
  )
}

function limitsToastDescription(
  perCall: ExactAmount,
  daily: ExactAmount,
  monthly: ExactAmount,
): string {
  return `${formatDisplayAmount(perCall)} / call · ${formatDisplayAmount(daily)} / day · ${formatDisplayAmount(monthly)} / month`
}

function matchingPresetId(perCall: string, daily: string, monthly: string): SpendingPresetId | null {
  for (const id of ['conservative', 'balanced', 'intensive'] as const) {
    const preset = SPENDING_PRESETS[id]
    if (preset.perCall === perCall && preset.daily === daily && preset.monthly === monthly) {
      return id
    }
  }
  return null
}

function mapUpdateConflictDiagnostic(
  code: Extract<AgentSpendingLimitsResult, { kind: 'conflict' }>['code'],
): SpendingDiagnostic {
  switch (code) {
    case 'revision_conflict':
      return {
        title: 'Policy changed since you opened it',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Reload the agent, then apply your limits again.',
      }
    case 'idempotency_conflict':
      return {
        title: 'This save collided with another request',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Wait a moment, then save again.',
      }
    case 'credential_replacement_pending':
      return {
        title: 'A credential replacement is in progress',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Finish or wait for replacement, then edit limits.',
      }
    case 'policy_invalid':
      return {
        title: 'Those limits are not allowed',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Check per-call ≤ daily ≤ monthly and try again.',
      }
    case 'agent_not_found':
      return {
        title: 'This agent is no longer available',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Close the sheet and refresh the directory.',
      }
    case 'account_ownership_required':
      return {
        title: 'You cannot change this agent’s policy',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Switch to the workspace that owns this agent.',
      }
    case 'authority_unavailable':
      return {
        title: 'Authority cannot be verified',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Retry in a few seconds. Limits were not changed.',
      }
    default: {
      const _exhaustive: never = code
      return {
        title: 'Could not update spending limits',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Try again in a moment.',
      }
    }
  }
}

function mapUpdateRefusedDiagnostic(
  code: Extract<AgentSpendingLimitsResult, { kind: 'refused' }>['code'],
): SpendingDiagnostic {
  switch (code) {
    case 'authentication_required':
      return {
        title: 'Sign-in required',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Sign in as the access owner, then try again.',
      }
    case 'source_unavailable':
      return {
        title: 'Spending policy is temporarily unavailable',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Try again in a moment. Nothing was written.',
      }
    default: {
      const _exhaustive: never = code
      return {
        title: 'Update refused',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Try again in a moment.',
      }
    }
  }
}

function mapReadRefusedDiagnostic(
  code: Extract<AgentSpendingLimitsReadResult, { kind: 'refused' }>['code'],
): SpendingDiagnostic {
  switch (code) {
    case 'source_unavailable':
      return {
        title: 'Spending limits are temporarily unavailable',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Try again in a moment. Nothing was written.',
      }
    case 'authentication_required':
      return {
        title: 'Sign-in required',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Sign in as the access owner, then try again.',
      }
    case 'account_ownership_required':
      return {
        title: 'You cannot change this agent’s policy',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Switch to the workspace that owns this agent.',
      }
    case 'agent_not_found':
      return {
        title: 'This agent is no longer available',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Close the sheet and refresh the directory.',
      }
    case 'authority_unavailable':
      return {
        title: 'Authority cannot be verified',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Retry in a few seconds. Limits were not changed.',
      }
    default: {
      const _exhaustive: never = code
      return {
        title: 'Cannot verify spending policy',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Try again in a moment.',
      }
    }
  }
}

type MonthlyQuotaGauge = Readonly<{
  label: string
  progressValue: number
  progressAriaLabel: string
  toneClass: string
  approachingCopy?: string
}>

function monthlyQuotaGauge(detail: AgentDetail, isPaused: boolean): MonthlyQuotaGauge {
  if (isPaused) {
    return {
      label: 'Spending frozen — A$0.00 new spend authorized',
      progressValue: 0,
      progressAriaLabel: 'Spending frozen, A$0.00 new spend authorized',
      toneClass: 'text-muted-foreground',
    }
  }

  const ceiling =
    detail.grant?.budget.maximumMonthlySpend ?? detail.agent.monthlyLimit
  const burn = detail.agent.monthlySettledSpend

  if (ceiling === undefined) {
    return {
      label: 'Monthly settled: no monthly ceiling configured',
      progressValue: 0,
      progressAriaLabel: 'Monthly settled spend, no ceiling configured',
      toneClass: 'text-muted-foreground',
    }
  }

  const ceilingFormatted = formatDisplayAmount(ceiling)

  if (
    detail.agent.monthlySpendCoverage === 'incomplete'
    || burn === undefined
    || burn.currency !== ceiling.currency
  ) {
    return {
      label: `Monthly settled: unavailable / ${ceilingFormatted}`,
      progressValue: 0,
      progressAriaLabel: `Monthly settled unavailable of ${ceilingFormatted}`,
      toneClass: 'text-muted-foreground',
    }
  }

  const spendUnits = BigInt(burn.units)
  const ceilingUnits = BigInt(ceiling.units)
  const burnFormatted = formatDisplayAmount(burn)

  if (ceilingUnits <= 0n) {
    return {
      label: `Monthly settled: ${burnFormatted} / ${ceilingFormatted}`,
      progressValue: spendUnits > 0n ? 100 : 0,
      progressAriaLabel: `Monthly settled ${burnFormatted} of ${ceilingFormatted}`,
      toneClass: 'text-muted-foreground',
    }
  }

  const percentTenths = Number((spendUnits * 1000n) / ceilingUnits) / 10
  const clampedPercent = Math.min(100, percentTenths)
  const label = `Monthly settled: ${burnFormatted} / ${ceilingFormatted} (${percentTenths}%)`
  const progressAriaLabel = `Monthly settled ${burnFormatted} of ${ceilingFormatted}, ${percentTenths} percent`

  let toneClass = 'text-success-foreground'
  let approachingCopy: string | undefined
  if (percentTenths > 90) {
    toneClass = 'text-destructive'
    approachingCopy = 'Approaching monthly limit'
  } else if (percentTenths > 70) {
    toneClass = 'text-warning-foreground'
  }

  return {
    label,
    progressValue: clampedPercent,
    progressAriaLabel,
    toneClass,
    ...(approachingCopy !== undefined ? { approachingCopy } : {}),
  }
}

const DEFAULT_RESTORE_LIMITS = {
  maximumSpendPerCall: { currency: 'AUD', units: '5000000', exponent: 6 }, // $5.00
  maximumDailySpend: { currency: 'AUD', units: '25000000', exponent: 6 }, // $25.00
  maximumMonthlySpend: { currency: 'AUD', units: '100000000', exponent: 6 }, // $100.00
}

export function AeAgentSpendingLimitsForm({
  detail,
  onUpdateSpendingLimits,
  onReadSpendingLimits,
}: AeAgentSpendingLimitsFormProps) {
  const currentBudget = detail.grant?.budget
  const isPaused = isAgentSpendingPaused(detail)
  const quota = monthlyQuotaGauge(detail, isPaused)

  const [editing, setEditing] = useState(false)
  const [perCallStr, setPerCallStr] = useState(() => exactAmountToDecimal(currentBudget?.maximumSpendPerCall, '5'))
  const [dailyStr, setDailyStr] = useState(() => exactAmountToDecimal(currentBudget?.maximumDailySpend, '25'))
  const [monthlyStr, setMonthlyStr] = useState(() => exactAmountToDecimal(currentBudget?.maximumMonthlySpend, '100'))
  const [diagnostic, setDiagnostic] = useState<SpendingDiagnostic | null>(null)
  const [pending, setPending] = useState(false)

  const [savedLimits, setSavedLimits] = useState<Readonly<{
    maximumSpendPerCall: ExactAmount
    maximumDailySpend: ExactAmount
    maximumMonthlySpend: ExactAmount
  }>>(() => {
    if (currentBudget && !isPaused) {
      return {
        maximumSpendPerCall: currentBudget.maximumSpendPerCall,
        maximumDailySpend: currentBudget.maximumDailySpend,
        maximumMonthlySpend: currentBudget.maximumMonthlySpend,
      }
    }
    return DEFAULT_RESTORE_LIMITS
  })

  const selectedPresetId = matchingPresetId(perCallStr, dailyStr, monthlyStr)

  const clearDiagnostic = () => {
    if (diagnostic !== null) setDiagnostic(null)
  }

  const resolveEffectiveGeneration = async (): Promise<
    | { ok: true; generation: number }
    | { ok: false; diagnostic: SpendingDiagnostic }
  > => {
    if (onReadSpendingLimits) {
      try {
        const current = await onReadSpendingLimits(detail.agent.principalRef)
        switch (current.kind) {
          case 'current':
            return { ok: true, generation: current.generation }
          case 'refused':
            return { ok: false, diagnostic: mapReadRefusedDiagnostic(current.code) }
          default: {
            const _exhaustive: never = current
            return {
              ok: false,
              diagnostic: {
                title: 'Cannot verify spending policy',
                financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
                nextStep: 'Refresh the agent, then try again.',
              },
            }
          }
        }
      } catch (cause) {
        void cause
        return {
          ok: false,
          diagnostic: {
            title: 'Spending limits are temporarily unavailable',
            financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
            nextStep: 'Try again in a moment.',
          },
        }
      }
    }
    const generation = detail.agent.currentCredentialGeneration
    if (generation === undefined) {
      return {
        ok: false,
        diagnostic: {
          title: 'Cannot verify spending policy',
          financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
          nextStep: 'Refresh the agent, then try again.',
        },
      }
    }
    return { ok: true, generation }
  }

  const applyUpdateResult = (
    result: AgentSpendingLimitsResult,
    success: {
      toastTitle: string
      toastDescription?: string
      onSuccess?: () => void
    },
  ): void => {
    switch (result.kind) {
      case 'completed':
      case 'replayed':
        toast.success(success.toastTitle, {
          ...(success.toastDescription !== undefined
            ? { description: success.toastDescription }
            : {}),
        })
        success.onSuccess?.()
        break
      case 'conflict': {
        const mapped = mapUpdateConflictDiagnostic(result.code)
        setDiagnostic(mapped)
        toast.error(mapped.title, { description: mapped.financialImpact })
        break
      }
      case 'refused': {
        const mapped = mapUpdateRefusedDiagnostic(result.code)
        setDiagnostic(mapped)
        toast.error(mapped.title, { description: mapped.financialImpact })
        break
      }
      default: {
        const _exhaustive: never = result
        break
      }
    }
  }

  const handleStartEdit = () => {
    setPerCallStr(exactAmountToDecimal(currentBudget?.maximumSpendPerCall, '5'))
    setDailyStr(exactAmountToDecimal(currentBudget?.maximumDailySpend, '25'))
    setMonthlyStr(exactAmountToDecimal(currentBudget?.maximumMonthlySpend, '100'))
    setDiagnostic(null)
    setEditing(true)
  }

  const handleCancelEdit = () => {
    setDiagnostic(null)
    setEditing(false)
  }

  const applyPreset = (presetId: SpendingPresetId) => {
    const preset = SPENDING_PRESETS[presetId]
    setPerCallStr(preset.perCall)
    setDailyStr(preset.daily)
    setMonthlyStr(preset.monthly)
    clearDiagnostic()
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!onUpdateSpendingLimits) return

    setDiagnostic(null)

    const perCallAmount = parseDecimalExactAmount('AUD', perCallStr, 6)
    const dailyAmount = parseDecimalExactAmount('AUD', dailyStr, 6)
    const monthlyAmount = parseDecimalExactAmount('AUD', monthlyStr, 6)

    if (!perCallAmount || !dailyAmount || !monthlyAmount) {
      setDiagnostic({
        title: 'Limits must be valid AUD amounts',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Enter a number in each field, then save again.',
      })
      return
    }

    const perCallVsDaily = compareExactAmounts(perCallAmount, dailyAmount)
    if (perCallVsDaily === undefined || perCallVsDaily > 0) {
      setDiagnostic({
        title: 'Daily limit cannot be less than per-call limit.',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Raise the daily limit, or lower the per-call limit.',
      })
      return
    }

    const dailyVsMonthly = compareExactAmounts(dailyAmount, monthlyAmount)
    if (dailyVsMonthly === undefined || dailyVsMonthly > 0) {
      setDiagnostic({
        title: 'Monthly limit cannot be below the daily limit',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Raise the monthly limit, or lower the daily limit.',
      })
      return
    }

    setPending(true)
    try {
      const generationResolution = await resolveEffectiveGeneration()
      if (!generationResolution.ok) {
        setDiagnostic(generationResolution.diagnostic)
        return
      }
      const result = await onUpdateSpendingLimits({
        principalRef: detail.agent.principalRef,
        expectedGeneration: generationResolution.generation,
        maximumSpendPerCall: perCallAmount,
        maximumDailySpend: dailyAmount,
        maximumMonthlySpend: monthlyAmount,
      })

      applyUpdateResult(result, {
        toastTitle: 'Spending limits updated',
        toastDescription: limitsToastDescription(perCallAmount, dailyAmount, monthlyAmount),
        onSuccess: () => {
          setSavedLimits({
            maximumSpendPerCall: perCallAmount,
            maximumDailySpend: dailyAmount,
            maximumMonthlySpend: monthlyAmount,
          })
          setEditing(false)
        },
      })
    } catch (cause) {
      void cause
      const networkDiagnostic: SpendingDiagnostic = {
        title: 'Connection interrupted',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Check your network and try again. Limits were not changed.',
      }
      setDiagnostic(networkDiagnostic)
      toast.error(networkDiagnostic.title, { description: networkDiagnostic.financialImpact })
    } finally {
      setPending(false)
    }
  }

  const handleTogglePause = async () => {
    if (!onUpdateSpendingLimits) return

    setPending(true)
    try {
      const generationResolution = await resolveEffectiveGeneration()
      if (!generationResolution.ok) {
        setDiagnostic(generationResolution.diagnostic)
        return
      }

      if (isPaused) {
        const target = savedLimits
        const result = await onUpdateSpendingLimits({
          principalRef: detail.agent.principalRef,
          expectedGeneration: generationResolution.generation,
          maximumSpendPerCall: target.maximumSpendPerCall,
          maximumDailySpend: target.maximumDailySpend,
          maximumMonthlySpend: target.maximumMonthlySpend,
        })
        applyUpdateResult(result, {
          toastTitle: 'Agent resumed',
          toastDescription: limitsToastDescription(
            target.maximumSpendPerCall,
            target.maximumDailySpend,
            target.maximumMonthlySpend,
          ),
        })
      } else {
        if (currentBudget) {
          setSavedLimits({
            maximumSpendPerCall: currentBudget.maximumSpendPerCall,
            maximumDailySpend: currentBudget.maximumDailySpend,
            maximumMonthlySpend: currentBudget.maximumMonthlySpend,
          })
        }
        const zeroAmount: ExactAmount = { currency: 'AUD', units: '0', exponent: 6 }
        const result = await onUpdateSpendingLimits({
          principalRef: detail.agent.principalRef,
          expectedGeneration: generationResolution.generation,
          maximumSpendPerCall: zeroAmount,
          maximumDailySpend: zeroAmount,
          maximumMonthlySpend: zeroAmount,
        })
        applyUpdateResult(result, {
          toastTitle: 'Agent paused',
          toastDescription:
            'New paid Calls will be refused. A$0.00 new spend authorized. In-flight Calls are not cancelled.',
        })
      }
    } catch (cause) {
      void cause
      toast.error('Network error changing agent pause state')
    } finally {
      setPending(false)
    }
  }

  const quotaBlock = (
    <div className="grid min-h-[2.75rem] gap-1.5">
      <p className={`text-xs text-muted-foreground ${quota.toneClass}`}>
        <span className="font-mono tabular-nums text-foreground">{quota.label}</span>
      </p>
      {quota.approachingCopy !== undefined ? (
        <p className="text-xs text-destructive">{quota.approachingCopy}</p>
      ) : null}
      <Progress
        className="h-1.5"
        value={quota.progressValue}
        aria-label={quota.progressAriaLabel}
      />
    </div>
  )

  return (
    <div className="grid min-h-[24.5rem] gap-4 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Spending Policy</span>
          {isPaused ? (
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
          {!editing && onUpdateSpendingLimits ? (
            <>
              <Button
                type="button"
                variant={isPaused ? 'default' : 'outline'}
                size="sm"
                disabled={pending}
                onClick={() => void handleTogglePause()}
                className="min-h-touch gap-1.5"
              >
                {isPaused ? (
                  <>
                    <PlayIcon className="size-3.5" />
                    Resume Agent
                  </>
                ) : (
                  <>
                    <PauseIcon className="size-3.5" />
                    Pause Agent
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleStartEdit}
                className="min-h-touch"
              >
                Edit Limits
              </Button>
            </>
          ) : (
            <span className="invisible min-h-touch min-w-[12rem]" aria-hidden />
          )}
        </div>
      </div>

      <div className="min-h-[2.75rem]">
        {isPaused ? (
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
        {diagnostic !== null && editing ? (
          <Alert variant="destructive" className="py-2">
            <AlertCircleIcon className="size-4" />
            <AlertTitle className="text-sm">{diagnostic.title}</AlertTitle>
            <AlertDescription className="grid gap-1 text-xs">
              <span>{diagnostic.financialImpact}</span>
              <span>{diagnostic.nextStep}</span>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      {editing ? (
        <form onSubmit={(e) => void handleSave(e)} className="grid gap-3">
          <div className="grid min-h-[4.5rem] grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="grid gap-1">
              <Label htmlFor="per-call-spend" className="text-xs">
                Max spend per call (A$)
              </Label>
              <Input
                id="per-call-spend"
                type="text"
                inputMode="decimal"
                value={perCallStr}
                onChange={(e) => {
                  setPerCallStr(e.target.value)
                  clearDiagnostic()
                }}
                disabled={pending}
                className="font-mono text-sm tabular-nums"
              />
            </div>

            <div className="grid gap-1">
              <Label htmlFor="daily-spend" className="text-xs">
                Daily spend limit (A$)
              </Label>
              <Input
                id="daily-spend"
                type="text"
                inputMode="decimal"
                value={dailyStr}
                onChange={(e) => {
                  setDailyStr(e.target.value)
                  clearDiagnostic()
                }}
                disabled={pending}
                className="font-mono text-sm tabular-nums"
              />
            </div>

            <div className="grid gap-1">
              <Label htmlFor="monthly-spend" className="text-xs">
                Monthly spend limit (A$)
              </Label>
              <Input
                id="monthly-spend"
                type="text"
                inputMode="decimal"
                value={monthlyStr}
                onChange={(e) => {
                  setMonthlyStr(e.target.value)
                  clearDiagnostic()
                }}
                disabled={pending}
                className="font-mono text-sm tabular-nums"
              />
            </div>
          </div>

          {quotaBlock}

          <div className="grid min-h-[2.75rem] gap-1.5">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SPENDING_PRESETS) as SpendingPresetId[]).map((presetId) => {
                const preset = SPENDING_PRESETS[presetId]
                const selected = selectedPresetId === presetId
                return (
                  <button
                    key={presetId}
                    type="button"
                    aria-pressed={selected}
                    disabled={pending}
                    onClick={() => applyPreset(presetId)}
                    className={`${PRESET_CHIP_CLASS}${selected ? ' border-foreground bg-muted' : ''}`}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Presets keep per-call ≤ daily ≤ monthly.
            </p>
          </div>

          <div className="flex min-h-touch items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={handleCancelEdit}
              className="min-h-touch"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending} className="min-h-touch">
              {pending ? 'Saving...' : 'Save Limits'}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="grid min-h-[4.5rem] grid-cols-3 gap-2 text-xs">
            <div className="rounded border bg-background/50 p-2">
              <span className="block text-[11px] text-muted-foreground">Per call max</span>
              <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                {formatDisplayAmount(currentBudget?.maximumSpendPerCall)}
              </span>
            </div>
            <div className="rounded border bg-background/50 p-2">
              <span className="block text-[11px] text-muted-foreground">Daily budget</span>
              <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                {formatDisplayAmount(currentBudget?.maximumDailySpend)}
              </span>
            </div>
            <div className="rounded border bg-background/50 p-2">
              <span className="block text-[11px] text-muted-foreground">Monthly budget</span>
              <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                {formatDisplayAmount(currentBudget?.maximumMonthlySpend)}
              </span>
            </div>
          </div>

          {quotaBlock}

          <div className="min-h-[2.75rem]" aria-hidden />

          <div className="min-h-touch" aria-hidden />
        </>
      )}
    </div>
  )
}
