import { Button } from '@/components/ui/button'
import type { FilterChipsProps } from './generative.contracts'

export function FilterChips({ view, onChange }: FilterChipsProps) {
  const { value } = view
  return (
    <section aria-label="Filter options" className="grid min-w-0 gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Filter options</span>
        {view.count === undefined ? null : <span role="status" className="text-muted-foreground">{view.count} matching</span>}
        <Button type="button" variant="ghost" size="sm" className="ms-auto min-h-10" onClick={() => onChange({ readyOnly: false })} disabled={!value.price && !value.readyOnly && !value.network && !value.category}>Reset</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={value.readyOnly ? 'secondary' : 'outline'} size="sm" className="min-h-10" aria-pressed={value.readyOnly} onClick={() => onChange({ ...value, readyOnly: !value.readyOnly })}>Ready only</Button>
        {view.prices.map((price) => <Button key={`price:${price}`} type="button" variant={value.price === price ? 'secondary' : 'outline'} size="sm" className="min-h-10" aria-pressed={value.price === price} onClick={() => onChange({ ...value, price: value.price === price ? undefined : price })}>Price: {price}</Button>)}
        {view.networks.map((network) => <Button key={`network:${network}`} type="button" variant={value.network === network ? 'secondary' : 'outline'} size="sm" className="min-h-10" aria-pressed={value.network === network} onClick={() => onChange({ ...value, network: value.network === network ? undefined : network })}>Network: {network}</Button>)}
        {view.categories.map((category) => <Button key={`category:${category}`} type="button" variant={value.category === category ? 'secondary' : 'outline'} size="sm" className="min-h-10" aria-pressed={value.category === category} onClick={() => onChange({ ...value, category: value.category === category ? undefined : category })}>Category: {category}</Button>)}
      </div>
    </section>
  )
}
