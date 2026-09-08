import { useId, useMemo } from 'react'
import { Gauge } from '@/components/charts/gauge'
import { EvilBarChart } from '@/components/evilcharts/charts/recharts-bar-chart'
import type { ChartConfig } from '@/components/evilcharts/ui/recharts-chart'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Bucket = Readonly<{ key: string; label: string; count: number }>
export type DirectoryAnalyticsChartCoverage = Readonly<{
  total: number
  inputSchema: number
  inputFields: number
  outputSchema: number
  outputFields: number
  outputExample: number
  priced?: number
  activityReported: number
}>
export type DirectoryAnalyticsChartsProps = Readonly<{
  priceBuckets: readonly Bucket[]
  priceDescription?: string
  adoptionBuckets?: readonly Bucket[]
  categories: readonly Bucket[]
  sections?: readonly ('price' | 'adoption' | 'coverage' | 'categories')[]
  coverage: DirectoryAnalyticsChartCoverage
  onSelectPriceBucket?: (key: string) => void
  onSelectAdoptionBucket?: (key: string) => void
  onSelectCategory?: (key: string) => void
}>
const colors = {
  count: { label: 'Tools', colors: { light: ['var(--ae-brand)'], dark: ['var(--ae-brand)'] } },
} satisfies ChartConfig
const integers = new Intl.NumberFormat('en-AU')
const percent = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 })

/** The caller supplies full-generation aggregates, never a paginated sample. */
export function DirectoryAnalyticsCharts({ priceBuckets, priceDescription, adoptionBuckets, categories, coverage, sections = ['price', 'adoption', 'coverage', 'categories'], onSelectPriceBucket, onSelectAdoptionBucket, onSelectCategory }: DirectoryAnalyticsChartsProps) {
  const rankedCategories = useMemo(() => [...categories].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)), [categories])
  if (coverage.total === 0) return <Empty><EmptyHeader><EmptyTitle>No catalogue observations yet</EmptyTitle><EmptyDescription>Analytics will appear when a directory scan has completed.</EmptyDescription></EmptyHeader></Empty>
  const signals = [
    { key: 'inputFields', label: 'Named input fields', value: coverage.inputFields },
    { key: 'outputFields', label: 'Named output fields', value: coverage.outputFields },
    { key: 'outputExample', label: 'Output example', value: coverage.outputExample },
    { key: 'inputSchema', label: 'Input schema', value: coverage.inputSchema },
    ...(coverage.priced === undefined ? [] : [{ key: 'priced', label: 'Comparable price', value: coverage.priced }]),
    { key: 'activityReported', label: 'Adoption reported', value: coverage.activityReported },
  ]
  return <div className="grid min-w-0 gap-6">
    {sections.includes('price') || (sections.includes('adoption') && adoptionBuckets !== undefined) ? <div className="grid min-w-0 gap-6 md:grid-cols-2">
      {sections.includes('price') ? <Distribution title="Published price distribution" description={priceDescription ?? "Tools by their lowest comparable published price. Unknown denominations remain separate."} rows={priceBuckets} {...(onSelectPriceBucket === undefined ? {} : { onSelect: onSelectPriceBucket })} /> : null}
      {sections.includes('adoption') && adoptionBuckets !== undefined ? <Distribution title="Adoption distribution" description="Unique payers reported for each Tool in the last 30 days. Unreported is distinct from zero." rows={adoptionBuckets} {...(onSelectAdoptionBucket === undefined ? {} : { onSelect: onSelectAdoptionBucket })} /> : null}
    </div> : null}
    {sections.includes('coverage') ? <Card className="min-w-0">
      <CardHeader><CardTitle>What the directory tells you</CardTitle><CardDescription>Published evidence across {integers.format(coverage.total)} Tools. These signals describe metadata coverage, not service quality.</CardDescription></CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 xl:grid-cols-6">
        {signals.map(signal => {
          const percentage = coverage.total > 0 ? signal.value / coverage.total * 100 : 0
          return <div key={signal.key} className="flex min-w-0 flex-col gap-2 text-center">
            <div aria-hidden="true" className="min-w-0"><Gauge value={percentage} centerValue={percentage} suffix="%" defaultLabel="of Tools" minWidth={0} activeFill="var(--ae-brand)" inactiveFill="var(--border)" inactiveFillOpacity={0.5} totalNotches={40} spacing={18} notchCornerRadius={2} /></div>
            <h3 className="text-sm font-medium">{signal.label}</h3>
            <p className="text-xs text-muted-foreground"><span className="tabular-nums">{integers.format(signal.value)} / {integers.format(coverage.total)}</span><span className="sr-only"> Tools, {percent.format(percentage)} percent</span></p>
          </div>
        })}
      </CardContent>
    </Card> : null}
    {sections.includes('categories') ? <Distribution title="Largest categories" description="Tool counts by declared category. Showing the eight largest groups; all categories are available below." rows={rankedCategories} chartLimit={8} horizontal {...(onSelectCategory === undefined ? {} : { onSelect: onSelectCategory })} /> : null}
  </div>
}

function Distribution({ title, description, rows, chartLimit, horizontal = false, onSelect }: Readonly<{
  title: string; description: string; rows: readonly Bucket[]; chartLimit?: number; horizontal?: boolean; onSelect?: (key: string) => void
}>) {
  const id = useId()
  const chartRows = rows.slice(0, chartLimit ?? rows.length).map(row => ({ key: row.key, label: row.label, count: row.count }))
  return <Card className="min-w-0">
    <CardHeader><CardTitle id={`${id}-title`}>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
    <CardContent className="grid min-w-0 gap-4">
      {chartRows.length === 0 ? <p role="status" className="py-10 text-sm text-muted-foreground">No observations available for this distribution.</p> : <>
        <div aria-hidden="true" className="h-64 min-w-0">
          <EvilBarChart data={chartRows} config={colors} animationType="none" layout={horizontal ? 'horizontal' : 'vertical'} className="h-full w-full" chartProps={{ margin: { top: 8, right: 10, bottom: 4, left: 0 }, accessibilityLayer: false }}>
            <EvilBarChart.Grid />
            {horizontal ? <><EvilBarChart.YAxis dataKey="label" width={110} tickFormatter={value => shortenLabel(String(value))} /><EvilBarChart.XAxis allowDecimals={false} /></> : <><EvilBarChart.XAxis dataKey="label" tickFormatter={value => shortenLabel(String(value), 12)} interval={0} angle={-45} textAnchor="end" height={54} tick={{ fontSize: 10 }} /><EvilBarChart.YAxis allowDecimals={false} width={42} /></>}
            <EvilBarChart.Tooltip />
            <EvilBarChart.Bar dataKey="count" variant="default" />
          </EvilBarChart>
        </div>
        <details className="min-w-0 rounded-lg border border-border">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">View counts{onSelect === undefined ? '' : ' and filter Tools'}</summary>
          <Table aria-labelledby={`${id}-title`}><TableHeader><TableRow><TableHead>Group</TableHead><TableHead className="text-right">Tools</TableHead></TableRow></TableHeader><TableBody>
            {rows.map(row => <TableRow key={row.key}><TableCell>{onSelect === undefined ? row.label : <Button variant="link" className="h-auto max-w-full justify-start whitespace-normal px-0 text-left" onClick={() => onSelect(row.key)} aria-label={`Filter ${row.label}: ${integers.format(row.count)} Tools`}>{row.label}</Button>}</TableCell><TableCell className="text-right tabular-nums">{integers.format(row.count)}</TableCell></TableRow>)}
          </TableBody></Table>
        </details>
      </>}
    </CardContent>
  </Card>
}

function shortenLabel(label: string, limit = 18): string { return label.length > limit ? `${label.slice(0, limit - 1)}…` : label }
