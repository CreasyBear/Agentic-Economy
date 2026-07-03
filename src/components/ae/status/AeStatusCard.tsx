import { ExternalLinkIcon } from 'lucide-react'

import { AeCopyPublicUrlButton } from '@/components/ae/forms/AeCopyPublicUrlButton'
import { readPublicCatalogActivationRef } from '@/modules/catalog/public'
import type { PublicOwnerStatusRouteReadback } from '@/modules/catalog/public'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import {
  discoveryStatusToAeStatus,
  indexStatusToAeStatus,
  publicStatusToAeStatus,
  trustTierToAeStatus,
} from '@/lib/ui/status-presentation'

type AeStatusCardProps = {
  readback: PublicOwnerStatusRouteReadback
}

export function AeStatusCard({ readback }: AeStatusCardProps) {
  const titleId = `ae-status-card-${readback.catalog.slug}`
  const hasUnavailableCapabilities = readback.unavailableCapabilities.length > 0

  return (
    <Card padding={5} aria-labelledby={titleId}>
      <div className="grid gap-1.5 border-b">
        <Text as="div" type="large" weight="semibold" color="primary" display="block" id={titleId}>{readback.catalog.name}</Text>
        <Text as="div" type="supporting" color="secondary" display="block">
          {readback.catalog.category} in {readback.catalog.suburb}, {readback.catalog.stateTerritory}
        </Text>
        <div className="flex items-center gap-2 flex flex-wrap gap-2">
          <AeCopyPublicUrlButton
            slug={readback.catalog.slug}
            businessId={readPublicCatalogActivationRef(readback.catalog)}
            size="sm"
          />
          <Button
            href={readback.publicUrl}
            variant="secondary"
            size="sm"
            label="Open page"
            icon={<ExternalLinkIcon aria-hidden="true" />}
          />
        </div>
      </div>
      <div className="grid gap-4">
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
          <li>
            <AeStatusBadge status={publicStatusToAeStatus(readback.catalog.publicStatus)} />
          </li>
          <li>
            <AeStatusBadge status={trustTierToAeStatus(readback.catalog.trustTier)} />
          </li>
          <li>
            <AeStatusBadge status={indexStatusToAeStatus(readback.catalog.indexStatus)} />
          </li>
          <li>
            <AeStatusBadge status={discoveryStatusToAeStatus(readback.catalog.discoveryStatus)} />
          </li>
        </ul>
        {hasUnavailableCapabilities ? (
          <ul className="m-0 mt-6 grid list-none gap-3 p-0">
            {readback.unavailableCapabilities.map((capability) => (
              <li key={capability.label} className="rounded-lg border bg-muted/40 p-3">
                <p className="font-medium">{capability.label}</p>
                <p className="text-sm text-secondary">{capability.explanation}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-secondary">{readback.nextAction}</p>
      </div>
    </Card>
  )
}
