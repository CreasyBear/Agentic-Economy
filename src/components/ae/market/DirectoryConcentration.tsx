import { useId, useState } from 'react'
import { Gauge } from '@/components/charts/gauge'
import { EvilBarChart } from '@/components/evilcharts/charts/recharts-bar-chart'
import type { ChartConfig } from '@/components/evilcharts/ui/recharts-chart'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export type DirectoryCategoryConcentration = Readonly<{
  key: string
  label: string
  toolCount: number
  documentedPayers: number
  totalCalls: number
  totalPayers: number
  /** Share of the category's reported calls held by its top-3 Tools, 0..1. */
  top3Share: number
  /** Herfindahl index over reported call shares, 0..1 (1 = one Tool holds all activity). */
  hhi: number
}>
type TopTool = Readonly<{ key: string; label: string; calls: number }>
type Props = Readonly<{
  concentration: Readonly<{ basis: 'declared_calls30d'; categoryCount: number; categories: readonly DirectoryCategoryConcentration[] }>
  /** Optional named top-3 Tools for the selected category, when the caller can supply them. */
  topTools?: readonly TopTool[]
  onSelectCategory?: (key: string) => void
}>
const colors = { share: { label: 'Top-3 share', colors: { light: ['var(--ae-brand)'], dark: ['var(--ae-brand)'] } } } satisfies ChartConfig
const percent = new Intl.NumberFormat('en-AU', { style: 'percent', maximumFractionDigits: 1 })

/** Category concentration from reported calls, last 30 days. Nothing here is measured by AE. */
export function DirectoryConcentration({ concentration, topTools, onSelectCategory }: Props) {
  const id = useId()
  const ranked = [...concentration.categories].sort((a, b) => b.toolCount - a.toolCount || a.label.localeCompare(b.label))
  const [selected, setSelected] = useState(ranked[0]?.key)
  const category = ranked.find(item => item.key === selected) ?? ranked[0]
  if (category === undefined) return null
  const share = Number.isFinite(category.top3Share) ? Math.min(1, Math.max(0, category.top3Share)) : 0
  const hhiBand = category.hhi < 0.25 ? 'Low' : category.hhi <= 0.5 ? 'Moderate' : 'High'
  const bars = [...concentration.categories].sort((a, b) => b.top3Share - a.top3Share || a.label.localeCompare(b.label)).map(item => ({ key: item.key, label: item.label, share: item.top3Share * 100 }))
  const leadingTop = topTools !== undefined && topTools.length > 0 ? Math.max(...topTools.map(item => item.calls), 1) : 1
  return <Card className="min-w-0">
    <CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><CardTitle id={`${id}-title`}>Category concentration</CardTitle><CardDescription>How tightly reported calls cluster within each category. Reported calls, last 30 days.</CardDescription></div>
        <Select value={category.key} onValueChange={setSelected}>
          <SelectTrigger aria-label="Category" className="w-auto min-w-44 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>{ranked.map(item => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </div>
    </CardHeader>
    <CardContent className="grid min-w-0 gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex flex-col items-center gap-3">
        <div aria-hidden="true">
          <Gauge value={share * 100} centerValue={Math.round(share * 1000) / 10} suffix="%" defaultLabel="of category Calls" minWidth={0} activeFill="var(--ae-brand)" inactiveFill="var(--border)" inactiveFillOpacity={0.5} totalNotches={40} spacing={18} notchCornerRadius={2} />
        </div>
        <p className="text-sm"><span className="font-medium">Top 3 Tools:</span> <span className="tabular-nums">{percent.format(share)}</span><span className="sr-only"> of {category.label} reported Calls in the last 30 days are held by its top 3 Tools</span></p>
        <p className="text-xs text-muted-foreground">Reported calls, last 30 days · {category.toolCount.toLocaleString('en-AU')} Tools</p>
        <Badge variant="secondary" title="Herfindahl index over reported call shares; 1 = one tool holds all activity">{hhiBand} concentration · HHI {category.hhi.toFixed(2)}<span className="sr-only">: Herfindahl index over reported call shares; 1 = one tool holds all activity</span></Badge>
      </div>
      <div className="grid min-w-0 content-start gap-4">
        {topTools === undefined || topTools.length === 0 ? null : <div className="grid gap-2">
          <h3 className="text-sm font-medium">Top 3 Tools by reported Calls</h3>
          {topTools.map(tool => {
            const shareWidth = Math.min(100, tool.calls / leadingTop * 100)
            return <div key={tool.key} className="grid min-w-0 gap-1">
              <div className="flex items-baseline justify-between gap-2 text-sm"><span className="min-w-0 truncate">{tool.label}</span><span className="shrink-0 tabular-nums text-muted-foreground">{tool.calls.toLocaleString('en-AU')} calls</span></div>
              <div role="meter" aria-label={`${tool.label} reported Calls within ${category.label}`} aria-valuemin={0} aria-valuemax={leadingTop} aria-valuenow={tool.calls} aria-valuetext={`${tool.calls.toLocaleString('en-AU')} reported Calls, last 30 days`} className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand/65" style={{ width: `${shareWidth}%` }} /></div>
            </div>
          })}
          <p className="text-xs text-muted-foreground">Reported calls, last 30 days.</p>
        </div>}
        <div aria-hidden="true" className="h-56 min-w-0">
          <EvilBarChart data={bars} config={colors} animationType="none" layout="horizontal" className="h-full w-full" chartProps={{ margin: { top: 8, right: 10, bottom: 4, left: 0 }, accessibilityLayer: false }}>
            <EvilBarChart.Grid />
            <EvilBarChart.YAxis dataKey="label" width={110} tickFormatter={value => String(value).length > 18 ? `${String(value).slice(0, 17)}…` : String(value)} />
            <EvilBarChart.XAxis allowDecimals={false} />
            <EvilBarChart.Tooltip />
            <EvilBarChart.Bar dataKey="share" variant="default" />
          </EvilBarChart>
        </div>
        <details className="min-w-0 rounded-lg border border-border">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">View categories{onSelectCategory === undefined ? '' : ' and filter Tools'}</summary>
          <Table aria-labelledby={`${id}-title`}><TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Top-3 share</TableHead></TableRow></TableHeader><TableBody>
            {bars.map(item => <TableRow key={item.key}><TableCell>{onSelectCategory === undefined ? item.label : <Button variant="link" className="h-auto max-w-full justify-start whitespace-normal px-0 text-left" onClick={() => onSelectCategory(item.key)} aria-label={`Filter ${item.label}: top 3 Tools hold ${percent.format(item.share / 100)} of reported Calls`}>{item.label}</Button>}</TableCell><TableCell className="text-right tabular-nums">{percent.format(item.share / 100)}</TableCell></TableRow>)}
          </TableBody></Table>
        </details>
      </div>
    </CardContent>
  </Card>
}
