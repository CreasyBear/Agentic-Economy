import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { useId, useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeOperatorDataTable, AeOperatorSortableHeader } from '@/components/ae/operator/AeOperatorDataTable'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Card } from '@astryxdesign/core/Card'
import type { AdminReadbackRow, AdminReadbackSurface, AdminShellReadback } from '@/modules/security/public'

const surfaceLabels = {
  claims_queue: 'Claims queue',
  audit_events: 'Audit events',
  index_health: 'Index health',
} satisfies Record<AdminReadbackSurface, string>

const rowStateLabels = {
  pending_review: 'Pending review',
  no_source_rows: 'No source rows',
  guarded: 'Guarded',
  queued: 'Queued',
  indexed: 'Indexed',
  degraded: 'Degraded',
  stale: 'Stale',
  suppressed: 'Suppressed',
} satisfies Record<AdminReadbackRow['rowState'], string>

const repairLabels = {
  review_claim: 'Review claim',
  inspect_audit: 'Inspect audit',
  regenerate_projection: 'Regenerate projection',
  source_auth_required: 'Source auth required',
  no_repair_available: 'No repair available',
} satisfies Record<AdminReadbackRow['repairAction'], string>

type AeAdminReadbackPanelProps = {
  title: string
  description: string
  readback: AdminShellReadback
}

export function AeAdminReadbackPanel({ title, description, readback }: AeAdminReadbackPanelProps) {
  const accessLabel = readback.kind === 'denied' ? `HTTP ${readback.httpStatus}` : `HTTP ${readback.httpStatus}`
  const titleId = useId()
  const descriptionId = useId()

  return (
    <>
      <Banner
        data-readback-kind={readback.kind}
        status={readback.kind === 'denied' ? 'error' : 'success'}
        icon={readback.kind === 'denied' ? <ShieldAlert aria-hidden="true" className="size-4" /> : <ShieldCheck aria-hidden="true" className="size-4" />}
        title={readback.kind === 'denied' ? 'Access denied' : 'Readback available'}
        description={
          readback.kind === 'denied'
            ? `${readback.publicMessage} ${accessLabel}.`
            : `${surfaceLabels[readback.surface]} is available to ${readback.actorRef}. ${accessLabel}.`
        }
      />

      <Card aria-labelledby={titleId} aria-describedby={descriptionId} padding={5}>
        <div className="border-b pb-4">
          <div className="text-lg font-semibold text-primary" id={titleId}>{title}</div>
          <div className="text-sm leading-6 text-secondary" id={descriptionId}>{description}</div>
        </div>
        <div className="pt-4">
          {readback.kind === 'denied' ? <DeniedReadback readback={readback} /> : <AllowedReadback readback={readback} />}
        </div>
      </Card>
    </>
  )
}

function DeniedReadback({ readback }: { readback: Extract<AdminShellReadback, { kind: 'denied' }> }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <ReadbackStat label="Surface" value={surfaceLabels[readback.surface]} />
      <ReadbackStat label="Decision" value={readback.reason.replaceAll('_', ' ')} />
      <ReadbackStat label="Private rows returned" value={String(readback.rows.length)} />
    </div>
  )
}

function AllowedReadback({ readback }: { readback: Extract<AdminShellReadback, { kind: 'allowed' }> }) {
  const columns = useAdminReadbackColumns(readback.surface)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <ReadbackStat label="Queued" value={String(readback.summary.queued)} />
        <ReadbackStat label="Needs attention" value={String(readback.summary.attention)} />
        <ReadbackStat label="Stale" value={String(readback.summary.stale)} />
        <ReadbackStat label="Suppressed" value={String(readback.summary.suppressed)} />
      </div>
      {readback.rows.length === 0 ? (
        <div className="rounded-md border border-border bg-muted/30 p-4">
          <AeStatusBadge status="not_queued" />
          <p className="mt-3 text-sm text-secondary">No source-owned operational rows exist for this surface yet.</p>
        </div>
      ) : (
        <AeOperatorDataTable
          columns={columns}
          data={readback.rows}
          filterPlaceholder="Filter by object, state, or correlation…"
          emptyMessage="No rows match this filter."
        />
      )}
    </div>
  )
}

function useAdminReadbackColumns(surface: AdminReadbackSurface): ColumnDef<AdminReadbackRow, unknown>[] {
  return useMemo(
    () => [
      {
        id: 'object',
        accessorKey: 'objectRef',
        header: ({ column }) => <AeOperatorSortableHeader label="Object" column={column} />,
        cell: ({ row }) => (
          <div className="grid max-w-[16rem] gap-1 whitespace-normal">
            <span className="break-words font-medium text-primary">{row.original.objectRef}</span>
            <span className="text-xs text-secondary">
              {row.original.rowType.replaceAll('_', ' ')} · {surfaceLabels[surface]}
            </span>
          </div>
        ),
      },
      {
        id: 'state',
        accessorFn: (row) => rowStateLabels[row.rowState],
        header: ({ column }) => <AeOperatorSortableHeader label="State" column={column} />,
        cell: ({ row }) => rowStateLabels[row.original.rowState],
      },
      {
        id: 'repair',
        accessorFn: (row) => repairLabels[row.repairAction],
        header: 'Repair',
        cell: ({ row }) => <Badge variant="neutral" label={repairLabels[row.original.repairAction]} />,
      },
      {
        id: 'readback',
        accessorKey: 'readbackState',
        header: ({ column }) => <AeOperatorSortableHeader label="Readback" column={column} />,
        cell: ({ row }) => <span className="whitespace-normal">{row.original.readbackState.replaceAll('_', ' ')}</span>,
      },
      {
        id: 'correlation',
        accessorFn: (row) => row.correlationId ?? 'Unavailable',
        header: 'Correlation',
        cell: ({ row }) => (
          <span className="max-w-[12rem] whitespace-normal font-mono text-xs">
            {row.original.correlationId ?? 'Unavailable'}
          </span>
        ),
      },
    ],
    [surface],
  )
}

function ReadbackStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <span className="block text-xs font-medium uppercase tracking-normal text-secondary">{label}</span>
      <span className="mt-1 block break-words text-sm font-medium text-primary" data-numeric>{value}</span>
    </div>
  )
}
