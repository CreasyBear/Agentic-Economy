import { useId, useState } from 'react'
import { AeSection } from '@/components/ae/layout/AeSection'
import { LiquidTabBar, liquidPanelId, liquidTabId } from '@/components/arc/liquid-tab-bar/liquid-tab-bar'
import { ReceiptTextIcon, QuoteIcon, UsersRoundIcon, CircleCheckIcon } from 'lucide-react'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { ADMIN_METRICS_COPY, type AdminMetricDayRow } from '../metrics.contracts'

const GROUPS = [
  { value: 'purchases', label: 'Purchases', icon: ReceiptTextIcon, fields: ['attemptedCalls', 'completedCalls', 'uncertainCalls', 'settledCalls', 'settledCallValue'] },
  { value: 'quotes', label: 'Quotes', icon: QuoteIcon, fields: ['quotesCreated', 'quotesConvertedAtClose'] },
  { value: 'participation', label: 'Participation', icon: UsersRoundIcon, fields: ['transactingWorkspaces', 'transactingAgents', 'transactingProviders', 'transactingTools', 'returningWorkspaces'] },
  { value: 'resolution', label: 'Resolution', icon: CircleCheckIcon, fields: ['terminalCalls', 'terminalCallsWithResolution'] },
] as const
const LABELS: Record<(typeof GROUPS)[number]['fields'][number], string> = {
  attemptedCalls: 'Attempted', completedCalls: 'Delivered', uncertainCalls: 'Uncertain',
  settledCalls: 'Settled', settledCallValue: 'Settled value', quotesCreated: 'Created', quotesConvertedAtClose: 'Converted',
  transactingWorkspaces: 'Accounts', transactingAgents: 'Agents', transactingProviders: 'Providers',
  transactingTools: 'Tools', returningWorkspaces: 'Returning Account-days', terminalCalls: 'Terminal Calls', terminalCallsWithResolution: 'With resolution',
}

export type MetricsDayTableProps = Readonly<{ rows: readonly AdminMetricDayRow[] }>

export function MetricsDayTable({ rows }: MetricsDayTableProps) {
  const id = useId()
  const [group, setGroup] = useState<(typeof GROUPS)[number]>(GROUPS[0])
  const columns: DataColumn<AdminMetricDayRow>[] = [
    { key: 'day', label: 'Day', sortable: false, render: (_value, row) => <time className="whitespace-nowrap tabular-nums" dateTime={row.day}>{row.day}</time> },
    ...group.fields.map(key => ({
      key, label: LABELS[key], sortable: false, numeric: true,
      render: (_value: unknown, row: AdminMetricDayRow) => key === 'settledCallValue'
        ? <span title={row.money} className="whitespace-nowrap">{row[key]}<span className="sr-only"> · {row.money}</span></span>
        : row[key],
    })),
  ]
  return (
    <AeSection title={ADMIN_METRICS_COPY.dailyTitle} className="min-w-0">
      <div className="ae-arc grid min-w-0 gap-3">
        <LiquidTabBar id={id} className="justify-self-start" label="Daily measures" tabs={GROUPS.map(({ value, label, icon: Icon }) => ({ value, label, icon: <Icon /> }))} value={group.value} onValueChange={value => {
          const selected = GROUPS.find(item => item.value === value)
          if (selected) setGroup(selected)
        }} />
        <div className="min-w-0" role="tabpanel" id={liquidPanelId(id, group.value)} aria-labelledby={liquidTabId(id, group.value)}>
          <SortableDataTable density="compact" mobileLayout="scroll" columns={columns} rows={rows} rowKey="day"
            caption={`${ADMIN_METRICS_COPY.dailyTitle} · ${group.label}`} emptyMessage={ADMIN_METRICS_COPY.noDays} />
        </div>
      </div>
    </AeSection>
  )
}
