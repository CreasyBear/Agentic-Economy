import type { AeRecordTableFeatures } from '@/components/ae/operator/AeOperatorDataTable'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { BillingHistory } from '@/components/ae/shared/arc-pro/billing-overview/billing-overview'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { formatTimestamp } from '@/lib/ui/format-time'
import { Badge } from '@/components/arc/badge/badge'
import { RecordTime } from '@/components/ae/operator/RecordTime'
import { enumLabel } from '@/lib/ui/enum-label'
import type { CallAttemptEvidence as Evidence } from '@/modules/capability-execution/call-attempt-evidence'
type Attempt = Extract<Evidence, {kind: 'available'}>['attempts'][number]
const outcomeTone: Record<Attempt['outcome'], 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  running: 'info', returned: 'success', failed: 'danger', uncertain: 'warning', timed_out: 'danger', reconciled_not_released: 'neutral', reconciled_released: 'success',
}
export function CallAttemptEvidence({ evidence }: { evidence: Evidence }) {
  const columns = useMemo<ColumnDef<AeRecordTableFeatures, Attempt, unknown>[]>(() => [
    { accessorKey: 'attemptNumber', header: 'Attempt', meta: { numeric: true } },
    { accessorKey: 'outcome', header: 'Outcome', cell: ({row}) => <Badge tone={outcomeTone[row.original.outcome]} size="sm">{enumLabel(row.original.outcome)}</Badge> },
    { accessorKey: 'effectGeneration', header: 'Effect generation', meta: { numeric: true } },
    { accessorKey: 'release', header: 'Release', cell: ({row}) => enumLabel(row.original.release) },
    { id: 'time', accessorKey: 'recordedAt', header: 'Recorded', cell: ({row}) => <RecordTime at={row.original.recordedAt} /> },
  ], [])
  if (evidence.kind !== 'available') return <AeSection title="Execution evidence"><p className="text-sm text-muted-foreground">{evidence.kind === 'not_recorded' ? 'No durable execution attempts were recorded for this Call.' : 'Execution evidence is unavailable.'}</p></AeSection>
  return <AeSection title="Execution evidence" description="Recorded attempts and audit transitions from the existing durable execution system.">
    <BillingHistory title="Attempts" description="Recorded release and outcome evidence for each attempt."><AeRecordTable columns={columns} data={evidence.attempts} getRowId={row => row.attemptRef} hideFilter caption="Durable Call execution attempts" emptyMessage="No attempts recorded." /></BillingHistory>
    <details><summary>Inspect {evidence.history.length} audit transitions</summary><ol className="grid gap-intra text-sm">
      {evidence.history.map((row,index) => <li key={`${row.executionVersion}:${index}`}>Version {row.executionVersion}: {row.kind}; {formatTimestamp(row.recordedAt, 'UTC')} UTC. {row.commandDigest === null ? 'Command digest unavailable.' : <span className="break-all">{row.commandDigest}</span>}</li>)}
    </ol></details>
    <p className="text-xs text-muted-foreground">Release evidence does not confirm financial settlement. Provider payloads and arbitrary errors are excluded from this history.</p>
  </AeSection>
}
