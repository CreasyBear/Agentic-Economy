import type { AeRecordTableFeatures } from '@/components/ae/operator/AeOperatorDataTable'
import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { Drawer, DrawerContent } from '@/components/ae/shared/base-ui/drawer/drawer'
import '../../RecordWorkspaceComposition.css'
import {
  AUDIT_COPY,
  type AdminAuditRowModel,
  type AuditEventsTableProps,
} from '../audit.contracts'
import { auditEventLabel, auditOutcomeLabel } from './audit-labels'
import { aeStatusValues, statusToneOf, type AeStatus } from '@/lib/ui/status-presentation'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { RecordTime } from '@/components/ae/operator/RecordTime'

// Canonical outcomes render as the shared status badge; stored values outside the status set stay a neutral badge.
function OutcomeStatus({ outcome }: { outcome: string | null }) {
  const status = outcome ?? 'unavailable'
  if (!(aeStatusValues as readonly string[]).includes(status)) {
    return <Badge tone={statusToneOf(outcome)} size="sm">{auditOutcomeLabel(outcome)}</Badge>
  }
  return <AeStatusBadge status={status as AeStatus} audience="operator" density="cell" />
}

const columns: ColumnDef<AeRecordTableFeatures, AdminAuditRowModel, unknown>[] = [
  {
    accessorKey: 'eventType',
    header: AUDIT_COPY.columnLabels.event,
    meta: { truncate: true },
    cell: ({ row }) => auditEventLabel(row.original.eventType),
  },
  {
    accessorKey: 'targetLabel',
    header: AUDIT_COPY.columnLabels.target,
    meta: { truncate: true },
    cell: ({ row }) => row.original.targetRef === null || row.original.targetType === null || row.original.targetHref === null
      ? <span>{row.original.targetLabel}</span>
      : <a className="arc-admin-record-link" href={row.original.targetHref}>{row.original.targetLabel}</a>,
  },
  {
    accessorKey: 'outcomeRaw',
    header: AUDIT_COPY.columnLabels.outcome,
    cell: ({ row }) => <OutcomeStatus outcome={row.original.outcomeRaw} />,
  },
  {
    accessorKey: 'actorRef',
    header: AUDIT_COPY.columnLabels.actor,
    meta: { truncate: true },
    cell: ({ row }) => <code>{row.original.actorRef}</code>,
  },
  {
    accessorKey: 'createdAtIso',
    header: AUDIT_COPY.columnLabels.time,
    cell: ({ row }) => <RecordTime at={row.original.createdAtIso} />,
  },
]

export function AuditEventsTable({ rows, filtered, paginationStatus, onLoadMore }: AuditEventsTableProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeRowId, setActiveRowId] = useState<string | undefined>()
  const selectedRow = selectedId === null ? undefined : rows.find((row) => row.id === selectedId)
  const emptyMessage = filtered ? AUDIT_COPY.noFilterMatches : AUDIT_COPY.nothingNeedsAttention

  // Reset before committing children so a removed event cannot reopen if it returns.
  if (selectedId !== null && selectedRow === undefined) setSelectedId(null)

  return (
    <AeSection title={AUDIT_COPY.eventsTitle} description={AUDIT_COPY.eventsDescription} className="order-first md:order-last">
      <AeRecordTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        hideFilter
        caption={AUDIT_COPY.eventsTitle}
        emptyMessage={emptyMessage}
        rowAction={{
          kind: 'button',
          label: 'View event',
          getAccessibleLabel: (row) => `View ${auditEventLabel(row.eventType)} at ${row.createdAtLabel}`,
          onOpen: (row) => { setActiveRowId(row.id); setSelectedId(row.id) },
        }}
        rowActionFocus={{
          ...(activeRowId === undefined ? {} : { currentId: activeRowId }),
          onCurrentIdChange: setActiveRowId,
          restore: selectedId === null,
        }}
      />
      {paginationStatus === 'CanLoadMore' ? (
        <Button type="button" variant="secondary" size="md" className="justify-self-start" onClick={onLoadMore}>
          {AUDIT_COPY.loadMore}
        </Button>
      ) : null}
      <Drawer open={selectedRow !== undefined} onOpenChange={(open) => { if (!open) setSelectedId(null) }}>
        {selectedRow === undefined ? null : (
          <DrawerContent title="Audit event" description={auditEventLabel(selectedRow.eventType)}>
            <AuditEventDetails row={selectedRow} />
          </DrawerContent>
        )}
      </Drawer>
    </AeSection>
  )
}

function AuditEventDetails({ row }: { row: AdminAuditRowModel }) {
  return (
            <dl className="arc-admin-source-facts">
              <div className="arc-admin-source-fact"><dt>Event reference</dt><dd><AeCopyReference label="Event reference" value={row.id} /></dd></div>
              <div className="arc-admin-source-fact"><dt>{AUDIT_COPY.columnLabels.time}</dt><dd><time dateTime={row.createdAtIso}>{row.createdAtLabel}</time></dd></div>
              <div className="arc-admin-source-fact"><dt>{AUDIT_COPY.columnLabels.event}</dt><dd><code>{row.eventType}</code></dd></div>
              <div className="arc-admin-source-fact"><dt>{AUDIT_COPY.columnLabels.actor}</dt><dd><AeCopyReference label={AUDIT_COPY.columnLabels.actor} value={row.actorRef} /></dd></div>
              <div className="arc-admin-source-fact">
                <dt>{AUDIT_COPY.columnLabels.target}</dt>
                <dd>
                  {row.targetRef === null || row.targetType === null || row.targetHref === null ? <span>{row.targetLabel}</span> : <a className="arc-admin-record-link" href={row.targetHref}>{row.targetLabel}</a>}
                  {row.targetType === null ? null : <p>{row.targetType}</p>}
                  {row.targetRef === null ? null : <AeCopyReference label={AUDIT_COPY.columnLabels.target} value={row.targetRef} />}
                </dd>
              </div>
              <div className="arc-admin-source-fact"><dt>{AUDIT_COPY.columnLabels.outcome}</dt><dd><OutcomeStatus outcome={row.outcomeRaw} />{row.outcomeRaw === null ? null : <p><code>{row.outcomeRaw}</code></p>}</dd></div>
              <div className="arc-admin-source-fact"><dt>{AUDIT_COPY.columnLabels.correlation}</dt><dd><AeCopyReference label={AUDIT_COPY.columnLabels.correlation} value={row.correlationId} /></dd></div>
              <AdminAuditDetails admin={row.admin} />
            </dl>
  )
}

function AdminAuditDetails({ admin }: { admin: AdminAuditRowModel['admin'] }) {
  if (admin === null) return null
  return (
    <>
                <div className="arc-admin-source-fact"><dt>{AUDIT_COPY.columnLabels.permission}</dt><dd>{admin.permission}</dd></div>
                <div className="arc-admin-source-fact"><dt>{AUDIT_COPY.columnLabels.reason}</dt><dd>{admin.reasonCode}</dd></div>
                {admin.beforeState === null ? null : <div className="arc-admin-source-fact"><dt>Before state</dt><dd><code>{admin.beforeState}</code></dd></div>}
                {admin.afterState === null ? null : <div className="arc-admin-source-fact"><dt>After state</dt><dd><code>{admin.afterState}</code></dd></div>}
                {admin.evidenceRefs.map((value) => <div className="arc-admin-source-fact" key={value}><dt>{AUDIT_COPY.columnLabels.evidence}</dt><dd><AeCopyReference label={AUDIT_COPY.columnLabels.evidence} value={value} /></dd></div>)}
    </>
  )
}
