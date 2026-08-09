import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { useCustomerInquiryRecord } from '@/modules/inquiries/customer-record-client'
import { cn } from '@/lib/utils'
import { formatRecordTimestamp } from '@/lib/ui/format-time'

const PROOF_BOUNDARY = 'This record proves what was sent, when, to whom, and the reply recorded. Acceptance, availability, booking, confirmation, and completed work require separate business evidence.'

export function AeCustomerRecord({ threadId, recordAccessKey }: { threadId: string; recordAccessKey: string | undefined }) {
  return <CustomerRecordContent threadId={threadId} recordAccessKey={recordAccessKey} />
}

function CustomerRecordContent({ threadId, recordAccessKey }: { threadId: string; recordAccessKey: string | undefined }) {
  const result = useCustomerInquiryRecord({ threadId, accessKey: recordAccessKey })

  if (recordAccessKey === undefined) {
    return <CustomerRecordNotFound />
  }

  if (result === undefined) {
    return (
      <AePublicShell>
        <AePageHeader eyebrow="Your record" title="Opening your record." description="The written record is loading." />
        <main className="mx-auto w-full max-w-3xl px-4 pb-16 md:px-6">
          <Card>
            <CardContent className="grid gap-3" aria-busy="true">
              <p className="text-lg font-semibold text-foreground">Loading record</p>
              <p className="text-muted-foreground">Checking the private link now.</p>
            </CardContent>
          </Card>
        </main>
      </AePublicShell>
    )
  }

  if (result.kind !== 'ok') {
    return <CustomerRecordNotFound />
  }

  const record = result.record
  const reply = record.reply

  return (
    <AePublicShell>
      <AePageHeader eyebrow="Private link" title="Your record" description={`Your request to ${record.business.name}.`} />
      <main id="record" className="mx-auto grid w-full max-w-3xl gap-6 px-4 pb-16 md:px-6" tabIndex={-1}>
        <Card className="gap-0 border-border bg-card">
          <CardHeader className="border-b border-border p-6">
            <CardTitle className="sr-only">Record identifiers</CardTitle>
            <div className="grid items-start gap-4 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
              <div className="grid gap-1">
                <span className="block font-mono text-sm font-semibold uppercase tracking-widest text-muted-foreground">Record ID</span>
                <span className="block break-all font-mono tabular-nums text-sm text-brand">{record.threadId}</span>
              </div>
              <div className="grid justify-self-start gap-1 sm:justify-self-end">
                <Badge variant={record.delivery.state === 'failed' || record.delivery.state === 'held' ? 'secondary' : 'outline'}>
                  {record.delivery.label}
                </Badge>
                <span className="block text-sm text-muted-foreground">Updated {formatRecordTimestamp(record.updatedAt)}</span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid gap-6 p-6">
            <section className="grid gap-3" aria-labelledby="record-summary-title">
              <h2 id="record-summary-title" className="text-lg font-semibold text-foreground">What you sent</h2>
              {record.governedSend === undefined ? (
                <div className="grid gap-2 rounded-md border border-border bg-card p-4">
                  <p className="whitespace-pre-wrap text-foreground">{record.submitted.messageSummary}</p>
                  <p className="text-sm text-muted-foreground">The exact submitted details are not available for this older record.</p>
                </div>
              ) : record.governedSend.posture === 'erased' ? (
                <div className="grid gap-2 rounded-md border border-border bg-card p-4">
                  <p className="text-foreground">These submitted details were deleted and can no longer be recovered.</p>
                  <p className="text-sm text-muted-foreground">The deletion record remains.</p>
                </div>
              ) : (
                <dl className="divide-y divide-border rounded-md border border-border">
                  {record.governedSend.fields.map((field) => (
                    <div key={field.key} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
                      <dt className="text-sm font-semibold text-muted-foreground">{field.label}</dt>
                      <dd className="break-words whitespace-pre-wrap text-foreground">{field.value ?? 'Not shared'}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="text-sm text-muted-foreground">Sent {formatRecordTimestamp(record.submitted.submittedAt)}.</p>
            </section>

            <p className="rounded-md border border-border bg-card p-4 text-muted-foreground">{PROOF_BOUNDARY}</p>

            <section className="grid gap-3" aria-labelledby="record-reply-title">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="record-reply-title" className="text-lg font-semibold text-foreground">Business reply</h2>
                <Badge variant={reply === undefined ? 'outline' : 'default'}>{reply === undefined ? 'No business reply' : 'Reply saved'}</Badge>
              </div>
              {reply === undefined ? (
                <p className="rounded-md border border-border bg-card p-4 text-muted-foreground">No business reply</p>
              ) : (
                <div className="grid gap-2 rounded-md border border-border bg-card p-4">
                  <p className="text-sm text-muted-foreground">Reply received from {record.business.name}, {formatRecordTimestamp(reply.createdAt)}</p>
                  <p className="whitespace-pre-wrap text-lg text-foreground">{reply.body}</p>
                </div>
              )}
            </section>
          </CardContent>
        </Card>

        <Card className="gap-0 border-border bg-card" aria-labelledby="record-history-title">
          <CardHeader className="p-5 pb-3">
            <CardTitle id="record-history-title" className="text-lg">Delivery history</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <ol className="grid gap-0" aria-label="Delivery history">
              {record.timeline.map((step, index) => {
                const hasNext = index < record.timeline.length - 1
                const nextStep = record.timeline[index + 1]
                const reached = step.status === 'complete' || step.status === 'current'
                const nextReached = nextStep?.status === 'complete' || nextStep?.status === 'current'
                return (
                  <li key={step.key} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
                    <span className="relative mt-1 flex justify-center" aria-hidden="true">
                      <span className={cn('size-3 rounded-full border', reached ? 'border-brand bg-brand' : 'border-border bg-card')} />
                      {hasNext ? <span className={cn('absolute top-3 h-[calc(100%+1rem)] w-px', reached && nextReached ? 'bg-brand' : 'bg-border')} /> : null}
                    </span>
                    <span className="grid gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{step.label}</span>
                        <Badge variant="outline">{statusLabel(step.status)}</Badge>
                      </span>
                      {step.timestamp === undefined ? null : <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatRecordTimestamp(step.timestamp)}</span>}
                      <span className="text-sm text-muted-foreground">{step.detail}</span>
                    </span>
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          {record.business.slug.length === 0 ? null : (
            <Button asChild variant="default">
              <a href={`/${record.business.slug}`}>Contact {record.business.name} another way</a>
            </Button>
          )}
        </div>
      </main>
    </AePublicShell>
  )
}

function CustomerRecordNotFound() {
  return (
    <AePublicShell>
      <AePageHeader eyebrow="Your record" title="This record is not available from this link." description="The private link may be incomplete, expired, or no longer valid." />
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 md:px-6">
        <Card className="border-border bg-card">
          <CardContent className="grid gap-4 p-5">
            <p className="text-muted-foreground">Use the complete private link you saved after sending.</p>
            <div>
              <Button asChild variant="secondary">
                <a href="/">Start a new ask</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </AePublicShell>
  )
}

function statusLabel(status: 'complete' | 'current' | 'pending'): string {
  switch (status) {
    case 'complete': return 'Done'
    case 'current': return 'Now'
    case 'pending': return 'Next'
  }
}

