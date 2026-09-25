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
    <section aria-labelledby="host-grouping-heading" className="grid min-w-0 gap-related">
      <h1 id="host-grouping-heading" className="break-all text-title-lg font-medium">{hostname.value}</h1>
      <p className="text-sm text-muted-foreground">Directory Host grouping, not an accountable Business identity.</p>
      <details className="text-xs text-muted-foreground"><summary className="min-h-touch cursor-pointer content-center">Technical source reference</summary><p className="break-all font-mono">{hostname.sourceRef}</p></details>
      {verifiedProvider === undefined ? null : <a className="min-h-touch w-fit content-center text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2" href={verifiedProvider.href}>Verified Provider: {verifiedProvider.name}</a>}
      <h2 className="text-title font-medium">Directory listings</h2>
      {listings.length === 0 ? <p className="text-sm text-muted-foreground">No sourced listings are available.</p> : (
        <div className="grid min-w-0 gap-related sm:grid-cols-2">
          {listings.map((view) => <ToolListingCard key={view.href} view={view} />)}
        </div>
      )}
    </section>
  )
}
