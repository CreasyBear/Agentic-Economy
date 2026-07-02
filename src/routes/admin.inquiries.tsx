import { createFileRoute } from '@tanstack/react-router'
import { ShieldAlertIcon, ShieldCheckIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { AeOperatorFactGrid } from '@/components/ae/operator/AeOperatorFactGrid'
import { AeOperatorFilterCard } from '@/components/ae/operator/AeOperatorFilterCard'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

export const Route = createFileRoute('/admin/inquiries')({
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
      role="admin"
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
    <Alert variant={readback.kind === 'denied' ? 'destructive' : 'default'}>
      {readback.kind === 'denied' ? (
        <ShieldAlertIcon aria-hidden="true" className="size-4" />
      ) : (
        <ShieldCheckIcon aria-hidden="true" className="size-4" />
      )}
      <AlertTitle>{readback.kind === 'denied' ? 'Access denied' : 'Reconstruction available'}</AlertTitle>
      <AlertDescription>
        {readback.kind === 'denied'
          ? `${readback.publicMessage} HTTP ${readback.httpStatus}.`
          : `Source-backed inquiry reconstruction is available to ${readback.actorRef}. HTTP ${readback.httpStatus}.`}
      </AlertDescription>
    </Alert>
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
    <Card>
      <CardHeader>
        <CardTitle>Private rows withheld</CardTitle>
        <CardDescription>Denied inquiry reconstruction reads return no source rows.</CardDescription>
      </CardHeader>
      <CardContent>
        <AeOperatorFactGrid
          facts={[
            { label: 'Decision', value: readback.reason.replaceAll('_', ' ') },
            { label: 'Private rows returned', value: String(readback.rows.length) },
            { label: 'Generated', value: new Date(readback.generatedAt).toISOString() },
          ]}
        />
      </CardContent>
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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Source summary</CardTitle>
          <CardDescription>Counts are derived from inquiry, notification, audit, funnel, and operation refs.</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
      {readback.rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No inquiry rows</CardTitle>
            <CardDescription>No source-owned inquiry path matches the current filters.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
            <TabsList variant="line" aria-label="Filter inquiry reconstruction rows">
              <TabsTrigger value="all">All ({readback.rows.length})</TabsTrigger>
              <TabsTrigger value="attention">Needs attention ({readback.summary.needsRepair})</TabsTrigger>
              <TabsTrigger value="terminal">Terminal ({readback.summary.terminal})</TabsTrigger>
            </TabsList>
          </Tabs>
          {filteredRows.length === 0 ? (
            <AeEmptyState
              title="Nothing in this bucket"
              description="Try another filter to see inquiry reconstruction rows in a different state."
            />
          ) : (
            <ScrollArea className="ae-operator-scroll-panel ae-operator-scroll-panel--tall border">
              <div className="grid gap-4 p-4">
                {filteredRows.map((row) => (
                  <TimelineRow key={row.rowId} row={row} />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </>
  )
}

function TimelineRow({ row }: { row: InquiryOperatorReconstructionRow }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={row.operatorNextAction === 'none' || row.operatorNextAction === 'terminal' ? 'secondary' : 'destructive'}>
            {row.operatorNextAction.replaceAll('_', ' ')}
          </Badge>
          <Badge variant="outline">{row.status}</Badge>
        </div>
        <CardTitle className="break-words text-lg">Thread {row.threadId}</CardTitle>
        <CardDescription>Source hash {row.sourceHash}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <AeOperatorFactGrid
          facts={[
            { label: 'Business', value: row.businessId },
            { label: 'Service', value: row.serviceId },
            { label: 'Updated', value: new Date(row.updatedAt).toISOString() },
            { label: 'Correlation', value: row.correlationIds.join(', ') || 'none' },
          ]}
        />
        <RefSection title="Message hashes" refs={row.messageRefs} renderRef={messageRefLabel} />
        <RefSection title="Notification refs" refs={row.notificationRefs} renderRef={(ref) => `${ref.notificationId} · ${ref.status} · ${ref.payloadHash}`} />
        <RefSection title="Dispatch refs" refs={row.dispatchRefs} renderRef={dispatchRefLabel} />
        <RefSection title="Audit refs" refs={row.auditRefs} renderRef={auditRefLabel} />
        <RefSection title="Funnel refs" refs={row.funnelRefs} renderRef={funnelRefLabel} />
        <RefSection title="Operation refs" refs={row.operationRefs} renderRef={operationRefLabel} />
      </CardContent>
    </Card>
  )
}

function RefSection<T>({ title, refs, renderRef }: { title: string; refs: readonly T[]; renderRef: (ref: T) => string }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {refs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No refs recorded.</p>
      ) : (
        <ul className="grid gap-2">
          {refs.map((ref, index) => (
            <li key={`${title}:${index}`} className="break-words rounded-md border bg-muted/30 p-3 font-mono text-xs leading-5 text-foreground">
              {renderRef(ref)}
            </li>
          ))}
        </ul>
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
