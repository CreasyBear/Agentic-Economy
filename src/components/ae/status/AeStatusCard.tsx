import { ExternalLinkIcon } from 'lucide-react'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeCopyPublicUrlButton } from '@/components/ae/forms/AeCopyPublicUrlButton'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { readPublicCatalogActivationRef } from '@/modules/catalog/public'
import type { PublicOwnerStatusRouteReadback } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import {
  dispositionToAeStatus,
  offeringAccessToAeStatus,
  offeringSupportToAeStatus,
  trustTierToAeStatus,
} from '@/lib/ui/status-presentation'

type AeStatusCardProps = {
  readback: PublicOwnerStatusRouteReadback<PublicBusinessCatalogApiV2Dto>
}

export function AeStatusCard({ readback }: AeStatusCardProps) {
  const isPreview = readback.projectionMode === 'local_preview'
  const titleId = `ae-status-card-${readback.catalog.slug}`
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
  const location =
    readback.catalog.businessContext.kind === 'local_human'
      ? `${readback.catalog.category} in ${readback.catalog.businessContext.suburb}, ${readback.catalog.businessContext.stateTerritory}`
      : `${readback.catalog.category} — ${readback.catalog.businessContext.website}`

  return (
    <section aria-labelledby={titleId} className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h2 id={titleId} className="text-base font-medium text-foreground">
            {readback.catalog.name}
          </h2>
          <p className="text-sm text-muted-foreground">{location}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isPreview ? (
            <Badge variant="outline">Preview</Badge>
          ) : (
            <AeCopyPublicUrlButton
              slug={readback.catalog.slug}
              businessId={readPublicCatalogActivationRef(readback.catalog)}
              size="sm"
            />
          )}
          <Button asChild variant="secondary" className="min-h-touch">
            <a href={readback.publicUrl}>
              <ExternalLinkIcon aria-hidden="true" />
              {isPreview ? 'Open preview' : 'Open page'}
            </a>
          </Button>
        </div>
      </div>
      <AeFactList
        facts={[
          {
            label: 'Disposition',
            value: <AeStatusBadge status={dispositionToAeStatus(readback.catalog.disposition)} density="cell" />,
          },
          {
            label: 'Trust',
            value: <AeStatusBadge status={trustTierToAeStatus(readback.catalog.trustTier)} density="cell" />,
          },
          {
            label: 'Support',
            value: <AeStatusBadge status={supportStatus} density="cell" />,
          },
          {
            label: 'Access',
            value: <AeStatusBadge status={accessStatus} density="cell" />,
          },
        ]}
      />
      {readback.unavailableCapabilities.length === 0 ? null : (
        <ul className="m-0 grid list-none gap-3 border-t border-border p-0 pt-4">
          {readback.unavailableCapabilities.map((capability) => (
            <li key={capability.label}>
              <p className="font-medium text-foreground">{capability.label}</p>
              <p className="text-sm text-muted-foreground">{capability.explanation}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">{readback.nextAction}</p>
    </section>
  )
}
