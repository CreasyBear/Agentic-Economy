import { formatCount } from '@/lib/ui/format-time'
import { SlidersHorizontalIcon } from 'lucide-react'
import { useState, useSyncExternalStore, type ReactNode } from 'react'
import styles from './DirectoryExplorerFilters.module.css'
import { ProviderFacetPicker } from './ProviderFacetPicker'
import { BottomSheet, BottomSheetClose } from '@/components/arc/bottom-sheet/bottom-sheet'
import { Button } from '@/components/arc/button/button'
import { ChipGroup } from '@/components/arc/chip-group/chip-group'
import { FilterToolbar, type FilterChip } from '@/components/arc/filter-toolbar/filter-toolbar'
import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from '@/components/ae/shared/base-ui/drawer/drawer'
import type { X402DirectoryCatalogueOverview } from '@/modules/market/x402-directory-catalogue'
import type { DirectoryExplorerFilterPatch, DirectoryExplorerFilterValues } from '@/modules/market/directory-filters.contracts'
import { formatPaymentNetwork } from '@/modules/market/tool-view-model'

export type DirectoryExplorerFiltersProps = Readonly<{
  search: DirectoryExplorerFilterValues
  overview?: X402DirectoryCatalogueOverview
  onChange: (patch: DirectoryExplorerFilterPatch) => void
  onReset: () => void
}>

type ExplorerFilterKey = typeof explorerFilterKeys[number]

/** Providers list prices in USDC, which tracks the US dollar. Caps are inclusive. */
const PRICE_CAPS = [{ value: '0.01', label: 'Up to US$0.01' }, { value: '0.1', label: 'Up to US$0.10' }, { value: '1', label: 'Up to US$1' }] as const
const priceBandLabels = { lt_0_01: 'Under US$0.01', '0_01_to_0_03': 'US$0.01 to 0.03', '0_03_to_0_10': 'US$0.03 to 0.10', '0_10_to_1': 'US$0.10 to 1', '1_to_10': 'US$1 to 10', '10_plus': 'US$10 or more', unknown: 'Price not listed' }
const adoptionBandLabels = { missing: 'Not reported', '0': 'None', '1': '1', '2_4': '2 to 4', '5_9': '5 to 9', '10_49': '10 to 49', '50_plus': '50 or more' }
/** Every URL filter stays removable here, including ones the drawer no longer offers. */
const explorerFilterKeys = ['directoryCategory', 'network', 'provider', 'minUsdPrice', 'maxUsdPrice', 'minPayers30d', 'maxPayers30d', 'priceBand', 'adoptionBand', 'curatedOnly', 'reviewedProvidersOnly', 'hasInputFields', 'hasOutputExample', 'hasInputSchema', 'hasOutputFields', 'hasOutputSchema', 'tags', 'bundleSlugs'] as const

function isActive(search: DirectoryExplorerFilterValues, key: ExplorerFilterKey) {
  const value = search[key]
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== false
}

/** Airbnb-style filters: price per call and provider. Categories live in the chip row. */
function FilterBody({ search, onChange }: DirectoryExplorerFiltersProps) {
  const cap = search.minUsdPrice === undefined && search.priceBand === undefined ? PRICE_CAPS.find(option => Number(option.value) === search.maxUsdPrice)?.value : undefined
  return <div className="flex flex-col gap-6">
    <ChipGroup
      options={[...PRICE_CAPS]}
      value={cap === undefined ? [] : [cap]}
      onValueChange={values => {
        const value = values[0]
        onChange({ maxUsdPrice: value === undefined ? undefined : Number(value), minUsdPrice: undefined, priceBand: undefined })
      }}
      label="Price per call"
      multiple={false}
    />
    <ProviderFacetPicker selected={search.provider} onChange={provider => onChange({ provider })} />
  </div>
}

const PHONE = '(max-width: 720px)'
function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
/** Arc's rule: a task on phones opens as a bottom sheet; larger screens keep the side drawer. */
function usePhone() {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false)
}

const TITLE = 'Filter tools'
const DESCRIPTION = 'Narrow by price per call and provider.'

/** Values are passed to the route; the current page is never filtered in the browser. Filters apply as they change, so the footer closes with Done. */
export function DirectoryExplorerFilters(props: DirectoryExplorerFiltersProps) {
  const count = explorerFilterKeys.filter(key => isActive(props.search, key)).length
  const [clearCount, setClearCount] = useState(0)
  const phone = usePhone()
  const trigger = <Button type="button" variant="secondary" data-filter-trigger="" aria-label={count > 0 ? `Filters, ${count} applied` : 'Filters'}>
    <SlidersHorizontalIcon aria-hidden="true" />Filters{count > 0 ? <span className={styles.count} aria-hidden="true">{count}</span> : null}
  </Button>
  const footer = (close: ReactNode) => <footer className={styles.footer}>
    <Button type="button" variant="secondary" onClick={() => { setClearCount(value => value + 1); props.onReset() }}>Clear filters</Button>
    {close}
  </footer>
  const body = <div className="min-w-0"><FilterBody key={clearCount} {...props} /></div>

  if (phone) return <BottomSheet trigger={trigger} title={TITLE} description={DESCRIPTION} closeLabel="Close" className={styles.facetTargets ?? ''}>
    {body}
    {footer(<BottomSheetClose asChild><Button type="button" variant="primary">Done</Button></BottomSheetClose>)}
  </BottomSheet>
  return <Drawer>
    <DrawerTrigger render={trigger} />
    <DrawerContent side="right" title={TITLE} description={DESCRIPTION} closeLabel="Close" className={`arc-market-filters ${styles.facetTargets ?? ''}`}>
      {body}
      {footer(<DrawerClose render={<Button type="button" variant="primary">Done</Button>} />)}
    </DrawerContent>
  </Drawer>
}

function facetLabel(overview: X402DirectoryCatalogueOverview | undefined, source: 'categories' | 'providers' | 'networks' | 'tags' | 'bundleSlugs', key: string, formatLabel?: (label: string) => string) {
  if (overview?.kind !== 'ok') return key
  const item = overview[source]?.find(candidate => candidate.key === key)
  return item === undefined ? key : formatLabel?.(item.label) ?? item.label
}

const usd = (value: number) => `US$${String(value)}`

function appliedFilters(search: DirectoryExplorerFilterValues, overview: X402DirectoryCatalogueOverview | undefined): FilterChip[] {
  const filters: FilterChip[] = []
  if (search.directoryCategory !== undefined) filters.push({ id: 'directoryCategory', label: 'Category', value: facetLabel(overview, 'categories', search.directoryCategory) })
  if (search.network !== undefined) filters.push({ id: 'network', label: 'Network', value: facetLabel(overview, 'networks', search.network, formatPaymentNetwork) })
  if (search.provider !== undefined) filters.push({ id: 'provider', label: 'Provider', value: facetLabel(overview, 'providers', search.provider) })
  if (search.minUsdPrice !== undefined) filters.push({ id: 'minUsdPrice', label: 'Price from', value: usd(search.minUsdPrice) })
  if (search.maxUsdPrice !== undefined) filters.push({ id: 'maxUsdPrice', label: 'Price up to', value: usd(search.maxUsdPrice) })
  if (search.priceBand !== undefined) filters.push({ id: 'priceBand', label: 'Price per call', value: priceBandLabels[search.priceBand] })
  if (search.minPayers30d !== undefined) filters.push({ id: 'minPayers30d', label: 'Paying wallets', value: `${formatCount(search.minPayers30d)} or more` })
  if (search.maxPayers30d !== undefined) filters.push({ id: 'maxPayers30d', label: 'Paying wallets', value: `Up to ${formatCount(search.maxPayers30d)}` })
  if (search.adoptionBand !== undefined) filters.push({ id: 'adoptionBand', label: 'Paying wallets', value: adoptionBandLabels[search.adoptionBand] })
  if (search.curatedOnly === true) filters.push({ id: 'curatedOnly', label: 'Curated' })
  if (search.reviewedProvidersOnly === true) filters.push({ id: 'reviewedProvidersOnly', label: 'Reviewed providers' })
  if (search.hasInputFields === true) filters.push({ id: 'hasInputFields', label: 'Lists its inputs' })
  if (search.hasOutputExample === true) filters.push({ id: 'hasOutputExample', label: 'Has a sample response' })
  if (search.hasInputSchema === true) filters.push({ id: 'hasInputSchema', label: 'Lists its inputs' })
  if (search.hasOutputFields === true) filters.push({ id: 'hasOutputFields', label: 'Lists its outputs' })
  if (search.hasOutputSchema === true) filters.push({ id: 'hasOutputSchema', label: 'Lists its outputs' })
  if (search.tags?.length) filters.push({ id: 'tags', label: 'Tags', value: search.tags.map(key => facetLabel(overview, 'tags', key)).join(', ') })
  if (search.bundleSlugs?.length) filters.push({ id: 'bundleSlugs', label: 'Collections', value: search.bundleSlugs.map(key => facetLabel(overview, 'bundleSlugs', key)).join(', ') })
  return filters
}

function clearExplorerFilter(key: string, onChange: DirectoryExplorerFiltersProps['onChange']) {
  if (!explorerFilterKeys.includes(key as ExplorerFilterKey)) return
  const patch: DirectoryExplorerFilterPatch = { [key]: undefined }
  onChange(patch)
}

/** Applied selections as removable chips, with the Filters drawer as the editing surface. Categories live in MarketCategoryRow. */
export function DirectoryDiscoveryFilters(props: DirectoryExplorerFiltersProps) {
  const filters = appliedFilters(props.search, props.overview)

  return <div className="arc-market-discovery-filters" data-empty={filters.length === 0}>
    <FilterToolbar
      filters={filters}
      label="Applied filters"
      onRemove={id => clearExplorerFilter(id, props.onChange)}
      onClearAll={() => props.onChange(Object.fromEntries(explorerFilterKeys.map(key => [key, undefined])) as DirectoryExplorerFilterPatch)}
    >
      <DirectoryExplorerFilters {...props} />
    </FilterToolbar>
  </div>
}
