import { ExternalLinkIcon } from 'lucide-react'

import { AeCopyPublicUrlButton } from '@/components/ae/forms/AeCopyPublicUrlButton'
import { readPublicCatalogActivationRef } from '@/modules/catalog/public'
import type { PublicOwnerStatusRouteReadback } from '@/modules/catalog/public'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
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
    <Card className="ae-status-readback-card" aria-labelledby={titleId}>
      <CardHeader className="border-b">
        <CardTitle id={titleId}>{readback.catalog.name}</CardTitle>
        <CardDescription>
          {readback.catalog.category} in {readback.catalog.suburb}, {readback.catalog.stateTerritory}
        </CardDescription>
        <CardAction className="flex flex-wrap gap-2">
          <AeCopyPublicUrlButton
            slug={readback.catalog.slug}
            businessId={readPublicCatalogActivationRef(readback.catalog)}
            size="sm"
          />
          <Button asChild variant="outline" size="sm">
            <a href={readback.publicUrl}>
              <ExternalLinkIcon data-icon="inline-start" />
              Open page
            </a>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
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
                <p className="text-sm text-muted-foreground">{capability.explanation}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
      <CardFooter>
        <p className="text-sm text-muted-foreground">{readback.nextAction}</p>
      </CardFooter>
    </Card>
  )
}
