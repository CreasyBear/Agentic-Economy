import { adminObjectHref } from '@/lib/operator/admin-console/contracts'
import { formatPerthTimestamp } from '@/lib/ui/format-time'
import { parseCallRef, parseQuoteRef } from '@/modules/capability-execution/call-contracts'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import { isAccountRef } from '@/modules/principal-account/account/public'
import { isPrincipalRef } from '@/modules/principal-account/principal/public'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import {
  ADMIN_CALL_OBJECT_COPY,
  ADMIN_CALL_STATUS,
  type AdminCallFact,
  type AdminCallObjectViewModel,
  type AdminCallRelatedRef,
  type AdminCallObjectView,
  type AdminCallWireView,
} from './call-object.contracts'


export function toAdminCallObjectView(view: AdminCallWireView): AdminCallObjectView | null {
  const call = parseCallRef(view.ref)
  const quote = view.quoteRef === null ? null : parseQuoteRef(view.quoteRef)
  if (call.kind !== 'valid' || quote?.kind === 'malformed'
    || (view.toolRef !== null && !isPublicToolRef(view.toolRef))
    || (view.workspaceRef !== null && !isAccountRef(view.workspaceRef))
    || (view.agentRef !== null && !isPrincipalRef(view.agentRef))) return null
  return {
    ...view,
    ref: call.ref,
    quoteRef: quote?.ref ?? null,
    toolRef: view.toolRef,
    workspaceRef: view.workspaceRef,
    agentRef: view.agentRef,
  }
}

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
      value: formatPerthTimestamp(view.resolution.resolvedAt),
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
        at: formatPerthTimestamp(entry.at),
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
    href: adminObjectHref({ kind: 'quote', ref: view.quoteRef }),
  })
  if (view.toolRef !== null) refs.push({
    label: ADMIN_CALL_OBJECT_COPY.toolLabel,
    value: view.toolRef,
    href: adminObjectHref({ kind: 'tool_version', ref: view.toolRef }),
  })
  if (view.workspaceRef !== null) refs.push({
    label: ADMIN_CALL_OBJECT_COPY.workspaceLabel,
    value: view.workspaceRef,
    href: adminObjectHref({ kind: 'workspace', ref: view.workspaceRef }),
  })
  if (view.agentRef !== null) refs.push({
    label: ADMIN_CALL_OBJECT_COPY.agentLabel,
    value: view.agentRef,
    href: adminObjectHref({ kind: 'agent', ref: view.agentRef }),
  })
  if (view.correlationId !== null) refs.push({
    label: ADMIN_CALL_OBJECT_COPY.correlationLabel,
    value: view.correlationId,
  })
  return refs
}
