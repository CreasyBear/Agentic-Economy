import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { OptionsGridProps } from './generative.contracts'

export function OptionsGrid({ view, onSelect, onCompare }: OptionsGridProps) {
  if (view.options.length === 0) return null
  return (
    <section aria-label="Options" className="grid min-w-0 gap-3">
      <h3 className="text-base font-semibold">Options</h3>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {view.options.map((option) => {
          const compared = view.comparedIds.includes(option.id)
          return (
            <Card key={option.id} className="min-w-0 justify-between" discoverLift>
              <CardHeader className="min-w-0">
                <CardTitle className="min-w-0 text-base"><a href={option.href} className="break-words underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring">{option.name}</a></CardTitle>
                {option.outcome ? <p className="text-sm leading-relaxed text-muted-foreground">{option.outcome}</p> : null}
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <p className="font-medium">{option.price}</p>
                {option.usage ? <p className="text-muted-foreground">{option.usage}</p> : null}
                <Badge variant={option.readiness === 'ready' ? 'success' : 'outline'}>{option.readiness === 'ready' ? 'Ready to use' : option.readiness === 'unavailable' ? 'Unavailable' : 'Not yet verified'}</Badge>
                {option.seller ? <p className="text-muted-foreground">{option.seller.kind === 'provider' ? 'Sold by' : 'Listed on'} {option.seller.name}</p> : null}
                {!option.selectable ? <p className="text-muted-foreground">View listing; not available to buy through AE</p> : null}
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2">
                <Button type="button" size="sm" className="min-h-10" onClick={() => onSelect(option.id)} disabled={!option.selectable} aria-pressed={view.selectedId === option.id}>Select</Button>
                <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => onCompare(option.id)} aria-pressed={compared}>{compared ? 'Remove from compare' : 'Compare'}</Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
