import { useState, type FormEvent } from 'react'

import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import { toast } from '@/lib/ui/toast'
import type { AgentDetail } from '@/modules/agent-access/agent-operator-view-model'
import {
  DEFAULT_RESTORE_LIMITS,
  exactAmountToDecimal,
  isSpendingPaused,
  limitsToastDescription,
  matchingPresetId,
  monthlyQuotaGaugeFromFacts,
  parseSpendingLimitTriple,
  SPENDING_PRESETS,
  validateSpendingLimitOrder,
} from '@/modules/agent-access/spending-policy.view-model'
import type {
  AgentSpendingLimitsReadResult,
  AgentSpendingLimitsResult,
} from '@/modules/agent-access/spending-policy-update'
import { formatDisplayAmount, type ExactAmount } from '@/modules/money/public'

import type { AgentSpendingLimitsViewState } from './spending-limits-form.contracts'
import {
  FINANCIAL_SAFE_LIMITS_UNCHANGED,
  mapReadRefusedDiagnostic,
  mapUpdateConflictDiagnostic,
  mapUpdateRefusedDiagnostic,
} from './spending-limits-diagnostics'

export type UseAgentSpendingLimitsParams = Readonly<{
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

export type UseAgentSpendingLimitsResult = Readonly<{
  view: AgentSpendingLimitsViewState
  handleStartEdit: () => void
  handleCancelEdit: () => void
  handleSave: (e: Pick<FormEvent, 'preventDefault'>) => void
  handleTogglePause: () => void
  applyPreset: (presetId: keyof typeof SPENDING_PRESETS) => void
  setPerCallStr: (value: string) => void
  setDailyStr: (value: string) => void
  setMonthlyStr: (value: string) => void
}>

export function useAgentSpendingLimits({
  detail,
  onUpdateSpendingLimits,
  onReadSpendingLimits,
}: UseAgentSpendingLimitsParams): UseAgentSpendingLimitsResult {
  const currentBudget = detail.grant?.budget
  const isPaused = isSpendingPaused(currentBudget)
  const quotaRaw = monthlyQuotaGaugeFromFacts({
    isPaused,
    ...(currentBudget?.maximumMonthlySpend !== undefined
      ? { grantBudgetMonthlyCeiling: currentBudget.maximumMonthlySpend }
      : {}),
    ...(detail.agent.monthlyLimit !== undefined ? { agentMonthlyLimit: detail.agent.monthlyLimit } : {}),
    ...(detail.agent.monthlySettledSpend !== undefined
      ? { monthlySettledSpend: detail.agent.monthlySettledSpend }
      : {}),
    ...(detail.agent.monthlySpendCoverage !== undefined
      ? { monthlySpendCoverage: detail.agent.monthlySpendCoverage }
      : {}),
  })

  const [editing, setEditing] = useState(false)
  const [perCallStr, setPerCallStr] = useState(() =>
    exactAmountToDecimal(currentBudget?.maximumSpendPerCall, '5'),
  )
  const [dailyStr, setDailyStr] = useState(() =>
    exactAmountToDecimal(currentBudget?.maximumDailySpend, '25'),
  )
  const [monthlyStr, setMonthlyStr] = useState(() =>
    exactAmountToDecimal(currentBudget?.maximumMonthlySpend, '100'),
  )
  const [diagnostic, setDiagnostic] = useState<Rule4Diagnostic | null>(null)
  const [pending, setPending] = useState(false)

  const [savedLimits, setSavedLimits] = useState<
    Readonly<{
      maximumSpendPerCall: ExactAmount
      maximumDailySpend: ExactAmount
      maximumMonthlySpend: ExactAmount
    }>
  >(() => {
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
  const canUpdate = onUpdateSpendingLimits !== undefined

  const clearDiagnostic = () => {
    if (diagnostic !== null) setDiagnostic(null)
  }

  const resolveEffectiveGeneration = async (): Promise<
    | { ok: true; generation: number }
    | { ok: false; diagnostic: Rule4Diagnostic }
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
                whatHappened: 'Cannot verify spending policy',
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
            whatHappened: 'Spending limits are temporarily unavailable',
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
          whatHappened: 'Cannot verify spending policy',
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
        toast.error(mapped.whatHappened, { description: mapped.financialImpact })
        break
      }
      case 'refused': {
        const mapped = mapUpdateRefusedDiagnostic(result.code)
        setDiagnostic(mapped)
        toast.error(mapped.whatHappened, { description: mapped.financialImpact })
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

  const applyPreset = (presetId: keyof typeof SPENDING_PRESETS) => {
    const preset = SPENDING_PRESETS[presetId]
    setPerCallStr(preset.perCall)
    setDailyStr(preset.daily)
    setMonthlyStr(preset.monthly)
    clearDiagnostic()
  }

  const handleSave = async (e: Pick<FormEvent, 'preventDefault'>) => {
    e.preventDefault()
    if (!onUpdateSpendingLimits) return

    setDiagnostic(null)

    const parsed = parseSpendingLimitTriple(perCallStr, dailyStr, monthlyStr)
    if (!parsed) {
      setDiagnostic({
        whatHappened: 'Limits must be valid AUD amounts',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Enter a number in each field, then save again.',
      })
      return
    }

    const orderViolation = validateSpendingLimitOrder(
      parsed.maximumSpendPerCall,
      parsed.maximumDailySpend,
      parsed.maximumMonthlySpend,
    )
    if (orderViolation === 'per_call_gt_daily') {
      setDiagnostic({
        whatHappened: 'Daily limit cannot be less than per-call limit.',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Raise the daily limit, or lower the per-call limit.',
      })
      return
    }
    if (orderViolation === 'daily_gt_monthly') {
      setDiagnostic({
        whatHappened: 'Monthly limit cannot be below the daily limit',
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
        maximumSpendPerCall: parsed.maximumSpendPerCall,
        maximumDailySpend: parsed.maximumDailySpend,
        maximumMonthlySpend: parsed.maximumMonthlySpend,
      })

      applyUpdateResult(result, {
        toastTitle: 'Spending limits updated',
        toastDescription: limitsToastDescription(
          parsed.maximumSpendPerCall,
          parsed.maximumDailySpend,
          parsed.maximumMonthlySpend,
        ),
        onSuccess: () => {
          setSavedLimits({
            maximumSpendPerCall: parsed.maximumSpendPerCall,
            maximumDailySpend: parsed.maximumDailySpend,
            maximumMonthlySpend: parsed.maximumMonthlySpend,
          })
          setEditing(false)
        },
      })
    } catch (cause) {
      void cause
      const networkDiagnostic: Rule4Diagnostic = {
        whatHappened: 'Connection interrupted',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Check your network and try again. Limits were not changed.',
      }
      setDiagnostic(networkDiagnostic)
      toast.error(networkDiagnostic.whatHappened, { description: networkDiagnostic.financialImpact })
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

  const presetOptions = (Object.keys(SPENDING_PRESETS) as Array<keyof typeof SPENDING_PRESETS>).map(
    (id) => ({
      id,
      label: SPENDING_PRESETS[id].label,
    }),
  )

  const view: AgentSpendingLimitsViewState = {
    isPaused,
    editing,
    pending,
    diagnostic,
    perCallStr,
    dailyStr,
    monthlyStr,
    selectedPresetId,
    quota: {
      label: quotaRaw.label,
      toneClass: quotaRaw.toneClass,
      progressValue: quotaRaw.progressValue,
      progressAriaLabel: quotaRaw.progressAriaLabel,
      ...(quotaRaw.approachingCopy !== undefined ? { approachingCopy: quotaRaw.approachingCopy } : {}),
    },
    readout: {
      perCallDisplay: formatDisplayAmount(currentBudget?.maximumSpendPerCall),
      dailyDisplay: formatDisplayAmount(currentBudget?.maximumDailySpend),
      monthlyDisplay: formatDisplayAmount(currentBudget?.maximumMonthlySpend),
    },
    presetOptions,
    showHeaderActions: !editing && canUpdate,
    showDiagnostic: diagnostic !== null && editing,
  }

  return {
    view,
    handleStartEdit,
    handleCancelEdit,
    handleSave: (e) => void handleSave(e),
    handleTogglePause: () => void handleTogglePause(),
    applyPreset,
    setPerCallStr: (value) => {
      setPerCallStr(value)
      clearDiagnostic()
    },
    setDailyStr: (value) => {
      setDailyStr(value)
      clearDiagnostic()
    },
    setMonthlyStr: (value) => {
      setMonthlyStr(value)
      clearDiagnostic()
    },
  }
}
