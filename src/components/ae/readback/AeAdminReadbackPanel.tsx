import { ChevronDown, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useId, useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeOperatorDataTable, AeOperatorSortableHeader } from '@/components/ae/operator/AeOperatorDataTable'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import type { AdminReadbackRow, AdminReadbackSurface, AdminShellReadback } from '@/modules/security/public'

const surfaceLabels = {
  claims_queue: 'Claims queue',
  audit_events: 'Activity log',
  index_health: 'Catalog health',
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
  const accessLabel = `HTTP ${readback.httpStatus}`
  const titleId = useId()
  const descriptionId = useId()

  return (
    <>
      <Alert
        data-readback-kind={readback.kind}
        variant={readback.kind === 'denied' ? 'destructive' : 'default'}
      >
        {readback.kind === 'denied'
          ? <ShieldAlert aria-hidden="true" />
          : <ShieldCheck aria-hidden="true" />}
        <AlertTitle>{readback.kind === 'denied' ? 'Access denied' : 'Readback available'}</AlertTitle>
        <AlertDescription>
          {readback.kind === 'denied'
            ? `${readback.publicMessage} ${accessLabel}.`
            : `${surfaceLabels[readback.surface]} is available to ${readback.actorRef}. ${accessLabel}.`}
        </AlertDescription>
      </Alert>

      <Card aria-labelledby={titleId} aria-describedby={descriptionId} className="p-5">
        <div className="border-b border-border pb-4">
          <h2 className="text-lg font-semibold text-foreground" id={titleId}>{title}</h2>
          <p className="text-sm leading-6 text-muted-foreground" id={descriptionId}>{description}</p>
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
        <Empty className="border border-border bg-card p-4">
          <EmptyHeader>
            <EmptyTitle>No operational rows yet</EmptyTitle>
            <EmptyDescription>No source-owned operational rows exist for this surface yet.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <AeStatusBadge status="not_queued" />
          </EmptyContent>
        </Empty>
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
            <span className="font-medium text-foreground">Object ref</span>
            <span className="text-xs text-muted-foreground">
              {row.original.rowType.replaceAll('_', ' ')} · {surfaceLabels[surface]}
            </span>
            <RefDisclosure raw={row.original.objectRef} />
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
        cell: ({ row }) => <Badge variant="outline">{repairLabels[row.original.repairAction]}</Badge>,
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
          <div className="grid max-w-[12rem] gap-1 whitespace-normal">
            <span className="font-medium text-foreground">Correlation ref</span>
            <RefDisclosure raw={row.original.correlationId ?? 'Unavailable'} />
          </div>
        ),
      },
    ],
    [surface],
  )
}

function ReadbackStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <span className="block text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</span>
      <span className="mt-1 block break-words text-sm font-medium text-foreground" data-numeric>{value}</span>
    </div>
  )
}

function RefDisclosure({ raw }: { raw: string }) {
  return (
    <Collapsible className="grid gap-1">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View reference
          <ChevronDown aria-hidden="true" className="size-3 text-muted-foreground" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <code className="block whitespace-normal break-words font-mono text-xs leading-5 text-muted-foreground">
          {raw}
        </code>
      </CollapsibleContent>
    </Collapsible>
  )
}
