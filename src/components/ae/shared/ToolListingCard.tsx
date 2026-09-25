import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { ToolObjectView } from './object-family.contracts'
import { ToolFacts } from './ToolFacts'

export type ToolListingCardProps = Readonly<{
  view: ToolObjectView
  onSave?: () => void
  saved?: boolean
  onCompare?: () => void
  comparing?: boolean
  compareDisabled?: boolean
  fromMarket?: boolean
}>

export function ToolListingCard({ view, onSave, saved, onCompare, comparing, compareDisabled, fromMarket }: ToolListingCardProps) {
  return (
    <Card className="relative min-w-0 overflow-hidden focus-within:ring-2 focus-within:ring-ring" discoverLift>
      <CardHeader className="min-w-0">
        <CardTitle className="min-w-0"><h3 className="min-w-0 wrap-anywhere text-base">{view.href === undefined
          ? view.title
          : <Link to={view.href} {...(fromMarket ? { state: { fromMarket: true as const } } : {})} className="after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2">{view.title}</Link>}</h3></CardTitle>
        {view.identity === undefined ? null : <p className="min-w-0 wrap-anywhere text-xs text-muted-foreground">{view.identity.kind === 'verified_provider' ? 'Provider' : view.identity.kind === 'publisher' ? 'Publisher' : 'Directory Host'}: {view.identity.name}</p>}
      </CardHeader>
      <CardContent className="grid min-w-0 gap-related">
        {view.outcome === undefined ? null : <p className="min-w-0 wrap-anywhere text-sm text-muted-foreground">{view.outcome}</p>}
        <ToolFacts view={view} compact />
        <p className="min-w-0 wrap-anywhere text-xs text-muted-foreground">Source: {view.listing.identity.title.provenance.replaceAll('_', ' ')}</p>
      </CardContent>
      {onSave === undefined && onCompare === undefined ? null : (
        <CardFooter className="relative z-10 flex-wrap gap-2">
          {onSave === undefined ? null : <Button type="button" variant="ghost" className="min-h-touch h-auto min-w-0 max-w-full whitespace-normal text-center" aria-pressed={saved === true} onClick={onSave}>{saved ? 'Saved' : 'Save'}</Button>}
          {onCompare === undefined ? null : <Button type="button" variant="ghost" className="min-h-touch h-auto min-w-0 max-w-full whitespace-normal text-center" aria-label={`${comparing ? 'Remove' : 'Add'} ${view.title} ${comparing ? 'from' : 'to'} comparison`} disabled={compareDisabled === true} aria-pressed={comparing === true} onClick={onCompare}>{comparing ? 'Comparing' : 'Compare'}</Button>}
        </CardFooter>
      )}
    </Card>
  )
}
