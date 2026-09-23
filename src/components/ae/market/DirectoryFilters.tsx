// Adapted from Spree Storefront's controlled FilterBar and MobileFilterDrawer.
// MIT licence and upstream attribution: docs/licenses/spree-storefront.txt.
import { useId, useRef, useState, type FormEvent } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { x402DirectoryFilterSchema, type X402DirectoryFilters } from '@/modules/market/x402-directory'

type Props = { search: X402DirectoryFilters; onApply: (filters: X402DirectoryFilters) => void }

export function DirectoryFilters({ search, onApply }: Props) {
  const [open, setOpen] = useState(false)
  const count = [search.network, search.provider, search.maxUsdPrice].filter(value => value !== undefined).length
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger
      render={
        <Button variant="outline" className="min-h-touch rounded-full sm:min-h-10">
          <SlidersHorizontal className="size-4" /> Filters{count > 0 ? ` (${count})` : ''}
        </Button>
      }
    />
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <SheetHeader className="border-b p-6 pr-12">
          <SheetTitle>Filter Tools</SheetTitle>
          <SheetDescription>Search the directory by network, provider or maximum price per Call.</SheetDescription>
        </SheetHeader>
        {open ? <FilterForm search={search} onApply={filters => { onApply(filters); setOpen(false) }} /> : null}
      </SheetContent>
  </Sheet>
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
  return <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
    <FieldGroup className="gap-6">
    <Field>
      <FieldLabel htmlFor={`${id}-network`} className="text-sm font-medium">Network</FieldLabel>
      <Input ref={networkRef} id={`${id}-network`} value={network} onChange={event => setNetwork(event.target.value)} placeholder="Any network" aria-invalid={invalidField === 'network'} aria-describedby={invalidField === 'network' ? `${id}-network-help ${id}-error` : `${id}-network-help`} />
      <FieldDescription id={`${id}-network-help`}>For example, eip155:8453 for Base.</FieldDescription>
    </Field>
    <Field>
      <FieldLabel htmlFor={`${id}-provider`} className="text-sm font-medium">Provider hostname</FieldLabel>
      <Input ref={providerRef} id={`${id}-provider`} value={provider} onChange={event => setProvider(event.target.value)} placeholder="Any provider" autoCapitalize="none" aria-invalid={invalidField === 'provider'} aria-describedby={invalidField === 'provider' ? `${id}-error` : undefined} />
    </Field>
    <Field>
      <FieldLabel htmlFor={`${id}-price`} className="text-sm font-medium">Maximum price (USD)</FieldLabel>
      <Input ref={priceRef} id={`${id}-price`} value={price} onChange={event => setPrice(event.target.value)} placeholder="No maximum" inputMode="decimal" aria-invalid={invalidField === 'price'} aria-describedby={invalidField === 'price' ? `${id}-error` : undefined} />
    </Field>
    </FieldGroup>
    {error === undefined ? null : <p id={`${id}-error`} role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
    <div className="flex items-stretch gap-3 border-t p-6">
      <Button type="button" variant="outline" className="min-h-touch flex-1" onClick={() => { setNetwork(''); setProvider(''); setPrice(''); setError(undefined); setInvalidField(undefined) }}>Clear filters</Button>
      <Button type="submit" className="min-h-touch flex-1">Show results</Button>
    </div>
  </form>
}
