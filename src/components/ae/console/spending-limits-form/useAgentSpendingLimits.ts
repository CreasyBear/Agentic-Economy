import { useEffect, useState, type FormEvent } from 'react'

import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import { degrade } from '@/lib/observability/degrade'
import { toast } from '@/lib/ui/toast'
import type { AgentDetail } from '@/modules/agent-access/agent-operator-view-model'
import {
  exactAmountToDecimal,
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
  AgentSpendingPolicyState,
} from '@/modules/agent-access/spending-policy-update'
import { formatDisplayAmount, type ExactAmount } from '@/modules/money/public'

import type { AgentSpendingLimitsViewState } from './spending-limits-form.contracts'
import {
  FINANCIAL_SAFE_LIMITS_UNCHANGED,
  mapReadRefusedDiagnostic,
  mapUpdateConflictDiagnostic,
  mapUpdateRefusedDiagnostic,
} from './spending-limits-diagnostics'

type KnownPolicy = Extract<AgentSpendingPolicyState, { kind: 'known' }>
type LimitTriple = Pick<KnownPolicy, 'maximumSpendPerCall' | 'maximumDailySpend' | 'maximumMonthlySpend'>

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
  policy: AgentSpendingPolicyState
  loading: boolean
  handleStartEdit: () => void
  handleCancelEdit: () => void
  handleSave: (e: Pick<FormEvent, 'preventDefault'>) => void
  handleTogglePause: () => void
  handleRefresh: () => void
  applyPreset: (presetId: keyof typeof SPENDING_PRESETS) => void
  setPerCallStr: (value: string) => void
  setDailyStr: (value: string) => void
  setMonthlyStr: (value: string) => void
}>

const readUnavailable: Rule4Diagnostic = {
  whatHappened: 'Cannot verify spending policy',
  financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
  nextStep: 'Refresh the agent, then try again.',
}

function ownerPolicy(result: AgentSpendingLimitsReadResult, principalRef: string): AgentSpendingPolicyState {
  if (result.kind === 'refused') return { kind: 'unavailable' }
  if (result.kind === 'known') {
    if (result.principalRef !== principalRef) return { kind: 'unavailable' }
    if (result.expiresAt <= Date.now()) return { kind: 'expired', expiresAt: result.expiresAt }
  }
  return result
}

function sameAuthority(left: KnownPolicy, right: KnownPolicy): boolean {
  return left.principalRef === right.principalRef
    && left.grantRef === right.grantRef
    && left.generation === right.generation
    && left.spendingPolicyDigest === right.spendingPolicyDigest
}

export function useAgentSpendingLimits({
  detail,
  onUpdateSpendingLimits,
  onReadSpendingLimits,
}: UseAgentSpendingLimitsParams): UseAgentSpendingLimitsResult {
  const principalRef = detail.agent.principalRef
  const [policy, setPolicy] = useState<AgentSpendingPolicyState>(detail.spendingPolicy)
  const [now, setNow] = useState(() => Date.now())
  const [refreshing, setRefreshing] = useState(onReadSpendingLimits !== undefined)
  const [editing, setEditing] = useState(false)
  const [editBase, setEditBase] = useState<KnownPolicy>()
  const [perCallStr, setPerCallStr] = useState('')
  const [dailyStr, setDailyStr] = useState('')
  const [monthlyStr, setMonthlyStr] = useState('')
  const [diagnostic, setDiagnostic] = useState<Rule4Diagnostic | null>(null)
  const [pending, setPending] = useState(false)
  const [savedLimits, setSavedLimits] = useState<LimitTriple | undefined>(() => detail.spendingPolicy.kind === 'known' && !detail.spendingPolicy.paused
    ? detail.spendingPolicy : undefined)
  const known = !refreshing && policy.kind === 'known' && policy.principalRef === principalRef && policy.expiresAt > now ? policy : undefined
  const state: AgentSpendingPolicyState = policy.kind === 'known' && policy.expiresAt <= now
    ? { kind: 'expired', expiresAt: policy.expiresAt }
    : policy.kind === 'known' && policy.principalRef !== principalRef ? { kind: 'unavailable' } : policy
  const isPaused = known?.paused ?? false
  const quotaRaw = monthlyQuotaGaugeFromFacts({
    isPaused,
    ...(known === undefined ? {} : { grantBudgetMonthlyCeiling: known.maximumMonthlySpend }),
    ...(detail.agent.monthlyLimit !== undefined ? { agentMonthlyLimit: detail.agent.monthlyLimit } : {}),
    ...(detail.agent.monthlySettledSpend !== undefined ? { monthlySettledSpend: detail.agent.monthlySettledSpend } : {}),
    ...(detail.agent.monthlySpendCoverage !== undefined ? { monthlySpendCoverage: detail.agent.monthlySpendCoverage } : {}),
  })

  useEffect(() => {
    if (policy.kind !== 'known' || policy.expiresAt <= now) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(policy.expiresAt - now, 2_147_483_647))
    return () => window.clearTimeout(timer)
  }, [policy, now])

  // A sheet begins with the owner-projected state, then refreshes that exact principal.
  // A failed refresh must never leave previously known limits editable.
  useEffect(() => {
    let active = true
    setPolicy(detail.spendingPolicy)
    setSavedLimits(detail.spendingPolicy.kind === 'known' && !detail.spendingPolicy.paused
      ? detail.spendingPolicy : undefined)
    setNow(Date.now())
    setEditing(false)
    setDiagnostic(null)
    if (onReadSpendingLimits === undefined) {
      setRefreshing(false)
      return
    }
    setRefreshing(true)
    void onReadSpendingLimits(principalRef).then(
      (result) => {
        if (!active) return
        const next = ownerPolicy(result, principalRef)
        setPolicy(next)
        if (next.kind === 'known' && !next.paused) setSavedLimits(next)
        setNow(Date.now())
        setRefreshing(false)
      },
      (cause) => {
        if (!active) return
        setPolicy(degrade(cause, { kind: 'unavailable' }, { site: 'useAgentSpendingLimits.initialRead', reason: 'source_unavailable' }))
        setRefreshing(false)
      },
    )
    return () => { active = false }
  }, [principalRef, detail.spendingPolicy, onReadSpendingLimits])

  const refresh = async (): Promise<AgentSpendingPolicyState> => {
    if (onReadSpendingLimits === undefined) {
      setPolicy(detail.spendingPolicy)
      return detail.spendingPolicy
    }
    setRefreshing(true)
    setEditing(false)
    try {
      const result = await onReadSpendingLimits(principalRef)
      const next = ownerPolicy(result, principalRef)
      setNow(Date.now())
      setPolicy(next)
      if (next.kind === 'known' && !next.paused) setSavedLimits(next)
      setDiagnostic(result.kind === 'refused' ? mapReadRefusedDiagnostic(result.code) : null)
      return next
    } catch (cause) {
      const unavailable: AgentSpendingPolicyState = degrade(cause, { kind: 'unavailable' }, { site: 'useAgentSpendingLimits.refresh', reason: 'source_unavailable' })
      setPolicy(unavailable)
      setDiagnostic(readUnavailable)
      return unavailable
    } finally {
      setRefreshing(false)
    }
  }

  // Each write demands a fresh owner join. Neither the detail's credential generation
  // nor an old sheet read can stand in for current authority.
  const readForWrite = async (): Promise<KnownPolicy | undefined> => {
    if (onReadSpendingLimits === undefined) {
      setPolicy({ kind: 'unavailable' })
      setEditing(false)
      setDiagnostic(readUnavailable)
      return undefined
    }
    try {
      const result = await onReadSpendingLimits(principalRef)
      if (result.kind === 'known' && result.expiresAt > Date.now() && result.principalRef === principalRef) {
        setNow(Date.now())
        setPolicy(result)
        return result
      }
      setPolicy(ownerPolicy(result, principalRef))
      setEditing(false)
      setDiagnostic(result.kind === 'refused' ? mapReadRefusedDiagnostic(result.code) : readUnavailable)
      return undefined
    } catch (cause) {
      setPolicy(degrade(cause, { kind: 'unavailable' }, { site: 'useAgentSpendingLimits.readForWrite', reason: 'source_unavailable' }))
      setEditing(false)
      setDiagnostic(readUnavailable)
      return undefined
    }
  }

  const applyUpdateResult = (result: AgentSpendingLimitsResult, title: string, description?: string): boolean => {
    if (result.kind === 'completed' || result.kind === 'replayed') {
      toast.success(title, description === undefined ? {} : { description })
      setEditing(false)
      void refresh()
      return true
    }
    const mapped = result.kind === 'conflict'
      ? mapUpdateConflictDiagnostic(result.code)
      : result.kind === 'refused' ? mapUpdateRefusedDiagnostic(result.code) : readUnavailable
    setDiagnostic(mapped)
    toast.error(mapped.whatHappened, { description: mapped.financialImpact })
    return false
  }

  const handleStartEdit = async () => {
    if (refreshing || pending || known === undefined || onUpdateSpendingLimits === undefined) return
    setPending(true)
    const current = await readForWrite()
    setPending(false)
    if (current === undefined) return
    setEditBase(current)
    const limits = current.paused ? savedLimits : current
    setPerCallStr(limits === undefined ? '' : exactAmountToDecimal(limits.maximumSpendPerCall, ''))
    setDailyStr(limits === undefined ? '' : exactAmountToDecimal(limits.maximumDailySpend, ''))
    setMonthlyStr(limits === undefined ? '' : exactAmountToDecimal(limits.maximumMonthlySpend, ''))
    setDiagnostic(null)
    setEditing(true)
  }

  const handleSave = async (e: Pick<FormEvent, 'preventDefault'>) => {
    e.preventDefault()
    if (!editing || editBase === undefined || refreshing || pending || known === undefined || onUpdateSpendingLimits === undefined) return
    setDiagnostic(null)
    const parsed = parseSpendingLimitTriple(perCallStr, dailyStr, monthlyStr)
    if (!parsed) {
      setDiagnostic({ whatHappened: 'Limits must be valid AUD amounts', financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED, nextStep: 'Enter a number in each field, then save again.' })
      return
    }
    const orderViolation = validateSpendingLimitOrder(parsed.maximumSpendPerCall, parsed.maximumDailySpend, parsed.maximumMonthlySpend)
    if (orderViolation !== null) {
      setDiagnostic(orderViolation === 'per_call_gt_daily'
        ? { whatHappened: 'Daily limit cannot be less than per-call limit.', financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED, nextStep: 'Raise the daily limit, or lower the per-call limit.' }
        : { whatHappened: 'Monthly limit cannot be below the daily limit', financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED, nextStep: 'Raise the monthly limit, or lower the daily limit.' })
      return
    }
    setPending(true)
    try {
      const current = await readForWrite()
      if (current === undefined) return
      if (!sameAuthority(editBase, current)) {
        setEditing(false)
        setDiagnostic(mapUpdateConflictDiagnostic('revision_conflict'))
        return
      }
      const result = await onUpdateSpendingLimits({ principalRef, expectedGeneration: current.generation, ...parsed })
      if (applyUpdateResult(result, 'Spending limits updated', limitsToastDescription(parsed.maximumSpendPerCall, parsed.maximumDailySpend, parsed.maximumMonthlySpend))
        && !(parsed.maximumSpendPerCall.units === '0' && parsed.maximumDailySpend.units === '0' && parsed.maximumMonthlySpend.units === '0')) {
        setSavedLimits(parsed)
      }
    } catch (cause) {
      const networkDiagnostic: Rule4Diagnostic = degrade(cause, { whatHappened: 'Connection interrupted', financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED, nextStep: 'Check your network and try again. Limits were not changed.' }, { site: 'useAgentSpendingLimits.save', reason: 'source_unavailable' })
      setDiagnostic(networkDiagnostic)
      toast.error(networkDiagnostic.whatHappened, { description: networkDiagnostic.financialImpact })
    } finally {
      setPending(false)
    }
  }

  const handleTogglePause = async () => {
    if (refreshing || pending || known === undefined || onUpdateSpendingLimits === undefined) return
    setPending(true)
    try {
      const current = await readForWrite()
      if (current === undefined) return
      if (!sameAuthority(known, current)) {
        setDiagnostic(mapUpdateConflictDiagnostic('revision_conflict'))
        return
      }
      let target: LimitTriple = current
      if (current.paused) {
        if (savedLimits === undefined) {
          setEditBase(current)
          setPerCallStr('')
          setDailyStr('')
          setMonthlyStr('')
          setEditing(true)
          return
        }
        target = savedLimits
      }
      const zero: ExactAmount = { currency: 'AUD', units: '0', exponent: 6 }
      const result = await onUpdateSpendingLimits({
        principalRef,
        expectedGeneration: current.generation,
        ...(current.paused ? {
          maximumSpendPerCall: target.maximumSpendPerCall,
          maximumDailySpend: target.maximumDailySpend,
          maximumMonthlySpend: target.maximumMonthlySpend,
        } : { maximumSpendPerCall: zero, maximumDailySpend: zero, maximumMonthlySpend: zero }),
      })
      if (applyUpdateResult(result, current.paused ? 'Agent resumed' : 'Agent paused', current.paused
        ? limitsToastDescription(target.maximumSpendPerCall, target.maximumDailySpend, target.maximumMonthlySpend)
        : 'New paid Calls will be refused. A$0.00 new spend authorized. In-flight Calls are not cancelled.') && !current.paused) {
        setSavedLimits(current)
      }
    } catch (cause) {
      degrade(cause, undefined, { site: 'useAgentSpendingLimits.togglePause', reason: 'source_unavailable' })
      toast.error('Network error changing agent pause state')
    } finally {
      setPending(false)
    }
  }

  const selectedPresetId = matchingPresetId(perCallStr, dailyStr, monthlyStr)
  const presetOptions = (Object.keys(SPENDING_PRESETS) as Array<keyof typeof SPENDING_PRESETS>).map((id) => ({ id, label: SPENDING_PRESETS[id].label }))
  const view: AgentSpendingLimitsViewState = {
    isPaused,
    restoreAvailable: savedLimits !== undefined,
    editing: editing && known !== undefined,
    pending: pending || refreshing,
    diagnostic,
    perCallStr,
    dailyStr,
    monthlyStr,
    selectedPresetId,
    quota: quotaRaw,
    readout: {
      perCallDisplay: known === undefined ? '—' : formatDisplayAmount(known.maximumSpendPerCall),
      dailyDisplay: known === undefined ? '—' : formatDisplayAmount(known.maximumDailySpend),
      monthlyDisplay: known === undefined ? '—' : formatDisplayAmount(known.maximumMonthlySpend),
    },
    presetOptions,
    showHeaderActions: !editing && !refreshing && known !== undefined && onUpdateSpendingLimits !== undefined && onReadSpendingLimits !== undefined,
    showDiagnostic: diagnostic !== null,
  }
  return {
    view,
    policy: state,
    loading: refreshing,
    handleStartEdit: () => void handleStartEdit(),
    handleCancelEdit: () => { setEditing(false); setDiagnostic(null) },
    handleSave: (e) => void handleSave(e),
    handleTogglePause: () => void handleTogglePause(),
    handleRefresh: () => { void refresh() },
    applyPreset: (id) => { const preset = SPENDING_PRESETS[id]; setPerCallStr(preset.perCall); setDailyStr(preset.daily); setMonthlyStr(preset.monthly); setDiagnostic(null) },
    setPerCallStr: (value) => { setPerCallStr(value); setDiagnostic(null) },
    setDailyStr: (value) => { setDailyStr(value); setDiagnostic(null) },
    setMonthlyStr: (value) => { setMonthlyStr(value); setDiagnostic(null) },
  }
}
