import { ExternalLinkIcon } from 'lucide-react'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeCopyPublicUrlButton } from '@/components/ae/forms/AeCopyPublicUrlButton'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { readPublicCatalogActivationRef } from '@/modules/catalog/public'
import type { PublicOwnerStatusRouteReadback } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import {
  dispositionToAeStatus,
  offeringAccessToAeStatus,
  offeringSupportToAeStatus,
  trustTierToAeStatus,
} from '@/lib/ui/business-status-mapping'
import './PublicStatusComposition.css'

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
    <section aria-labelledby={titleId} className="arc-market arc-public-status">
      <header className="arc-public-status-header">
        <div className="arc-public-status-identity">
          <h2 id={titleId}>
            {readback.catalog.name}
          </h2>
          <p>{location}</p>
        </div>
        <div className="arc-public-status-actions">
          {isPreview ? (
            <span className="arc-public-status-preview">Preview</span>
          ) : (
            <AeCopyPublicUrlButton
              slug={readback.catalog.slug}
              businessId={readPublicCatalogActivationRef(readback.catalog)}
              size="sm"
            />
          )}
          <a href={readback.publicUrl} className={actionLinkClassName('secondary', 'md')}>
            <ExternalLinkIcon aria-hidden="true" />
            {isPreview ? 'Open preview' : 'Open page'}
          </a>
        </div>
      </header>
      <AeFactList
        className="arc-public-status-facts"
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
        <ul className="arc-public-status-limitations">
          {readback.unavailableCapabilities.map((capability) => (
            <li key={capability.label}>
              <p className="font-medium text-foreground">{capability.label}</p>
              <p className="text-sm text-muted-foreground">{capability.explanation}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="arc-public-status-next">{readback.nextAction}</p>
    </section>
  )
}
