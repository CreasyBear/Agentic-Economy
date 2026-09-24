import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ToolListingCard } from './ToolListingCard'
import type { ProviderHumanOfferingView, ToolObjectView } from './object-family.contracts'

export type ProviderPortfolioProps = Readonly<{ offerings: readonly ToolObjectView[]; otherOfferings?: readonly ProviderHumanOfferingView[] }>

export function ProviderPortfolio({ offerings, otherOfferings = [] }: ProviderPortfolioProps) {
  return (
    <section aria-labelledby="provider-offerings-heading" className="grid min-w-0 gap-related">
      <h2 id="provider-offerings-heading" className="text-title font-medium">Tools and offerings</h2>
      {offerings.length === 0 && otherOfferings.length === 0 ? <p className="text-sm text-muted-foreground">No sourced offerings are available.</p> : (
        <div className="grid min-w-0 gap-related sm:grid-cols-2">
          {offerings.map((view) => <div key={view.href ?? view.listing.identity.title.sourceRef} className="grid min-w-0 gap-intra">
            <ToolListingCard view={view} />
            <p className="text-xs text-muted-foreground">{view.listing.canonicalToolRef.kind === 'present' ? 'Admitted Tool' : 'Catalogue-only offering'}</p>
          </div>)}
          {otherOfferings.map((offering) => <Card key={offering.name} className="min-w-0">
            <CardHeader><CardTitle><h3 className="break-words text-base">{offering.name}</h3></CardTitle></CardHeader>
            <CardContent className="grid gap-intra">
              {offering.summary === undefined ? null : <p className="text-sm text-muted-foreground">{offering.summary}</p>}
              <p className="text-xs text-muted-foreground">Human-request offering · not an admitted Tool</p>
              {offering.href === undefined ? null : <a href={offering.href} className="min-h-touch w-fit content-center text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">View offering</a>}
            </CardContent>
          </Card>)}
        </div>
      )}
    </section>
  )
}
