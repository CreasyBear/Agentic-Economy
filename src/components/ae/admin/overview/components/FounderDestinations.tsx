import { useState } from 'react'
import { ActivityIcon, BookOpenCheckIcon, ChartNoAxesCombinedIcon, CirclePauseIcon, CirclePlayIcon, PanelsTopLeftIcon, ReceiptTextIcon, StoreIcon, UsersRoundIcon, WalletCardsIcon } from 'lucide-react'
import { AeSection } from '@/components/ae/layout/AeSection'
import { OrbitLogos, type OrbitLogo } from '@/components/ae/shared/arc-pro/orbit-logos/orbit-logos'
import { readObservabilityClientConfig } from '@/lib/observability/config'
import styles from './FounderDestinations.module.css'

export function FounderDestinations() {
  const [paused, setPaused] = useState(false)
  const config = readObservabilityClientConfig()
  const analyticsUrl = safeAnalyticsUrl(config.posthogAppUrl ?? 'https://us.posthog.com/project/491802/dashboard/1778627')
  const destinations: OrbitLogo[] = [
    { id: 'treasury', name: 'Treasury', icon: <WalletCardsIcon />, category: 'Money', color: 'var(--orbit-mint)',
      description: 'Available funds, purchased and promotional credit, settlement liquidity and reconciliation.',
      href: '/admin/treasury', actionLabel: 'Open treasury' },
    { id: 'purchases', name: 'Purchases', icon: <ReceiptTextIcon />, category: 'Customers', color: 'var(--orbit-blue)',
      description: 'Follow a purchase from the first Call through delivery, payment and resolution.',
      href: '/admin/activity', actionLabel: 'Explore purchases' },
    { id: 'accounts', name: 'Accounts', icon: <UsersRoundIcon />, category: 'Customers', color: 'var(--orbit-blue)',
      description: 'Find the Account behind a purchase and inspect its activity.',
      href: '/admin/accounts', actionLabel: 'Find Accounts' },
    { id: 'providers', name: 'Providers', icon: <StoreIcon />, category: 'Operations', color: 'var(--orbit-peach)',
      description: 'Inspect supply, Tool versions, connections and review cases.',
      href: '/admin/providers', actionLabel: 'Explore Providers' },
    { id: 'exceptions', name: 'Review queues', icon: <PanelsTopLeftIcon />, category: 'Operations', color: 'var(--orbit-peach)',
      description: 'Open delivery, source-authority and policy cases that need an operator decision.',
      href: '/admin/exceptions', actionLabel: 'Open queues' },
    { id: 'audit', name: 'Audit', icon: <BookOpenCheckIcon />, category: 'Operations', color: 'var(--orbit-peach)',
      description: 'See who did what, when it happened, and the evidence behind the action.',
      href: '/admin/audit-events', actionLabel: 'Inspect audit events' },
    ...(analyticsUrl === null ? [] : [{ id: 'posthog', name: 'PostHog', icon: <ChartNoAxesCombinedIcon />, category: 'Signals', color: 'var(--orbit-violet)',
      description: config.enabled && config.posthogKey
        ? 'Browser analytics is configured. Inspect traffic sources, routes and interaction. Configuration does not prove event receipt.'
        : 'PostHog is not connected in this web deployment. Marketplace records remain available independently.',
      href: analyticsUrl, actionLabel: 'Open PostHog', external: true }]),
    { id: 'sentry', name: 'Sentry', icon: <ActivityIcon />, category: 'Signals', color: 'var(--orbit-violet)',
      description: config.enabled && config.sentryDsn
        ? 'Error reporting is configured. Inspect issues and alert delivery. Configuration does not prove receipt.'
        : 'Error reporting is not connected in this web deployment. Check Sentry setup before launch.',
      href: 'https://agentic-economy.sentry.io/issues/?project=4511653575393280', actionLabel: 'Open Sentry', external: true },
  ]
  return <AeSection title="Your orbit" description="Money, people, supply and signals. Pick a destination." className="min-w-0">
    <div className={`ae-arc ${styles.surface}`}>
      <OrbitLogos logos={destinations} label="Operating tools" paused={paused} speed={.65}
        center={<img src="/brand/aecon-symbol-forest-compact.svg" alt="" className={styles.mark} />} />
      <div className={styles.footer}>
        <span>Move around. Get the full picture.</span>
        <button type="button" className={styles.motionControl} aria-pressed={paused} onClick={() => setPaused(value => !value)}>
          {paused ? <CirclePlayIcon aria-hidden="true" /> : <CirclePauseIcon aria-hidden="true" />}
          {paused ? 'Resume motion' : 'Pause motion'}
        </button>
      </div>
    </div>
  </AeSection>
}

function safeAnalyticsUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch { return null }
}
