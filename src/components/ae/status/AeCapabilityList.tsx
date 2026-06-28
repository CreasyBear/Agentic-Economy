import type { PublicCatalogContract } from '@/modules/catalog/public'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { capabilityStatusToAeStatus, firstRequestModeLabel } from '@/lib/ui/status-presentation'

type AeCapabilityListProps = {
  catalog: PublicCatalogContract
}

export function AeCapabilityList({ catalog }: AeCapabilityListProps) {
  return (
    <div className="grid gap-4">
      {catalog.services.map((service) => (
        <Card key={service.serviceId}>
          <CardHeader>
            <CardTitle>{service.name}</CardTitle>
            <CardDescription>{service.summary}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm md:grid-cols-2">
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
              {service.capabilities.map((capability) => (
                <AeStatusBadge key={`${capability.serviceId}:${capability.kind}`} status={capabilityStatusToAeStatus(capability.status)} />
              ))}
              <p className="text-sm text-muted-foreground">Bookings, payments, and automated actions are not live for this service.</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
