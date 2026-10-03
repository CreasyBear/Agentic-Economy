import { useId, useState } from 'react'

import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { ADMIN_METRICS_COPY, type AdminMetricDayRow } from '../metrics.contracts'
import styles from './MetricsDayTable.module.css'

// View changes select columns only. Rows, authoritative daily order, money
// projections and the separate full-report CSV export remain unchanged.
const views = [
  { value: 'calls', label: 'Calls', keys: ['attemptedCalls', 'completedCalls', 'uncertainCalls', 'settledCalls'] },
  { value: 'money', label: 'Money', keys: ['settledCallValue', 'money', 'settledCalls'] },
  { value: 'quotes', label: 'Quotes', keys: ['quotesCreated', 'quotesConvertedAtClose'] },
  { value: 'participants', label: 'Participants', keys: ['transactingWorkspaces', 'transactingAgents', 'transactingProviders', 'transactingTools', 'returningWorkspaces'] },
  { value: 'resolution', label: 'Resolution', keys: ['terminalCalls', 'terminalCallsWithResolution'] },
] as const

const columns: Record<keyof AdminMetricDayRow, DataColumn<AdminMetricDayRow>> = {
  day: {
    key: 'day', label: ADMIN_METRICS_COPY.columns.day, sortable: false, width: 144,
    render: (_value, row) => <time className={styles.day} dateTime={row.day}>{row.day}</time>,
  },
  settledCallValue: { key: 'settledCallValue', label: ADMIN_METRICS_COPY.columns.settledValue, sortable: false },
  money: { key: 'money', label: ADMIN_METRICS_COPY.columns.money, sortable: false },
  settledCalls: { key: 'settledCalls', label: ADMIN_METRICS_COPY.columns.settledCalls, sortable: false, numeric: true },
  attemptedCalls: { key: 'attemptedCalls', label: ADMIN_METRICS_COPY.columns.attemptedCalls, sortable: false, numeric: true },
  completedCalls: { key: 'completedCalls', label: ADMIN_METRICS_COPY.columns.completedCalls, sortable: false, numeric: true },
  uncertainCalls: { key: 'uncertainCalls', label: ADMIN_METRICS_COPY.columns.uncertainCalls, sortable: false, numeric: true },
  quotesCreated: { key: 'quotesCreated', label: ADMIN_METRICS_COPY.columns.quotesCreated, sortable: false, numeric: true },
  quotesConvertedAtClose: { key: 'quotesConvertedAtClose', label: ADMIN_METRICS_COPY.columns.quotesConverted, sortable: false, numeric: true },
  transactingWorkspaces: { key: 'transactingWorkspaces', label: ADMIN_METRICS_COPY.columns.workspaces, sortable: false, numeric: true },
  transactingAgents: { key: 'transactingAgents', label: ADMIN_METRICS_COPY.columns.agents, sortable: false, numeric: true },
  transactingProviders: { key: 'transactingProviders', label: ADMIN_METRICS_COPY.columns.providers, sortable: false, numeric: true },
  transactingTools: { key: 'transactingTools', label: ADMIN_METRICS_COPY.columns.tools, sortable: false, numeric: true },
  returningWorkspaces: { key: 'returningWorkspaces', label: ADMIN_METRICS_COPY.columns.returningWorkspaces, sortable: false, numeric: true },
  terminalCalls: { key: 'terminalCalls', label: ADMIN_METRICS_COPY.columns.terminalCalls, sortable: false, numeric: true },
  terminalCallsWithResolution: { key: 'terminalCallsWithResolution', label: ADMIN_METRICS_COPY.columns.resolvedCalls, sortable: false, numeric: true },
}

export type MetricsDayTableProps = Readonly<{ rows: readonly AdminMetricDayRow[] }>

export function MetricsDayTable({ rows }: MetricsDayTableProps) {
  const headingId = useId()
  const [view, setView] = useState<string>('calls')
  const current = views.find((item) => item.value === view) ?? views[0]
  return (
    <section className={`arc-market ${styles.region}`} aria-labelledby={headingId}>
      <header className={styles.header}>
        <div>
          <h2 id={headingId}>{ADMIN_METRICS_COPY.dailyTitle}</h2>
          <p>Recorded snapshots. Export CSV includes every metric.</p>
        </div>
        <SegmentedControl label="Daily metric view" options={[...views]} value={current.value} onValueChange={setView} />
      </header>
      <SortableDataTable
        columns={[columns.day, ...current.keys.map((key) => columns[key])]}
        rows={[...rows]}
        rowKey="day"
        animateRows={false}
        caption={`${ADMIN_METRICS_COPY.dailyTitle}: ${current.label}`}
        emptyMessage={ADMIN_METRICS_COPY.noDays}
      />
    </section>
  )
}
