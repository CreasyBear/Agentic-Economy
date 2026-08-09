import { useMemo, useState } from 'react'
import { ChevronDown, ShieldAlertIcon, ShieldCheckIcon } from 'lucide-react'

import { AeOperatorFactGrid } from '@/components/ae/operator/AeOperatorFactGrid'
import { AeOperatorFilterCard } from '@/components/ae/operator/AeOperatorFilterCard'
import { AeOperatorQueueList, type AeOperatorQueueRow } from '@/components/ae/operator/AeOperatorQueueList'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatTimestamp } from '@/lib/ui/format-time'
import type {
  InquiryOperatorAuditRef,
  InquiryOperatorDispatchRef,
  InquiryOperatorFunnelRef,
  InquiryOperatorMessageRef,
  InquiryOperatorOperationRef,
  InquiryOperatorReconstructionRow,
} from '@/modules/inquiries/public'
import type { InquiryOperatorReconstructionServerResult } from '@/modules/inquiries/inquiry.functions'

export function OperatorAccess({ readback }: { readback: InquiryOperatorReconstructionServerResult }) {
  return (
    <Alert variant={readback.kind === 'denied' ? 'destructive' : 'default'}>
      {readback.kind === 'denied' ? <ShieldAlertIcon aria-hidden="true" /> : <ShieldCheckIcon aria-hidden="true" />}
      <AlertTitle>{readback.kind === 'denied' ? 'Access denied' : 'Reconstruction available'}</AlertTitle>
      <AlertDescription>
        {readback.kind === 'denied'
          ? `${readback.publicMessage} HTTP ${readback.httpStatus}.`
          : `Source-backed inquiry reconstruction is available to ${readback.actorRef}. HTTP ${readback.httpStatus}.`}
      </AlertDescription>
    </Alert>
  )
}

export function FilterPanel({
  search,
}: {
  search: { threadId?: string; correlationId?: string; dispatchId?: string }
}) {
  return (
    <AeOperatorFilterCard
      action="/admin/inquiries"
      title="Find a source path"
      description="Filter by one source-owned thread, correlation, or dispatch identifier."
      fields={[
        {
          id: 'threadId',
          name: 'threadId',
          label: 'Thread ID',
          description: 'Inquiry thread source ref.',
          defaultValue: search.threadId ?? '',
        },
        {
          id: 'correlationId',
          name: 'correlationId',
          label: 'Correlation ID',
          description: 'Operation or funnel correlation ref.',
          defaultValue: search.correlationId ?? '',
        },
        {
          id: 'dispatchId',
          name: 'dispatchId',
          label: 'Dispatch ID',
          description: 'Notification dispatch binding ref.',
          defaultValue: search.dispatchId ?? '',
        },
      ]}
    />
  )
}

export function DeniedReadback({ readback }: { readback: Extract<InquiryOperatorReconstructionServerResult, { kind: 'denied' }> }) {
  return (
    <Card className="p-5">
      <div className="grid gap-1.5">
        <p className="text-lg font-semibold text-foreground">Private rows withheld</p>
        <p className="text-sm text-muted-foreground">Denied inquiry reconstruction reads return no source rows.</p>
      </div>
      <div className="grid gap-4">
        <AeOperatorFactGrid
          facts={[
            { label: 'Decision', value: readback.reason.replaceAll('_', ' ') },
            { label: 'Private rows returned', value: String(readback.rows.length) },
            { label: 'Generated', value: formatTimestamp(readback.generatedAt) },
          ]}
        />
      </div>
    </Card>
  )
}

export function AllowedReadback({ readback }: { readback: Extract<InquiryOperatorReconstructionServerResult, { kind: 'allowed' }> }) {
  const [filter, setFilter] = useState<'all' | 'attention' | 'terminal'>('all')
  const filteredRows = useMemo(() => {
    if (filter === 'all') {
      return readback.rows
    }
    if (filter === 'terminal') {
      return readback.rows.filter(
        (row) => row.operatorNextAction === 'none' || row.operatorNextAction === 'terminal'
      )
    }
    return readback.rows.filter(
      (row) => row.operatorNextAction !== 'none' && row.operatorNextAction !== 'terminal'
    )
  }, [filter, readback.rows])
  const queueRows = useMemo(() => filteredRows.map(toInquiryQueueRow), [filteredRows])

  return (
    <>
      <Card className="p-5">
        <div className="grid gap-1.5">
          <p className="text-lg font-semibold text-foreground">Source summary</p>
          <p className="text-sm text-muted-foreground">Counts are derived from inquiry, notification, audit, funnel, and operation refs.</p>
        </div>
        <div className="grid gap-4">
          <AeOperatorFactGrid
            facts={[
              { label: 'Threads', value: readback.summary.threads },
              { label: 'Messages', value: readback.summary.messages },
              { label: 'Notifications', value: readback.summary.notifications },
              { label: 'Dispatches', value: readback.summary.dispatches },
              { label: 'Needs repair', value: readback.summary.needsRepair },
              { label: 'Terminal', value: readback.summary.terminal },
            ]}
          />
        </div>
      </Card>
      {readback.rows.length === 0 ? (
        <Card className="p-5">
          <div className="grid gap-1.5">
            <p className="text-lg font-semibold text-foreground">No inquiry rows</p>
            <p className="text-sm text-muted-foreground">No source-owned inquiry path matches the current filters.</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          <Tabs value={filter} onValueChange={(value) => {
            if (value === 'all' || value === 'attention' || value === 'terminal') setFilter(value)
          }}>
            <TabsList aria-label="Filter inquiry reconstruction rows">
              <TabsTrigger value="all">All ({readback.rows.length})</TabsTrigger>
              <TabsTrigger value="attention">Needs attention ({readback.summary.needsRepair})</TabsTrigger>
              <TabsTrigger value="terminal">Terminal ({readback.summary.terminal})</TabsTrigger>
            </TabsList>
          </Tabs>
          <AeOperatorQueueList
            rows={queueRows}
            scroll
            emptyTitle="Nothing in this bucket"
            emptyDescription="Try another filter to see inquiry reconstruction rows in a different state."
          />
        </div>
      )}
    </>
  )
}

function toInquiryQueueRow(row: InquiryOperatorReconstructionRow): AeOperatorQueueRow {
  const needsAttention = row.operatorNextAction !== 'none' && row.operatorNextAction !== 'terminal'
  const targetLabel = 'offeringRef' in row
    ? row.offeringRef
    : `Legacy target · ${row.serviceId} · ${row.capabilityKind}`
  return {
    id: row.rowId,
    title: `Thread ${row.threadId}`,
    description: 'Source-backed inquiry reconstruction',
    badges: [
      { label: row.operatorNextAction.replaceAll('_', ' '), variant: needsAttention ? 'destructive' : 'secondary' },
      { label: row.status, variant: 'outline' },
    ],
    facts: [
      { label: 'Business', value: row.businessId },
      { label: 'Offering', value: targetLabel },
      { label: 'Updated', value: formatTimestamp(row.updatedAt) },
      { label: 'Correlation', value: row.correlationIds.join(', ') || 'none' },
    ],
    body: (
      <div className="mt-2 grid gap-4">
        <RefDisclosure label="Source hash" raw={row.sourceHash} />
        <RefSection title="Message hashes" refType="Message ref" refs={row.messageRefs} renderRef={messageRefLabel} />
        <RefSection
          title="Notification refs"
          refType="Notification ref"
          refs={row.notificationRefs}
          renderRef={(ref) => `${ref.notificationId} · ${ref.status} · ${ref.payloadHash}`}
        />
        <RefSection title="Dispatch refs" refType="Dispatch ref" refs={row.dispatchRefs} renderRef={dispatchRefLabel} />
        <RefSection title="Audit refs" refType="Audit ref" refs={row.auditRefs} renderRef={auditRefLabel} />
        <RefSection title="Funnel refs" refType="Funnel ref" refs={row.funnelRefs} renderRef={funnelRefLabel} />
        <RefSection title="Operation refs" refType="Operation ref" refs={row.operationRefs} renderRef={operationRefLabel} />
      </div>
    ),
  }
}

function RefSection<T>({
  title,
  refType,
  refs,
  renderRef,
}: {
  title: string
  refType: string
  refs: readonly T[]
  renderRef: (ref: T) => string
}) {
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {refs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No refs recorded.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {refs.map((ref) => (
            <RefDisclosure key={renderRef(ref)} label={`${refType} ${refs.indexOf(ref) + 1}`} raw={renderRef(ref)} />
          ))}
        </div>
      )}
    </section>
  )
}

function RefDisclosure({ label, raw }: { label: string; raw: string }) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="gap-1 px-4">
        <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      </CardHeader>
      <CardContent className="grid gap-2 px-4">
        <Collapsible className="grid gap-1">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-medium text-foreground transition-colors hover:text-primary"
            >
              View reference
              <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <code className="block whitespace-normal break-words font-mono text-xs leading-5 text-muted-foreground">
              {raw}
            </code>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

function messageRefLabel(ref: InquiryOperatorMessageRef): string {
  return `${ref.sender} · ${ref.messageId} · body ${ref.bodyHash}${ref.contactHash === undefined ? '' : ` · contact ${ref.contactHash}`}`
}

function dispatchRefLabel(ref: InquiryOperatorDispatchRef): string {
  const attemptCount = ref.attemptRefs.length
  const webhookCount = ref.webhookRefs.length
  return `${ref.providerFamily} · ${ref.dispatchId} · ${ref.status} · ${ref.payloadHash} · ${ref.operatorNextAction} · attempts ${attemptCount} · webhooks ${webhookCount}`
}

function auditRefLabel(ref: InquiryOperatorAuditRef): string {
  return `${ref.eventType} · ${ref.targetRef} · ${ref.payloadHash} · ${ref.operationKey} · ${ref.correlationId}`
}

function funnelRefLabel(ref: InquiryOperatorFunnelRef): string {
  return `${ref.eventType} · ${ref.businessId} · ${ref.payloadHash} · ${ref.correlationId}`
}

function operationRefLabel(ref: InquiryOperatorOperationRef): string {
  return `${ref.resultCode} · ${ref.operationKey} · ${ref.requestHash}`
}
