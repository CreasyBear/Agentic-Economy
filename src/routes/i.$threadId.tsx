import { createFileRoute } from '@tanstack/react-router'
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


type CustomerRecordSearch = {
  k?: string
}

export const Route = createFileRoute('/i/$threadId')({
  validateSearch: (search: Record<string, unknown>): CustomerRecordSearch => {
    const k = typeof search.k === 'string' && search.k.trim().length > 0 ? search.k.trim() : undefined
    return k === undefined ? {} : { k }
  },
  head: () => ({
    meta: [
      { title: 'Your inquiry record | Agentic Economy' },
      { name: 'description', content: 'Read the written inquiry record and business reply.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: CustomerRecordRoute,
})

function CustomerRecordRoute() {
  if (!isCustomerInquiryRecordClientAvailable()) {
    return <CustomerRecordNotFound />
  }

  return (
    <CustomerInquiryRecordProvider>
      <CustomerRecordContent />
    </CustomerInquiryRecordProvider>
  )
}

function CustomerRecordContent() {
  const { threadId } = Route.useParams()
  const search = Route.useSearch()
  const result = useCustomerInquiryRecord({
    threadId,
    accessKey: search.k,
  })

  if (search.k === undefined) {
    return <CustomerRecordNotFound />
  }

  if (result === undefined) {
    return (
      <AePublicShell>
        <AePageHeader
          eyebrow="Your record"
          title="Opening your inquiry record."
          description="The written record is loading."
        />
        <main className="mx-auto w-full max-w-3xl px-4 pb-16 md:px-6">
          <Card padding={5} className="grid gap-3">
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
      <AePageHeader
        eyebrow="Your record"
        title={`Your inquiry to ${record.business.name}.`}
        description="One ask out. One written record back."
      />
      <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 pb-16 md:px-6">
        <Card padding={6} className="grid gap-6">
          <Grid columns={{ minWidth: 220, repeat: 'fit' }} gap={4} align="start" className="border-b border-border pb-5">
            <VStack gap={1}>
              <Text type="supporting" color="secondary" weight="semibold" display="block" className="font-mono uppercase tracking-widest">
                Inquiry record
              </Text>
              <Text type="supporting" color="primary" display="block" hasTabularNumbers className="break-all font-mono text-accent">
                {record.threadId}
              </Text>
            </VStack>
            <VStack gap={1} className="justify-self-start sm:justify-self-end">
              <Badge variant={record.delivery.state === 'failed' || record.delivery.state === 'held' ? 'warning' : 'neutral'} label={record.delivery.label} />
              <Text type="supporting" color="secondary" display="block">
                Updated {formatTimestamp(record.updatedAt)}
              </Text>
            </VStack>
          </Grid>

          <section className="grid gap-3" aria-labelledby="record-summary-title">
            <Text id="record-summary-title" as="h2" type="large" weight="semibold" color="primary" display="block">
              What you sent
            </Text>
            <Text as="p" type="body" color="primary" display="block" className="rounded-md border border-border bg-surface p-4">
              {record.submitted.messageSummary}
            </Text>
            <Text type="supporting" color="secondary" display="block">
              Received {formatTimestamp(record.submitted.submittedAt)}.
            </Text>
          </section>

          <Text as="p" type="body" color="primary" display="block" className="rounded-md border border-accent bg-surface p-4">
            AE has not booked, charged, or confirmed.
          </Text>

          <section className="grid gap-3" aria-labelledby="record-reply-title">
            <HStack gap={2} wrap="wrap" align="center">
              <Text id="record-reply-title" as="h2" type="large" weight="semibold" color="primary" display="block">
                Business reply
              </Text>
              <Badge variant={reply === undefined ? 'neutral' : 'success'} label={reply === undefined ? 'Waiting' : 'Reply saved'} />
            </HStack>
            {reply === undefined ? (
              <Text as="p" type="body" color="secondary" display="block" className="rounded-md border border-border bg-surface p-4">
                The business reply will appear here when it arrives.
              </Text>
            ) : (
              <VStack gap={2} className="rounded-md border border-border bg-surface p-4">
                <Text as="p" type="large" color="primary" display="block" className="text-balance">
                  {reply.body}
                </Text>
                <Text type="supporting" color="secondary" display="block">
                  Reply saved {formatTimestamp(reply.createdAt)}.
                </Text>
              </VStack>
            )}
          </section>
        </Card>

        <Card padding={5} className="grid gap-4" aria-labelledby="record-timeline-title">
          <Text id="record-timeline-title" as="h2" type="large" weight="semibold" color="primary" display="block">
            What happens next
          </Text>
          <ol className="grid gap-0" aria-label="Inquiry record timeline">
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
                      <Text type="supporting" weight="medium" color="primary" display="block">
                        {step.label}
                      </Text>
                      <Badge variant={step.status === 'complete' ? 'success' : step.status === 'current' ? 'neutral' : 'neutral'} label={statusLabel(step.status)} />
                    </HStack>
                    {step.timestamp === undefined ? null : (
                      <span className="font-mono text-xs tabular-nums text-secondary">{formatTimestamp(step.timestamp)}</span>
                    )}
                    <Text type="supporting" color="secondary" display="block">
                      {step.detail}
                    </Text>
                  </span>
                </li>
              )
            })}
          </ol>
        </Card>

        <div className="flex flex-wrap gap-3">
          {record.business.slug.length === 0 ? null : <Button label="Back to business page" variant="secondary" href={`/${record.business.slug}`} />}
        </div>
      </main>
    </AePublicShell>
  )
}

function CustomerRecordNotFound() {
  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Your record"
        title="We couldn’t open that record."
        description="Use the private link from your inquiry receipt."
      />
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 md:px-6">
        <Card padding={5} className="grid gap-4">
          <Text type="large" weight="semibold" color="primary" display="block">Record not found</Text>
          <Text color="secondary" display="block">
            The link needs both the record id and its private key.
          </Text>
          <div>
            <Button label="Back to registry" variant="secondary" href="/registry" />
          </div>
        </Card>
      </main>
    </AePublicShell>
  )
}

function statusLabel(status: 'complete' | 'current' | 'pending'): string {
  switch (status) {
    case 'complete':
      return 'Done'
    case 'current':
      return 'Now'
    case 'pending':
      return 'Next'
  }
}

function formatTimestamp(value: number): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
