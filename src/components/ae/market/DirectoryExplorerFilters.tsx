import { ChevronDownIcon, SlidersHorizontalIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import styles from './DirectoryExplorerFilters.module.css'
import { Button } from '@/components/arc/button/button'
import { ChipGroup, type ChipOption } from '@/components/arc/chip-group/chip-group'
import { Combobox, type ComboboxOption } from '@/components/arc/combobox/combobox'
import { FilterToolbar, type FilterChip } from '@/components/arc/filter-toolbar/filter-toolbar'
import { Input } from '@/components/arc/input/input'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from '@/components/ae/shared/base-ui/drawer/drawer'
import { cn } from '@/lib/utils'
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
  entity?: 'tools' | 'providers'
}>

type ExplorerFilterKey = typeof explorerFilterKeys[number]

const priceBandLabels = { lt_0_01: 'Under 0.01 Provider-listed USDC', '0_01_to_0_03': '0.01–<0.03 Provider-listed USDC', '0_03_to_0_10': '0.03–<0.10 Provider-listed USDC', '0_10_to_1': '0.10–<1 Provider-listed USDC', '1_to_10': '1–<10 Provider-listed USDC', '10_plus': '10+ Provider-listed USDC', unknown: 'Price not comparable' }
const adoptionBandLabels = { missing: 'Payers not reported', '0': '0 paying addresses', '1': '1 paying address', '2_4': '2–4 paying addresses', '5_9': '5–9 paying addresses', '10_49': '10–49 paying addresses', '50_plus': '50+ paying addresses' }
const explorerFilterKeys = ['directoryCategory', 'network', 'provider', 'minUsdPrice', 'maxUsdPrice', 'minPayers30d', 'maxPayers30d', 'priceBand', 'adoptionBand', 'curatedOnly', 'reviewedProvidersOnly', 'hasInputFields', 'hasOutputExample', 'hasInputSchema', 'hasOutputFields', 'hasOutputSchema', 'tags', 'bundleSlugs'] as const
const advancedFilterKeys = ['network', 'minUsdPrice', 'maxUsdPrice', 'minPayers30d', 'maxPayers30d', 'adoptionBand', 'curatedOnly', 'hasInputFields', 'hasOutputExample', 'hasInputSchema', 'hasOutputFields', 'hasOutputSchema', 'tags', 'bundleSlugs'] as const

const publishedDetailOptions = [
  { value: 'hasInputFields', label: 'Request fields' },
  { value: 'hasInputSchema', label: 'Request schema' },
  { value: 'hasOutputFields', label: 'Output fields' },
  { value: 'hasOutputSchema', label: 'Output schema' },
  { value: 'hasOutputExample', label: 'Output example' },
  { value: 'curatedOnly', label: 'Bazaar curated' },
] as const satisfies readonly (ChipOption & { value: keyof DirectoryExplorerFilterValues })[]

function isActive(search: DirectoryExplorerFilterValues, key: ExplorerFilterKey) {
  const value = search[key]
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== false
}

function activeAdvancedFilterCount(search: DirectoryExplorerFilterValues) {
  return advancedFilterKeys.filter(key => {
    const value = search[key]
    return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== false
  }).length
}

function facetOptions(values: readonly X402DirectoryFacet[], selected: string | undefined, formatLabel?: (label: string) => string): ComboboxOption[] {
  const options = values.map(item => ({
    value: item.key,
    label: `${formatLabel?.(item.label) ?? item.label} ${item.count.toLocaleString('en-AU')}`,
    keywords: [item.key, item.label],
  }))
  if (selected !== undefined && !options.some(option => option.value === selected)) options.push({ value: selected, label: selected, keywords: [selected] })
  return options
}

function Facets({ label, values, selected, onChange, allLabel, description, formatLabel }: Readonly<{
  label: string
  values: readonly X402DirectoryFacet[]
  selected?: string | undefined
  onChange: (value: string | undefined) => void
  allLabel: string
  description?: string | undefined
  formatLabel?: (label: string) => string
}>) {
  return <Combobox
    label={label}
    options={facetOptions(values, selected, formatLabel)}
    value={selected ?? ''}
    onValueChange={value => onChange(value || undefined)}
    placeholder={allLabel}
    {...(description === undefined ? {} : { description })}
    emptyMessage={`No matching ${label.toLowerCase()}.`}
  />
}

function ListedPriceFilter({ search, onChange }: Pick<DirectoryExplorerFiltersProps, 'search' | 'onChange'>) {
  const id = useId()
  const minimumId = `${id}-minimum`
  const [minimum, setMinimum] = useState(() => search.minUsdPrice?.toString() ?? '')
  const [maximum, setMaximum] = useState(() => search.maxUsdPrice?.toString() ?? '')
  const minimumRef = useRef<HTMLInputElement>(null)
  const [priceError, setPriceError] = useState<string>()

  return <form className="flex flex-col gap-3 border-t pt-5" onSubmit={event => {
    event.preventDefault()
    const min = minimum.trim() === '' ? undefined : Number(minimum), max = maximum.trim() === '' ? undefined : Number(maximum)
    if ((min !== undefined && (!Number.isFinite(min) || min < 0)) || (max !== undefined && (!Number.isFinite(max) || max < 0)) || (min !== undefined && max !== undefined && min > max)) {
      setPriceError('Enter a valid price range with the minimum no greater than the maximum.')
      minimumRef.current?.focus()
      return
    }
    setPriceError(undefined)
    onChange({ minUsdPrice: min, maxUsdPrice: max, priceBand: undefined })
  }}>
    <p className="text-sm font-medium">Custom Provider-listed price · USDC</p>
    <div className="grid grid-cols-2 gap-2">
      <Input ref={minimumRef} id={minimumId} label="Min USDC" type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={minimum} {...(priceError === undefined ? {} : { error: priceError })} onChange={event => { setMinimum(event.target.value); setPriceError(undefined) }} />
      <Input id={`${id}-maximum`} label="Max USDC" type="number" min="0" step="any" inputMode="decimal" placeholder="Any" value={maximum} aria-invalid={priceError !== undefined} aria-describedby={priceError === undefined ? undefined : `${minimumId}-error`} onChange={event => { setMaximum(event.target.value); setPriceError(undefined) }} />
    </div>
    <p className="text-xs leading-relaxed text-muted-foreground">A Provider-listed USDC range, not your AUD budget. Applying it clears the listed-price band.</p>
    <Button type="submit" variant="secondary" size="sm" className="w-full">Apply price range</Button>
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
    if (!parsed.success) {
      setProviderError('Enter a Provider hostname, such as api.example.com.')
      providerRef.current?.focus()
      return
    }
    setProviderError(undefined)
    onChange({ provider: parsed.data.provider })
  }}>
    <Input ref={providerRef} id={`${id}-provider`} label="Provider" value={provider} onChange={event => { setProvider(event.target.value); setProviderError(undefined) }} placeholder="api.example.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} {...(providerError === undefined ? {} : { error: providerError })} />
    <Button type="submit" variant="secondary" size="sm" className="w-full">Apply Provider</Button>
  </form>
}

function PublishedDetailsFilter({ search, onChange }: Pick<DirectoryExplorerFiltersProps, 'search' | 'onChange'>) {
  const selected = publishedDetailOptions.filter(option => search[option.value] === true).map(option => option.value)

  function change(values: string[]) {
    const next = new Set(values)
    const patch: DirectoryExplorerFilterPatch = {}
    for (const option of publishedDetailOptions) {
      const wasSelected = search[option.value] === true
      const isSelected = next.has(option.value)
      if (wasSelected !== isSelected) Object.assign(patch, { [option.value]: isSelected ? true : undefined })
    }
    if (Object.keys(patch).length > 0) onChange(patch)
  }

  return <div className="flex flex-col gap-3 border-t pt-5">
    <p className="text-sm font-medium">Published details</p>
    <ChipGroup options={[...publishedDetailOptions]} value={selected} onValueChange={change} label="Published details" />
    <p className="text-xs leading-relaxed text-muted-foreground">Provider metadata and source curation.</p>
  </div>
}

function ReviewedProvidersFilter({ search, onChange }: Pick<DirectoryExplorerFiltersProps, 'search' | 'onChange'>) {
  return <div className="flex flex-col gap-3 border-t pt-5">
    <ChipGroup
      options={[{ value: 'reviewed', label: 'Reviewed providers' }]}
      value={search.reviewedProvidersOnly === true ? ['reviewed'] : []}
      onValueChange={values => onChange({ reviewedProvidersOnly: values.length > 0 ? true : undefined })}
      label="Provider review"
      multiple={false}
    />
    <p className="text-xs leading-relaxed text-muted-foreground">An initial shortlist reviewed against public operator and service evidence. Turn off to browse all providers.</p>
  </div>
}

function PayerBreadthFilter({ search, onChange }: Pick<DirectoryExplorerFiltersProps, 'search' | 'onChange'>) {
  const selectedBand = search.adoptionBand
  const selectedMax = search.maxPayers30d
  const removalFilters: FilterChip[] = [
    ...(selectedBand === undefined ? [] : [{ id: 'adoptionBand', label: 'payer band', value: adoptionBandLabels[selectedBand] }]),
    ...(selectedMax === undefined ? [] : [{ id: 'maxPayers30d', label: 'maximum payer count', value: `At most ${selectedMax.toLocaleString('en-AU')} paying addresses` }]),
    ...(search.minPayers30d === undefined ? [] : [{ id: 'minPayers30d', label: 'minimum payer count', value: `At least ${search.minPayers30d.toLocaleString('en-AU')} paying addresses` }]),
  ]
  const payerOptions = [
    { value: 'any', label: 'Any payer count' },
    { value: '10', label: '10+ paying addresses' },
    { value: '100', label: '100+ paying addresses' },
    { value: '1000', label: '1,000+ paying addresses' },
  ]
  if (search.minPayers30d !== undefined && ![10, 100, 1000].includes(search.minPayers30d)) {
    payerOptions.push({ value: String(search.minPayers30d), label: `${search.minPayers30d.toLocaleString('en-AU')}+ paying addresses` })
  }
  const selectedPayerValue = selectedBand === undefined && selectedMax === undefined
    ? [search.minPayers30d === undefined ? 'any' : String(search.minPayers30d)]
    : []

  function change(values: string[]) {
    const token = values[0]
    const minPayers30d = token === undefined || token === 'any' ? undefined : Number(token)
    if (minPayers30d !== undefined && (!Number.isSafeInteger(minPayers30d) || minPayers30d < 0)) return
    onChange({ minPayers30d, maxPayers30d: undefined, adoptionBand: undefined })
  }

  return <fieldset className="flex flex-col gap-2 border-t pt-5">
    <legend className="sr-only">Payer breadth</legend>
    <p className="text-sm font-medium">Payer breadth · 30 days</p>
    <FilterToolbar
      filters={removalFilters}
      label="Existing payer filters"
      onRemove={id => {
        if (id === 'adoptionBand') onChange({ adoptionBand: undefined })
        if (id === 'maxPayers30d') onChange({ maxPayers30d: undefined })
        if (id === 'minPayers30d') onChange({ minPayers30d: undefined })
      }}
      onClearAll={() => onChange({ adoptionBand: undefined, maxPayers30d: undefined, minPayers30d: undefined })}
    >
      <div className={styles.payerChoiceTarget} role="group" aria-label="Payer breadth choices" tabIndex={-1} data-filter-trigger="">
        <ChipGroup className="w-full min-w-0" options={payerOptions} value={selectedPayerValue} onValueChange={change} label="Payer breadth · 30 days" multiple={false} />
      </div>
    </FilterToolbar>
    <p className="text-xs leading-relaxed text-muted-foreground">Distinct paying addresses per Tool, not people or Customers.</p>
  </fieldset>
}

function MultipleFacets({ label, filterKey, values, selected, onChange }: Readonly<{
  label: 'Tags' | 'Collections'
  filterKey: 'tags' | 'bundleSlugs'
  values: readonly X402DirectoryFacet[]
  selected?: readonly string[] | undefined
  onChange: (values: string[] | undefined) => void
}>) {
  const selectedValues = selected ?? []
  const selectedKeys = new Set(selectedValues)
  const singular = label === 'Tags' ? 'tag' : 'collection'
  const applied = selectedValues.map(value => ({
    id: `${filterKey}:${encodeURIComponent(value)}`,
    label: label === 'Tags' ? 'Tag' : 'Collection',
    value: values.find(item => item.key === value)?.label ?? value,
  }))
  const options = values.map(item => ({
    value: item.key,
    label: `${item.label} ${item.count.toLocaleString('en-AU')}`,
    keywords: [item.key, item.label],
    disabled: selectedKeys.has(item.key),
  }))
  const atLimit = selectedValues.length >= 5

  return <fieldset className="flex min-w-0 flex-col gap-3 border-t pt-5">
    <legend className="sr-only">{label}</legend>
    <p className="text-sm font-medium">{label}</p>
    <FilterToolbar
      filters={applied}
      label={`Selected ${label.toLowerCase()}`}
      onRemove={id => {
        const key = decodeURIComponent(id.slice(`${filterKey}:`.length))
        const next = selectedValues.filter(value => value !== key)
        onChange(next.length === 0 ? undefined : next)
      }}
      onClearAll={() => onChange(undefined)}
    >
      <Combobox
        label={label}
        options={options}
        value=""
        onValueChange={key => {
          if (selectedKeys.has(key) || selectedValues.length >= 5 || !values.some(item => item.key === key)) return
          onChange([...selectedValues, key])
        }}
        placeholder={`Add ${singular}`}
        disabled={atLimit}
        description={atLimit
          ? `You can select up to five ${label.toLowerCase()}. Remove a selected ${singular} to add another.`
          : `Choose up to five ${label.toLowerCase()}; Tools can match any selected ${singular}.`}
        emptyMessage={`No matching ${label.toLowerCase()}.`}
        data-filter-trigger=""
      />
    </FilterToolbar>
    <p className="text-xs leading-relaxed text-muted-foreground">These options and counts come from a bounded catalogue sample. Tools can match any selected {singular}.</p>
  </fieldset>
}

function AdvancedFilters({ search, overview, onChange }: Pick<DirectoryExplorerFiltersProps, 'search' | 'overview' | 'onChange'>) {
  const facets = overview?.kind === 'ok' ? overview : undefined
  const activeCount = activeAdvancedFilterCount(search)
  const [open, setOpen] = useState(activeCount > 0)

  return <Collapsible open={open} onOpenChange={setOpen} className="border-t pt-3">
    <CollapsibleTrigger render={<button type="button" className={styles.advancedFilterTrigger} aria-label={activeCount > 0 ? `Advanced filters ${activeCount} active` : 'Advanced filters'}>
      <span>Advanced filters{activeCount > 0 ? <span className="ml-2 rounded bg-muted px-1.5 text-xs tabular-nums">{activeCount}</span> : null}</span>
      <ChevronDownIcon className={cn('transition-transform', open && 'rotate-180')} aria-hidden="true" />
    </button>} />
    <CollapsibleContent className="flex flex-col gap-6 pt-4">
      {facets !== undefined || search.network !== undefined ? <Facets label="Network" allLabel="All networks" values={facets?.networks ?? []} selected={search.network} onChange={network => onChange({ network })} formatLabel={formatPaymentNetwork} /> : null}
      <ListedPriceFilter search={search} onChange={onChange} />
      <ProviderFilter search={search} onChange={onChange} />
      <PublishedDetailsFilter search={search} onChange={onChange} />
      <PayerBreadthFilter search={search} onChange={onChange} />
      {facets?.tags?.length || search.tags?.length ? <MultipleFacets label="Tags" filterKey="tags" values={facets?.tags ?? []} selected={search.tags} onChange={tags => onChange({ tags })} /> : null}
      {facets?.bundleSlugs?.length || search.bundleSlugs?.length ? <MultipleFacets label="Collections" filterKey="bundleSlugs" values={facets?.bundleSlugs ?? []} selected={search.bundleSlugs} onChange={bundleSlugs => onChange({ bundleSlugs })} /> : null}
    </CollapsibleContent>
  </Collapsible>
}

function FilterBody({ search, overview, onChange }: DirectoryExplorerFiltersProps) {
  const facets = overview?.kind === 'ok' ? overview : undefined

  return <div className="flex flex-col gap-6">
    {facets !== undefined || search.directoryCategory !== undefined ? <Facets label="Provider category" allLabel="All categories" values={facets?.categories ?? []} selected={search.directoryCategory} onChange={directoryCategory => onChange({ directoryCategory })} /> : null}
    {facets === undefined ? <p className="text-xs text-muted-foreground">Provider and network catalogue samples are unavailable.</p> : <>
      <p className="text-xs leading-relaxed text-muted-foreground">Provider names and counts come from a bounded catalogue sample.</p>
    </>}
    <ReviewedProvidersFilter search={search} onChange={onChange} />
    {facets !== undefined || search.provider !== undefined ? <Facets label="Providers" allLabel="All providers" values={facets?.providers ?? []} selected={search.provider} onChange={provider => onChange({ provider })} {...(facets === undefined ? {} : { description: 'Select a Provider from the bounded catalogue sample.' })} /> : null}
    <ChipGroup
      options={DIRECTORY_PRICE_BANDS.map(key => ({ value: key, label: priceBandLabels[key] }))}
      value={search.priceBand === undefined ? [] : [search.priceBand]}
      onValueChange={values => {
        const value = values[0]
        const priceBand = value === undefined ? undefined : DIRECTORY_PRICE_BANDS.find((band): band is DirectoryPriceBand => band === value)
        if (value !== undefined && priceBand === undefined) return
        onChange({ priceBand, minUsdPrice: undefined, maxUsdPrice: undefined })
      }}
      label="Provider-listed price · USDC"
      multiple={false}
    />
    <AdvancedFilters search={search} {...(overview === undefined ? {} : { overview })} onChange={onChange} />
  </div>
}

/** Values are passed to the route; the current page is never filtered in the browser. */
export function DirectoryExplorerFilters({ entity = 'tools', ...props }: DirectoryExplorerFiltersProps) {
  const count = explorerFilterKeys.filter(key => isActive(props.search, key)).length
  const [clearCount, setClearCount] = useState(0)
  const title = entity === 'providers' ? 'Refine Providers' : 'Refine Tools'
  const description = entity === 'providers'
    ? 'Filter published Provider listings by category, Provider, price and published details.'
    : 'Filter Tool listings by category, Provider, price and published details.'

  return <Drawer>
    <DrawerTrigger render={<button data-filter-trigger="" type="button" className={cn(styles.filterTrigger, 'w-40')} aria-label={count > 0 ? `Filters ${count}` : 'Filters'}>
      <span className="inline-flex items-center gap-2"><SlidersHorizontalIcon />Filters</span>
      <span className={cn('min-w-5 rounded px-1 text-center text-xs tabular-nums', count > 0 ? 'bg-muted' : 'invisible')} aria-hidden="true">{count > 0 ? count : 1}</span>
    </button>} />
    <DrawerContent side="left" title={title} description={description} closeLabel="Close" className={cn('arc-market-filters', styles.facetTargets)}>
      <div className="min-w-0"><FilterBody key={clearCount} {...props} entity={entity} onReset={() => { setClearCount(value => value + 1); props.onReset() }} /></div>
      <footer className="mt-5 flex flex-row flex-wrap items-stretch gap-3 border-t pt-5">
        <Button type="button" variant="secondary" className="min-h-touch flex-1 active:scale-100" onClick={() => { setClearCount(value => value + 1); props.onReset() }}>Clear filters</Button>
        <DrawerClose render={<Button type="button" className="min-h-touch flex-1 active:scale-100">Show results</Button>} />
      </footer>
    </DrawerContent>
  </Drawer>
}

function categoryOptions(overview: X402DirectoryCatalogueOverview | undefined, selected: string | undefined): ChipOption[] {
  const categories = overview?.kind === 'ok' ? overview.categories : []
  const options = categories.slice(0, 8).map(item => ({
    value: item.key,
    label: `${item.label} ${item.count.toLocaleString('en-AU')}`,
  }))
  if (selected !== undefined && !options.some(option => option.value === selected)) {
    const known = categories.find(item => item.key === selected)
    options.push(known === undefined
      ? { value: selected, label: selected }
      : { value: known.key, label: `${known.label} ${known.count.toLocaleString('en-AU')}` })
  }
  return options
}

function facetLabel(overview: X402DirectoryCatalogueOverview | undefined, source: 'categories' | 'providers' | 'networks' | 'tags' | 'bundleSlugs', key: string, formatLabel?: (label: string) => string) {
  if (overview?.kind !== 'ok') return key
  const item = overview[source]?.find(candidate => candidate.key === key)
  return item === undefined ? key : formatLabel?.(item.label) ?? item.label
}

function appliedFilters(search: DirectoryExplorerFilterValues, overview: X402DirectoryCatalogueOverview | undefined): FilterChip[] {
  const filters: FilterChip[] = []
  if (search.directoryCategory !== undefined) filters.push({ id: 'directoryCategory', label: 'Provider category', value: facetLabel(overview, 'categories', search.directoryCategory) })
  if (search.network !== undefined) filters.push({ id: 'network', label: 'Network', value: facetLabel(overview, 'networks', search.network, formatPaymentNetwork) })
  if (search.provider !== undefined) filters.push({ id: 'provider', label: 'Providers', value: facetLabel(overview, 'providers', search.provider) })
  if (search.minUsdPrice !== undefined) filters.push({ id: 'minUsdPrice', label: 'Minimum Provider-listed price', value: `${String(search.minUsdPrice)} USDC` })
  if (search.maxUsdPrice !== undefined) filters.push({ id: 'maxUsdPrice', label: 'Maximum Provider-listed price', value: `${String(search.maxUsdPrice)} USDC` })
  if (search.minPayers30d !== undefined) filters.push({ id: 'minPayers30d', label: 'Minimum paying addresses', value: `${search.minPayers30d.toLocaleString('en-AU')} or more` })
  if (search.maxPayers30d !== undefined) filters.push({ id: 'maxPayers30d', label: 'Maximum paying addresses', value: `At most ${search.maxPayers30d.toLocaleString('en-AU')}` })
  if (search.priceBand !== undefined) filters.push({ id: 'priceBand', label: 'Provider-listed price', value: priceBandLabels[search.priceBand] })
  if (search.adoptionBand !== undefined) filters.push({ id: 'adoptionBand', label: 'Payer band', value: adoptionBandLabels[search.adoptionBand] })
  if (search.curatedOnly === true) filters.push({ id: 'curatedOnly', label: 'Bazaar curated' })
  if (search.reviewedProvidersOnly === true) filters.push({ id: 'reviewedProvidersOnly', label: 'Reviewed providers' })
  if (search.hasInputFields === true) filters.push({ id: 'hasInputFields', label: 'Request fields' })
  if (search.hasOutputExample === true) filters.push({ id: 'hasOutputExample', label: 'Output example' })
  if (search.hasInputSchema === true) filters.push({ id: 'hasInputSchema', label: 'Request schema' })
  if (search.hasOutputFields === true) filters.push({ id: 'hasOutputFields', label: 'Output fields' })
  if (search.hasOutputSchema === true) filters.push({ id: 'hasOutputSchema', label: 'Output schema' })
  if (search.tags?.length) filters.push({ id: 'tags', label: 'Tags', value: search.tags.map(key => facetLabel(overview, 'tags', key)).join(', ') })
  if (search.bundleSlugs?.length) filters.push({ id: 'bundleSlugs', label: 'Collections', value: search.bundleSlugs.map(key => facetLabel(overview, 'bundleSlugs', key)).join(', ') })
  return filters
}

function clearExplorerFilter(key: string, onChange: DirectoryExplorerFiltersProps['onChange']) {
  if (!explorerFilterKeys.includes(key as ExplorerFilterKey)) return
  const patch: DirectoryExplorerFilterPatch = { [key]: undefined }
  onChange(patch)
}

/** Visible category entry and applied selections; the Drawer remains the editing surface for every facet. */
export function DirectoryDiscoveryFilters(props: DirectoryExplorerFiltersProps) {
  const id = useId()
  const categoriesAvailable = props.overview?.kind === 'ok' && props.overview.categories.length > 0
  const selectedCategory = props.search.directoryCategory
  const showCategory = categoriesAvailable || selectedCategory !== undefined
  const headingId = `${id}-category-heading`
  const filters = appliedFilters(props.search, props.overview)

  return <div className="arc-market-discovery-filters">
    {showCategory ? <section className="arc-market-category-entry" aria-labelledby={headingId}>
      <h2 id={headingId}>Browse by Provider category</h2>
      <p className="text-xs leading-relaxed text-muted-foreground">Category names and counts come from a bounded catalogue sample, not current search matches.</p>
      <ChipGroup
        className={styles.categoryChips ?? ''}
        options={categoryOptions(props.overview, selectedCategory)}
        value={selectedCategory === undefined ? [] : [selectedCategory]}
        onValueChange={values => props.onChange({ directoryCategory: values[0] || undefined })}
        label="Browse by Provider category"
        maxVisible={6}
        multiple={false}
      />
    </section> : null}
    <FilterToolbar
      filters={filters}
      label="Applied catalogue filters"
      onRemove={id => clearExplorerFilter(id, props.onChange)}
      onClearAll={() => props.onChange({
        directoryCategory: undefined,
        network: undefined,
        provider: undefined,
        minUsdPrice: undefined,
        maxUsdPrice: undefined,
        minPayers30d: undefined,
        maxPayers30d: undefined,
        priceBand: undefined,
        adoptionBand: undefined,
        curatedOnly: undefined,
        reviewedProvidersOnly: undefined,
        hasInputFields: undefined,
        hasOutputExample: undefined,
        hasInputSchema: undefined,
        hasOutputFields: undefined,
        hasOutputSchema: undefined,
        tags: undefined,
        bundleSlugs: undefined,
      })}
    >
      <DirectoryExplorerFilters {...props} />
    </FilterToolbar>
  </div>
}
