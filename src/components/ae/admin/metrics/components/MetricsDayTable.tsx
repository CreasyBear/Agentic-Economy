import type { ColumnDef } from '@tanstack/react-table'

import { AeSection } from '@/components/ae/layout/AeSection'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { ADMIN_METRICS_COPY, type AdminMetricDayRow } from '../metrics.contracts'

const columns: ColumnDef<AdminMetricDayRow, unknown>[] = [
  { accessorKey: 'day', header: ADMIN_METRICS_COPY.columns.day },
  { accessorKey: 'settledCallValue', header: ADMIN_METRICS_COPY.columns.settledValue },
  { accessorKey: 'money', header: ADMIN_METRICS_COPY.columns.money },
  { accessorKey: 'settledCalls', header: ADMIN_METRICS_COPY.columns.settledCalls },
  { accessorKey: 'attemptedCalls', header: ADMIN_METRICS_COPY.columns.attemptedCalls },
  { accessorKey: 'completedCalls', header: ADMIN_METRICS_COPY.columns.completedCalls },
  { accessorKey: 'uncertainCalls', header: ADMIN_METRICS_COPY.columns.uncertainCalls },
  { accessorKey: 'quotesCreated', header: ADMIN_METRICS_COPY.columns.quotesCreated },
  { accessorKey: 'quotesConvertedAtClose', header: ADMIN_METRICS_COPY.columns.quotesConverted },
  { accessorKey: 'transactingWorkspaces', header: ADMIN_METRICS_COPY.columns.workspaces },
  { accessorKey: 'transactingAgents', header: ADMIN_METRICS_COPY.columns.agents },
  { accessorKey: 'transactingProviders', header: ADMIN_METRICS_COPY.columns.providers },
  { accessorKey: 'transactingTools', header: ADMIN_METRICS_COPY.columns.tools },
  { accessorKey: 'returningWorkspaces', header: ADMIN_METRICS_COPY.columns.returningWorkspaces },
  { accessorKey: 'terminalCalls', header: ADMIN_METRICS_COPY.columns.terminalCalls },
  { accessorKey: 'terminalCallsWithResolution', header: ADMIN_METRICS_COPY.columns.resolvedCalls },
]

export type MetricsDayTableProps = Readonly<{ rows: readonly AdminMetricDayRow[] }>

export function MetricsDayTable({ rows }: MetricsDayTableProps) {
  return (
    <AeSection title={ADMIN_METRICS_COPY.dailyTitle}>
      <AeRecordTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.day}
        hideFilter
        caption={ADMIN_METRICS_COPY.dailyTitle}
        emptyMessage={ADMIN_METRICS_COPY.noDays}
      />
    </AeSection>
  )
}
