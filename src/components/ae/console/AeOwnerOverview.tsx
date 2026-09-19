import { Link } from '@tanstack/react-router'
import { ActivityIcon, BotIcon, StoreIcon, WalletIcon } from 'lucide-react'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSection } from '@/components/ae/layout/AeSection'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDisplayAmount, type ExactAmount } from '@/modules/money/public'

export type OwnerOverviewSnapshot = Readonly<{
  balance: Readonly<{ kind: 'available'; amount: ExactAmount; locked: boolean }> | Readonly<{ kind: 'unavailable' }>
  calls: Readonly<{ kind: 'available'; attention: number; loaded: number; complete: boolean }> | Readonly<{ kind: 'unavailable' }>
  agents: Readonly<{ kind: 'available'; connected: number; complete: boolean }> | Readonly<{ kind: 'unavailable' }>
  provider?: Readonly<{ kind: 'available'; name: string; tools: number }> | Readonly<{ kind: 'attention' }> | Readonly<{ kind: 'unavailable' }>
}>

type NextAction = Readonly<{ label: string; description: string; href: string }>
type ProviderCard = Readonly<{ description: string; value: string }>

function nextActionFor(snapshot: OwnerOverviewSnapshot): NextAction {
  if (snapshot.calls.kind === 'available' && snapshot.calls.attention > 0) {
    return { label: snapshot.calls.attention === 1 ? 'Review Call' : 'Review Calls', description: 'Resolve the Call that is waiting for a confirmed outcome.', href: '/activity' }
  }
  if (snapshot.calls.kind === 'unavailable' || !snapshot.calls.complete) {
    return { label: 'Check Calls', description: 'Confirm there is no unresolved Call before starting another purchase.', href: '/activity' }
  }
  if (snapshot.agents.kind === 'unavailable') {
    return { label: 'Check Agents', description: 'Confirm an Agent is connected before starting a purchase.', href: '/agent-access' }
  }
  if (!snapshot.agents.complete && snapshot.agents.connected === 0) {
    return { label: 'Check Agents', description: 'Finish checking the Agent directory before connecting another Agent.', href: '/agent-access' }
  }
  if (snapshot.agents.connected === 0) {
    return { label: 'Connect an Agent', description: 'Connect the Agent that will request Quotes and make Calls under your limits.', href: '/agent-access' }
  }
  if (snapshot.balance.kind === 'unavailable' || snapshot.balance.locked) {
    return { label: 'Check Balance', description: 'Confirm available credit before asking your Agent to make a Call.', href: '/owner/credit' }
  }
  if (snapshot.balance.amount.units === '0') {
    return { label: 'Add credit', description: 'Fund the AUD Balance your connected Agent can use within its spending policy.', href: '/owner/credit#fund' }
  }
  return { label: 'Explore Market', description: 'Describe the service you need, inspect a Tool, then continue with your Agent.', href: '/owner/market' }
}

function countLabel(count: number, singular: string, plural: string, complete: boolean) {
  return `${complete ? '' : 'At least '}${count.toLocaleString('en-AU')} ${count === 1 ? singular : plural}`
}

function providerCardFor(provider: OwnerOverviewSnapshot['provider']): ProviderCard | undefined {
  if (provider === undefined) return undefined
  if (provider.kind === 'attention') return { description: 'Provider state needs review.', value: 'Needs attention' }
  if (provider.kind === 'unavailable') return { description: 'Provider status could not be confirmed. Existing Tools remain available to inspect.', value: 'Status unavailable' }
  return {
    description: 'Supply status is shown only because this Account has Provider state.',
    value: `${provider.name} · ${provider.tools.toLocaleString('en-AU')} ${provider.tools === 1 ? 'Tool' : 'Tools'}`,
  }
}

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

export function AeOwnerOverview({ snapshot }: Readonly<{ snapshot: OwnerOverviewSnapshot }>) {
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
