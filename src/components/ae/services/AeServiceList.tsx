import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import type { ConsumerPlanResult } from '@/modules/customer-request/application/public'
import type { ServiceDto } from '@/modules/registry/public'
import type { WebDiscoveryClaim } from '@/modules/storefront/public'

import { AeAssistantInstallFunnel } from '../console/AeAssistantInstallFunnel'
import { AeConsumerPlan } from '../plan/AeConsumerPlan'
import { AeImportedClaims } from './AeImportedClaims'
import { AeServiceRow } from './AeServiceRow'
export type AeServiceListProps = Readonly<{
  services: readonly ServiceDto[]
  query: string
  plan?: ConsumerPlanResult
  canonicalBaseUrl?: string
  importedClaims?: readonly WebDiscoveryClaim[]
}>

export function AeServiceList({ services, query, plan, canonicalBaseUrl, importedClaims = [] }: AeServiceListProps) {
  if (plan?.kind === 'plan') {
    return (
      <div className="grid gap-6">
        <AeConsumerPlan plan={plan} />
        {canonicalBaseUrl === undefined ? null : <AeAssistantInstallFunnel canonicalBaseUrl={canonicalBaseUrl} />}
      </div>
    )
  }
  if (services.length === 0) {
    return (
      <div className="grid gap-6">
        <Card className="grid w-full max-w-3xl gap-5 border border-border bg-card p-6">
          <div role="status" className="grid gap-2">
            <h2 className="text-xl font-semibold text-foreground">Expand the network for this ask</h2>
            <p className="block text-muted-foreground">
              No listed business covers “{query}” yet. Businesses publish what they do here so agents can bring them work.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="default" data-variant="primary" className="min-h-11 w-full sm:w-auto">
              <Link to="/claim" search={{ source: 'supply' }}>List your business</Link>
            </Button>
            <Button asChild variant="secondary" className="min-h-11 w-full sm:w-auto">
              <Link to="/">Try another ask</Link>
            </Button>
          </div>
        </Card>
        <AeImportedClaims claims={importedClaims} query={query} />
      </div>
    )
  }

  const answers = services.slice(0, 3)
  const moreMatches = services.slice(3)

  return (
    <section aria-labelledby="services-list-title" className="grid gap-5">
      <div className="grid gap-2 border-b border-border pb-4">
        <p className="block text-sm font-semibold text-muted-foreground">OPTIONS FOR THIS ASK</p>
        <h2 id="services-list-title" className="text-xl font-semibold text-foreground">Compare your options</h2>
        <p className="block max-w-3xl text-muted-foreground">
          Compare what each business publishes: the service, price, timing, and next step. Then choose who to contact.
        </p>
      </div>

      <ol className="m-0 grid list-none gap-4 p-0 lg:grid-cols-2">
        {answers.map((service, index) => (
          <AeServiceRow
            key={service.id}
            service={service}
            emphasized={index === 0}
            answerRank={index + 1}
          />
        ))}
      </ol>

      {moreMatches.length === 0 ? null : (
        <details className="border-t border-border pt-2">
          <summary className="flex min-h-11 cursor-pointer items-center rounded-md px-2 text-sm font-semibold text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2">
            More matches ({moreMatches.length})
          </summary>
          <ol start={4} className="m-0 grid list-none gap-3 px-0 pb-0 pt-4 md:grid-cols-2">
            {moreMatches.map((service, index) => (
              <AeServiceRow key={service.id} service={service} answerRank={index + 4} />
            ))}
          </ol>
        </details>
      )}
    </section>
  )
}
