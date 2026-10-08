import { createFileRoute } from '@tanstack/react-router'
import { PlanOwnerPage } from '@/components/ae/plans/PlanOwnerPage'
import { PlanRunSkeleton } from '@/components/ae/plans/plan-run/PlanRunSkeleton'
import { PlanReceiptSkeleton } from '@/components/ae/plans/plan-receipt/PlanReceiptSkeleton'
import { readOwnerPlanServer } from '@/modules/capability-execution/plan/owner.functions'
import { activityReturnScopeSchema } from '@/lib/call-recovery/activity-return-scope'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/plans/$planRef')({
  ...operatorRouteOptions,
  validateSearch: activityReturnScopeSchema,
  loader: ({ params }) => readOwnerPlanServer({ data: { planRef: params.planRef } }),
  head: () => ({ meta: [{ title: 'Tool Plan | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  pendingComponent: () => <div className="grid gap-8"><PlanRunSkeleton /><PlanReceiptSkeleton /></div>,
  component: PlanRoute,
})
function PlanRoute() {
  const { planRef } = Route.useParams()
  return <PlanOwnerPage key={planRef} initial={Route.useLoaderData()} planRef={planRef} returnScope={Route.useSearch()} />
}
