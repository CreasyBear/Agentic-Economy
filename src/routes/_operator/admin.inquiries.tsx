import { createFileRoute } from '@tanstack/react-router'
import { ShieldAlertIcon, ShieldCheckIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { AeOperatorFactGrid } from '@/components/ae/operator/AeOperatorFactGrid'
import { AeOperatorFilterCard } from '@/components/ae/operator/AeOperatorFilterCard'
import { AeOperatorQueueList, type AeOperatorQueueRow } from '@/components/ae/operator/AeOperatorQueueList'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Banner } from '@astryxdesign/core/Banner'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { formatTimestamp } from '@/lib/ui/format-time'
import {
  readInquiryOperatorReconstructionServer,
  type InquiryOperatorReconstructionServerResult,
} from '@/modules/inquiries/inquiry.functions'
import type {
  InquiryOperatorAuditRef,
  InquiryOperatorDispatchRef,
  InquiryOperatorFunnelRef,
  InquiryOperatorMessageRef,
  InquiryOperatorOperationRef,
  InquiryOperatorReconstructionRow,
} from '@/modules/inquiries/public'

type AdminInquirySearch = {
  threadId?: string
  correlationId?: string
  dispatchId?: string
}

export const Route = createFileRoute('/_operator/admin/inquiries')({
  ...operatorRouteOptions,
  validateSearch: (search: Record<string, unknown>): AdminInquirySearch =>
    compactSearch(stringSearch(search.threadId), stringSearch(search.correlationId), stringSearch(search.dispatchId)),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readInquiryOperatorReconstructionServer({ data: deps }),
  head: () => ({
    meta: [
      { title: 'Inquiry reconstruction | Agentic Economy' },
      { name: 'description', content: 'Admin inquiry reconstruction with private content redacted.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminInquiriesRoute,
})

function AdminInquiriesRoute() {
  const readback = Route.useLoaderData() as InquiryOperatorReconstructionServerResult
  const search = Route.useSearch() as AdminInquirySearch

  return (
    <AeOperatorShell
      operatorRole="admin"
      title="Inquiry reconstruction"
      description="Reconstruct customer inquiry, owner action, delivery, audit, funnel, and operation refs without exposing private content."
      currentPath="/admin/inquiries"
      navBadges={{ '/admin/inquiries': readback.kind === 'allowed' ? readback.summary.needsRepair : 0 }}
    >
      <OperatorAccess readback={readback} />
      <FilterPanel search={search} />
      {readback.kind === 'denied' ? <DeniedReadback readback={readback} /> : <AllowedReadback readback={readback} />}
    </AeOperatorShell>
  )
}

function OperatorAccess({ readback }: { readback: InquiryOperatorReconstructionServerResult }) {
  return (
    <Banner
      status={readback.kind === 'denied' ? 'error' : 'success'}
      icon={readback.kind === 'denied' ? <ShieldAlertIcon aria-hidden="true" className="size-4" /> : <ShieldCheckIcon aria-hidden="true" className="size-4" />}
      title={readback.kind === 'denied' ? 'Access denied' : 'Reconstruction available'}
      description={
        readback.kind === 'denied'
          ? `${readback.publicMessage} HTTP ${readback.httpStatus}.`
          : `Source-backed inquiry reconstruction is available to ${readback.actorRef}. HTTP ${readback.httpStatus}.`
      }
    />
  )
}

function FilterPanel({ search }: { search: AdminInquirySearch }) {
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

function DeniedReadback({ readback }: { readback: Extract<InquiryOperatorReconstructionServerResult, { kind: 'denied' }> }) {
  return (
    <Card padding={5}>
      <div className="grid gap-1.5">
        <Text as="div" type="large" weight="semibold" color="primary" display="block">Private rows withheld</Text>
        <Text as="div" type="supporting" color="secondary" display="block">Denied inquiry reconstruction reads return no source rows.</Text>
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

function AllowedReadback({ readback }: { readback: Extract<InquiryOperatorReconstructionServerResult, { kind: 'allowed' }> }) {
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
      <Card padding={5}>
        <div className="grid gap-1.5">
          <Text as="div" type="large" weight="semibold" color="primary" display="block">Source summary</Text>
          <Text as="div" type="supporting" color="secondary" display="block">Counts are derived from inquiry, notification, audit, funnel, and operation refs.</Text>
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
        <Card padding={5}>
          <div className="grid gap-1.5">
            <Text as="div" type="large" weight="semibold" color="primary" display="block">No inquiry rows</Text>
            <Text as="div" type="supporting" color="secondary" display="block">No source-owned inquiry path matches the current filters.</Text>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          <TabList value={filter} onChange={(value) => setFilter(value as typeof filter)} hasDivider aria-label="Filter inquiry reconstruction rows">
            <Tab value="all" label={`All (${readback.rows.length})`} />
            <Tab value="attention" label={`Needs attention (${readback.summary.needsRepair})`} />
            <Tab value="terminal" label={`Terminal (${readback.summary.terminal})`} />
          </TabList>
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
  return {
    id: row.rowId,
    title: `Thread ${row.threadId}`,
    description: `Source hash ${row.sourceHash}`,
    badges: [
      { label: row.operatorNextAction.replaceAll('_', ' '), variant: needsAttention ? 'destructive' : 'secondary' },
      { label: row.status, variant: 'outline' },
    ],
    facts: [
      { label: 'Business', value: row.businessId },
      { label: 'Service', value: row.serviceId },
      { label: 'Updated', value: formatTimestamp(row.updatedAt) },
      { label: 'Correlation', value: row.correlationIds.join(', ') || 'none' },
    ],
    body: (
      <div className="mt-2 grid gap-4">
        <RefSection title="Message hashes" refs={row.messageRefs} renderRef={messageRefLabel} />
        <RefSection
          title="Notification refs"
          refs={row.notificationRefs}
          renderRef={(ref) => `${ref.notificationId} · ${ref.status} · ${ref.payloadHash}`}
        />
        <RefSection title="Dispatch refs" refs={row.dispatchRefs} renderRef={dispatchRefLabel} />
        <RefSection title="Audit refs" refs={row.auditRefs} renderRef={auditRefLabel} />
        <RefSection title="Funnel refs" refs={row.funnelRefs} renderRef={funnelRefLabel} />
        <RefSection title="Operation refs" refs={row.operationRefs} renderRef={operationRefLabel} />
      </div>
    ),
  }
}

function RefSection<T>({ title, refs, renderRef }: { title: string; refs: readonly T[]; renderRef: (ref: T) => string }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-semibold text-primary">{title}</h2>
      {refs.length === 0 ? (
        <p className="text-sm text-secondary">No refs recorded.</p>
      ) : (
        <AeOperatorFactGrid
          facts={refs.map((ref, index) => ({ label: `${title} ${index + 1}`, value: renderRef(ref) }))}
          columns={2}
        />
      )}
    </section>
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

function compactSearch(threadId: string | undefined, correlationId: string | undefined, dispatchId: string | undefined): AdminInquirySearch {
  return {
    ...(threadId === undefined ? {} : { threadId }),
    ...(correlationId === undefined ? {} : { correlationId }),
    ...(dispatchId === undefined ? {} : { dispatchId }),
  }
}

function stringSearch(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}
