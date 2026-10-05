import { useState } from 'react'
import { AeRecordSheet } from '@/components/ae/layout/AeRecordSheet'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/ui/button'
import { AUDIT_COPY, type AdminAuditRowModel, type AuditEventsTableProps } from '../audit.contracts'
import { auditEventLabel, auditOutcomeLabel } from './audit-labels'

const columns: DataColumn<AdminAuditRowModel>[] = [
  { key: 'eventType', label: AUDIT_COPY.columnLabels.event, sortable: false, width: '24%',
    render: (_value, row) => <span className="font-medium" title={row.eventType}>{auditEventLabel(row.eventType)}</span> },
  { key: 'actorRef', label: AUDIT_COPY.columnLabels.actor, sortable: false, width: '20%',
    render: (_value, row) => <AeCopyReference compact label={AUDIT_COPY.columnLabels.actor} value={row.actorRef} /> },
  { key: 'targetLabel', label: AUDIT_COPY.columnLabels.target, sortable: false, width: '24%',
    render: (_value, row) => row.targetRef === null || row.targetType === null ? row.targetLabel : (
      <div className="grid min-w-0">
        <span className="text-xs text-muted-foreground">{row.targetType}</span>
        <AeCopyReference compact label={AUDIT_COPY.columnLabels.target} value={row.targetRef} {...(row.targetHref === null ? {} : { href: row.targetHref })} />
      </div>
    ) },
  { key: 'outcomeRaw', label: AUDIT_COPY.columnLabels.outcome, sortable: false, width: '12%',
    render: (_value, row) => <Badge tone="neutral">{auditOutcomeLabel(row.outcomeRaw)}</Badge> },
  { key: 'createdAtIso', label: AUDIT_COPY.columnLabels.time, sortable: false, width: '12%',
    render: (_value, row) => <time className="text-xs text-muted-foreground" dateTime={row.createdAtIso}>{row.createdAtLabel}</time> },
]

export function AuditEventsTable({ rows, filtered, paginationStatus, onLoadMore }: AuditEventsTableProps) {
  const [selected, setSelected] = useState<AdminAuditRowModel | null>(null)
  return (
    <AeSection title={AUDIT_COPY.eventsTitle} description={AUDIT_COPY.eventsDescription} className="order-first min-w-0 md:order-last">
      <div className="ae-arc min-w-0">
        <SortableDataTable density="compact" columns={[...columns, {
          key: 'correlationId', label: 'Evidence', sortable: false, width: '8%',
          render: (_value, row) => <Button size="sm" variant="ghost" className="h-8 min-h-8 px-2 [@media(pointer:coarse)]:min-h-11"
            aria-label={`View evidence: ${row.id}`} onClick={() => setSelected(row)}>Details</Button>,
        }]} rows={rows} rowKey="id" caption={AUDIT_COPY.eventsTitle}
          emptyMessage={filtered ? AUDIT_COPY.noFilterMatches : AUDIT_COPY.nothingNeedsAttention} />
      </div>
      {paginationStatus === 'CanLoadMore' ? <Button type="button" variant="outline" className="justify-self-start" onClick={onLoadMore}>{AUDIT_COPY.loadMore}</Button> : null}
      <AeRecordSheet open={selected !== null} onOpenChange={open => { if (!open) setSelected(null) }}
        title="Audit evidence" description={selected === null ? 'Recorded event details' : `${auditEventLabel(selected.eventType)} · ${selected.createdAtLabel}`}>
        {selected === null ? null : <dl className="grid gap-4 text-sm">
          <div><dt className="text-muted-foreground">Event</dt><dd className="break-all">{selected.eventType}</dd></div>
          <div><dt className="text-muted-foreground">Outcome</dt><dd>{selected.outcomeRaw ?? 'Not recorded'}</dd></div>
          {selected.admin === null ? null : <>
            <div><dt className="text-muted-foreground">{AUDIT_COPY.columnLabels.permission}</dt><dd className="break-all">{selected.admin.permission}</dd></div>
            <div><dt className="text-muted-foreground">{AUDIT_COPY.columnLabels.reason}</dt><dd className="break-all">{selected.admin.reasonCode}</dd></div>
            {selected.admin.evidenceRefs.map(ref => <div key={ref}><dt className="text-muted-foreground">{AUDIT_COPY.columnLabels.evidence}</dt><dd><AeCopyReference label="Evidence" value={ref} /></dd></div>)}
          </>}
          <div><dt className="text-muted-foreground">{AUDIT_COPY.columnLabels.correlation}</dt><dd><AeCopyReference label="Correlation" value={selected.correlationId} /></dd></div>
        </dl>}
      </AeRecordSheet>
    </AeSection>
  )
}
