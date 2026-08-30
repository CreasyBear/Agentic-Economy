import { ChevronDown, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeOperatorDataTable, AeOperatorSortableHeader } from '@/components/ae/operator/AeOperatorDataTable'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { AdminReadbackRow, AdminReadbackSurface, AdminShellReadback } from '@/modules/security/public'

const surfaceLabels = {
  audit_events: 'Activity log',
  index_health: 'Catalog health',
} satisfies Record<AdminReadbackSurface, string>

const rowStateLabels = {
  no_source_rows: 'No source rows',
  guarded: 'Guarded',
  queued: 'Queued',
  indexed: 'Indexed',
  degraded: 'Degraded',
  stale: 'Stale',
  suppressed: 'Suppressed',
} satisfies Record<AdminReadbackRow['rowState'], string>

const repairLabels = {
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

      <AeSection title={title} description={description}>
        {readback.kind === 'denied' ? <DeniedReadback readback={readback} /> : <AllowedReadback readback={readback} />}
      </AeSection>
    </>
  )
}

function DeniedReadback({ readback }: { readback: Extract<AdminShellReadback, { kind: 'denied' }> }) {
  return (
    <AeFactList
      facts={[
        { label: 'Surface', value: surfaceLabels[readback.surface] },
        { label: 'Decision', value: readback.reason.replaceAll('_', ' ') },
        { label: 'Private rows returned', value: String(readback.rows.length) },
      ]}
    />
  )
}

function AllowedReadback({ readback }: { readback: Extract<AdminShellReadback, { kind: 'allowed' }> }) {
  const columns = useAdminReadbackColumns(readback.surface)

  return (
    <div className="flex flex-col gap-4">
      <AeFactList
        facts={[
          { label: 'Queued', value: String(readback.summary.queued) },
          { label: 'Needs attention', value: String(readback.summary.attention) },
          { label: 'Stale', value: String(readback.summary.stale) },
          { label: 'Suppressed', value: String(readback.summary.suppressed) },
        ]}
      />
      {readback.rows.length === 0 ? (
        <AeEmptyState
          title="No operational rows yet"
          description="No source-owned operational rows exist for this surface yet."
        />
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
