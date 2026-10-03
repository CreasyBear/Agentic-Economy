import type { FunctionReturnType } from 'convex/server'
import type { ColumnDef } from '@tanstack/react-table'
import { Link } from '@tanstack/react-router'

import type { api } from '../../../../../convex/_generated/api'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { Button } from '@/components/ui/button'
import { formatPerthTimestamp } from '@/lib/ui/format-time'
import { validCommercialPolicyControl, validProductionCommercialPolicyControl, type CommercialPolicyFamily } from '@/modules/money/public'
import { POLICY_LABELS } from './commercial-policy-form'

type Summary = Extract<FunctionReturnType<typeof api.moneyCommercialPolicy.readSummary>, { kind: 'ready' }>
type PolicyRow = Summary['rows'][number]

export function commercialPolicyStatus(row: PolicyRow, now: number): string {
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

export function CommercialPolicyTable({ summary, selectedFamily, locked, onSelect }: {
  summary: Summary
  selectedFamily: CommercialPolicyFamily
  locked: boolean
  onSelect: (family: CommercialPolicyFamily) => void
}) {
  const columns: ColumnDef<PolicyRow, unknown>[] = [
    { accessorKey: 'family', header: 'Policy family', enableSorting: false, cell: ({ row }) => POLICY_LABELS[row.original.family] },
    { id: 'status', header: 'Record and pending decision', enableSorting: false, cell: ({ row }) => {
      const policy = row.original
      const firstPending = policy.pending[0]
      return <div className="grid gap-1">
        <span>{commercialPolicyStatus(policy, summary.observedAt)}{policy.current === null ? '' : ` · revision ${policy.current.revision}`}</span>
        {firstPending === undefined ? <span>No pending decision</span> : <>
          <span>{policy.pending.length} awaiting second owner · next expires {formatPerthTimestamp(firstPending.expiresAt)}</span>
          <details><summary className="cursor-pointer">Proposal reference</summary><AeCopyReference label="Proposal" value={firstPending.proposalRef} /></details>
          <Link to="/admin/audit-events" className="underline underline-offset-4">Review in Audit</Link>
        </>}
      </div>
    } },
    { id: 'validity', header: 'Validity (Perth)', enableSorting: false, cell: ({ row }) => {
      const current = row.original.current
      return current === null ? '—' : <div className="grid gap-1"><span>From {formatPerthTimestamp(current.effectiveAt)}</span><span>Until {formatPerthTimestamp(current.expiresAt)}</span></div>
    } },
    { id: 'decision', header: 'Recorded decision', enableSorting: false, cell: ({ row }) => {
      const current = row.original.current
      return current === null ? '—' : <div className="grid gap-1">
        <span>Approver: <AeCopyReference label="Approver" value={current.approvedByPrincipalRef} /></span>
        <span>Evidence: <AeCopyReference label="Evidence" value={current.evidenceRef} /></span>
      </div>
    } },
    { id: 'action', header: 'Prepare', enableSorting: false, cell: ({ row }) => <Button type="button" variant="outline" size="sm" disabled={locked} aria-pressed={selectedFamily === row.original.family} onClick={() => onSelect(row.original.family)}>Select {POLICY_LABELS[row.original.family]}</Button> },
  ]
  return <div className="grid gap-intra">
    <AeRecordTable columns={columns} data={summary.rows} getRowId={row => row.family} caption="Production commercial policy approvals" hideFilter emptyMessage="No policy families are available." />
    <p className="text-xs text-muted-foreground">Recorded evidence references and control attestations are not proof that operational recovery or daily close was tested. <Link to="/admin/audit-events" className="underline underline-offset-4">Review approval history in Audit</Link>.</p>
  </div>
}
