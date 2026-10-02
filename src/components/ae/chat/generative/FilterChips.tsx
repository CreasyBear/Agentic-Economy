import { Button } from '@/components/arc/button/button'
import type { FilterChipsProps } from './generative.contracts'

export function FilterChips({ view, onChange }: FilterChipsProps) {
  const { value } = view
  return (
    <section aria-label="Filter options" className="arc-chat-filters grid min-w-0 gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium tracking-tight text-muted-foreground">Filter options</span>
        {view.count === undefined ? null : <span role="status" className="text-muted-foreground">{view.count} matching</span>}
        <Button type="button" variant="ghost" size="sm" className="ms-auto min-h-10" onClick={() => onChange({ readyOnly: false })} disabled={!value.price && !value.readyOnly && !value.network && !value.category}>Reset</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" className="min-h-10 rounded-full border-0 shadow-none" aria-pressed={value.readyOnly} onClick={() => onChange({ ...value, readyOnly: !value.readyOnly })}>Ready only</Button>
        {view.prices.map((price) => <Button key={`price:${price}`} type="button" variant="secondary" size="sm" className="min-h-10 rounded-full border-0 shadow-none" aria-pressed={value.price === price} onClick={() => onChange({ ...value, price: value.price === price ? undefined : price })}>Price: {price}</Button>)}
        {view.networks.map((network) => <Button key={`network:${network}`} type="button" variant="secondary" size="sm" className="min-h-10 rounded-full border-0 shadow-none" aria-pressed={value.network === network} onClick={() => onChange({ ...value, network: value.network === network ? undefined : network })}>Network: {network}</Button>)}
        {view.categories.map((category) => <Button key={`category:${category}`} type="button" variant="secondary" size="sm" className="min-h-10 rounded-full border-0 shadow-none" aria-pressed={value.category === category} onClick={() => onChange({ ...value, category: value.category === category ? undefined : category })}>Category: {category}</Button>)}
      </div>
    </section>
  )
}
