import { getStatusPresentation } from '@/lib/ui/status-presentation'
import {
  ADMIN_CALL_OBJECT_COPY,
  ADMIN_CALL_STATUS,
  type AdminCallFact,
  type AdminCallObjectViewModel,
  type AdminCallRelatedRef,
  type AdminCallObjectView,
} from './call-object.contracts'

const perthTimestamp = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Australia/Perth',
})

export function buildAdminCallObjectViewModel(view: AdminCallObjectView): AdminCallObjectViewModel {
  const facts: AdminCallFact[] = [
    {
      label: ADMIN_CALL_OBJECT_COPY.statusDetailLabel,
      value: view.receipt.statusDetail,
    },
  ]
  if (view.receipt.resultKind !== undefined) {
    facts.push({
      label: ADMIN_CALL_OBJECT_COPY.resultKindLabel,
      value: view.receipt.resultKind,
      mono: true,
    })
  }
  if (view.resolution !== null) {
    facts.push({
      label: ADMIN_CALL_OBJECT_COPY.purchaseResolutionLabel,
      value: view.resolution.resolutionRef,
      mono: true,
    })
    facts.push({
      label: ADMIN_CALL_OBJECT_COPY.resolvedAtLabel,
      value: perthTimestamp.format(new Date(view.resolution.resolvedAt)),
    })
  }

  return {
    view,
    status: getStatusPresentation(ADMIN_CALL_STATUS[view.state]),
    facts,
    moneyTruth: view.purchase.kind === 'uncertain'
      ? view.receipt.issue?.moneyMovement ?? view.receipt.statusDetail
      : null,
    relatedRefs: relatedRefs(view),
    activity: view.timeline
      .map((entry, index) => ({
        id: `${entry.at}:${index}:${entry.eventType}`,
        at: perthTimestamp.format(new Date(entry.at)),
        eventType: entry.eventType,
        actorRef: entry.actorRef ?? ADMIN_CALL_OBJECT_COPY.notRecorded,
        outcome: entry.outcome ?? ADMIN_CALL_OBJECT_COPY.notRecorded,
        sortAt: entry.at,
      }))
      .sort((left, right) => right.sortAt - left.sortAt)
      .map(({ sortAt: _sortAt, ...row }) => row),
  }
}

function relatedRefs(view: AdminCallObjectView): readonly AdminCallRelatedRef[] {
  const refs: AdminCallRelatedRef[] = []
  if (view.quoteRef !== null) refs.push({
    label: ADMIN_CALL_OBJECT_COPY.quoteLabel,
    value: view.quoteRef,
    href: `/admin/quotes/${encodeURIComponent(view.quoteRef)}`,
  })
  if (view.toolRef !== null) refs.push({
    label: ADMIN_CALL_OBJECT_COPY.toolLabel,
    value: view.toolRef,
    href: `/admin/tools/${encodeURIComponent(view.toolRef)}`,
  })
  if (view.workspaceRef !== null) refs.push({
    label: ADMIN_CALL_OBJECT_COPY.workspaceLabel,
    value: view.workspaceRef,
    href: `/admin/workspaces/${encodeURIComponent(view.workspaceRef)}`,
  })
  if (view.agentRef !== null) refs.push({
    label: ADMIN_CALL_OBJECT_COPY.agentLabel,
    value: view.agentRef,
    href: `/admin/agents/${encodeURIComponent(view.agentRef)}`,
  })
  if (view.correlationId !== null) refs.push({
    label: ADMIN_CALL_OBJECT_COPY.correlationLabel,
    value: view.correlationId,
  })
  return refs
}
