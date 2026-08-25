import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { AeOfferingCard } from '@/components/ae/primitives/AeOfferingCard'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

type AeCapabilityListProps = {
  catalog: PublicBusinessCatalogApiV2Dto
}

/** One Operation row per published Operation. */
export function AeCapabilityList({ catalog }: AeCapabilityListProps) {
  if (catalog.offerings.length === 0) {
    return (
      <Empty className="border border-border bg-card p-5">
        <EmptyHeader>
          <EmptyTitle>No published Operations yet</EmptyTitle>
          <EmptyDescription>Add an Operation so agents can inspect the tool and its price.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ul className="m-0 grid list-none gap-4 p-0">
      {catalog.offerings.map((offering) => (
        <li key={offering.offeringRef}>
          <AeOfferingCard offering={offering} />
        </li>
      ))}
    </ul>
  )
}
