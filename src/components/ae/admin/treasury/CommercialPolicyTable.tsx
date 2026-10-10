import type { AeRecordTableFeatures } from '@/components/ae/operator/AeOperatorDataTable'
import type { FunctionReturnType } from 'convex/server'
import type { ColumnDef } from '@tanstack/react-table'
import { Link } from '@tanstack/react-router'

import type { api } from '../../../../../convex/_generated/api'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { Button } from '@/components/arc/button/button'
import { Badge } from '@/components/arc/badge/badge'
import { RecordTime } from '@/components/ae/operator/RecordTime'
import { validCommercialPolicyControl, validProductionCommercialPolicyControl, type CommercialPolicyFamily } from '@/modules/money/public'
import { POLICY_LABELS } from './commercial-policy-form'

type Summary = Extract<FunctionReturnType<typeof api.moneyCommercialPolicy.readSummary>, { kind: 'ready' }>
type PolicyRow = Summary['rows'][number]
type CommercialPolicyStatus = 'Conflicting active records' | 'Missing' | 'Suspended' | 'No active policy (superseded)' | 'Expired' | 'Scheduled' | 'Invalid recorded terms' | 'Custody cap unavailable or below recorded buffer' | 'Active'

export function commercialPolicyStatus(row: PolicyRow, now: number): CommercialPolicyStatus {
  if (row.conflict) return 'Conflicting active records'
  const current = row.current
  if (current === null) return 'Missing'
  if (current.lifecycle === 'suspended') return 'Suspended'
  if (current.lifecycle === 'superseded') return 'No active policy (superseded)'
  if (current.expiresAt <= now) return 'Expired'
  if (current.effectiveAt > now) return 'Scheduled'
  if (!validCommercialPolicyControl(current.control) || !validProductionCommercialPolicyControl(current.control)) return 'Invalid recorded terms'
  if (!row.deploymentProfileValid) return 'Custody cap unavailable or below recorded buffer'
  return 'Active'
}

function commercialPolicyTone(status: CommercialPolicyStatus): 'success' | 'info' | 'warning' | 'danger' {
  if (status === 'Active') return 'success'
  if (status === 'Scheduled') return 'info'
  if (status === 'Missing' || status === 'Expired' || status === 'Suspended' || status === 'No active policy (superseded)') return 'warning'
  return 'danger'
}

export function CommercialPolicyTable({ summary, selectedFamily, locked, onSelect }: {
  summary: Summary
  selectedFamily: CommercialPolicyFamily
  locked: boolean
  onSelect: (family: CommercialPolicyFamily) => void
}) {
  const columns: ColumnDef<AeRecordTableFeatures, PolicyRow, unknown>[] = [
    { accessorKey: 'family', header: 'Policy family', enableSorting: false, cell: ({ row }) => POLICY_LABELS[row.original.family] },
    { id: 'status', header: 'Status', enableSorting: false, cell: ({ row }) => {
      const status = commercialPolicyStatus(row.original, summary.observedAt)
      const current = row.original.current
      return <div className="grid justify-items-start gap-1">
        <Badge tone={commercialPolicyTone(status)} size="sm">{status}</Badge>
        {current === null ? null : <span className="text-xs text-muted-foreground">Revision {current.revision}{status === 'Scheduled' ? <>, starts <RecordTime at={current.effectiveAt} /></> : null}</span>}
      </div>
    } },
    { id: 'pending', header: 'Awaiting approval', enableSorting: false, meta: { numeric: true }, cell: ({ row }) => {
      const firstPending = row.original.pending[0]
      return firstPending === undefined ? '0' : <div className="grid justify-items-end gap-1">
        <span>{row.original.pending.length}</span>
        <AeCopyReference compact label="Proposal" value={firstPending.proposalRef} />
      </div>
    } },
    { id: 'expires', header: 'Expires', enableSorting: false, cell: ({ row }) => <RecordTime at={row.original.current?.expiresAt} missing="No active record" /> },
    { id: 'decision', header: 'Recorded decision', enableSorting: false, cell: ({ row }) => {
      const current = row.original.current
      return current === null ? <span className="text-muted-foreground">None</span> : <div className="grid gap-1">
        <AeCopyReference compact label="Approver" value={current.approvedByPrincipalRef} />
        <AeCopyReference compact label="Evidence" value={current.evidenceRef} />
      </div>
    } },
    { id: 'action', header: 'Action', enableSorting: false, cell: ({ row }) => <Button type="button" variant="secondary" size="sm" disabled={locked} aria-pressed={selectedFamily === row.original.family} onClick={() => onSelect(row.original.family)}>Select {POLICY_LABELS[row.original.family]}</Button> },
  ]
  return <div className="grid gap-intra">
    <AeRecordTable columns={columns} data={summary.rows} getRowId={row => row.family} caption="Production commercial policy approvals" hideFilter emptyMessage="No policy families are available." />
    <p className="text-xs text-muted-foreground">Recorded evidence references and control attestations are not proof that operational recovery or daily close was tested. <Link to="/admin/audit-events" className="underline underline-offset-4">Review approval history in Audit</Link>.</p>
  </div>
}
