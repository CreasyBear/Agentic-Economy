import { useRef, useState } from 'react'
import { useAdminCommandProof } from '../actions/useAdminCommandProof'
import type { AdminActionSheetReceipt, AdminCommandRequest } from '../actions/actions.contracts'
import { ADMIN_REFUSAL_PRESENTATION } from '@/lib/operator/admin-console/refusal-presentation'
import { createPrefixedRandomId } from '@/modules/common/random-id'
import { formatExactAmount } from '@/modules/money/public'
import type { AdminTreasuryView } from '@/modules/money/treasury-report'
import { parseTreasuryThresholdInputs } from './treasury-view-model'

type Action = 'pause' | 'resume' | 'thresholds'
/**
 * Requires a reviewed treasury control digest and owner permission.
 * Ensures one immutable command survives MFA cancellation, pending outcomes and response loss.
 * Invariant: unknown outcomes retry the same key/payload; changed targets require a new review.
 * On violation: preserve inputs, explain refusal and never optimistically claim application.
 * COMPLEXITY: adds one hook owning request, review and flight state. Bought: both controls use one
 * retry contract without recreating the seven-phase sheet. Keep: tested real callers below.
 */
export function useTreasuryActions(view: AdminTreasuryView) {
  const execute = useAdminCommandProof()
  const [action, setAction] = useState<Action | null>(null)
  const [review, setReview] = useState(view.controls)
  const [lowWater, setLowWater] = useState('')
  const [target, setTarget] = useState('')
  const [pending, setPending] = useState(false)
  const [receipt, setReceipt] = useState<AdminActionSheetReceipt | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unknown, setUnknown] = useState(false)
  const request = useRef<AdminCommandRequest | null>(null)
  const flight = useRef(false)
  const unresolved = unknown || receipt?.kind === 'pending'
  const paused = view.controls.paymentsOpenTo === 'none'
  const targetChanged = receipt?.kind === 'refused' && receipt.code === 'target_changed'

  function open(next: Action) {
    if (unresolved || flight.current) return
    setAction(next)
    setReview(view.controls)
    request.current = null
    setReceipt(null)
    setError(null)
    if (next === 'thresholds' && lowWater === '' && target === '' && view.controls.thresholds.kind === 'fixed') {
      setLowWater(formatExactAmount({ currency: 'USDC', exponent: 6, units: view.controls.thresholds.lowWaterUnits }) ?? '')
      setTarget(formatExactAmount({ currency: 'USDC', exponent: 6, units: view.controls.thresholds.targetFloatUnits }) ?? '')
    }
  }
  function reviewCurrent() {
    if (flight.current || unresolved) return
    setReview(view.controls)
    request.current = null
    setReceipt(null)
    setError(null)
  }
  function edit(field: 'lowWater' | 'target', value: string) {
    if (flight.current || unresolved) return
    if (field === 'lowWater') setLowWater(value)
    else setTarget(value)
    request.current = null
    if (!targetChanged) setReceipt(null)
    setError(null)
  }
  async function submit(proposeResume = false) {
    if (flight.current || !view.controls.canManage || action === null || targetChanged) return
    if (proposeResume) {
      if (unresolved || action !== 'resume' || receipt?.kind !== 'refused' || receipt.code !== 'approval_required') return
      // A proposal is a new reviewed command, never a rewrite of an uncertain request.
      setReview(view.controls)
      request.current = null
    }
    if (request.current === null) {
      const shared = { operationKey: createPrefixedRandomId('admin:'), correlationId: createPrefixedRandomId('admin:correlation:') }
      if (action === 'thresholds') {
        const input = parseTreasuryThresholdInputs(lowWater, target)
        if (input === null) {
          setError('Enter nonnegative USDC amounts with at most six decimal places. The target must be positive and at least the low-water mark.')
          return
        }
        request.current = { ...shared, action: 'change_treasury_thresholds', input: { environment: view.environment, ...input },
          reasonCode: 'threshold_update', evidenceRefs: [`treasury-settings:${view.environment}`],
          expectedStateDigest: review.settingsStateDigest, approval: { kind: 'execute' } }
      } else {
        request.current = { ...shared, action: 'set_payments_paused', input: { environment: view.environment, paused: action === 'pause' },
          reasonCode: action === 'pause' ? 'operational_pause' : 'operational_resume', evidenceRefs: [`platform-launch:${view.environment}`],
          expectedStateDigest: proposeResume ? view.controls.launchStateDigest : review.launchStateDigest,
          approval: { kind: proposeResume || (action === 'resume' && review.resumeRequiresApproval) ? 'propose' : 'execute' } }
      }
    }
    flight.current = true
    const recovering = unresolved
    setPending(true)
    setError(null)
    // A known refusal belongs to the earlier attempt, not to this submitted request.
    if (receipt?.kind === 'refused') setReceipt(null)
    try {
      const next = await execute(request.current)
      setUnknown(false)
      setReceipt(next)
      if (next.kind === 'completed') {
        request.current = null
        setAction(null)
        if (next.action === 'change_treasury_thresholds') { setLowWater(''); setTarget('') }
      } else if (next.kind === 'proposed') setAction(null)
    } catch (cause) {
      const cancelled = typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'reverification_cancelled'
      setUnknown(recovering || !cancelled)
      setError(cancelled ? recovering
        ? 'Verification cancelled. The earlier command is still unresolved; recover its receipt before making another change.'
        : 'Verification cancelled. Your change is still here; no new command was submitted.'
        : 'The result is unknown. Retry this same command to recover its receipt before making another change.')
    } finally { flight.current = false; setPending(false) }
  }
  function retry() {
    if (!unresolved && receipt?.kind === 'refused') {
      const presentation = ADMIN_REFUSAL_PRESENTATION[receipt.code]
      if (presentation.retry === 'no' || targetChanged) return
      if (presentation.retry === 'new_key') request.current = null
    }
    void submit()
  }
  return { action, paused, review, lowWater, target, pending, receipt, error, unknown, unresolved, targetChanged,
    open, reviewCurrent, edit, submit, retry, proposeResume: () => { void submit(true) },
    close: () => { if (!flight.current && !unresolved) setAction(null) },
  }
}
