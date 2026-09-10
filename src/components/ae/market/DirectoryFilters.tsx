// Adapted from Spree Storefront's controlled FilterBar and MobileFilterDrawer.
// MIT licence and upstream attribution: docs/licenses/spree-storefront.txt.
import { useId, useState, type FormEvent } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { x402DirectoryFilterSchema, type X402DirectoryFilters } from '@/modules/market/x402-directory'

type Props = { search: X402DirectoryFilters; onApply: (filters: X402DirectoryFilters) => void }

export function DirectoryFilters({ search, onApply }: Props) {
  const [open, setOpen] = useState(false)
  const count = [search.network, search.provider, search.maxUsdPrice].filter(value => value !== undefined).length
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild><Button variant="outline" className="rounded-full">
      <SlidersHorizontal className="size-4" /> Filters{count > 0 ? ` (${count})` : ''}
    </Button></SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md p-6">
        <SheetTitle>Filter Tools</SheetTitle>
        <SheetDescription>Search the directory by network, provider or maximum price per Call.</SheetDescription>
        {open && <FilterForm search={search} onApply={filters => { onApply(filters); setOpen(false) }} />}
      </SheetContent>
  </Sheet>
}

// A fresh draft on each opening keeps cancelled changes out of applied filters.
function FilterForm({ search, onApply }: Props) {
  const id = useId()
  const [network, setNetwork] = useState(search.network ?? '')
  const [provider, setProvider] = useState(search.provider ?? '')
  const [price, setPrice] = useState(search.maxUsdPrice === undefined ? '' : String(search.maxUsdPrice))
  const [error, setError] = useState<string>()
  function submit(event: FormEvent) {
    event.preventDefault()
    if (price.trim() !== "" && !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(price.trim())) {
      setError("Enter a non-negative USD price.")
      return
    }
    const parsed = x402DirectoryFilterSchema.safeParse({
      ...(network.trim() === '' ? {} : { network }),
      ...(provider.trim() === '' ? {} : { provider }),
      ...(price.trim() === '' ? {} : { maxUsdPrice: Number(price) }),
    })
    if (!parsed.success) {
      setError('Enter a network identifier, a provider hostname without a URL path, and a non-negative USD price.')
      return
    }
    onApply(parsed.data)
  }
  return <form onSubmit={submit} className="flex flex-1 flex-col gap-6" noValidate>
    <FieldGroup>
    <Field>
      <FieldLabel htmlFor={`${id}-network`} className="text-sm font-medium">Network</FieldLabel>
      <Input id={`${id}-network`} value={network} onChange={event => setNetwork(event.target.value)} placeholder="Any network" aria-describedby={`${id}-network-help`} />
      <FieldDescription id={`${id}-network-help`}>For example, eip155:8453 for Base.</FieldDescription>
    </Field>
    <Field>
      <FieldLabel htmlFor={`${id}-provider`} className="text-sm font-medium">Provider hostname</FieldLabel>
      <Input id={`${id}-provider`} value={provider} onChange={event => setProvider(event.target.value)} placeholder="Any provider" autoCapitalize="none" />
    </Field>
    <Field>
      <FieldLabel htmlFor={`${id}-price`} className="text-sm font-medium">Maximum price (USD)</FieldLabel>
      <Input id={`${id}-price`} value={price} onChange={event => setPrice(event.target.value)} placeholder="No maximum" inputMode="decimal" />
    </Field>
    </FieldGroup>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="mt-auto flex gap-3 border-t pt-4">
      <Button type="button" variant="outline" onClick={() => { setNetwork(''); setProvider(''); setPrice(''); setError(undefined) }}>Clear filters</Button>
      <Button type="submit" className="flex-1">Show results</Button>
    </div>
  </form>
}
