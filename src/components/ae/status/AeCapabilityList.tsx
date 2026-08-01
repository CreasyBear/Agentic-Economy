import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { AeProviderCard } from '@/components/ae/primitives/AeProviderCard'
import type { PublicRouteCatalogContract } from '@/modules/catalog/public'
type AeCapabilityListProps = {
  catalog: PublicRouteCatalogContract
}

/** One AeProviderCard (capability variant) per published service. */
export function AeCapabilityList({ catalog }: AeCapabilityListProps) {
  if (catalog.services.length === 0) {
    return (
      <Empty className="border border-border bg-card p-5">
        <EmptyHeader>
          <EmptyTitle>No published Offerings yet</EmptyTitle>
          <EmptyDescription>Add an Offering to show customers what your business provides.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

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
