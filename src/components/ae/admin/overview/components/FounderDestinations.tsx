import { Link } from '@tanstack/react-router'
import { ArrowUpRightIcon } from 'lucide-react'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'
import { readObservabilityClientConfig } from '@/lib/observability/config'

export function FounderDestinations() {
  const config = readObservabilityClientConfig()
  const analyticsUrl = safeAnalyticsUrl(config.posthogAppUrl ?? 'https://us.posthog.com/project/491802/dashboard/1778627')
  return <AeSection title="Run the business" description="Money, customer issues and the evidence behind the numbers.">
    <div className="grid gap-section md:grid-cols-2 xl:grid-cols-4">
      <div className="flex flex-col items-start gap-related">
        <h3 className="font-medium">Money and coverage</h3>
        <p className="text-sm text-muted-foreground">Inspect available funds, purchased and promotional credit, settlement liquidity and reconciliation.</p>
        <Button nativeButton={false} variant="outline" render={<Link to="/admin/treasury" />}>Open treasury</Button>
      </div>
      <div className="flex flex-col items-start gap-related">
        <h3 className="font-medium">Customer experience</h3>
        <p className="text-sm text-muted-foreground">Trace a Call or Quote, investigate uncertain delivery and follow the purchase to resolution.</p>
        <Button nativeButton={false} variant="outline" render={<Link to="/admin/activity" />}>Explore purchases</Button>
      </div>
      <div className="flex flex-col items-start gap-related">
        <h3 className="font-medium">Acquisition and interaction</h3>
        <p className="text-sm text-muted-foreground">{config.enabled && config.posthogKey
          ? 'Browser analytics is configured. Inspect traffic sources, routes and interaction. Marketplace repeat buying is measured above.'
          : 'PostHog is not connected in this web deployment. Marketplace records above remain available independently.'}</p>
        {analyticsUrl !== null && <Button nativeButton={false} variant="outline" render={<a href={analyticsUrl} target="_blank" rel="noreferrer" />}>Open PostHog<ArrowUpRightIcon data-icon="inline-end" /></Button>}
      </div>
      <div className="flex flex-col items-start gap-related">
        <h3 className="font-medium">Reliability and incidents</h3>
        <p className="text-sm text-muted-foreground">{config.enabled && config.sentryDsn
          ? 'Error reporting is configured. Inspect issues and alert delivery in Sentry; configuration alone does not prove receipt.'
          : 'Error reporting is not connected in this web deployment. Check Sentry setup before launch.'}</p>
        <Button nativeButton={false} variant="outline" render={<a href="https://agentic-economy.sentry.io/issues/?project=4511653575393280" target="_blank" rel="noreferrer" />}>Open Sentry<ArrowUpRightIcon data-icon="inline-end" /></Button>
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
