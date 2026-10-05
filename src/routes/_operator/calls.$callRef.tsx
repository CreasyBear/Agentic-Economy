import { activityReturnScopeSchema, type ActivityReturnScope } from '@/lib/call-recovery/activity-return-scope'
import { createFileRoute } from '@tanstack/react-router'

import {
  CallStatusFoundView,
  CallStatusRefusedView,
  CallStatusUnavailableView,
  CallStatusUnchangedView,
} from '@/components/ae/call-receipt/CallStatusViews'
import { CallReceiptWorkspace } from '@/components/ae/call-receipt/CallReceiptWorkspace'
import { CallReceiptSkeleton } from '@/components/ae/call-receipt/CallReceiptSkeleton'
import { useCallStatusRecovery } from '@/hooks/useCallStatusRecovery'
import type {
  CallReconciliationForm,
  CallStatusPageActions,
  CallStatusPageResult,
} from '@/lib/call-recovery/call-status-page-types'
import { readOwnerCallStatusServer } from '@/modules/capability-execution/call-recovery.functions'

export type { CallReconciliationForm, CallStatusPageActions, CallStatusPageResult }

export const Route = createFileRoute('/_operator/calls/$callRef')({
  validateSearch: activityReturnScopeSchema,
  loader: ({ params }) => readOwnerCallStatusServer({ data: { callRef: params.callRef } })
    .catch((): CallStatusPageResult => ({
      kind: 'source_unavailable',
      callRef: params.callRef,
    })),
  head: () => ({ meta: [
    { title: 'Call receipt | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  pendingComponent: CallStatusPending,
  errorComponent: CallStatusError,
  component: CallStatusRoute,
})

function CallStatusRoute() {
  const loadedResult = Route.useLoaderData()
  return <CallStatusRouteBody key={loadedResult.callRef} loadedResult={loadedResult} returnScope={Route.useSearch()} />
}

function CallStatusRouteBody({ loadedResult, returnScope }: Readonly<{ loadedResult: CallStatusPageResult; returnScope: ActivityReturnScope }>) {
  const { result, actions } = useCallStatusRecovery(loadedResult)
  return <CallStatusPage result={result} actions={actions} returnScope={returnScope} />
}

export function CallStatusPage({
  result,
  actions,
  returnScope,
}: Readonly<{ result: CallStatusPageResult; actions?: CallStatusPageActions; returnScope?: ActivityReturnScope }>) {
  if (result.kind === 'source_unavailable') return <CallStatusUnavailableView {...(returnScope === undefined ? {} : { returnScope })} result={result} {...(actions === undefined ? {} : { actions })} />
  if (result.kind === 'refused') return <CallStatusRefusedView {...(returnScope === undefined ? {} : { returnScope })} result={result} {...(actions === undefined ? {} : { actions })} />
  if (result.kind === 'unchanged') return <CallStatusUnchangedView {...(returnScope === undefined ? {} : { returnScope })} result={result} {...(actions === undefined ? {} : { actions })} />
  return <CallStatusFoundView {...(returnScope === undefined ? {} : { returnScope })} result={result} {...(actions === undefined ? {} : { actions })} />
}

function CallStatusPending() {
  const { callRef } = Route.useParams()
  return (
    <CallReceiptWorkspace returnScope={Route.useSearch()} callRef={callRef} description="Checking the exact current owner-scoped Call receipt." pending>
      <CallReceiptSkeleton />
    </CallReceiptWorkspace>
  )
}

function CallStatusError() {
  const { callRef } = Route.useParams()
  return <CallStatusUnavailableView returnScope={Route.useSearch()} result={{ kind: 'source_unavailable', callRef }} />
}
