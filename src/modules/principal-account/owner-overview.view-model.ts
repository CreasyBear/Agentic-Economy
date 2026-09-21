export type OwnerOverviewAmount = Readonly<{
  currency: string
  units: string
  exponent: number
}>

export type OwnerOverviewBalanceSnapshot =
  | Readonly<{ kind: 'available'; amount: OwnerOverviewAmount; locked: boolean }>
  | Readonly<{ kind: 'unavailable' }>

export type OwnerOverviewCallsSnapshot =
  | Readonly<{ kind: 'available'; attention: number; loaded: number; complete: boolean }>
  | Readonly<{ kind: 'unavailable' }>

export type OwnerOverviewAgentsSnapshot =
  | Readonly<{ kind: 'available'; connected: number; complete: boolean }>
  | Readonly<{ kind: 'unavailable' }>

export type OwnerOverviewProviderSnapshot =
  | Readonly<{ kind: 'available'; name: string; tools: number }>
  | Readonly<{ kind: 'attention' }>
  | Readonly<{ kind: 'unavailable' }>

export type OwnerOverviewSnapshot = Readonly<{
  balance: OwnerOverviewBalanceSnapshot
  calls: OwnerOverviewCallsSnapshot
  agents: OwnerOverviewAgentsSnapshot
  provider?: OwnerOverviewProviderSnapshot
}>

export type OwnerOverviewNextAction = Readonly<{
  label: string
  description: string
  href: string
}>

export type OwnerOverviewProviderCard = Readonly<{
  description: string
  value: string
}>

export function countLabel(
  count: number,
  singular: string,
  plural: string,
  complete: boolean,
): string {
  return `${complete ? '' : 'At least '}${count.toLocaleString('en-AU')} ${count === 1 ? singular : plural}`
}

export function nextActionFor(snapshot: OwnerOverviewSnapshot): OwnerOverviewNextAction {
  if (snapshot.calls.kind === 'available' && snapshot.calls.attention > 0) {
    return {
      label: snapshot.calls.attention === 1 ? 'Review Call' : 'Review Calls',
      description: 'Resolve the Call that is waiting for a confirmed outcome.',
      href: '/activity',
    }
  }
  if (snapshot.calls.kind === 'unavailable' || !snapshot.calls.complete) {
    return {
      label: 'Check Calls',
      description: 'Confirm there is no unresolved Call before starting another purchase.',
      href: '/activity',
    }
  }
  if (snapshot.agents.kind === 'unavailable') {
    return {
      label: 'Check Agents',
      description: 'Confirm an Agent is connected before starting a purchase.',
      href: '/agent-access',
    }
  }
  if (!snapshot.agents.complete && snapshot.agents.connected === 0) {
    return {
      label: 'Check Agents',
      description: 'Finish checking the Agent directory before connecting another Agent.',
      href: '/agent-access',
    }
  }
  if (snapshot.agents.connected === 0) {
    return {
      label: 'Connect an Agent',
      description: 'Connect the Agent that will request Quotes and make Calls under your limits.',
      href: '/agent-access',
    }
  }
  if (snapshot.balance.kind === 'unavailable' || snapshot.balance.locked) {
    return {
      label: 'Check Credit',
      description: 'Confirm available credit before asking your Agent to make a Call.',
      href: '/owner/credit',
    }
  }
  if (snapshot.balance.amount.units === '0') {
    return {
      label: 'Add credit',
      description: 'Fund the AUD Credit your connected Agent can use within its Spending policy.',
      href: '/owner/credit#fund',
    }
  }
  return {
    label: 'Explore Market',
    description: 'Describe the service you need, inspect a Tool, then continue with your Agent.',
    href: '/market',
  }
}

export function providerCardFor(
  provider: OwnerOverviewSnapshot['provider'],
): OwnerOverviewProviderCard | undefined {
  if (provider === undefined) return undefined
  switch (provider.kind) {
    case 'attention':
      return { description: 'Provider state needs review.', value: 'Needs attention' }
    case 'unavailable':
      return {
        description: 'Provider status could not be confirmed. Existing Tools remain available to inspect.',
        value: 'Status unavailable',
      }
    case 'available':
      return {
        description: 'Supply status is shown only because this Account has Provider state.',
        value: `${provider.name} · ${provider.tools.toLocaleString('en-AU')} ${provider.tools === 1 ? 'Tool' : 'Tools'}`,
      }
    default: {
      const _exhaustive: never = provider
      return _exhaustive
    }
  }
}
