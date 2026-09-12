import { SearchIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { x402DirectoryFilterSchema } from '@/modules/market/x402-directory'
import type { X402DirectoryCatalogueInput, X402DirectoryCatalogueOverview, X402DirectoryFacet } from '@/modules/market/x402-directory-catalogue'
import { formatPaymentNetwork } from '@/modules/market/tool-view-model'

export type DirectoryExplorerFilterValues = Readonly<Pick<X402DirectoryCatalogueInput,
  'directoryCategory' | 'network' | 'provider' | 'minUsdPrice' | 'maxUsdPrice' |
  'minPayers30d' | 'maxPayers30d' | 'priceBand' | 'adoptionBand' | 'curatedOnly' | 'hasInputFields' | 'hasOutputExample' |
  'hasInputSchema' | 'hasOutputFields' | 'hasOutputSchema' | 'tags' | 'bundleSlugs'
>>
export type DirectoryExplorerFilterPatch = { [Key in keyof DirectoryExplorerFilterValues]?: DirectoryExplorerFilterValues[Key] | undefined }
type Props = Readonly<{
  search: DirectoryExplorerFilterValues
  overview?: X402DirectoryCatalogueOverview
  onChange: (patch: DirectoryExplorerFilterPatch) => void
  onReset: () => void
}>
const priceBandLabels = { lt_0_01: 'Under 0.01 USDC', '0_01_to_0_03': '0.01–<0.03 USDC', '0_03_to_0_10': '0.03–<0.10 USDC', '0_10_to_1': '0.10–<1 USDC', '1_to_10': '1–<10 USDC', '10_plus': '10+ USDC', unknown: 'Price not comparable' }
const adoptionBandLabels = { missing: 'Payers not reported', '0': '0 paying addresses', '1': '1 paying address', '2_4': '2–4 paying addresses', '5_9': '5–9 paying addresses', '10_49': '10–49 paying addresses', '50_plus': '50+ paying addresses' }

function MultipleFacets({ label, values, selected = [], onChange }: Readonly<{ label: string; values: readonly X402DirectoryFacet[]; selected?: readonly string[] | undefined; onChange: (values: string[] | undefined) => void }>) {
  const [query, setQuery] = useState('')
  const visible = values.filter(item => `${item.label} ${item.key}`.toLowerCase().includes(query.trim().toLowerCase()))
  function toggle(key: string) {
    const next = selected.includes(key) ? selected.filter(value => value !== key) : [...selected, key]
    onChange(next.length === 0 ? undefined : next)
  }
  return <fieldset className="flex min-w-0 flex-col gap-3 border-t pt-5"><legend className="sr-only">{label}</legend><p className="text-sm font-semibold">{label}</p><Input value={query} aria-label={`Find shown ${label.toLowerCase()}`} onChange={event => setQuery(event.target.value)} placeholder={`Find ${label.toLowerCase()}…`} className="h-9 text-xs" /><div className="flex max-h-52 flex-col gap-1 overflow-y-auto overscroll-contain">
    {visible.map(item => <Label key={item.key} className="min-h-8 justify-between gap-2 text-xs font-normal"><span className="flex min-w-0 items-center gap-2"><Checkbox aria-label={`${item.label} ${item.count.toLocaleString('en-AU')}`} checked={selected.includes(item.key)} disabled={selected.length >= 5 && !selected.includes(item.key)} onCheckedChange={() => toggle(item.key)} /><span className="break-words">{item.label}</span></span><span className="shrink-0 text-muted-foreground tabular-nums">{item.count.toLocaleString('en-AU')}</span></Label>)}
    {visible.length === 0 ? <p className="text-xs text-muted-foreground">No match in the shown {label.toLowerCase()}.</p> : null}
  </div>{selected.filter(key => !values.some(item => item.key === key)).map(key => <Button key={key} variant="secondary" size="sm" className="h-auto min-h-9 justify-between whitespace-normal" onClick={() => toggle(key)} aria-label={`Remove ${label.toLowerCase()}: ${key}`}>{key}<XIcon className="size-3" /></Button>)}<p className="text-xs leading-relaxed text-muted-foreground">A selection from the catalogue. Choose up to five; Tools can match any selected {label === 'Tags' ? 'tag' : 'collection'}.</p></fieldset>
}

function Facets({ label, values, selected, onChange, searchable = false }: Readonly<{
  label: string; values: readonly X402DirectoryFacet[]; selected?: string | undefined
  onChange: (value: string | undefined) => void; searchable?: boolean
}>) {
  const [query, setQuery] = useState('')
  const visible = values.filter(item => `${item.label} ${item.key}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <fieldset className="min-w-0 flex flex-col gap-3">
    <legend className="mb-3 text-sm font-semibold">{label}</legend>
    {searchable ? <div className="relative"><SearchIcon className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" /><Input aria-label={`Find ${label.toLowerCase()}`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a category…" className="h-9 pl-8 text-xs" /></div> : null}
    <div className="max-h-60 flex flex-col gap-0.5 overflow-y-auto overscroll-contain">
      <Button type="button" variant="ghost" onClick={() => onChange(undefined)} aria-pressed={selected === undefined} className={cn('h-auto min-h-9 w-full justify-start rounded-md px-2 text-xs font-normal', selected === undefined && 'bg-muted font-medium')}>All {label === 'Network' ? 'networks' : 'categories'}</Button>
      {visible.map(item => <Button key={item.key} type="button" variant="ghost" aria-label={`${item.label} ${item.count.toLocaleString('en-AU')}`} aria-pressed={selected === item.key} onClick={() => onChange(selected === item.key ? undefined : item.key)} className={cn('h-auto min-h-9 w-full justify-between gap-3 rounded-md px-2 text-xs font-normal', selected === item.key && 'bg-muted font-medium')}>
        <span className="min-w-0 break-words text-left whitespace-normal">{item.label}</span><span className="shrink-0 text-muted-foreground tabular-nums">{item.count.toLocaleString('en-AU')}</span>
      </Button>)}
      {visible.length === 0 ? <p className="px-2 py-2 text-xs text-muted-foreground">No matching {label.toLowerCase()}.</p> : null}
      {selected !== undefined && !values.some(item => item.key === selected) ? <Button type="button" variant="secondary" className="h-auto min-h-9 w-full justify-start whitespace-normal" aria-pressed onClick={() => onChange(undefined)}>{selected}</Button> : null}
    </div>
  </fieldset>
}

function FilterBody({ search, overview, onChange, onReset }: Props) {
  const id = useId()
  const [provider, setProvider] = useState(search.provider ?? '')
  const [minimum, setMinimum] = useState(search.minUsdPrice?.toString() ?? '')
  const [maximum, setMaximum] = useState(search.maxUsdPrice?.toString() ?? '')
  const [priceError, setPriceError] = useState<string>()
  const [providerError, setProviderError] = useState<string>()
  const facets = overview?.kind === 'ok' ? overview : undefined
  return <div className="flex flex-col gap-6">
    <div className="flex items-center justify-between"><p className="text-sm font-semibold">Filters</p><Button type="button" variant="ghost" size="sm" onClick={onReset}>Clear all</Button></div>
    {facets === undefined ? <p className="text-xs text-muted-foreground">Category and network counts are unavailable.</p> : <><p className="text-xs leading-relaxed text-muted-foreground">Counts cover the full indexed catalogue.</p><Facets label="Provider category" values={facets.categories} selected={search.directoryCategory} onChange={directoryCategory => onChange({ directoryCategory })} searchable /></>}
    <form className="flex flex-col gap-3 border-t pt-5" onSubmit={event => {
      event.preventDefault()
      const min = minimum.trim() === '' ? undefined : Number(minimum), max = maximum.trim() === '' ? undefined : Number(maximum)
      if ((min !== undefined && (!Number.isFinite(min) || min < 0)) || (max !== undefined && (!Number.isFinite(max) || max < 0)) || (min !== undefined && max !== undefined && min > max)) { setPriceError('Enter a valid price range with the minimum no greater than the maximum.'); return }
      setPriceError(undefined); onChange({ minUsdPrice: min, maxUsdPrice: max, priceBand: undefined })
    }}>
      <p className="text-sm font-semibold">Provider price</p>
      {search.priceBand === undefined ? null : <Button type="button" variant="secondary" className="h-auto min-h-9 justify-between gap-2 text-xs whitespace-normal" aria-label={`Remove price band: ${priceBandLabels[search.priceBand]}`} onClick={() => onChange({ priceBand: undefined })}>{priceBandLabels[search.priceBand]}<XIcon className="size-3" /></Button>}
      <FieldGroup className="grid grid-cols-2 gap-2"><Field className="gap-2"><FieldLabel className="text-xs font-normal" htmlFor={`${id}-minimum`}>Min USDC</FieldLabel><Input id={`${id}-minimum`} type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={minimum} aria-invalid={priceError !== undefined} aria-describedby={priceError === undefined ? undefined : `${id}-price-error`} onChange={event => setMinimum(event.target.value)} /></Field><Field className="gap-2"><FieldLabel className="text-xs font-normal" htmlFor={`${id}-maximum`}>Max USDC</FieldLabel><Input id={`${id}-maximum`} type="number" min="0" step="any" inputMode="decimal" placeholder="Any" value={maximum} aria-invalid={priceError !== undefined} aria-describedby={priceError === undefined ? undefined : `${id}-price-error`} onChange={event => setMaximum(event.target.value)} /></Field></FieldGroup>
      <FieldError id={`${id}-price-error`} className="text-xs">{priceError}</FieldError>
      <p className="text-xs leading-relaxed text-muted-foreground">Per Call. Includes only published USDC prices on the selected network.</p><Button type="submit" variant="outline" size="sm" className="w-full">Apply price range</Button>
    </form>
    {facets === undefined ? null : <div className="border-t pt-5"><Facets label="Network" values={facets.networks.map(item => ({ ...item, label: formatPaymentNetwork(item.label) }))} selected={search.network} onChange={network => onChange({ network })} /></div>}
    <form className="flex flex-col gap-3 border-t pt-5" onSubmit={event => {
      event.preventDefault()
      const parsed = x402DirectoryFilterSchema.safeParse(provider.trim() === '' ? {} : { provider })
      if (!parsed.success) { setProviderError('Enter a Provider hostname, such as api.example.com.'); return }
      setProviderError(undefined); onChange({ provider: parsed.data.provider })
    }}><Field><FieldLabel htmlFor={`${id}-provider`}>Provider</FieldLabel><Input id={`${id}-provider`} value={provider} onChange={event => setProvider(event.target.value)} placeholder="api.example.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={providerError !== undefined} aria-describedby={providerError === undefined ? undefined : `${id}-provider-error`} /><FieldError id={`${id}-provider-error`} className="text-xs">{providerError}</FieldError></Field><Button type="submit" variant="outline" size="sm" className="w-full">Apply Provider</Button></form>
    <fieldset className="flex flex-col gap-3 border-t pt-5"><legend className="sr-only">Published request details</legend><p className="text-sm font-semibold">Published details</p>
      {([{ key: 'hasInputFields', label: 'Request fields' }, { key: 'hasInputSchema', label: 'Request schema' }, { key: 'hasOutputFields', label: 'Output fields' }, { key: 'hasOutputSchema', label: 'Output schema' }, { key: 'hasOutputExample', label: 'Output example' }, { key: 'curatedOnly', label: 'Bazaar curated' }] as const).map(filter => <Label key={filter.key} className="min-h-8 text-xs font-normal leading-relaxed"><Checkbox checked={search[filter.key] === true} onCheckedChange={checked => onChange({ [filter.key]: checked === true ? true : undefined })} />{filter.label}</Label>)}
      <p className="text-xs leading-relaxed text-muted-foreground">Provider metadata and source curation.</p>
    </fieldset>
    <fieldset className="flex flex-col gap-2 border-t pt-5"><legend className="sr-only">Payer breadth</legend><p className="text-sm font-semibold">Payer breadth · 30 days</p>
      {search.adoptionBand === undefined ? null : <Button type="button" variant="secondary" className="h-auto min-h-9 justify-between gap-2 text-xs whitespace-normal" aria-label={`Remove payer band: ${adoptionBandLabels[search.adoptionBand]}`} onClick={() => onChange({ adoptionBand: undefined })}>{adoptionBandLabels[search.adoptionBand]}<XIcon className="size-3" /></Button>}
      {search.maxPayers30d === undefined ? null : <Button type="button" variant="secondary" className="h-auto min-h-9 justify-between gap-2 text-xs whitespace-normal" aria-label="Remove maximum payer count" onClick={() => onChange({ maxPayers30d: undefined })}>At most {search.maxPayers30d.toLocaleString('en-AU')} paying addresses<XIcon className="size-3" /></Button>}
      {[{ label: 'Any payer count', value: undefined }, { label: '10+ paying addresses', value: 10 }, { label: '100+ paying addresses', value: 100 }, { label: '1,000+ paying addresses', value: 1000 }].map(option => {
        const selected = search.minPayers30d === option.value && search.adoptionBand === undefined && search.maxPayers30d === undefined
        return <Button key={option.label} type="button" variant="ghost" aria-pressed={selected} className={cn('h-auto min-h-9 w-full justify-start px-2 text-xs font-normal', selected && 'bg-muted font-medium')} onClick={() => onChange({ minPayers30d: option.value, maxPayers30d: undefined, adoptionBand: undefined })}>{option.label}</Button>
      })}
      <p className="text-xs leading-relaxed text-muted-foreground">Distinct paying addresses per Tool, not people or Customers.</p>
    </fieldset>
    {facets?.tags?.length || search.tags?.length ? <MultipleFacets label="Tags" values={facets?.tags ?? []} selected={search.tags} onChange={tags => onChange({ tags })} /> : null}
    {facets?.bundleSlugs?.length || search.bundleSlugs?.length ? <MultipleFacets label="Collections" values={facets?.bundleSlugs ?? []} selected={search.bundleSlugs} onChange={bundleSlugs => onChange({ bundleSlugs })} /> : null}
  </div>
}

/** Values are passed to the route; the current page is never filtered in the browser. */
export function DirectoryExplorerFilters(props: Props) {
  const filterKeys = ['directoryCategory', 'network', 'provider', 'minUsdPrice', 'maxUsdPrice', 'minPayers30d', 'maxPayers30d', 'priceBand', 'adoptionBand', 'curatedOnly', 'hasInputFields', 'hasOutputExample', 'hasInputSchema', 'hasOutputFields', 'hasOutputSchema', 'tags', 'bundleSlugs'] as const
  const count = filterKeys.filter(key => props.search[key] !== undefined && props.search[key] !== false).length
  const key = JSON.stringify(props.search)
  return <>
    <aside aria-label="Tool filters" className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] w-52 shrink-0 self-start overflow-y-auto overscroll-contain pr-4 md:block"><FilterBody key={key} {...props} /></aside>
    <div className="md:hidden"><Sheet><SheetTrigger asChild><Button variant="outline" size="sm" aria-label={count > 0 ? `Filters ${count}` : 'Filters'}><SlidersHorizontalIcon />Filters{count > 0 ? <span className="rounded bg-muted px-1.5 tabular-nums">{count}</span> : null}</Button></SheetTrigger><SheetContent side="left" className="w-full gap-0 sm:max-w-md"><SheetHeader className="border-b p-5"><SheetTitle>Refine Tools</SheetTitle><SheetDescription>Filter the catalogue by price, Provider and published details.</SheetDescription></SheetHeader><div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5"><FilterBody key={key} {...props} /></div><SheetFooter className="border-t"><SheetClose asChild><Button>Show results</Button></SheetClose></SheetFooter></SheetContent></Sheet></div>
  </>
}
