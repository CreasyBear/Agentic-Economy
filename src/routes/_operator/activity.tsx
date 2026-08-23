import { Link, createFileRoute } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readAgentAccessConsoleServer } from '@/modules/agent-access/agent-access-console'
import { formatExactAmount, type CreditActivityView } from '@/modules/money/public'

export const Route = createFileRoute('/_operator/activity')({
  ...operatorRouteOptions,
  loader: () => readAgentAccessConsoleServer(),
  head: () => ({ meta: [
    { title: 'Activity | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: ActivityRoute,
})

function ActivityRoute() {
  const readbacks = Route.useLoaderData()
  const activity = readbacks
    .flatMap((readback) => readback.activity)
    .toSorted((left, right) => right.observedAt - left.observedAt)

  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Activity"
      description="Your agent’s calls in task language, with the amount, outcome, and durable receipt together."
      currentPath="/activity"
    >
      {activity.length === 0 ? <EmptyActivity /> : (
        <ol className="m-0 grid list-none divide-y rounded-lg border bg-card p-0">
          {activity.map((item) => <ActivityRow key={item.activityRef} item={item} />)}
        </ol>
      )}
    </AeOperatorShell>
  )
}

function ActivityRow({ item }: { item: CreditActivityView }) {
  const amount = formatExactAmount(item.grossAmount) ?? item.grossAmount.units
  return (
    <li className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
      <div className="min-w-0">
        <p className="font-medium text-foreground">
          {taskLabel(item.operationKey)} — {item.grossAmount.currency} {amount} — {chargeLabel(item.chargeState)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(item.observedAt).toLocaleString()} · receipt {shortReference(item.invocationRef)}
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/operations/invocations/$invocationRef" params={{ invocationRef: item.invocationRef }}>View receipt</Link>
      </Button>
    </li>
  )
}

function EmptyActivity() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>No calls yet</EmptyTitle>
        <EmptyDescription>Find a capability and complete one call. Its task, outcome, amount, and receipt will appear here.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild><Link to="/market" search={{ window: '30d' }}>Discover capabilities</Link></Button>
      </EmptyContent>
    </Empty>
  )
}

function taskLabel(operationKey: string): string {
  const words = operationKey.replaceAll(/[._:/-]+/g, ' ').trim()
  return words.length === 0 ? 'Used a capability' : `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

function chargeLabel(state: CreditActivityView['chargeState']): string {
  if (state === 'free_tier') return 'completed free'
  if (state === 'paid') return 'completed'
  if (state === 'refunded') return 'refunded'
  if (state === 'outcome_unknown') return 'payment being verified'
  if (state === 'insufficient_credit') return 'not run · funding required'
  return state
}

function shortReference(reference: string): string {
  return reference.length <= 20 ? reference : `${reference.slice(0, 10)}…${reference.slice(-6)}`
}
