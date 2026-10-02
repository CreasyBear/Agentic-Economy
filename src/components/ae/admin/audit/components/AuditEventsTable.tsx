import type { ColumnDef } from '@tanstack/react-table'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/arc/button/button'
import '../../RecordWorkspaceComposition.css'
import {
  AUDIT_COPY,
  type AdminAuditRowModel,
  type AuditEventsTableProps,
} from '../audit.contracts'
import { auditEventLabel, auditOutcomeLabel } from './audit-labels'

const columns: ColumnDef<AdminAuditRowModel, unknown>[] = [
  {
    accessorKey: 'createdAtLabel',
    header: AUDIT_COPY.columnLabels.time,
    cell: ({ row }) => (
      <time dateTime={row.original.createdAtIso}>{row.original.createdAtLabel}</time>
    ),
  },
  {
    accessorKey: 'eventType',
    header: AUDIT_COPY.columnLabels.event,
    cell: ({ row }) => {
      const admin = row.original.admin
      return (
        <div className="arc-admin-record-detail">
          <span>{auditEventLabel(row.original.eventType)}</span>
          <code>{row.original.eventType}</code>
          {admin === null ? null : (
            <dl>
              <div className="flex flex-wrap gap-1">
                <dt className="font-medium text-foreground">{AUDIT_COPY.columnLabels.permission}:</dt>
                <dd>{admin.permission}</dd>
              </div>
              <div className="flex flex-wrap gap-1">
                <dt className="font-medium text-foreground">{AUDIT_COPY.columnLabels.reason}:</dt>
                <dd>{admin.reasonCode}</dd>
              </div>
              {admin.evidenceRefs.map((evidenceRef) => (
                <div key={evidenceRef} className="grid gap-1">
                  <dt className="font-medium text-foreground">{AUDIT_COPY.columnLabels.evidence}</dt>
                  <dd><AeCopyReference label={AUDIT_COPY.columnLabels.evidence} value={evidenceRef} /></dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'actorRef',
    header: AUDIT_COPY.columnLabels.actor,
    cell: ({ row }) => (
      <AeCopyReference label={AUDIT_COPY.columnLabels.actor} value={row.original.actorRef} />
    ),
  },
  {
    accessorKey: 'targetLabel',
    header: AUDIT_COPY.columnLabels.target,
    cell: ({ row }) => row.original.targetRef === null || row.original.targetType === null
      ? row.original.targetLabel
      : (
          <div className="arc-admin-record-detail">
            {row.original.targetHref === null
              ? <span>{row.original.targetType}</span>
              : <a className="arc-admin-record-link" href={row.original.targetHref}>{row.original.targetType}</a>}
            <AeCopyReference label={AUDIT_COPY.columnLabels.target} value={row.original.targetRef} />
          </div>
        ),
  },
  {
    accessorKey: 'outcomeRaw',
    header: AUDIT_COPY.columnLabels.outcome,
    cell: ({ row }) => (
      <div className="arc-admin-record-detail">
        <Badge variant="outline">{auditOutcomeLabel(row.original.outcomeRaw)}</Badge>
        {row.original.outcomeRaw === null ? null : <code>{row.original.outcomeRaw}</code>}
      </div>
    ),
  },
  {
    accessorKey: 'correlationId',
    header: AUDIT_COPY.columnLabels.correlation,
    cell: ({ row }) => (
      <AeCopyReference label={AUDIT_COPY.columnLabels.correlation} value={row.original.correlationId} />
    ),
  },
]

export function AuditEventsTable({ rows, filtered, paginationStatus, onLoadMore }: AuditEventsTableProps) {
  const emptyMessage = filtered ? AUDIT_COPY.noFilterMatches : AUDIT_COPY.nothingNeedsAttention
  return (
    <AeSection title={AUDIT_COPY.eventsTitle} description={AUDIT_COPY.eventsDescription} className="order-first md:order-last">
      <AeRecordTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        hideFilter
        caption={AUDIT_COPY.eventsTitle}
        emptyMessage={emptyMessage}
      />
      {paginationStatus === 'CanLoadMore' ? (
        <Button type="button" variant="secondary" size="md" className="justify-self-start" onClick={onLoadMore}>
          {AUDIT_COPY.loadMore}
        </Button>
      ) : null}
    </AeSection>
  )
}
