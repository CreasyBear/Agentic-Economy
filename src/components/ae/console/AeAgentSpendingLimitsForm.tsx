'use client'

import { useState } from 'react'
import { AlertCircleIcon, CheckIcon, PauseIcon, PlayIcon, ShieldAlertIcon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

  const [editing, setEditing] = useState(false)
  const [perCallStr, setPerCallStr] = useState(() => exactAmountToDecimal(currentBudget?.maximumSpendPerCall, '5'))
  const [dailyStr, setDailyStr] = useState(() => exactAmountToDecimal(currentBudget?.maximumDailySpend, '25'))
  const [monthlyStr, setMonthlyStr] = useState(() => exactAmountToDecimal(currentBudget?.maximumMonthlySpend, '100'))
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  // Stored limits to restore when resuming from paused state
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

  const resolveEffectiveGeneration = async (): Promise<
    | { ok: true; generation: number }
    | { ok: false; message: string }
  > => {
    if (onReadSpendingLimits) {
      try {
        const current = await onReadSpendingLimits(detail.agent.principalRef)
        switch (current.kind) {
          case 'current':
            return { ok: true, generation: current.generation }
          case 'refused':
            return {
              ok: false,
              message:
                current.code === 'source_unavailable'
                  ? 'Spending limits are temporarily unavailable. Try again in a moment.'
                  : 'Cannot verify spending policy. Try again.',
            }
          default: {
            const _exhaustive: never = current
            return { ok: false, message: 'Cannot verify spending policy. Try again.' }
          }
        }
      } catch (cause) {
        void cause;
        return {
          ok: false,
          message: 'Spending limits are temporarily unavailable. Try again in a moment.',
        }
      }
    }
    const generation = detail.agent.currentCredentialGeneration
    if (generation === undefined) {
      return { ok: false, message: 'Cannot verify spending policy generation. Try again.' }
    }
    return { ok: true, generation }
  }

  const applyUpdateResult = (
    result: AgentSpendingLimitsResult,
    success: { toastMessage: string; onSuccess?: () => void },
    failure: { setFormError?: (message: string) => void; toastPrefix: string; formErrorPrefix?: string },
  ): void => {
    switch (result.kind) {
      case 'completed':
      case 'replayed':
        toast.success(success.toastMessage)
        success.onSuccess?.()
        break
      case 'conflict': {
        const toastMessage = `${failure.toastPrefix}: ${result.code}`
        const formMessage = `${failure.formErrorPrefix ?? failure.toastPrefix}: ${result.code}`
        failure.setFormError?.(formMessage)
        toast.error(toastMessage)
        break
      }
      case 'refused': {
        const message = `Update refused: ${result.code}`
        failure.setFormError?.(message)
        toast.error(message)
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
    setError(undefined)
    setEditing(true)
  }

  const handleCancelEdit = () => {
    setError(undefined)
    setEditing(false)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!onUpdateSpendingLimits) return

    setError(undefined)

    const perCallAmount = parseDecimalExactAmount('AUD', perCallStr, 6)
    const dailyAmount = parseDecimalExactAmount('AUD', dailyStr, 6)
    const monthlyAmount = parseDecimalExactAmount('AUD', monthlyStr, 6)

    if (!perCallAmount || !dailyAmount || !monthlyAmount) {
      setError('Please enter valid AUD numbers for all limits.')
      return
    }

    const perCallVsDaily = compareExactAmounts(perCallAmount, dailyAmount)
    if (perCallVsDaily === undefined || perCallVsDaily > 0) {
      setError('Daily limit cannot be less than per-call limit.')
      return
    }

    const dailyVsMonthly = compareExactAmounts(dailyAmount, monthlyAmount)
    if (dailyVsMonthly === undefined || dailyVsMonthly > 0) {
      setError('Monthly limit cannot be less than daily limit.')
      return
    }

    setPending(true)
    try {
      const generationResolution = await resolveEffectiveGeneration()
      if (!generationResolution.ok) {
        setError(generationResolution.message)
        return
      }
      const result = await onUpdateSpendingLimits({
        principalRef: detail.agent.principalRef,
        expectedGeneration: generationResolution.generation,
        maximumSpendPerCall: perCallAmount,
        maximumDailySpend: dailyAmount,
        maximumMonthlySpend: monthlyAmount,
      })

      applyUpdateResult(
        result,
        {
          toastMessage: 'Spending limits updated',
          onSuccess: () => {
            setSavedLimits({
              maximumSpendPerCall: perCallAmount,
              maximumDailySpend: dailyAmount,
              maximumMonthlySpend: monthlyAmount,
            })
            setEditing(false)
          },
        },
        {
          setFormError: setError,
          toastPrefix: 'Update conflict',
          formErrorPrefix: 'Failed to update limits',
        },
      )
    } catch (cause) {
      void cause;
      setError('Network error while updating limits.')
      toast.error('Network error updating limits')
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
        setError(generationResolution.message)
        return
      }

      if (isPaused) {
        // Resume with saved limits
        const target = savedLimits
        const result = await onUpdateSpendingLimits({
          principalRef: detail.agent.principalRef,
          expectedGeneration: generationResolution.generation,
          maximumSpendPerCall: target.maximumSpendPerCall,
          maximumDailySpend: target.maximumDailySpend,
          maximumMonthlySpend: target.maximumMonthlySpend,
        })
        applyUpdateResult(
          result,
          { toastMessage: 'Agent resumed' },
          { toastPrefix: 'Failed to resume' },
        )
      } else {
        // Pause by zeroing out limits
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
        applyUpdateResult(
          result,
          { toastMessage: 'Agent paused' },
          { toastPrefix: 'Failed to pause' },
        )
      }
    } catch (cause) {
      void cause;
      toast.error('Network error changing agent pause state')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid gap-4 rounded-md border p-3 bg-muted/20">
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
        <div className="flex items-center gap-2">
          {!editing && onUpdateSpendingLimits && (
            <>
              <Button
                type="button"
                variant={isPaused ? 'default' : 'outline'}
                size="sm"
                disabled={pending}
                onClick={() => void handleTogglePause()}
                className="gap-1.5 min-h-touch"
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
          )}
        </div>
      </div>

      {isPaused && (
        <Alert className="border-warning-ring bg-warning-subtle text-warning-foreground py-2">
          <AlertCircleIcon className="size-4" />
          <AlertDescription className="text-xs">
            This agent is temporarily paused. Incoming calls will be refused with zero-limit fences until resumed.
          </AlertDescription>
        </Alert>
      )}

      {editing ? (
        <form onSubmit={(e) => void handleSave(e)} className="grid gap-3 pt-1">
          {error && (
            <Alert variant="destructive" className="py-2">
              <AlertCircleIcon className="size-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="per-call-spend" className="text-xs">
                Max spend per call (A$)
              </Label>
              <Input
                id="per-call-spend"
                type="text"
                inputMode="decimal"
                value={perCallStr}
                onChange={(e) => setPerCallStr(e.target.value)}
                disabled={pending}
                className="font-mono text-sm"
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
                onChange={(e) => setDailyStr(e.target.value)}
                disabled={pending}
                className="font-mono text-sm"
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
                onChange={(e) => setMonthlyStr(e.target.value)}
                disabled={pending}
                className="font-mono text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
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
            <Button
              type="submit"
              size="sm"
              disabled={pending}
              className="min-h-touch"
            >
              {pending ? 'Saving...' : 'Save Limits'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded border bg-background/50 p-2">
            <span className="text-muted-foreground block text-[11px]">Per call max</span>
            <span className="font-mono font-medium text-foreground">
              {formatDisplayAmount(currentBudget?.maximumSpendPerCall)}
            </span>
          </div>
          <div className="rounded border bg-background/50 p-2">
            <span className="text-muted-foreground block text-[11px]">Daily budget</span>
            <span className="font-mono font-medium text-foreground">
              {formatDisplayAmount(currentBudget?.maximumDailySpend)}
            </span>
          </div>
          <div className="rounded border bg-background/50 p-2">
            <span className="text-muted-foreground block text-[11px]">Monthly budget</span>
            <span className="font-mono font-medium text-foreground">
              {formatDisplayAmount(currentBudget?.maximumMonthlySpend)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
