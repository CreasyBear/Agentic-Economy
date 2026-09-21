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
  value: string
  action: Readonly<{ label: string; href: string }>
}>) {
  return (
    <div className="flex flex-col gap-related border-b border-border py-related last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid min-w-0 flex-1 gap-intra">
        <span className="font-medium text-foreground">{title}</span>
        <span className="text-pretty text-sm text-muted-foreground">{description}</span>
      </div>
      <div className="flex flex-wrap items-center gap-related sm:justify-end">
        <span className="font-mono text-base tabular-nums text-foreground">{value}</span>
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
      </div>
    </div>
  )
}

function ProviderSetupEntry({ provider }: Readonly<{ provider: OwnerOverviewSnapshot['provider'] }>) {
  if (provider !== undefined) return null
  return (
    <aside aria-label="Provider setup" className="flex flex-col gap-related border-t border-border pt-related sm:flex-row sm:items-center sm:justify-between">
      <div className="grid gap-intra">
        <p className="text-sm font-medium text-foreground">Want to offer a service?</p>
        <p className="text-sm text-muted-foreground">Start a separate Provider setup when you are ready to publish a Tool.</p>
      </div>
      <Link
        to="/owner/operations"
        className={cn(buttonVariants({ variant: 'outline' }), 'w-fit min-h-touch')}
      >
        Offer a Tool
      </Link>
    </aside>
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
  const agentsValue = snapshot.agents.kind === 'available'
    ? countLabel(snapshot.agents.connected, 'connected Agent', 'connected Agents', snapshot.agents.complete)
    : 'Agents unavailable'

  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Overview"
      description="See what needs attention, your available Credit, and connected Agents."
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
              snapshot.balance.kind === 'available' && snapshot.balance.locked
                ? 'Credit is recorded, but spending is temporarily locked.'
                : 'AUD credit available for authorized Agent Calls.'
            }
            value={balanceValue}
            action={{ label: 'Open Credit', href: '/owner/credit' }}
          />
          <OverviewFactRow
            title="Calls"
            description="Work waiting for a decision appears before completed Calls."
            value={callsValue}
            action={{ label: 'Open Calls', href: '/activity' }}
          />
          <OverviewFactRow
            title="Agents"
            description="See connected Agents and review their access."
            value={agentsValue}
            action={{ label: 'Open Agents', href: '/agent-access' }}
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
        <ProviderSetupEntry provider={snapshot.provider} />
      </div>
    </AeOperatorPage>
  )
}
