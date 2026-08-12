import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { ProvenanceBadge } from '@/components/ae/status/ProvenanceBadge'
import { ProviderFacts } from '@/components/ae/provider-facts'
import { offeringPathLabel } from '@/components/ae/provider-facts.exports'
import { cn } from '@/lib/utils'
import type { PublicOfferingDto } from '@/modules/registry/public'

export type AeOfferingCardProps = {
  offering: PublicOfferingDto
  /** Action/status slot rendered below the access paths (e.g. a "Send a message" CTA). */
  actions?: ReactNode
  /** Extra layout classes for the card shell. */
  className?: string
  /** Optional evidence marker shown for catalog-backed offerings. */
  source?: string
  /** Short capability-type pill rendered next to the name (e.g. "Weather", "FX"). */
  tag?: string
}

/**
 * The single canonical card for a published `PublicOfferingDto`. Converges the
 * former AeProviderCard `offering` variant and the listing page's inline
 * OfferingCardsSection card. Image/name/summary plus optional facts (service
 * area, availability, pricing — each omitted when unpublished) and access-path
 * badges. The `actions` slot carries call-site affordances; the shell gets no
 * call-site-identity branching.
 */
export function AeOfferingCard({ offering, actions, className, source, tag }: AeOfferingCardProps) {
  const titleId = `ae-offering-${offering.offeringRef}`
  const pathLabels = offering.accessPaths.map(offeringPathLabel)

  return (
    <Card className={cn('grid gap-4', className)} data-variant="offering" aria-labelledby={titleId}>
      <CardHeader className="grid gap-1 p-5">
        <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="grid gap-1">
            <CardTitle>
              <h2 id={titleId} className="text-lg font-semibold text-foreground">
                {tag === undefined ? null : (
                  <span className="me-2 align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tag}</span>
                )}
                {offering.name}
              </h2>
            </CardTitle>
            <p className="block text-muted-foreground">{offering.summary}</p>
          </div>
          {source === undefined ? null : <ProvenanceBadge />}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-5 pt-0">
        <ProviderFacts
          facts={[
            { term: 'Service area', description: offering.serviceAreaSummary },
            { term: 'Availability', description: offering.availabilitySummary },
            { term: 'Pricing', description: offering.pricingSummary },
          ]}
        />
        <TokenList labels={pathLabels} ariaLabel="Published access paths" />
        {offering.support.aeSupportedAction ? (
          <p className="block text-sm text-muted-foreground">AE can help with the next step.</p>
        ) : null}
        {actions === undefined ? null : actions}
        <p className="block text-sm text-muted-foreground" role="note">
          The business publishes these details and confirms each request.
        </p>
      </CardContent>
    </Card>
  )
}

function TokenList({ labels, ariaLabel = 'Listed offerings' }: { labels: readonly string[]; ariaLabel?: string }) {
  if (labels.length === 0) {
    return null
  }

  return (
    <ul className="flex flex-wrap gap-2" aria-label={ariaLabel}>
      {labels.map((label) => (
        <li key={label}><Badge variant="outline">{label}</Badge></li>
      ))}
    </ul>
  )
}
