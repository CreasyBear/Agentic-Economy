import { ExternalLinkIcon } from 'lucide-react'

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
  return (
    <Card>
      <CardHeader>
        <CardTitle>{readback.catalog.name}</CardTitle>
        <CardDescription>
          {readback.catalog.category} in {readback.catalog.suburb}, {readback.catalog.stateTerritory}
        </CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <a href={readback.publicUrl}>
              <ExternalLinkIcon data-icon="inline-start" />
              Open page
            </a>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <AeStatusBadge status={publicStatusToAeStatus(readback.catalog.publicStatus)} />
          <AeStatusBadge status={trustTierToAeStatus(readback.catalog.trustTier)} />
          <AeStatusBadge status={indexStatusToAeStatus(readback.catalog.indexStatus)} />
          <AeStatusBadge status={discoveryStatusToAeStatus(readback.catalog.discoveryStatus)} />
        </div>
        <div className="mt-6 grid gap-3">
          {readback.unavailableCapabilities.map((capability) => (
            <div key={capability.label} className="rounded-lg border bg-muted/40 p-3">
              <p className="font-medium">{capability.label}</p>
              <p className="text-sm text-muted-foreground">{capability.explanation}</p>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <p className="text-sm text-muted-foreground">{readback.nextAction}</p>
      </CardFooter>
    </Card>
  )
}
