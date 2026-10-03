import { ChevronDownIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Button } from '@/components/arc/button/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from '@/components/arc/drawer/Drawer'
import { cn } from '@/lib/utils'
import { SEARCH_QUERY_MAX_LENGTH } from '@/modules/common/search-query'
import { x402DirectoryFilterSchema } from '@/modules/market/x402-directory'
import type { X402DirectoryCatalogueOverview, X402DirectoryFacet } from '@/modules/market/x402-directory-catalogue'
import type { DirectoryExplorerFilterPatch, DirectoryExplorerFilterValues } from '@/modules/market/directory-filters.contracts'
import { formatPaymentNetwork } from '@/modules/market/tool-view-model'
import { DIRECTORY_PRICE_BANDS, type DirectoryPriceBand } from '@/modules/market/x402-directory-index'

export type DirectoryExplorerFiltersProps = Readonly<{
  search: DirectoryExplorerFilterValues
  overview?: X402DirectoryCatalogueOverview
  onChange: (patch: DirectoryExplorerFilterPatch) => void
  onReset: () => void
  jevRecipient?: string
  showQuery?: boolean
}>
const priceBandLabels = { lt_0_01: 'Under 0.01 Provider-listed USDC', '0_01_to_0_03': '0.01–<0.03 Provider-listed USDC', '0_03_to_0_10': '0.03–<0.10 Provider-listed USDC', '0_10_to_1': '0.10–<1 Provider-listed USDC', '1_to_10': '1–<10 Provider-listed USDC', '10_plus': '10+ Provider-listed USDC', unknown: 'Price not comparable' }
const adoptionBandLabels = { missing: 'Payers not reported', '0': '0 paying addresses', '1': '1 paying address', '2_4': '2–4 paying addresses', '5_9': '5–9 paying addresses', '10_49': '10–49 paying addresses', '50_plus': '50+ paying addresses' }
const advancedFilterKeys = ['network', 'minUsdPrice', 'maxUsdPrice', 'minPayers30d', 'maxPayers30d', 'adoptionBand', 'curatedOnly', 'hasInputFields', 'hasOutputExample', 'hasInputSchema', 'hasOutputFields', 'hasOutputSchema', 'tags', 'bundleSlugs'] as const
const explorerFilterKeys = ['directoryCategory', 'network', 'provider', 'minUsdPrice', 'maxUsdPrice', 'minPayers30d', 'maxPayers30d', 'priceBand', 'adoptionBand', 'curatedOnly', 'reviewedProvidersOnly', 'hasInputFields', 'hasOutputExample', 'hasInputSchema', 'hasOutputFields', 'hasOutputSchema', 'tags', 'bundleSlugs'] as const

const discoverFacetPill = 'rounded-full border border-transparent transition-[background-color,border-color,color] duration-fast ease-standard active:scale-100'
const discoverFacetSelected = cn(discoverFacetPill, 'border-border/70 bg-card')

function activeAdvancedFilterCount(search: DirectoryExplorerFilterValues) {
  return advancedFilterKeys.filter(key => {
    const value = search[key]
    return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== false
  }).length
}

function DirectoryQueryFilter({ search, onChange, jevRecipient }: Pick<DirectoryExplorerFiltersProps, 'search' | 'onChange' | 'jevRecipient'>) {
  const id = useId()
  const [query, setQuery] = useState(search.query ?? '')
  const [queryError, setQueryError] = useState<string>()
  const inputRef = useRef<HTMLInputElement>(null)
  return <form className="flex flex-col gap-2" onSubmit={event => {
    event.preventDefault()
    const trimmed = query.trim()
    if (trimmed.length > SEARCH_QUERY_MAX_LENGTH) {
      setQueryError(`Use ${SEARCH_QUERY_MAX_LENGTH} characters or fewer. Shorten your search and try again.`)
      inputRef.current?.focus()
      return
    }
    setQueryError(undefined)
    onChange({ query: trimmed || undefined, sort: trimmed ? 'relevance' : undefined })
  }}>
    <Field>
      <FieldLabel htmlFor={`${id}-query`}>Search Tools</FieldLabel>
      <Input ref={inputRef} id={`${id}-query`} type="search" value={query} onChange={event => { setQuery(event.target.value); setQueryError(undefined) }} placeholder="Weather forecasts, document analysis…" aria-invalid={queryError !== undefined} aria-describedby={queryError === undefined ? undefined : `${id}-query-error`} />
      <FieldError id={`${id}-query-error`} className="text-xs">{queryError}</FieldError>
      {jevRecipient === undefined ? <p className="text-xs text-muted-foreground">Search assesses Market Tool listings and published candidate descriptions.</p> : <p className="text-xs text-muted-foreground">Search query and candidate Tool text go to {jevRecipient}.</p>}
    </Field>
    <Button type="submit" variant="secondary" size="sm" className="w-full">Search Tools</Button>
  </form>
}

function MultipleFacets({ label, values, selected = [], onChange }: Readonly<{ label: string; values: readonly X402DirectoryFacet[]; selected?: readonly string[] | undefined; onChange: (values: string[] | undefined) => void }>) {
  const [query, setQuery] = useState('')
  const visible = values.filter(item => `${item.label} ${item.key}`.toLowerCase().includes(query.trim().toLowerCase()))
  const selectedKeys = new Set(selected)
  const valueKeys = new Set(values.map(item => item.key))
  const unlistedSelected: string[] = []
  for (const key of selected) if (!valueKeys.has(key)) unlistedSelected.push(key)
  function toggle(key: string) {
    const next = selectedKeys.has(key) ? selected.filter(value => value !== key) : [...selected, key]
    onChange(next.length === 0 ? undefined : next)
  }
  return <fieldset className="flex min-w-0 flex-col gap-3 border-t pt-5"><legend className="sr-only">{label}</legend><p className="text-sm font-medium">{label}</p><Input value={query} aria-label={`Find shown ${label.toLowerCase()}`} onChange={event => setQuery(event.target.value)} placeholder={`Find ${label.toLowerCase()}…`} className="h-9" /><div className="flex max-h-52 flex-col gap-1 overflow-y-auto overscroll-contain">
    {visible.map(item => <Label key={item.key} className="min-h-10 justify-between gap-2 py-1 text-xs font-normal"><span className="flex min-w-0 items-center gap-2"><Checkbox aria-label={`${item.label} ${item.count.toLocaleString('en-AU')}`} checked={selectedKeys.has(item.key)} disabled={selected.length >= 5 && !selectedKeys.has(item.key)} onCheckedChange={() => toggle(item.key)} /><span className="break-words">{item.label}</span></span><span className="shrink-0 text-muted-foreground tabular-nums">{item.count.toLocaleString('en-AU')}</span></Label>)}
    {visible.length === 0 ? <p className="text-xs text-muted-foreground">No match in the shown {label.toLowerCase()}.</p> : null}
  </div>{unlistedSelected.map(key => <Button labelLayout="between" type="button" key={key} variant="secondary" size="sm" className={cn('h-auto min-h-9 justify-between whitespace-normal', discoverFacetSelected)} onClick={() => toggle(key)} aria-label={`Remove ${label.toLowerCase()}: ${key}`}>{key}<XIcon className="size-3" /></Button>)}<p className="text-xs leading-relaxed text-muted-foreground">A selection from the catalogue. Choose up to five; Tools can match any selected {label === 'Tags' ? 'tag' : 'collection'}.</p></fieldset>
}

function Facets({ label, values, selected, onChange, searchable = false, allLabel, showCount = true }: Readonly<{
  label: string; values: readonly X402DirectoryFacet[]; selected?: string | undefined
  onChange: (value: string | undefined) => void; searchable?: boolean; allLabel?: string; showCount?: boolean
}>) {
  const [query, setQuery] = useState('')
  const visible = values.filter(item => `${item.label} ${item.key}`.toLowerCase().includes(query.trim().toLowerCase()))
  const allText = allLabel ?? (label === 'Network' ? 'All networks' : 'All categories')
  return <fieldset className="min-w-0 flex flex-col gap-3">
    <legend className="mb-3 text-sm font-medium">{label}</legend>
    {searchable ? <div className="relative"><SearchIcon className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" /><Input aria-label={`Find ${label.toLowerCase()}`} value={query} onChange={event => setQuery(event.target.value)} placeholder={`Find ${label.toLowerCase()}…`} className="h-9 pl-8" /></div> : null}
    <div className="max-h-60 flex flex-col gap-0.5 overflow-y-auto overscroll-contain">
      <Button type="button" variant="ghost" onClick={() => onChange(undefined)} aria-pressed={selected === undefined} className={cn('h-auto min-h-10 w-full justify-start px-3 text-xs font-normal', selected === undefined ? discoverFacetSelected : discoverFacetPill)}>{allText}</Button>
      {visible.map(item => <Button key={item.key} type="button" variant="ghost" aria-label={showCount ? `${item.label} ${item.count.toLocaleString('en-AU')}` : item.label} aria-pressed={selected === item.key} onClick={() => onChange(selected === item.key ? undefined : item.key)} className={cn('h-auto min-h-10 w-full justify-between gap-3 px-3 text-xs font-normal', selected === item.key ? discoverFacetSelected : discoverFacetPill)}>
        <span className="min-w-0 break-words text-left whitespace-normal">{item.label}</span>{showCount ? <span className="shrink-0 text-muted-foreground tabular-nums">{item.count.toLocaleString('en-AU')}</span> : null}
      </Button>)}
      {visible.length === 0 ? <p className="px-2 py-2 text-xs text-muted-foreground">No matching {label.toLowerCase()}.</p> : null}
      {selected !== undefined && !values.some(item => item.key === selected) ? <Button labelLayout="start" type="button" variant="secondary" className={cn('h-auto min-h-9 w-full justify-start whitespace-normal', discoverFacetSelected)} aria-pressed onClick={() => onChange(undefined)}>{selected}</Button> : null}
    </div>
  </fieldset>
}

function ListedPriceFilter({ search, onChange }: Pick<DirectoryExplorerFiltersProps, 'search' | 'onChange'>) {
  const id = useId()
  const [minimum, setMinimum] = useState(() => search.minUsdPrice?.toString() ?? '')
  const [maximum, setMaximum] = useState(() => search.maxUsdPrice?.toString() ?? '')
  const minimumRef = useRef<HTMLInputElement>(null)
  const [priceError, setPriceError] = useState<string>()
  return <form className="flex flex-col gap-3 border-t pt-5" onSubmit={event => {
    event.preventDefault()
    const min = minimum.trim() === '' ? undefined : Number(minimum), max = maximum.trim() === '' ? undefined : Number(maximum)
    if ((min !== undefined && (!Number.isFinite(min) || min < 0)) || (max !== undefined && (!Number.isFinite(max) || max < 0)) || (min !== undefined && max !== undefined && min > max)) { setPriceError('Enter a valid price range with the minimum no greater than the maximum.'); minimumRef.current?.focus(); return }
    setPriceError(undefined); onChange({ minUsdPrice: min, maxUsdPrice: max, priceBand: undefined })
  }}>
    <p className="text-sm font-medium">Custom Provider-listed price · USDC</p>
    <FieldGroup className="grid grid-cols-2 gap-2"><Field className="gap-2"><FieldLabel className="text-xs font-normal" htmlFor={`${id}-minimum`}>Min USDC</FieldLabel><Input ref={minimumRef} id={`${id}-minimum`} type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={minimum} aria-invalid={priceError !== undefined} aria-describedby={priceError === undefined ? undefined : `${id}-price-error`} onChange={event => setMinimum(event.target.value)} /></Field><Field className="gap-2"><FieldLabel className="text-xs font-normal" htmlFor={`${id}-maximum`}>Max USDC</FieldLabel><Input id={`${id}-maximum`} type="number" min="0" step="any" inputMode="decimal" placeholder="Any" value={maximum} aria-invalid={priceError !== undefined} aria-describedby={priceError === undefined ? undefined : `${id}-price-error`} onChange={event => setMaximum(event.target.value)} /></Field></FieldGroup>
    <FieldError id={`${id}-price-error`} className="text-xs">{priceError}</FieldError>
    <p className="text-xs leading-relaxed text-muted-foreground">A Provider-listed USDC range, not your AUD budget. Applying it clears the listed-price band.</p><Button type="submit" variant="secondary" size="sm" className="w-full">Apply price range</Button>
  </form>
}

function ProviderFilter({ search, onChange }: Pick<DirectoryExplorerFiltersProps, 'search' | 'onChange'>) {
  const id = useId()
  const [provider, setProvider] = useState(search.provider ?? '')
  const providerRef = useRef<HTMLInputElement>(null)
  const [providerError, setProviderError] = useState<string>()
  return <form className="flex flex-col gap-3 border-t pt-5" onSubmit={event => {
      event.preventDefault()
      const parsed = x402DirectoryFilterSchema.safeParse(provider.trim() === '' ? {} : { provider })
      if (!parsed.success) { setProviderError('Enter a Provider hostname, such as api.example.com.'); providerRef.current?.focus(); return }
      setProviderError(undefined); onChange({ provider: parsed.data.provider })
    }}><Field><FieldLabel htmlFor={`${id}-provider`}>Provider</FieldLabel><Input ref={providerRef} id={`${id}-provider`} value={provider} onChange={event => setProvider(event.target.value)} placeholder="api.example.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={providerError !== undefined} aria-describedby={providerError === undefined ? undefined : `${id}-provider-error`} /><FieldError id={`${id}-provider-error`} className="text-xs">{providerError}</FieldError></Field><Button type="submit" variant="secondary" size="sm" className="w-full">Apply Provider</Button></form>
}

function PublishedDetailsFilter({ search, onChange }: Pick<DirectoryExplorerFiltersProps, 'search' | 'onChange'>) {
  return <fieldset className="flex flex-col gap-3 border-t pt-5"><legend className="sr-only">Published request details</legend><p className="text-sm font-medium">Published details</p>
      {([{ key: 'hasInputFields', label: 'Request fields' }, { key: 'hasInputSchema', label: 'Request schema' }, { key: 'hasOutputFields', label: 'Output fields' }, { key: 'hasOutputSchema', label: 'Output schema' }, { key: 'hasOutputExample', label: 'Output example' }, { key: 'curatedOnly', label: 'Bazaar curated' }] as const).map(filter => <Label key={filter.key} className="min-h-10 py-1 text-xs font-normal leading-relaxed"><Checkbox checked={search[filter.key] === true} onCheckedChange={checked => onChange({ [filter.key]: checked === true ? true : undefined })} />{filter.label}</Label>)}
      <p className="text-xs leading-relaxed text-muted-foreground">Provider metadata and source curation.</p>
    </fieldset>
}

function PayerBreadthFilter({ search, onChange }: Pick<DirectoryExplorerFiltersProps, 'search' | 'onChange'>) {
  return <fieldset className="flex flex-col gap-2 border-t pt-5"><legend className="sr-only">Payer breadth</legend><p className="text-sm font-medium">Payer breadth · 30 days</p>
      {search.adoptionBand === undefined ? null : <Button labelLayout="between" type="button" variant="secondary" className={cn('h-auto min-h-9 justify-between gap-2 text-xs whitespace-normal', discoverFacetSelected)} aria-label={`Remove payer band: ${adoptionBandLabels[search.adoptionBand]}`} onClick={() => onChange({ adoptionBand: undefined })}>{adoptionBandLabels[search.adoptionBand]}<XIcon className="size-3" /></Button>}
      {search.maxPayers30d === undefined ? null : <Button labelLayout="between" type="button" variant="secondary" className={cn('h-auto min-h-9 justify-between gap-2 text-xs whitespace-normal', discoverFacetSelected)} aria-label="Remove maximum payer count" onClick={() => onChange({ maxPayers30d: undefined })}>At most {search.maxPayers30d.toLocaleString('en-AU')} paying addresses<XIcon className="size-3" /></Button>}
      {[{ label: 'Any payer count', value: undefined }, { label: '10+ paying addresses', value: 10 }, { label: '100+ paying addresses', value: 100 }, { label: '1,000+ paying addresses', value: 1000 }].map(option => {
        const selected = search.minPayers30d === option.value && search.adoptionBand === undefined && search.maxPayers30d === undefined
        return <Button labelLayout="start" key={option.label} type="button" variant="ghost" aria-pressed={selected} className={cn('h-auto min-h-10 w-full justify-start px-3 text-xs font-normal', selected ? discoverFacetSelected : discoverFacetPill)} onClick={() => onChange({ minPayers30d: option.value, maxPayers30d: undefined, adoptionBand: undefined })}>{option.label}</Button>
      })}
      <p className="text-xs leading-relaxed text-muted-foreground">Distinct paying addresses per Tool, not people or Customers.</p>
    </fieldset>
}

function AdvancedFilters({ search, overview, onChange }: Pick<DirectoryExplorerFiltersProps, 'search' | 'overview' | 'onChange'>) {
  const facets = overview?.kind === 'ok' ? overview : undefined
  const activeCount = activeAdvancedFilterCount(search)
  const [open, setOpen] = useState(activeCount > 0)
  return <Collapsible open={open} onOpenChange={setOpen} className="border-t pt-3">
      <CollapsibleTrigger render={<Button labelLayout="between" type="button" variant="ghost" className="h-auto min-h-10 w-full justify-between px-2 active:scale-100" aria-label={activeCount > 0 ? `Advanced filters ${activeCount} active` : 'Advanced filters'}>
        <span>Advanced filters{activeCount > 0 ? <span className="ml-2 rounded bg-muted px-1.5 text-xs tabular-nums">{activeCount}</span> : null}</span>
        <ChevronDownIcon className={cn('transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </Button>} />
      <CollapsibleContent className="flex flex-col gap-6 pt-4">
        {facets === undefined ? null : <Facets label="Network" allLabel="All networks" values={facets.networks.map(item => ({ ...item, label: formatPaymentNetwork(item.label) }))} selected={search.network} onChange={network => onChange({ network })} />}
        <ListedPriceFilter search={search} onChange={onChange} />
        <ProviderFilter search={search} onChange={onChange} />
        <PublishedDetailsFilter search={search} onChange={onChange} />
        <PayerBreadthFilter search={search} onChange={onChange} />
        {facets?.tags?.length || search.tags?.length ? <MultipleFacets label="Tags" values={facets?.tags ?? []} selected={search.tags} onChange={tags => onChange({ tags })} /> : null}
        {facets?.bundleSlugs?.length || search.bundleSlugs?.length ? <MultipleFacets label="Collections" values={facets?.bundleSlugs ?? []} selected={search.bundleSlugs} onChange={bundleSlugs => onChange({ bundleSlugs })} /> : null}
      </CollapsibleContent>
    </Collapsible>
}

function FilterBody({ search, overview, onChange, onReset, showHeading = true, showQuery = true, jevRecipient }: DirectoryExplorerFiltersProps & Readonly<{ showHeading?: boolean }>) {
  const facets = overview?.kind === 'ok' ? overview : undefined
  return <div className="flex flex-col gap-6">
    {showQuery ? <DirectoryQueryFilter search={search} onChange={onChange} {...(jevRecipient === undefined ? {} : { jevRecipient })} /> : null}
    {showHeading ? <div className="flex items-center justify-between"><p className="text-sm font-medium">Filters</p><Button type="button" variant="ghost" size="sm" className="min-h-touch" onClick={onReset}>Clear all</Button></div> : null}
    <div className="flex flex-col gap-2">
      <Label className="min-h-touch gap-2 text-sm"><Checkbox checked={search.reviewedProvidersOnly === true} onCheckedChange={checked => onChange({ reviewedProvidersOnly: checked === true ? true : undefined })} />Reviewed providers</Label>
      <p className="text-xs leading-relaxed text-muted-foreground">An initial shortlist reviewed against public operator and service evidence. Turn off to browse all providers.</p>
    </div>
    {facets === undefined ? <p className="text-xs text-muted-foreground">Category and network counts are unavailable.</p> : <><p className="text-xs leading-relaxed text-muted-foreground">Counts cover the full indexed catalogue.</p><Facets label="Provider" allLabel="All providers" values={facets.providers} selected={search.provider} onChange={provider => onChange({ provider })} searchable /></>}
    <Facets label="Provider-listed price · USDC" allLabel="Any Provider-listed price" showCount={false} values={DIRECTORY_PRICE_BANDS.map(key => ({ key, label: priceBandLabels[key], count: 0 }))} selected={search.priceBand} onChange={value => {
      const priceBand = value === undefined ? undefined : DIRECTORY_PRICE_BANDS.find((band): band is DirectoryPriceBand => band === value)
      if (value !== undefined && priceBand === undefined) return
      onChange({ priceBand, minUsdPrice: undefined, maxUsdPrice: undefined })
    }} />
    <AdvancedFilters search={search} {...(overview === undefined ? {} : { overview })} onChange={onChange} />
    {facets === undefined ? null : <Facets label="Provider category" allLabel="All categories" values={facets.categories} selected={search.directoryCategory} onChange={directoryCategory => onChange({ directoryCategory })} searchable />}
  </div>
}

/** Values are passed to the route; the current page is never filtered in the browser. */
export function DirectoryExplorerFilters(props: DirectoryExplorerFiltersProps) {
  const count = explorerFilterKeys.filter(key => props.search[key] !== undefined && props.search[key] !== false).length
  const [clearCount, setClearCount] = useState(0)
  return <Drawer><DrawerTrigger render={<Button labelLayout="between" type="button" variant="secondary" className="h-11 w-40 justify-between px-3 active:scale-100" aria-label={count > 0 ? `Filters ${count}` : 'Filters'}><span className="inline-flex items-center gap-2"><SlidersHorizontalIcon />Filters</span><span className={cn('min-w-5 rounded px-1 text-center text-xs tabular-nums', count > 0 ? 'bg-muted' : 'invisible')} aria-hidden="true">{count > 0 ? count : 1}</span></Button>} /><DrawerContent side="left" title="Refine Tools" description="Filter the catalogue by price, Provider and published details." className="arc-market-filters"><div className="min-w-0"><FilterBody key={clearCount} {...props} onReset={() => { setClearCount(value => value + 1); props.onReset() }} showHeading={false} /></div><footer className="mt-5 flex flex-row flex-wrap items-stretch gap-3 border-t pt-5"><Button labelLayout="wrap" type="button" variant="secondary" className="min-h-touch flex-1 active:scale-100" onClick={() => { setClearCount(value => value + 1); props.onReset() }}>Clear filters</Button><DrawerClose render={<Button labelLayout="wrap" type="button" className="min-h-touch flex-1 active:scale-100">Show results</Button>} /></footer></DrawerContent></Drawer>
}
