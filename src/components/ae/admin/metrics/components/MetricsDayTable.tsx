import { useEffect, useId, useState } from 'react'

import { Button } from '@/components/arc/button/button'
import { Drawer, DrawerContent } from '@/components/ae/shared/base-ui/drawer/drawer'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { AeSortableDataTable as SortableDataTable } from '@/components/ae/shared/sortable-data-table/AeSortableDataTable'
import type { AeDataColumn as DataColumn } from '@/components/ae/shared/sortable-data-table/sortable-data-table.contracts'
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

const snapshotGroups = [
  {
    label: 'Calls',
    fields: [
      { key: 'attemptedCalls', label: ADMIN_METRICS_COPY.columns.attemptedCalls },
      { key: 'completedCalls', label: ADMIN_METRICS_COPY.columns.completedCalls },
      { key: 'uncertainCalls', label: ADMIN_METRICS_COPY.columns.uncertainCalls },
      { key: 'settledCalls', label: ADMIN_METRICS_COPY.columns.settledCalls },
    ],
  },
  {
    label: 'Money',
    fields: [
      { key: 'settledCallValue', label: ADMIN_METRICS_COPY.columns.settledValue },
      { key: 'money', label: ADMIN_METRICS_COPY.columns.money },
    ],
  },
  {
    label: 'Quotes',
    fields: [
      { key: 'quotesCreated', label: ADMIN_METRICS_COPY.columns.quotesCreated },
      { key: 'quotesConvertedAtClose', label: ADMIN_METRICS_COPY.columns.quotesConverted },
    ],
  },
  {
    label: 'Participants',
    fields: [
      { key: 'transactingWorkspaces', label: ADMIN_METRICS_COPY.columns.workspaces },
      { key: 'transactingAgents', label: ADMIN_METRICS_COPY.columns.agents },
      { key: 'transactingProviders', label: ADMIN_METRICS_COPY.columns.providers },
      { key: 'transactingTools', label: ADMIN_METRICS_COPY.columns.tools },
      { key: 'returningWorkspaces', label: ADMIN_METRICS_COPY.columns.returningWorkspaces },
    ],
  },
  {
    label: 'Resolution',
    fields: [
      { key: 'terminalCalls', label: ADMIN_METRICS_COPY.columns.terminalCalls },
      { key: 'terminalCallsWithResolution', label: ADMIN_METRICS_COPY.columns.resolvedCalls },
    ],
  },
] as const satisfies readonly Readonly<{
  label: string
  fields: readonly Readonly<{ key: keyof AdminMetricDayRow; label: string }>[]
}>[]

type CountMetricKey = Exclude<keyof AdminMetricDayRow, 'day' | 'settledCallValue' | 'money'>

function countSortValue(value: string): bigint | undefined {
  const canonical = value.replaceAll(',', '')
  return /^\d+$/.test(canonical) ? BigInt(canonical) : undefined
}

function countColumn<Key extends CountMetricKey>(key: Key, label: string): DataColumn<AdminMetricDayRow> {
  return {
    key,
    label,
    sortable: true,
    sortValue: (row) => countSortValue(row[key]),
    numeric: true,
    render: (_value, row) => <span className={styles.cellText}>{row[key]}</span>,
  }
}

const columns: Record<keyof AdminMetricDayRow, DataColumn<AdminMetricDayRow>> = {
  day: {
    key: 'day', label: ADMIN_METRICS_COPY.columns.day, sortable: true,
    render: (_value, row) => <time className={styles.day} dateTime={row.day}>{row.day}</time>,
  },
  settledCallValue: {
    key: 'settledCallValue', label: ADMIN_METRICS_COPY.columns.settledValue, sortable: false, numeric: true,
    render: (_value, row) => <span className={styles.cellText} title={row.settledCallValue}>{row.settledCallValue}</span>,
  },
  money: {
    key: 'money', label: ADMIN_METRICS_COPY.columns.money, sortable: false,
    render: (_value, row) => <span className={styles.cellText} title={row.money}>{row.money}</span>,
  },
  settledCalls: countColumn('settledCalls', ADMIN_METRICS_COPY.columns.settledCalls),
  attemptedCalls: countColumn('attemptedCalls', ADMIN_METRICS_COPY.columns.attemptedCalls),
  completedCalls: countColumn('completedCalls', ADMIN_METRICS_COPY.columns.completedCalls),
  uncertainCalls: countColumn('uncertainCalls', ADMIN_METRICS_COPY.columns.uncertainCalls),
  quotesCreated: countColumn('quotesCreated', ADMIN_METRICS_COPY.columns.quotesCreated),
  quotesConvertedAtClose: countColumn('quotesConvertedAtClose', ADMIN_METRICS_COPY.columns.quotesConverted),
  transactingWorkspaces: countColumn('transactingWorkspaces', ADMIN_METRICS_COPY.columns.workspaces),
  transactingAgents: countColumn('transactingAgents', ADMIN_METRICS_COPY.columns.agents),
  transactingProviders: countColumn('transactingProviders', ADMIN_METRICS_COPY.columns.providers),
  transactingTools: countColumn('transactingTools', ADMIN_METRICS_COPY.columns.tools),
  returningWorkspaces: countColumn('returningWorkspaces', ADMIN_METRICS_COPY.columns.returningWorkspaces),
  terminalCalls: countColumn('terminalCalls', ADMIN_METRICS_COPY.columns.terminalCalls),
  terminalCallsWithResolution: countColumn('terminalCallsWithResolution', ADMIN_METRICS_COPY.columns.resolvedCalls),
}

export type MetricsDayTableProps = Readonly<{ rows: readonly AdminMetricDayRow[] }>

export function MetricsDayTable({ rows }: MetricsDayTableProps) {
  const headingId = useId()
  const [view, setView] = useState<string>('calls')
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const current = views.find((item) => item.value === view) ?? views[0]
  const selectedRow = selectedDayId === null ? undefined : rows.find((row) => row.day === selectedDayId)
  const detailsColumn: DataColumn<AdminMetricDayRow> = {
    key: 'details', label: 'Details', sortable: false,
    render: (_value, row) => (
      <Button
        className={styles.detailsButton}
        size="sm"
        variant="secondary"
        aria-label={`View snapshot for ${row.day}`}
        onClick={() => setSelectedDayId(row.day)}
      >
        View
      </Button>
    ),
  }

  // The drawer follows the current report props; it must never retain a removed snapshot.
  useEffect(() => {
    if (selectedDayId !== null && !rows.some((row) => row.day === selectedDayId)) setSelectedDayId(null)
  }, [rows, selectedDayId])

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
        columns={[columns.day, ...current.keys.map((key) => columns[key]), detailsColumn]}
        rows={[...rows]}
        rowKey="day"
        caption={`${ADMIN_METRICS_COPY.dailyTitle}: ${current.label}`}
        emptyMessage={ADMIN_METRICS_COPY.noDays}
        defaultSort={{ key: 'day', direction: 'desc' }}
      />
      <Drawer
        open={selectedRow !== undefined}
        onOpenChange={(open) => { if (!open) setSelectedDayId(null) }}
      >
        {selectedRow ? (
          <DrawerContent title={selectedRow.day} description="Recorded metric snapshot.">
            <div className={styles.snapshot}>
              {snapshotGroups.map((group) => (
                <section className={styles.snapshotGroup} key={group.label} aria-label={group.label}>
                  <h3>{group.label}</h3>
                  <dl>
                    {group.fields.map((field) => (
                      <div className={styles.fact} key={field.key}>
                        <dt>{field.label}</dt>
                        <dd>{selectedRow[field.key]}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </DrawerContent>
        ) : null}
      </Drawer>
    </section>
  )
}
