import { useQuery } from 'convex/react'
import { useEffect, useRef, useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import { ADMIN_ACTION_PERMISSION } from '@/lib/operator/admin-console/contracts'
import { ADMIN_REFUSAL_PRESENTATION } from '@/lib/operator/admin-console/refusal-presentation'
import { createPrefixedRandomId } from '@/modules/common/random-id'
import { canAdminRolePerformAction } from '@/modules/security/public'
import {
  ADMIN_REASON_OPTIONS,
  adminCommandRequestSchema,
  type AdminActionSheetController,
  type AdminActionSheetProps,
  type AdminActionSheetState,
} from './actions.contracts'
import { useAdminCommandProof } from './useAdminCommandProof'

export function useAdminActionSheet(props: AdminActionSheetProps): AdminActionSheetController {
  const access = useQuery(api.adminConsoleAudit.readAdminAuditAccess, {})
  const overview = useQuery(api.adminConsoleOverview.readAdminOverview, {})
  const clerkFvaAbsent = overview !== undefined && 'clerkFva' in overview && overview.clerkFva === 'absent'
  const role = access?.kind === 'allowed' ? access.role : null
  const allowed = role !== null && canAdminRolePerformAction(role, ADMIN_ACTION_PERMISSION[props.action])
  const execute = useAdminCommandProof()
  const operationKey = useRef(createPrefixedRandomId('admin:'))
  const correlationId = useRef(createPrefixedRandomId('admin:correlation:'))
  const [state, setState] = useState<AdminActionSheetState>({
    phase: props.approval?.kind === 'approve' ? 'preview' : 'reason', reasonCode: props.initialReasonCode ?? '',
    evidenceRefs: props.initialEvidenceRefs ?? [], typedEvidence: '', receipt: null,
    error: null, approval: props.approval ?? { kind: 'execute' },
  })

  useEffect(() => {
    if (!props.open) return
    operationKey.current = createPrefixedRandomId('admin:')
    correlationId.current = createPrefixedRandomId('admin:correlation:')
    setState({
      phase: props.approval?.kind === 'approve' ? 'preview' : 'reason', reasonCode: props.initialReasonCode ?? '',
      evidenceRefs: props.initialEvidenceRefs ?? [], typedEvidence: '', receipt: null,
      error: null, approval: props.approval ?? { kind: 'execute' },
    })
  }, [props.open])

  function setReason(value: string) {
    if (props.approval?.kind === 'approve') return
    if (!ADMIN_REASON_OPTIONS[props.action].some((reason) => reason === value)) return
    setState((previous) => ({ ...previous, reasonCode: value, error: null }))
  }

  function setEvidence(value: string, selected: boolean) {
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

  function back() {
    if (props.approval?.kind === 'approve' && state.phase !== 'confirm') return
    setState((previous) => ({ ...previous, error: null, phase:
      previous.phase === 'confirm' ? 'preview'
        : previous.phase === 'preview' ? 'proof'
          : previous.phase === 'proof' ? 'evidence' : 'reason',
    }))
  }

  async function submit(intent = state.approval) {
    if (props.approval?.kind === 'approve' && intent.kind !== 'approve') return
    if (intent.kind !== state.approval.kind) {
      operationKey.current = createPrefixedRandomId('admin:')
      correlationId.current = createPrefixedRandomId('admin:correlation:')
    }
    if (!allowed || state.phase === 'submitting') return
    const validated = adminCommandRequestSchema.safeParse({
      action: props.action, input: props.input, reasonCode: state.reasonCode,
      evidenceRefs: state.evidenceRefs,
      ...(props.currentStateDigest === undefined ? {} : { expectedStateDigest: props.currentStateDigest }),
      approval: intent, operationKey: operationKey.current, correlationId: correlationId.current,
    })
    if (!validated.success) {
      setState((previous) => ({ ...previous, error: 'Review the reason, evidence and command details before submitting.' }))
      return
    }
    setState((previous) => ({ ...previous, phase: 'submitting', approval: intent, error: null }))
    try {
      const receipt = await execute(validated.data)
      setState((previous) => ({ ...previous, phase: 'receipt', receipt }))
    } catch (cause) {
      void cause
      setState((previous) => ({ ...previous, phase: 'preview', error: 'Command outcome could not be confirmed. Review the current record before retrying.' }))
    }
  }

  async function retry(newKey: boolean) {
    if (state.receipt?.kind !== 'refused') return
    const presentation = ADMIN_REFUSAL_PRESENTATION[state.receipt.code]
    if (presentation.retry === 'no') return
    if (newKey) operationKey.current = createPrefixedRandomId('admin:')
    correlationId.current = createPrefixedRandomId('admin:correlation:')
    await submit()
  }

  function edit() {
    if (props.approval?.kind === 'approve' || state.receipt?.kind !== 'refused') return
    operationKey.current = createPrefixedRandomId('admin:')
    correlationId.current = createPrefixedRandomId('admin:correlation:')
    setState((previous) => ({ ...previous, phase: 'reason', receipt: null, error: null, approval: { kind: 'execute' } }))
  }

  return {
    ...state, role, allowed, clerkFvaAbsent, setReason, setEvidence,
    setTypedEvidence: (value) => setState((previous) => ({ ...previous, typedEvidence: value })),
    next, back, submit, retry, edit,
  }
}
