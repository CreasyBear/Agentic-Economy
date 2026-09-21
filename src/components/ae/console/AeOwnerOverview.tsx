import { Link } from '@tanstack/react-router'
import { ChevronRightIcon } from 'lucide-react'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSection } from '@/components/ae/layout/AeSection'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { formatDisplayAmount } from '@/modules/money/public'
import {
  countLabel,
  nextActionFor,
  ownerOverviewCopy,
  providerCardFor,
  type OwnerOverviewSnapshot,
} from '@/modules/principal-account/owner-overview.view-model'

export type AeOwnerOverviewProps = Readonly<{
  snapshot: OwnerOverviewSnapshot
}>

function OverviewFactRow({
  title,
  description,
  value,
  action,
}: Readonly<{
  title: string
  description: string
  value?: string
  action?: Readonly<{ label: string; href: string }>
}>) {
  return (
    <div className="flex flex-col gap-related border-b border-border py-related last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid min-w-0 flex-1 gap-intra">
        <span className="font-medium text-foreground">{title}</span>
        <span className="text-pretty text-sm text-muted-foreground">{description}</span>
      </div>
      <div className="flex flex-wrap items-center gap-related sm:justify-end">
        {value === undefined ? null : (
          <span className="font-mono text-base tabular-nums text-foreground">{value}</span>
        )}
        {action === undefined ? null : (
          <Link
            to={action.href}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              'min-h-touch gap-1 sm:min-h-8',
            )}
          >
            {action.label}
            <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        )}
      </div>
    </div>
  )
}


export function AeOwnerOverview({ snapshot }: AeOwnerOverviewProps) {
  const next = nextActionFor(snapshot)
  const providerCard = providerCardFor(snapshot.provider)
  const balanceValue = snapshot.balance.kind === 'available' ? formatDisplayAmount(snapshot.balance.amount) : 'Credit unavailable'
  const callsValue = snapshot.calls.kind === 'available'
    ? snapshot.calls.attention === 0
      ? snapshot.calls.complete ? 'No Calls need attention' : 'No attention in recent Calls'
      : countLabel(snapshot.calls.attention, 'Call needs attention', 'Calls need attention', snapshot.calls.complete)
    : 'Calls unavailable'
  const agentsValue = snapshot.agents.kind === 'unavailable' ? 'Agents unavailable' : undefined
  const agentsAction = snapshot.agents.kind === 'available'
    ? snapshot.agents.connected > 0
      ? { label: ownerOverviewCopy.reviewSpendingPolicy, href: '/agent-access' }
      : snapshot.agents.complete
        ? { label: ownerOverviewCopy.connectAgent, href: '/agent-access' }
        : { label: ownerOverviewCopy.checkAgents, href: '/agent-access' }
    : { label: ownerOverviewCopy.checkAgents, href: '/agent-access' }

  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Overview"
      description={ownerOverviewCopy.description}
      currentPath="/owner"
    >
      <div className="grid gap-section pb-page">
        <AeSection title="Next step" description={next.description}>
          <Link to={next.href} className={cn(buttonVariants(), 'w-fit min-h-touch')}>
            {next.label}
          </Link>
        </AeSection>
        <section aria-label="Account summary" className="border-y border-border">
          <OverviewFactRow
            title="Available Credit"
            description={
              snapshot.balance.kind === 'unavailable'
                ? ownerOverviewCopy.nothingCharged
                : snapshot.balance.locked
                  ? 'Credit is recorded, but spending is temporarily locked.'
                  : 'AUD credit available for authorized Agent Calls.'
            }
            value={balanceValue}
            {...(next.href.startsWith('/owner/credit') ? {} : { action: { label: ownerOverviewCopy.checkCredit, href: '/owner/credit' } })}
          />
          <OverviewFactRow
            title="Calls"
            description={snapshot.calls.kind === 'unavailable' ? ownerOverviewCopy.nothingCharged : 'Work waiting for a decision appears before completed Calls.'}
            value={callsValue}
            action={{ label: 'Open Calls', href: '/activity' }}
          />
          <OverviewFactRow
            title="Agents"
            description="See connected Agents and review their access."
            {...(agentsValue === undefined ? {} : { value: agentsValue })}
            action={agentsAction}
          />
          {providerCard === undefined ? null : (
            <OverviewFactRow
              title="Provider workspace"
              description={providerCard.description}
              value={providerCard.value}
              action={{ label: 'Open My Tools', href: '/owner/operations' }}
            />
          )}
        </section>
      </div>
    </AeOperatorPage>
  )
}
