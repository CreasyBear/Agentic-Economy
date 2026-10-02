import { isReverificationCancelledError } from '@clerk/tanstack-react-start/errors'
import { useQuery } from 'convex/react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import { ADMIN_ACTION_PERMISSION } from '@/lib/operator/admin-console/contracts'
import { ADMIN_REFUSAL_PRESENTATION } from '@/lib/operator/admin-console/refusal-presentation'
import { createPrefixedRandomId } from '@/modules/common/random-id'
import { canAdminRolePerformAction } from '@/modules/security/public'
import {
  ADMIN_ACTION_SHEET_COPY,
  ADMIN_REASON_OPTIONS,
  adminCommandRequestSchema,
  type AdminActionSheetController,
  type AdminActionSheetProps,
  type AdminActionSheetState,
  type AdminCommandRequest,
} from './actions.contracts'
import { useAdminCommandProof } from './useAdminCommandProof'

/** Requires a reviewed command and current authority. Submission captures its entire request once.
 * Ensures MFA, pending and uncertain retries use identical terms and operation identity.
 * An unresolved request can be minimized and resumed in the same mounted instance; it cannot be edited.
 * A known refusal permits an explicit new request. Page reload/navigation is outside this local lifetime. */
export function useAdminActionSheet(props: AdminActionSheetProps): AdminActionSheetController {
  const access = useQuery(api.adminConsoleAudit.readAdminAuditAccess, {})
  const role = access?.kind === 'allowed' ? access.role : null
  const allowed = role !== null && canAdminRolePerformAction(role, ADMIN_ACTION_PERMISSION[props.action])
  const execute = useAdminCommandProof()
  const operationKey = useRef(createPrefixedRandomId('admin:'))
  const correlationId = useRef(createPrefixedRandomId('admin:correlation:'))
  const generation = useRef(0)
  const flights = useRef(0)
  const abandoned = useRef(false)
  const submittedRequest = useRef<AdminCommandRequest | null>(null)
  const unresolved = useRef(false)
  const [pending, setPending] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [state, setState] = useState<AdminActionSheetState>({
    phase: props.approval?.kind === 'approve' ? 'preview' : 'reason', reasonCode: props.initialReasonCode ?? '',
    evidenceRefs: props.initialEvidenceRefs ?? [], typedEvidence: '', receipt: null,
    error: null, approval: props.approval ?? { kind: 'execute' }, submittedRequest: null,
  })

  const resetFromCurrentProps = useEffectEvent(() => {
    generation.current += 1
    abandoned.current = false
    submittedRequest.current = null
    unresolved.current = false
    setMinimized(false)
    setPending(flights.current > 0)
    operationKey.current = createPrefixedRandomId('admin:')
    correlationId.current = createPrefixedRandomId('admin:correlation:')
    setState({
      phase: props.approval?.kind === 'approve' ? 'preview' : 'reason', reasonCode: props.initialReasonCode ?? '',
      evidenceRefs: props.initialEvidenceRefs ?? [], typedEvidence: '', receipt: null,
      error: null, approval: props.approval ?? { kind: 'execute' }, submittedRequest: null,
    })
  })

  useEffect(() => {
    if (props.open) resetFromCurrentProps()
  }, [props.open])

  function setReason(value: string) {
    if (submittedRequest.current !== null) return
    if (props.approval?.kind === 'approve') return
    if (!ADMIN_REASON_OPTIONS[props.action].some((reason) => reason === value)) return
    setState((previous) => ({ ...previous, reasonCode: value, error: null }))
  }

  function setEvidence(value: string, selected: boolean) {
    if (submittedRequest.current !== null) return
    if (props.approval?.kind === 'approve') return
    setState((previous) => ({ ...previous,
      evidenceRefs: selected
        ? [...new Set([...previous.evidenceRefs, value])]
        : previous.evidenceRefs.filter((ref) => ref !== value),
      error: null,
    }))
  }

  function next() {
    setState((previous) => {
      if (previous.phase === 'reason') return previous.reasonCode.length > 0
        ? { ...previous, phase: 'evidence', error: null }
        : { ...previous, error: 'Select a reason before continuing.' }
      if (previous.phase === 'evidence') {
        const typed = previous.typedEvidence.trim()
        const evidenceRefs = typed.length === 0
          ? previous.evidenceRefs
          : [...new Set([...previous.evidenceRefs, typed])]
        return evidenceRefs.length === 0
          ? { ...previous, error: 'Select at least one evidence reference.' }
          : { ...previous, evidenceRefs, phase: 'proof', error: null }
      }
      if (previous.phase === 'proof') return { ...previous, phase: 'preview', error: null }
      if (previous.phase === 'preview' && (
        props.action === 'revoke_admin_membership' || props.action === 'close_removal_dispute'
      )) return { ...previous, phase: 'confirm', error: null }
      return previous
    })
  }

  function unchangedPreview() {
    return ADMIN_REFUSAL_PRESENTATION.mfa_reverification_required.nextStep
  }

  function leaveSubmitting() {
    abandoned.current = true
    setState((previous) => ({ ...previous, phase: 'preview', error: ADMIN_ACTION_SHEET_COPY.unavailable }))
  }

  function back() {
    if (state.phase === 'submitting') {
      leaveSubmitting()
      return
    }
    if (submittedRequest.current !== null) return
    if (props.approval?.kind === 'approve' && state.phase !== 'confirm') return
    setState((previous) => ({ ...previous, error: null, phase:
      previous.phase === 'confirm' ? 'preview'
        : previous.phase === 'preview' ? 'proof'
          : previous.phase === 'proof' ? 'evidence' : 'reason',
    }))
  }

  async function submit(intent = state.approval) {
    if (props.approval?.kind === 'approve' && intent.kind !== 'approve') return
    if (!allowed || flights.current > 0 || state.phase === 'submitting') return
    if (intent.kind !== state.approval.kind) {
      if (unresolved.current) return
      operationKey.current = createPrefixedRandomId('admin:')
      correlationId.current = createPrefixedRandomId('admin:correlation:')
      if (submittedRequest.current !== null) submittedRequest.current = {
        ...submittedRequest.current, approval: intent, operationKey: operationKey.current, correlationId: correlationId.current,
      }
    }
    const validated = adminCommandRequestSchema.safeParse(submittedRequest.current ?? {
      action: props.action, input: props.input, reasonCode: state.reasonCode,
      evidenceRefs: state.evidenceRefs,
      ...(props.currentStateDigest === undefined ? {} : { expectedStateDigest: props.currentStateDigest }),
      approval: intent, operationKey: operationKey.current, correlationId: correlationId.current,
    })
    if (!validated.success) {
      setState((previous) => ({ ...previous, error: 'Review the reason, evidence and command details before submitting.' }))
      return
    }
    submittedRequest.current = validated.data
    unresolved.current = true
    const ticket = generation.current
    flights.current += 1
    abandoned.current = false
    setPending(true)
    setState((previous) => ({ ...previous, phase: 'submitting', approval: intent, error: null, receipt: null, submittedRequest: validated.data }))
    try {
      const receipt = await execute(validated.data)
      if (generation.current !== ticket) return
      if (receipt == null || (receipt.kind !== 'completed' && receipt.kind !== 'pending' && receipt.kind !== 'proposed' && receipt.kind !== 'refused')) {
        setState((previous) => ({ ...previous, phase: 'preview', error: ADMIN_ACTION_SHEET_COPY.unavailable }))
        return
      }
      unresolved.current = receipt.kind === 'pending'
      if (abandoned.current) {
        abandoned.current = false
        if (receipt.kind === 'refused' && receipt.code === 'mfa_reverification_required') return
        setState((previous) => ({ ...previous, phase: 'receipt', receipt, error: null }))
        return
      }
      setState((previous) => ({ ...previous, phase: 'receipt', receipt }))
    } catch (cause) {
      if (generation.current !== ticket) return
      const cancelled = isReverificationCancelledError(cause)
      unresolved.current = !cancelled
      if (abandoned.current) {
        abandoned.current = false
        if (!cancelled) {
          setState((previous) => ({ ...previous, phase: 'preview', error: ADMIN_ACTION_SHEET_COPY.unavailable }))
        }
        return
      }
      setState((previous) => ({
        ...previous,
        phase: 'preview',
        error: cancelled ? unchangedPreview() : ADMIN_ACTION_SHEET_COPY.unavailable,
      }))
    } finally {
      flights.current = Math.max(0, flights.current - 1)
      setPending(flights.current > 0)
    }
  }

  async function retry(newKey: boolean) {
    if (state.receipt?.kind === 'pending') {
      await submit()
      return
    }
    if (state.receipt?.kind !== 'refused') return
    const presentation = ADMIN_REFUSAL_PRESENTATION[state.receipt.code]
    if (presentation.retry === 'no') return
    if (newKey) {
      operationKey.current = createPrefixedRandomId('admin:')
      correlationId.current = createPrefixedRandomId('admin:correlation:')
      if (submittedRequest.current !== null) submittedRequest.current = { ...submittedRequest.current, operationKey: operationKey.current, correlationId: correlationId.current }
    }
    await submit()
  }

  function edit() {
    if (props.approval?.kind === 'approve' || state.receipt?.kind !== 'refused') return
    submittedRequest.current = null
    operationKey.current = createPrefixedRandomId('admin:')
    correlationId.current = createPrefixedRandomId('admin:correlation:')
    setState((previous) => ({ ...previous, phase: 'reason', receipt: null, error: null, approval: { kind: 'execute' }, submittedRequest: null }))
  }

  return {
    ...state, role, allowed, pending, minimized, resume: () => setMinimized(false), setReason, setEvidence,
    onOpenChange: (open) => {
      if (!open && (flights.current > 0 || unresolved.current)) {
        setMinimized(true)
        return
      }
      props.onOpenChange(open)
    },
    setTypedEvidence: (value) => { if (submittedRequest.current === null) setState((previous) => ({ ...previous, typedEvidence: value })) },
    next, back, submit, retry, edit,
  }
}
