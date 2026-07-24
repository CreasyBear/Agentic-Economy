import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import {
  CustomerInquiryRecordProvider,
  isCustomerInquiryRecordClientAvailable,
  useCustomerInquiryRecord,
} from '@/modules/inquiries/customer-record-client'

const PROOF_BOUNDARY = 'This record proves what was sent, when, to whom, and the reply recorded. Acceptance, availability, booking, confirmation, and completed work require separate business evidence.'

export function AeCustomerRecord({ threadId, accessKey }: { threadId: string; accessKey: string | undefined }) {
  if (!isCustomerInquiryRecordClientAvailable()) {
    return <CustomerRecordNotFound />
  }

  return (
    <CustomerInquiryRecordProvider>
      <CustomerRecordContent threadId={threadId} accessKey={accessKey} />
    </CustomerInquiryRecordProvider>
  )
}

function CustomerRecordContent({ threadId, accessKey }: { threadId: string; accessKey: string | undefined }) {
  const result = useCustomerInquiryRecord({ threadId, accessKey })

  if (accessKey === undefined) {
    return <CustomerRecordNotFound />
  }

  if (result === undefined) {
    return (
      <AePublicShell>
        <AePageHeader eyebrow="Your record" title="Opening your record." description="The written record is loading." />
        <main className="mx-auto w-full max-w-3xl px-4 pb-16 md:px-6">
          <Card padding={5} className="grid gap-3" aria-busy="true">
            <Text type="large" weight="semibold" color="primary" display="block">Loading record</Text>
            <Text color="secondary" display="block">Checking the private link now.</Text>
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
        <Card padding={6} className="grid gap-6">
          <Grid columns={{ minWidth: 220, repeat: 'fit' }} gap={4} align="start" className="border-b border-border pb-5">
            <VStack gap={1}>
              <Text type="supporting" color="secondary" weight="semibold" display="block" className="font-mono uppercase tracking-widest">Record ID</Text>
              <Text type="supporting" color="primary" display="block" hasTabularNumbers className="break-all font-mono text-accent">{record.threadId}</Text>
            </VStack>
            <VStack gap={1} className="justify-self-start sm:justify-self-end">
              <Badge variant={record.delivery.state === 'failed' || record.delivery.state === 'held' ? 'warning' : 'neutral'} label={record.delivery.label} />
              <Text type="supporting" color="secondary" display="block">Updated {formatTimestamp(record.updatedAt)}</Text>
            </VStack>
          </Grid>

          <section className="grid gap-3" aria-labelledby="record-summary-title">
            <Text id="record-summary-title" as="h2" type="large" weight="semibold" color="primary" display="block">What you sent</Text>
            {record.governedSend === undefined ? (
              <VStack gap={2} className="rounded-md border border-border bg-surface p-4">
                <Text as="p" type="body" color="primary" display="block" className="whitespace-pre-wrap">{record.submitted.messageSummary}</Text>
                <Text type="supporting" color="secondary" display="block">The exact submitted details are not available for this older record.</Text>
              </VStack>
            ) : record.governedSend.posture === 'erased' ? (
              <VStack gap={2} className="rounded-md border border-border bg-surface p-4">
                <Text as="p" type="body" color="primary" display="block">These submitted details were deleted and can no longer be recovered.</Text>
                <Text type="supporting" color="secondary" display="block">The deletion record remains.</Text>
              </VStack>
            ) : (
              <dl className="divide-y divide-border rounded-md border border-border">
                {record.governedSend.fields.map((field) => (
                  <div key={field.key} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
                    <dt><Text type="supporting" color="secondary" weight="semibold" display="block">{field.label}</Text></dt>
                    <dd><Text type="body" color="primary" display="block" className="break-words whitespace-pre-wrap">{field.value ?? 'Not shared'}</Text></dd>
                  </div>
                ))}
              </dl>
            )}
            <Text type="supporting" color="secondary" display="block">Sent {formatTimestamp(record.submitted.submittedAt)}.</Text>
          </section>

          <Text as="p" type="body" color="secondary" display="block" className="rounded-md border border-border bg-surface p-4">{PROOF_BOUNDARY}</Text>

          <section className="grid gap-3" aria-labelledby="record-reply-title">
            <HStack gap={2} wrap="wrap" align="center">
              <Text id="record-reply-title" as="h2" type="large" weight="semibold" color="primary" display="block">Business reply</Text>
              <Badge variant={reply === undefined ? 'neutral' : 'success'} label={reply === undefined ? 'No business reply' : 'Reply saved'} />
            </HStack>
            {reply === undefined ? (
              <Text as="p" type="body" color="secondary" display="block" className="rounded-md border border-border bg-surface p-4">No business reply</Text>
            ) : (
              <VStack gap={2} className="rounded-md border border-border bg-surface p-4">
                <Text type="supporting" color="secondary" display="block">Reply received from {record.business.name}, {formatTimestamp(reply.createdAt)}</Text>
                <Text as="p" type="large" color="primary" display="block" className="whitespace-pre-wrap text-balance">{reply.body}</Text>
              </VStack>
            )}
          </section>
        </Card>

        <Card padding={5} className="grid gap-4" aria-labelledby="record-history-title">
          <Text id="record-history-title" as="h2" type="large" weight="semibold" color="primary" display="block">Delivery history</Text>
          <ol className="grid gap-0" aria-label="Delivery history">
            {record.timeline.map((step, index) => {
              const hasNext = index < record.timeline.length - 1
              const nextStep = record.timeline[index + 1]
              const reached = step.status === 'complete' || step.status === 'current'
              const nextReached = nextStep?.status === 'complete' || nextStep?.status === 'current'
              return (
                <li key={step.key} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
                  <span className="relative mt-1 flex justify-center" aria-hidden="true">
                    <span className={`size-3 rounded-full border ${reached ? 'border-accent bg-accent' : 'border-border bg-surface'}`} />
                    {hasNext ? <span className={`absolute top-3 h-[calc(100%+1rem)] w-px ${reached && nextReached ? 'bg-accent' : 'bg-border'}`} /> : null}
                  </span>
                  <span className="grid gap-1">
                    <HStack gap={2} wrap="wrap" align="center">
                      <Text type="supporting" weight="medium" color="primary" display="block">{step.label}</Text>
                      <Badge variant="neutral" label={statusLabel(step.status)} />
                    </HStack>
                    {step.timestamp === undefined ? null : <span className="font-mono text-xs tabular-nums text-secondary">{formatTimestamp(step.timestamp)}</span>}
                    <Text type="supporting" color="secondary" display="block">{step.detail}</Text>
                  </span>
                </li>
              )
            })}
          </ol>
        </Card>

        <div className="flex flex-wrap gap-3">
          {record.business.slug.length === 0 ? null : <Button label={`Contact ${record.business.name} another way`} variant="primary" href={`/${record.business.slug}`} />}
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
        <Card padding={5} className="grid gap-4">
          <Text color="secondary" display="block">Use the complete private link you saved after sending.</Text>
          <div><Button label="Start a new ask" variant="secondary" href="/" /></div>
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

function formatTimestamp(value: number): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}
