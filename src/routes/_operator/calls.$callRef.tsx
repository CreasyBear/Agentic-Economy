import { createFileRoute } from '@tanstack/react-router'

import {
  CallStatusFoundView,
  CallStatusRefusedView,
  CallStatusUnavailableView,
  CallStatusUnchangedView,
} from '@/components/ae/call-receipt/CallStatusViews'
import { CallReceiptWorkspace } from '@/components/ae/call-receipt/CallReceiptWorkspace'
import { useCallStatusRecovery } from '@/hooks/useCallStatusRecovery'
import type {
  CallReconciliationForm,
  CallStatusPageActions,
  CallStatusPageResult,
} from '@/lib/call-recovery/call-status-page-types'
import { readOwnerCallStatusServer } from '@/modules/capability-execution/call-recovery.functions'

export type { CallReconciliationForm, CallStatusPageActions, CallStatusPageResult }

export const Route = createFileRoute('/_operator/calls/$callRef')({
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
  return <CallStatusRouteBody key={loadedResult.callRef} loadedResult={loadedResult} />
}

function CallStatusRouteBody({ loadedResult }: Readonly<{ loadedResult: CallStatusPageResult }>) {
  const { result, actions } = useCallStatusRecovery(loadedResult)
  return <CallStatusPage result={result} actions={actions} />
}

export function CallStatusPage({
  result,
  actions,
}: Readonly<{ result: CallStatusPageResult; actions?: CallStatusPageActions }>) {
  if (result.kind === 'source_unavailable') return <CallStatusUnavailableView result={result} {...(actions === undefined ? {} : { actions })} />
  if (result.kind === 'refused') return <CallStatusRefusedView result={result} {...(actions === undefined ? {} : { actions })} />
  if (result.kind === 'unchanged') return <CallStatusUnchangedView result={result} {...(actions === undefined ? {} : { actions })} />
  return <CallStatusFoundView result={result} {...(actions === undefined ? {} : { actions })} />
}

function CallStatusPending() {
  const { callRef } = Route.useParams()
  return (
    <CallReceiptWorkspace callRef={callRef} description="Checking the exact current owner-scoped Call receipt." pending>
      <section className="py-page" aria-busy="true" aria-live="polite">
        <p className="text-muted-foreground">Checking the exact current owner-scoped Call receipt…</p>
      </section>
    </CallReceiptWorkspace>
  )
}

function CallStatusError() {
  const { callRef } = Route.useParams()
  return <CallStatusUnavailableView result={{ kind: 'source_unavailable', callRef }} />
}
