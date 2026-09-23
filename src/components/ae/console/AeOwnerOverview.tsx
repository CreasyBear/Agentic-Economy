import { Link } from '@tanstack/react-router'
import { ActivityIcon, BotIcon, StoreIcon, WalletIcon } from 'lucide-react'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSection } from '@/components/ae/layout/AeSection'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

function OverviewCard({ title, description, value, action, icon: Icon, dominant = false }: Readonly<{
  title: string
  description: string
  value: string
  action: Readonly<{ label: string; href: string }>
  icon: typeof WalletIcon
  dominant?: boolean
}>) {
  return <Card className={dominant ? 'md:col-span-2' : undefined}>
    <CardHeader>
      <div className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4" aria-hidden="true" /><CardTitle>{title}</CardTitle></div>
      <CardDescription>{description}</CardDescription>
      <CardAction>
        <Link
          to={action.href}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'min-h-touch sm:min-h-8')}
        >
          {action.label}
        </Link>
      </CardAction>
    </CardHeader>
    <CardContent><p className={dominant ? 'text-4xl font-semibold tracking-tight tabular-nums' : 'text-2xl font-semibold tracking-tight tabular-nums'}>{value}</p></CardContent>
  </Card>
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
  const balanceValue = snapshot.balance.kind === 'available' ? formatDisplayAmount(snapshot.balance.amount) : 'Balance unavailable'
  const callsValue = snapshot.calls.kind === 'available'
    ? snapshot.calls.attention === 0
      ? snapshot.calls.complete ? 'No Calls need attention' : 'No attention in recent Calls'
      : countLabel(snapshot.calls.attention, 'Call needs attention', 'Calls need attention', snapshot.calls.complete)
    : 'Calls unavailable'
  const agentsValue = snapshot.agents.kind === 'available'
    ? countLabel(snapshot.agents.connected, 'connected Agent', 'connected Agents', snapshot.agents.complete)
    : 'Agents unavailable'

  return <AeOperatorPage operatorRole="owner" title="Overview" description="See what needs attention, your available Balance, and connected Agents." currentPath="/owner">
    <div className="grid gap-section pb-page">
      <AeSection title="Next step" description={next.description} className="rounded-xl border border-border bg-card p-gutter shadow-soft">
        <Link
          to={next.href}
          className={cn(buttonVariants(), 'w-fit min-h-touch')}
        >
          {next.label}
        </Link>
      </AeSection>
      <section aria-label="Account summary" className="grid gap-related md:grid-cols-2 xl:grid-cols-3">
        <OverviewCard title="Available Balance" description={snapshot.balance.kind === 'available' && snapshot.balance.locked ? 'Credit is recorded, but spending is temporarily locked.' : 'AUD credit available for authorized Agent Calls.'} value={balanceValue} action={{ label: 'Open Balance', href: '/owner/credit' }} icon={WalletIcon} dominant />
        <OverviewCard title="Calls" description="Work waiting for a decision appears before completed Calls." value={callsValue} action={{ label: 'Open Calls', href: '/activity' }} icon={ActivityIcon} />
        <OverviewCard title="Agents" description="See connected Agents and review their access." value={agentsValue} action={{ label: 'Open Agents', href: '/agent-access' }} icon={BotIcon} />
        {providerCard === undefined ? null : <OverviewCard title="Provider workspace" description={providerCard.description} value={providerCard.value} action={{ label: 'Open My Tools', href: '/owner/operations' }} icon={StoreIcon} />}
      </section>
      <ProviderSetupEntry provider={snapshot.provider} />
    </div>
  </AeOperatorPage>
}
