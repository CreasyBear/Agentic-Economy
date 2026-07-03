import { AeProviderCard } from '@/components/ae/primitives/AeProviderCard'
import type { PublicRouteCatalogContract } from '@/modules/catalog/public'

type AeCapabilityListProps = {
  catalog: PublicRouteCatalogContract
}

/** One AeProviderCard (capability variant) per published service. */
export function AeCapabilityList({ catalog }: AeCapabilityListProps) {
  return (
    <ul className="m-0 grid list-none gap-4 p-0">
      {catalog.services.map((service) => (
        <li key={service.serviceId}>
          <AeProviderCard variant="capability" service={service} />
        </li>
      ))}
    </ul>
  )
}
