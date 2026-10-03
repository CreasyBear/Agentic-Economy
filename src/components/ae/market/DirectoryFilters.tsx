// Adapted from Spree Storefront's controlled FilterBar and MobileFilterDrawer.
// MIT licence and upstream attribution: docs/licenses/spree-storefront.txt.
import { useId, useRef, useState, type FormEvent } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/arc/drawer/Drawer'
import { x402DirectoryFilterSchema, type X402DirectoryFilters } from '@/modules/market/x402-directory'

type Props = { search: X402DirectoryFilters; onApply: (filters: X402DirectoryFilters) => void }

export function DirectoryFilters({ search, onApply }: Props) {
  const [open, setOpen] = useState(false)
  const count = [search.network, search.provider, search.maxUsdPrice].filter(value => value !== undefined).length
  return <Drawer open={open} onOpenChange={setOpen}>
    <DrawerTrigger
      render={
        <Button type="button" variant="secondary" className="min-h-touch rounded-full sm:min-h-10">
          <SlidersHorizontal className="size-4" /> Filters{count > 0 ? ` (${count})` : ''}
        </Button>
      }
    />
      <DrawerContent className="arc-market-filters" title="Filter Tools" description="Search the directory by network, provider or maximum price per Call.">
        {open ? <FilterForm search={search} onApply={filters => { onApply(filters); setOpen(false) }} /> : null}
      </DrawerContent>
  </Drawer>
}

// A fresh draft on each opening keeps cancelled changes out of applied filters.
function FilterForm({ search, onApply }: Props) {
  const id = useId()
  const networkRef = useRef<HTMLInputElement>(null)
  const providerRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)
  const [network, setNetwork] = useState(search.network ?? '')
  const [provider, setProvider] = useState(search.provider ?? '')
  const [price, setPrice] = useState(search.maxUsdPrice === undefined ? '' : String(search.maxUsdPrice))
  const [error, setError] = useState<string>()
  const [invalidField, setInvalidField] = useState<'network' | 'provider' | 'price'>()
  function reject(field: 'network' | 'provider' | 'price', message: string) {
    setInvalidField(field)
    setError(message)
    const target = field === 'network' ? networkRef : field === 'provider' ? providerRef : priceRef
    target.current?.focus()
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (price.trim() !== "" && !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(price.trim())) {
      reject('price', 'Enter a non-negative USD price.')
      return
    }
    const parsed = x402DirectoryFilterSchema.safeParse({
      ...(network.trim() === '' ? {} : { network }),
      ...(provider.trim() === '' ? {} : { provider }),
      ...(price.trim() === '' ? {} : { maxUsdPrice: Number(price) }),
    })
    if (!parsed.success) {
      const path = parsed.error.issues[0]?.path[0]
      const field = path === 'network' || path === 'provider' ? path : 'price'
      reject(field, 'Enter a network identifier, a provider hostname without a URL path, and a non-negative USD price.')
      return
    }
    setInvalidField(undefined)
    setError(undefined)
    onApply(parsed.data)
  }
  return <form onSubmit={submit} className="flex min-w-0 flex-col gap-6" noValidate>
    <div className="grid min-w-0 gap-6">
      <Input label="Network" description="For example, eip155:8453 for Base." ref={networkRef} id={`${id}-network`} value={network} onChange={event => setNetwork(event.target.value)} placeholder="Any network" aria-invalid={invalidField === 'network'} aria-describedby={invalidField === 'network' ? `${id}-error` : undefined} />
      <Input label="Provider hostname" ref={providerRef} id={`${id}-provider`} value={provider} onChange={event => setProvider(event.target.value)} placeholder="Any provider" autoCapitalize="none" aria-invalid={invalidField === 'provider'} aria-describedby={invalidField === 'provider' ? `${id}-error` : undefined} />
      <Input label="Maximum price (USD)" ref={priceRef} id={`${id}-price`} value={price} onChange={event => setPrice(event.target.value)} placeholder="No maximum" inputMode="decimal" aria-invalid={invalidField === 'price'} aria-describedby={invalidField === 'price' ? `${id}-error` : undefined} />
    {error === undefined ? null : <p id={`${id}-error`} role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
    <div className="flex items-stretch gap-3 border-t pt-6">
      <Button labelLayout="wrap" type="button" variant="secondary" className="min-h-touch flex-1" onClick={() => { setNetwork(''); setProvider(''); setPrice(''); setError(undefined); setInvalidField(undefined) }}>Clear filters</Button>
      <Button labelLayout="wrap" type="submit" className="min-h-touch flex-1">Show results</Button>
    </div>
  </form>
}
