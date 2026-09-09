import { ArrowUpRightIcon, BadgeCheckIcon, CompassIcon, LayersIcon, UsersIcon } from 'lucide-react'
import { useState } from 'react'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { X402DirectoryAnalytics, X402DirectoryCatalogueInput } from '@/modules/market/x402-directory-catalogue'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import type { X402IndexedDirectoryEntry } from '@/modules/market/x402-directory-index'
import { DirectoryAnalyticsCharts, type DirectoryAnalyticsChartCoverage, type DirectoryAnalyticsSignals, type DirectorySignalEntry } from './DirectoryAnalyticsCharts'
import { DirectoryToolTable } from './DirectoryToolTable'
import type { SavedDirectoryTool } from './DirectorySavedTools'
import { directoryDate, directoryTitle } from './directory-presentation'

type Props = Readonly<{
  analytics?: X402DirectoryAnalytics
  widelyUsed: readonly X402DirectoryEntry[]
  onExplore: (filters: X402DirectoryCatalogueInput) => void
  onPriceNetworkChange: (network: string | undefined) => void
  onSelect: (item: SavedDirectoryTool) => void
  onSave: (item: SavedDirectoryTool) => void
  isSaved: (resource: string) => boolean
  onCompare: (item: SavedDirectoryTool) => void
  isCompared: (resource: string) => boolean
  compareDisabled: boolean
}>
const number = new Intl.NumberFormat('en-AU')

/** Market-wide analysis and direct paths into the full Tool Explorer. */
export function DirectoryMarketOverview({ analytics, widelyUsed, onExplore, onPriceNetworkChange, onSelect, onSave, isSaved, onCompare, isCompared, compareDisabled }: Props) {
  const [radar, setRadar] = useState('curated')
  if (analytics?.kind !== 'ok') return <AeEmptyState icon={<LayersIcon />} title="The market snapshot is being prepared" description="You can keep exploring Tools while the catalogue's price and adoption analysis is updated." action={<Button variant="outline" onClick={() => onExplore({})}>Open the Tool Explorer<ArrowUpRightIcon /></Button>} />
  const metadataCount = (key: (typeof analytics.metadata)[number]['key']) => analytics.metadata.find(item => item.key === key)?.count ?? 0
  const adopted = analytics.adoption.filter(item => item.key === '5_9' || item.key === '10_49' || item.key === '50_plus').reduce((sum, item) => sum + item.count, 0)
  const activityReported = analytics.totalTools - (analytics.adoption.find(item => item.key === 'missing')?.count ?? 0)
  const chartCoverage: DirectoryAnalyticsChartCoverage = {
    total: analytics.totalTools,
    inputFields: metadataCount('hasInputFields'), outputFields: metadataCount('hasOutputFields'),
    inputSchema: metadataCount('hasInputSchema'), outputSchema: metadataCount('hasOutputSchema'),
    outputExample: metadataCount('hasOutputExample'), activityReported,
    ...(analytics.price.scope === 'whole_generation' ? { priced: analytics.price.knownPriceTools } : {}),
  }
  const network = analytics.price.network
  const networkLabel = analytics.networks.find(item => item.key === network)?.label ?? network
  const priceDescription = `${number.format(analytics.price.knownPriceTools)} Tools with comparable exact USDC prices${networkLabel === undefined ? ', across networks' : ` on ${networkLabel}`}. Each Tool is counted once at its lowest listed price; ${number.format(analytics.price.unknownPriceTools)} have no comparable price.`
  const selectPrice = (key: string) => {
    const band = analytics.price.bands.find(item => item.key === key)
    if (band) onExplore({ priceBand: band.key, ...(network === undefined ? {} : { network }), sort: 'price_asc' })
  }
  const selectAdoption = (key: string) => {
    const band = analytics.adoption.find(item => item.key === key)
    if (band) onExplore({ adoptionBand: band.key, sort: 'adoption' })
  }
  const selectCategory = (directoryCategory: string) => onExplore({ directoryCategory, sort: 'adoption' })
  const toSignalEntry = (item: X402IndexedDirectoryEntry): DirectorySignalEntry => ({ resource: item.entry.resource, title: directoryTitle(item.entry), provider: item.entry.provider, ...(item.analytics?.payerDelta === undefined ? {} : { payerDelta: item.analytics.payerDelta }), ...(item.analytics?.momentumBand === undefined ? {} : { momentumBand: item.analytics.momentumBand }), item: { entry: item.entry, search: {} } })
  const signals: DirectoryAnalyticsSignals = { depth: analytics.depth, recency: analytics.recency, rising: analytics.rising.map(toSignalEntry), falling: analytics.falling.map(toSignalEntry), concentration: analytics.concentration }
  const chartProps = { priceBuckets: analytics.price.bands, adoptionBuckets: analytics.adoption, categories: analytics.categories, coverage: chartCoverage, onSelectPriceBucket: selectPrice, onSelectAdoptionBucket: selectAdoption, onSelectCategory: selectCategory, priceDescription }
  const tableProps = { onSelect, onSave, isSaved, onCompare, isCompared, compareDisabled }
  const quantiles = analytics.price.quantiles

  return <div className="grid min-w-0 gap-7">
    <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric title="Capabilities to explore" value={number.format(analytics.totalTools)} description="Search the complete observed catalogue" icon={CompassIcon} onClick={() => onExplore({})} />
      <Metric title="Median listed price" value={quantiles ? quantiles.median : '—'} unit={quantiles ? 'USDC' : undefined} description={quantiles ? `Middle 50%: ${quantiles.p25}–${quantiles.p75} USDC per Call` : 'Comparable prices are not available'} icon={LayersIcon} onClick={() => onExplore({ ...(network === undefined ? {} : { network }), sort: 'price_asc' })} />
      <Metric title="Tools with 5+ payers" value={number.format(adopted)} description="Distinct paying addresses per Tool · 30 days" icon={UsersIcon} onClick={() => onExplore({ minPayers30d: 5, sort: 'adoption' })} />
      <Metric title="Curated by Coinbase" value={number.format(metadataCount('curated'))} description="Explore the directory's curated selection" icon={BadgeCheckIcon} onClick={() => onExplore({ curatedOnly: true, sort: 'adoption' })} />
    </div>

    <section aria-label="Market analysis" className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-semibold tracking-tight">Understand the landscape</h2><p className="mt-1 text-xs text-muted-foreground">Market-wide adoption · price comparisons within a payment network</p></div>
        <Select value={network ?? '__all'} onValueChange={value => onPriceNetworkChange(value === '__all' ? undefined : value)}>
          <SelectTrigger aria-label="Price analysis network" className="w-auto min-w-44 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="__all">Prices: all networks</SelectItem>{analytics.networks.map(item => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </div>
      <DirectoryAnalyticsCharts {...chartProps} sections={['price', 'adoption']} signals={signals} onSelectSignal={onSelect} />
    </section>

    <section aria-label="Tools on the radar" className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight">On the radar</h2><p className="mt-1 text-sm text-muted-foreground">Explore source-curated capabilities and Tools reaching more paying addresses.</p></div><Button variant="ghost" size="sm" onClick={() => onExplore(radar === 'curated' ? { curatedOnly: true, sort: 'adoption' } : { sort: 'adoption', ...(network === undefined ? {} : { network }) })}>Explore this group<ArrowUpRightIcon /></Button></div>
      <Tabs value={radar} onValueChange={setRadar}>
        <TabsList aria-label="Discovery signals"><TabsTrigger value="curated">Coinbase curated</TabsTrigger><TabsTrigger value="adoption">Broader adoption</TabsTrigger></TabsList>
        <TabsContent value="curated" className="pt-3"><DirectoryToolTable entries={analytics.curated.map(item => item.entry)} sourceInput={{}} {...tableProps} /></TabsContent>
        <TabsContent value="adoption" className="pt-3"><DirectoryToolTable entries={widelyUsed.slice(0, 8)} sourceInput={network === undefined ? {} : { network }} {...tableProps} /></TabsContent>
      </Tabs>
    </section>

    <Accordion type="multiple" className="rounded-xl border bg-card px-5">
      <AccordionItem value="coverage"><AccordionTrigger>Capability coverage and published details</AccordionTrigger><AccordionContent><DirectoryAnalyticsCharts {...chartProps} sections={['coverage', 'categories']} /></AccordionContent></AccordionItem>
      <AccordionItem value="definitions"><AccordionTrigger>How to read this snapshot</AccordionTrigger><AccordionContent><div className="grid gap-4 text-sm leading-relaxed text-muted-foreground sm:grid-cols-2">
        <p><strong className="font-medium text-foreground">Adoption.</strong> Payers are distinct paying addresses reported for each Tool over the last 30 days. They do not count people, and they cannot be added together to calculate unique market customers.</p>
        <p><strong className="font-medium text-foreground">Prices.</strong> Comparisons use the lowest published exact USDC amount for each Tool on the selected network. A current AE Quote depends on the actual request. Missing or incomparable prices remain separate.</p>
        <p><strong className="font-medium text-foreground">Curation and capabilities.</strong> Coinbase supplies the curated flag. Providers supply descriptions, categories, schemas and examples. Published details help assess a Tool; they do not establish delivery quality.</p>
        <p><strong className="font-medium text-foreground">Timing.</strong> This snapshot was completed {directoryDate(new Date(analytics.coverage.completedAt).toISOString())}. The source supplies rolling totals, so this view does not claim growth, retention or future performance.</p>
      </div></AccordionContent></AccordionItem>
    </Accordion>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>Coinbase Bazaar · {number.format(analytics.totalTools)} Tools observed</span><Badge variant="outline">Snapshot · {directoryDate(new Date(analytics.coverage.completedAt).toISOString())}</Badge></div>
  </div>
}

function Metric({ title, value, unit, description, icon: Icon, onClick }: Readonly<{ title: string; value: string; unit?: string | undefined; description: string; icon: typeof CompassIcon; onClick: () => void }>) {
  return <Card className="min-w-0 gap-3 py-4 shadow-none"><CardHeader className="gap-1 px-4"><div className="flex items-start justify-between gap-2"><CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle><Icon className="size-4 shrink-0 text-muted-foreground" /></div></CardHeader><CardContent className="grid gap-2 px-4"><button type="button" onClick={onClick} className="flex w-fit items-baseline gap-1.5 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring" aria-label={`${title}: ${value}${unit ? ` ${unit}` : ''}. Explore Tools`}><span className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</span>{unit ? <span className="text-xs text-muted-foreground">{unit}</span> : null}</button><CardDescription className="text-xs leading-relaxed">{description}</CardDescription></CardContent></Card>
}
