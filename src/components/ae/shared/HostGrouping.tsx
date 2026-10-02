import './ProviderCatalogueComposition.css'
import { ToolListingCard } from './ToolListingCard'
import type { ToolObjectView } from './object-family.contracts'
import type { ListingFact } from '@/modules/registry/public'

export type HostGroupingProps = Readonly<{
  hostname: ListingFact<string>
  listings: readonly ToolObjectView[]
  verifiedProvider?: Readonly<{ name: string; href: string }>
}>

export function HostGrouping({ hostname, listings, verifiedProvider }: HostGroupingProps) {
  if (hostname.kind !== 'present' || hostname.scope !== 'directory_resource') return null
  return (
    <section aria-labelledby="host-grouping-heading" className="arc-host-grouping">
      <header className="arc-host-identity">
        <div className="arc-provider-title">
          <h1 id="host-grouping-heading">{hostname.value}</h1>
          <p>Directory Host grouping, not an accountable Business identity.</p>
        </div>
        <div className="arc-provider-source">
          <details><summary>Technical source reference</summary><p>{hostname.sourceRef}</p></details>
          {verifiedProvider === undefined ? null : <a href={verifiedProvider.href}>Verified Provider: {verifiedProvider.name}</a>}
        </div>
      </header>
      <h2 className="text-title font-medium">Directory listings</h2>
      {listings.length === 0 ? <p className="text-sm text-muted-foreground">No sourced listings are available.</p> : (
        <div className="arc-provider-gallery">
          {listings.map((view) => <ToolListingCard key={view.href} view={view} />)}
        </div>
      )}
    </section>
  )
}
