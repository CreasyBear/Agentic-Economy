import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { SendIcon } from 'lucide-react'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { toast } from '@/lib/ui/toast'
import { useClientMounted } from '@/hooks/use-client-mounted'

import { AeActionResultCard } from '@/components/ae/feedback/AeActionResultCard'
import { AeInquiryComposer } from '@/components/ae/inquiries/AeInquiryComposer'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeActionButton } from '@/components/ae/motion/AeActionButton'
import { readPublicBusinessPageServer } from '@/modules/catalog/owner-claim.functions'
import {
  submitPublicInquiryServer,
  type PublicInquirySubmitServerResult,
} from '@/modules/inquiries/inquiry.functions'
import {
  readPublicInquiryRouteReadback,
  validatePublicInquiryFormInput,
  type PublicInquiryFormInput,
  type PublicInquiryFormField,
  type PublicInquiryRouteReadback,
  type PublicInquirySubmittedReceipt,
  type PublicInquiryValidationError,
} from '@/modules/inquiries/route-readbacks'
import type { InquiryOriginRef } from '@/modules/inquiries/public'

const emptyInquiryFormInput = {
  body: '',
  contact: {
    name: '',
    email: '',
    phone: '',
  },
} satisfies PublicInquiryFormInput

const submitInquiryServer = submitPublicInquiryServer

type PublicInquirySearch = {
  from?: 'thread'
  id?: string
}

export const Route = createFileRoute('/$slug/inquiry')({
  validateSearch: (search: Record<string, unknown>): PublicInquirySearch => {
    const from = search.from === 'thread' ? search.from : undefined
    const id = typeof search.id === 'string' && search.id.trim().length > 0 ? search.id.trim() : undefined
    return {
      ...(from === undefined ? {} : { from }),
      ...(id === undefined ? {} : { id }),
    }
  },
  loader: async ({ params }) => {
    const page = await readPublicBusinessPageServer({ data: { slug: params.slug } })
    return readPublicInquiryRouteReadback({ slug: params.slug, page })
  },
  head: () => ({
    meta: [
      { title: 'Tell a business about the job | Agentic Economy' },
      { name: 'description', content: 'Send one clear inquiry for owner review.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: PublicInquiryRoute,
})

export { readPublicInquiryRouteReadback, validatePublicInquiryFormInput }

function PublicInquiryRoute() {
  const readback = Route.useLoaderData()
  const search = Route.useSearch()
  const initialResult = readback.kind === 'available' && readback.submitted
    ? submittedReceiptToResult(readback.submitted)
    : undefined
  const submitInquiry = useServerFn(submitInquiryServer)
  const hydrated = useClientMounted()
  const [value, setValue] = useState<PublicInquiryFormInput>(emptyInquiryFormInput)
  const [errors, setErrors] = useState<readonly PublicInquiryValidationError[]>([])
  const [result, setResult] = useState<PublicInquirySubmitServerResult | undefined>(initialResult)
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)
  const submitLockRef = useRef(false)
  const errorByField = new Map(errors.map((error) => [error.field, error.message]))
  const origin = inquiryOrigin(search)

  if (readback.kind === 'unavailable') {
    return <UnavailableInquiry readback={readback} />
  }

  function updateContact(field: keyof PublicInquiryFormInput['contact'], nextValue: string) {
    setValue((current) => ({ ...current, contact: { ...current.contact, [field]: nextValue } }))
  }

  async function submitFormValue() {
    if (submitLockRef.current || result?.kind === 'ok') {
      return
    }

    setResult(undefined)
    setCopied(false)

    if (readback.kind !== 'available') {
      return
    }

    const validation = validatePublicInquiryFormInput(value)
    if (validation.kind === 'invalid') {
      setErrors(validation.errors)
      focusFirstPublicInquiryError(validation.errors)
      return
    }

    setErrors([])
    submitLockRef.current = true
    setPending(true)
    let releaseSubmitLock = true
    try {
      const submitted = await submitInquiry({
        data: {
          target: readback.target,
          body: validation.input.body,
          contact: validation.input.contact,
          ...(origin === undefined ? {} : { inquiryOrigin: origin.submitOrigin }),
        },
      })

      setResult(submitted)
      if (submitted.kind === 'ok') {
        releaseSubmitLock = false
        setValue(emptyInquiryFormInput)
        toast.success('Inquiry sent for owner review.')
      } else {
        const serverField = publicInquiryFormField(submitted.field)
        if (serverField !== undefined) {
          const nextErrors = [{ field: serverField, message: submitted.reason }]
          setErrors(nextErrors)
          focusFirstPublicInquiryError(nextErrors)
        }
        toast.error('reason' in submitted ? submitted.reason : 'Inquiry could not be sent.')
      }
    } finally {
      if (releaseSubmitLock) {
        submitLockRef.current = false
      }
      setPending(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitFormValue()
  }

  async function copyReceipt(receiptResult: Extract<PublicInquirySubmitServerResult, { kind: 'ok' }>) {
    if (readback.kind !== 'available') {
      return
    }
    const copy = inquiryReceiptText({
      result: receiptResult,
      businessName: readback.businessName,
      serviceName: readback.serviceName,
    })

    try {
      await navigator.clipboard.writeText(copy)
      setCopied(true)
      toast.success('Receipt copied.')
    } catch {
      toast.error('Receipt could not be copied.')
    }
  }

  const bodyError = errorByField.get('body')
  const emailError = errorByField.get('email')
  const phoneError = errorByField.get('phone')
  const submittedOk = result?.kind === 'ok'

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow={readback.businessName}
        title={`Tell ${readback.businessName} about the job.`}
        description="What you need, where, and when. It reaches them in writing."
      />
      <form onSubmit={handleSubmit} noValidate className="mx-auto grid w-full max-w-3xl gap-6 px-4 pb-16 md:px-6">
        {result !== undefined && result.kind === 'ok' ? (
          <VStack gap={6} className="mx-auto w-full max-w-2xl">
            <QualifiedInquiryReceipt
              result={result}
              businessName={readback.businessName}
              serviceName={readback.serviceName}
              serviceHref={`/${readback.slug}`}
              copied={copied}
              onCopy={() => void copyReceipt(result)}
              {...(origin === undefined ? {} : { answerHref: origin.backHref })}
            />
            <InquiryProofSpineCard result={result} businessName={readback.businessName} />
          </VStack>
        ) : null}

        {submittedOk ? null : (
          <div className="mx-auto grid w-full max-w-[35rem] gap-6">
            {result === undefined ? null : <AeActionResultCard result={result} />}
            {origin === undefined ? null : (
              <Card padding={4} className="grid gap-2" role="note" aria-label="Answer context">
                <Text type="supporting" color="secondary" weight="medium" display="block">From your answer</Text>
                <Text color="primary" display="block">
                  This inquiry continues {readback.businessName} from your answer thread. Review the details, then describe the job for owner review.
                </Text>
                <div>
                  <Button label="Back to answer" variant="secondary" size="sm" href={origin.backHref} />
                </div>
              </Card>
            )}
            <Card padding={5} className="grid gap-4">
              <div className="grid gap-1.5">
                <Text type="large" weight="semibold" color="primary" display="block">{readback.serviceName} inquiry</Text>
                <Text color="secondary" display="block">Tell the business what you need them to review.</Text>
              </div>
              <FormLayout>
                <TextInput
                  label="Name"
                  description="Optional, but helpful for the business reply."
                  htmlName="name"
                  value={value.contact.name ?? ''}
                  isDisabled={!hydrated || pending}
                  onChange={(nextValue) => updateContact('name', nextValue)}
                />
                <TextInput
                  label="Contact details for the business reply"
                  description="Email is kept private and is not shown on public pages."
                  htmlName="email"
                  type="email"
                  value={value.contact.email ?? ''}
                  isDisabled={!hydrated || pending}
                  {...(emailError === undefined ? {} : { status: { type: 'error' as const, message: emailError } })}
                  onChange={(nextValue) => updateContact('email', nextValue)}
                />
                <TextInput
                  label="Phone"
                  description="Use this instead of email if a phone reply is better."
                  htmlName="phone"
                  type={'tel' as 'text'}
                  value={value.contact.phone ?? ''}
                  isDisabled={!hydrated || pending}
                  {...(phoneError === undefined ? {} : { status: { type: 'error' as const, message: phoneError } })}
                  onChange={(nextValue) => updateContact('phone', nextValue)}
                />
                <AeInquiryComposer
                  label="Tell them about the job"
                  description={`${value.body.length}/${readback.maxBodyLength} characters. Include what you need, where, when, and anything the business should know before replying.`}
                  value={value.body}
                  maxLength={readback.maxBodyLength}
                  invalid={bodyError !== undefined}
                  {...(bodyError === undefined ? {} : { errorMessage: bodyError })}
                  disabled={!hydrated || pending}
                  pending={pending}
                  onChange={(nextBody) => setValue((current) => ({ ...current, body: nextBody }))}
                />
              </FormLayout>
            </Card>
            <p className="text-sm leading-6 text-secondary">
              AE sends this for owner review. The business can reply with timing, quote, and whether they can take the work. AE does not book, charge, or confirm.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <AeActionButton type="button" state={pending ? 'loading' : 'idle'} leadingIcon={<SendIcon />} disabled={!hydrated || pending} onClick={() => void submitFormValue()}>
                Send inquiry
              </AeActionButton>
              <Button label={origin === undefined ? 'Back to service page' : 'Back to answer'} variant="secondary" href={origin?.backHref ?? `/${readback.slug}`} />
            </div>
          </div>
        )}
      </form>
    </AePublicShell>
  )
}

type SubmittedInquiryResult = Extract<PublicInquirySubmitServerResult, { kind: 'ok' }>

function QualifiedInquiryReceipt({
  result,
  businessName,
  serviceName,
  serviceHref,
  answerHref,
  copied,
  onCopy,
}: {
  result: SubmittedInquiryResult
  businessName: string
  serviceName: string
  serviceHref: string
  answerHref?: string
  copied: boolean
  onCopy: () => void
}) {
  const receiptId = result.receipt.threadId
  const delivery = deliveryLabel(result.receipt.notificationStatus)
  const receiptKicker = 'Your inquiry receipt'
  const recordHref = customerRecordHref(result.receipt.threadId, result.receipt.accessKey)

  return (
    <Card
      padding={6}
      role="status"
      aria-labelledby="inquiry-receipt-title"
      className="w-full min-h-[34rem] rounded-md border border-border bg-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-300"
    >
      <VStack gap={5}>
        <Grid columns={{ minWidth: 220, repeat: 'fit' }} gap={3} align="start" className="border-b border-border pb-5">
          <VStack gap={1}>
            <Text type="supporting" color="secondary" weight="semibold" display="block" className="font-mono uppercase tracking-widest">
              {receiptKicker}
            </Text>
            <Text type="supporting" color="primary" display="block" hasTabularNumbers className="break-all font-mono text-accent">
              <span className="sr-only">Receipt ID </span>
              {receiptId}
            </Text>
          </VStack>
          <img src="/brand/logo/ae-seal.svg" alt="" aria-hidden="true" className="h-10 w-10 justify-self-start sm:justify-self-end" />
        </Grid>

        <VStack gap={4}>
          <Text id="inquiry-receipt-title" as="h2" type="display-1" weight="semibold" color="primary" display="block" className="max-w-sm text-balance tracking-tight">
            {businessName}
          </Text>
          <Badge variant="neutral" label={serviceName} />
        </VStack>

        <ReceiptSection title="What AE sent">
          One clear inquiry for {serviceName} with the message and reply details you supplied.
        </ReceiptSection>

        <Text as="p" type="body" color="primary" display="block" className="rounded-md border border-accent bg-surface p-4">
          AE has not booked, charged, or confirmed.
        </Text>

        <ReceiptSection title="What happens next">
          The business can reply with timing, quote, or whether they can take the work.
        </ReceiptSection>

        <VStack gap={2} className="border-t border-border pt-5">
          <Text as="h3" type="body" color="secondary" weight="semibold" display="block">
            Receipt details
          </Text>
          <Text type="supporting" color="primary" display="block" className="font-mono text-accent">
            inquiry sent · for owner review
          </Text>
          <Text type="supporting" color="secondary" display="block" className="font-mono">
            receipt issued · {delivery}
          </Text>
          <Text as="p" type="supporting" color="secondary" display="block">
            Message saved for {businessName}. Delivery state: {delivery}.
          </Text>
        </VStack>

        <ReceiptSection title="Your record">
          Your ask is on its way in writing. Keep the live record link to see the business reply when it arrives.
        </ReceiptSection>

        <HStack gap={2} wrap="wrap" aria-label="Receipt actions">
          <Button label="View your record" variant="primary" href={recordHref} />
          <Button label={copied ? 'Receipt copied' : 'Copy receipt'} variant="secondary" onClick={onCopy} />
        </HStack>
      </VStack>
    </Card>
  )
}

const PROOF_SPINE_STEP_DELAYS = ['', 'motion-safe:delay-100', 'motion-safe:delay-150', 'motion-safe:delay-200'] as const

function InquiryProofSpineCard({ result, businessName }: { result: SubmittedInquiryResult; businessName: string }) {
  const delivery = deliveryLabel(result.receipt.notificationStatus)
  const steps = [
    {
      title: 'Page open',
      stamp: 'business page live',
      note: 'The business page was open when this inquiry was written.',
      reached: true,
    },
    {
      title: 'Send path checked',
      stamp: 'inquiry path open',
      note: 'AE checked the send path before sending.',
      reached: true,
    },
    {
      title: 'Inquiry sent',
      stamp: 'receipt issued',
      note: `One clear inquiry sent to ${businessName} for owner review.`,
      reached: true,
    },
    {
      title: 'Business can reply',
      stamp: delivery,
      note: result.receipt.status === 'replied' || result.receipt.status === 'closed'
        ? 'The business reply is saved on your record.'
        : 'The business can reply with timing, quote, or whether they can take the work.',
      reached: result.receipt.status === 'replied' || result.receipt.status === 'closed',
    },
  ] satisfies Array<{ title: string; stamp: string; note: string; reached: boolean }>

  return (
    <Card
      padding={5}
      aria-labelledby="inquiry-proof-spine"
      className="w-full motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 motion-safe:delay-150"
    >
      <VStack gap={3}>
        <Text id="inquiry-proof-spine" type="large" weight="semibold" color="primary" display="block">
          What happens next
        </Text>
        <ol className="grid gap-0" aria-label="Inquiry next steps">
          {steps.map((step, index) => {
            const hasNext = index < steps.length - 1
            const nextReached = steps[index + 1]?.reached === true

            return (
              <li
                key={step.title}
                className={`grid grid-cols-[1rem_minmax(0,1fr)] gap-3 pb-4 last:pb-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 ${PROOF_SPINE_STEP_DELAYS[index] ?? ''}`}
              >
                <span className="relative mt-1 flex justify-center" aria-hidden="true">
                  <span className={`size-3 rounded-full border ${step.reached ? 'border-accent bg-accent' : 'border-border bg-surface'}`} />
                  {hasNext ? <span className={`absolute top-3 h-[calc(100%+1rem)] w-px ${step.reached && nextReached ? 'bg-accent' : 'bg-border'}`} /> : null}
                </span>
                <span className="grid gap-1">
                  <Text type="supporting" weight="medium" color="primary" display="block">
                    {step.title}
                  </Text>
                  <span className="font-mono text-xs tabular-nums text-secondary">
                    {step.stamp}
                  </span>
                  <Text type="supporting" color="secondary" display="block">
                    {step.note}
                  </Text>
                </span>
              </li>
            )
          })}
        </ol>
      </VStack>
    </Card>
  )
}

function ReceiptSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <VStack gap={2} className="border-t border-border pt-5">
      <Text as="h3" type="body" color="secondary" weight="semibold" display="block">
        {title}
      </Text>
      <Text as="p" type="large" color="primary" display="block" className="max-w-xl text-balance tracking-tight">
        {children}
      </Text>
    </VStack>
  )
}

function inquiryReceiptText({
  result,
  businessName,
  serviceName,
}: {
  result: SubmittedInquiryResult
  businessName: string
  serviceName: string
}) {
  const delivery = deliveryLabel(result.receipt.notificationStatus)
  return [
    `Receipt ${result.receipt.threadId}`,
    `Business: ${businessName}`,
    `Service: ${serviceName}`,
    `What AE sent: One bounded inquiry with the message and reply details supplied.`,
    `What happens next: The business replies with timing, quote, or availability. AE records the handoff.`,
    `Source note: business supplied · inquiry path published`,
    `Record: ${customerRecordHref(result.receipt.threadId, result.receipt.accessKey)}`,
    `Delivery state: ${delivery}`,
    `Boundary: AE has not booked, charged, or confirmed.`,
  ].join('\n')
}

function customerRecordHref(threadId: string, accessKey: string): string {
  return `/i/${encodeURIComponent(threadId)}?k=${encodeURIComponent(accessKey)}`
}

function deliveryLabel(status: SubmittedInquiryResult['receipt']['notificationStatus']): string {
  switch (status) {
    case 'queued':
      return 'queued for owner delivery'
    case 'sent':
      return 'delivery recorded'
    case 'failed':
      return 'delivery needs review'
    case 'held':
      return 'delivery awaiting review'
    default:
      return 'awaiting owner review'
  }
}

function inquiryOrigin(search: PublicInquirySearch): { backHref: string; submitOrigin: InquiryOriginRef } | undefined {
  if (search.from !== 'thread' || search.id === undefined) {
    return undefined
  }
  return {
    backHref: `/t/${encodeURIComponent(search.id)}`,
    submitOrigin: {
      kind: 'answer_thread',
      threadId: search.id,
    },
  }
}

function focusFirstPublicInquiryError(errors: readonly PublicInquiryValidationError[]) {
  const first = errors.at(0)
  if (first === undefined) {
    return
  }

  window.setTimeout(() => {
    document.querySelector<HTMLElement>(`[name="${first.field}"]`)?.focus()
  }, 0)
}

function publicInquiryFormField(value: string | undefined): PublicInquiryFormField | undefined {
  return value === 'body' || value === 'email' || value === 'phone' ? value : undefined
}

function UnavailableInquiry({ readback }: { readback: Extract<PublicInquiryRouteReadback, { kind: 'unavailable' }> }) {
  return (
    <AePublicShell>
      <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
        <AeEmptyState
          title="Inquiry not open yet"
          description={readback.reason}
          action={<Button label="Back to service page" variant="primary" href={`/${readback.slug}`} />}
        />
      </section>
    </AePublicShell>
  )
}

function submittedReceiptToResult(receipt: PublicInquirySubmittedReceipt): PublicInquirySubmitServerResult {
  return {
    kind: 'ok',
    code: 'inquiry_submitted',
    receipt: {
      threadId: receipt.threadId,
      businessId: '',
      serviceId: '',
      status: receipt.status,
      version: 0,
      notificationId: '',
      notificationStatus: receipt.notificationStatus,
      accessKey: receipt.accessKey,
    },
  }
}
