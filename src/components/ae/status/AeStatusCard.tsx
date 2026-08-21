import { ExternalLinkIcon } from 'lucide-react'

import { AeCopyPublicUrlButton } from '@/components/ae/forms/AeCopyPublicUrlButton'
import { readPublicCatalogActivationRef } from '@/modules/catalog/public'
import type { PublicOwnerStatusRouteReadback } from '@/modules/catalog/public'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  dispositionToAeStatus,
  offeringAccessToAeStatus,
  offeringSupportToAeStatus,
  trustTierToAeStatus,
} from '@/lib/ui/status-presentation'

type AeStatusCardProps = {
  readback: PublicOwnerStatusRouteReadback
}

export function AeStatusCard({ readback }: AeStatusCardProps) {
  const isPreview = readback.projectionMode === 'local_preview'
  const titleId = `ae-status-card-${readback.catalog.slug}`
  const hasUnavailableCapabilities = readback.unavailableCapabilities.length > 0
  const offeringStatuses = readback.catalog.offerings.map((offering) => ({
    support: offeringSupportToAeStatus(offering.support),
    access: offeringAccessToAeStatus(offering.accessPaths),
  }))
  const supportStatus = offeringStatuses.some(({ support }) => support === 'available')
    ? 'available'
    : offeringStatuses.some(({ support }) => support === 'guarded')
      ? 'guarded'
      : 'not_live'
  const accessStatus = offeringStatuses.some(({ access }) => access === 'listed') ? 'listed' : 'not_queued'

  return (
    <Card className="p-6" aria-labelledby={titleId}>
      <div className="grid gap-6">
        <div className="grid gap-4">
          <div className="grid gap-1">
            <h2 className="block text-lg font-semibold text-foreground" id={titleId}>{readback.catalog.name}</h2>
            <p className="block text-sm text-muted-foreground">
              {readback.catalog.businessContext.kind === 'local_human'
                ? `${readback.catalog.category} in ${readback.catalog.businessContext.suburb}, ${readback.catalog.businessContext.stateTerritory}`
                : `${readback.catalog.category} — ${readback.catalog.businessContext.website}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isPreview ? <Badge variant="outline">Preview</Badge> : (
              <AeCopyPublicUrlButton
                slug={readback.catalog.slug}
                businessId={readPublicCatalogActivationRef(readback.catalog)}
                size="sm"
              />
            )}
            <Button asChild variant="secondary" size="sm">
              <a href={readback.publicUrl}><ExternalLinkIcon aria-hidden="true" />{isPreview ? 'Open preview' : 'Open page'}</a>
            </Button>
          </div>
        </div>
        <Separator />
        <div className="grid gap-4">
          <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
            <li><AeStatusBadge status={dispositionToAeStatus(readback.catalog.disposition)} /></li>
            <li><AeStatusBadge status={trustTierToAeStatus(readback.catalog.trustTier)} /></li>
            <li><AeStatusBadge status={supportStatus} /></li>
            <li><AeStatusBadge status={accessStatus} /></li>
          </ul>
          {hasUnavailableCapabilities ? (
            <ul className="m-0 grid list-none gap-3 p-0">
              {readback.unavailableCapabilities.map((capability) => (
                <li key={capability.label} className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="block font-medium text-foreground">{capability.label}</p>
                  <p className="block text-sm text-muted-foreground">{capability.explanation}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <p className="block text-sm text-muted-foreground">{readback.nextAction}</p>
      </div>
    </Card>
  )
}
