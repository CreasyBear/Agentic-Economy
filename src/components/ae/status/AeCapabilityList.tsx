import type { PublicRouteCatalogContract } from '@/modules/catalog/public'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { capabilityStatusToAeStatus, firstRequestModeLabel } from '@/lib/ui/status-presentation'

type AeCapabilityListProps = {
  catalog: PublicRouteCatalogContract
}

export function AeCapabilityList({ catalog }: AeCapabilityListProps) {
  return (
    <div className="grid gap-4" role="list">
      {catalog.services.map((service) => {
        const serviceTitleId = `ae-service-${service.serviceId}`

        return (
          <Card key={service.serviceId} className="ae-source-card" role="listitem" aria-labelledby={serviceTitleId}>
            <CardHeader className="border-b">
              <CardTitle id={serviceTitleId}>{service.name}</CardTitle>
              <CardDescription>{service.summary}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium">Service area</dt>
                  <dd className="text-muted-foreground">{service.serviceArea}</dd>
                </div>
                <div>
                  <dt className="font-medium">Hours</dt>
                  <dd className="text-muted-foreground">{service.hoursOrUnknown}</dd>
                </div>
                <div>
                  <dt className="font-medium">First request</dt>
                  <dd className="text-muted-foreground">{firstRequestModeLabel(service.firstRequest.mode)}</dd>
                </div>
                <div>
                  <dt className="font-medium">Public note</dt>
                  <dd className="text-muted-foreground">{service.firstRequest.publicDisclosure}</dd>
                </div>
              </dl>
              <div className="mt-4 grid gap-3">
                <div className="grid gap-3" role="list">
                  {service.capabilities.map((capability) => (
                    <div key={`${capability.serviceId}:${capability.kind}`} role="listitem">
                      <AeStatusBadge status={capabilityStatusToAeStatus(capability.status)} />
                    </div>
                  ))}
                </div>
                <p role="note" className="text-sm text-muted-foreground">This page does not book, charge, or take action for the business.</p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
