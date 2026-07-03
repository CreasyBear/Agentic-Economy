import { useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { SendIcon } from 'lucide-react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { FormLayout } from '@astryxdesign/core/FormLayout'
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
      { title: 'Send inquiry details | Agentic Economy' },
      { name: 'description', content: 'Send first-contact inquiry details to a published service.' },
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
  const errorByField = new Map(errors.map((error) => [error.field, error.message]))
  const origin = inquiryOrigin(search)

  if (readback.kind === 'unavailable') {
    return <UnavailableInquiry readback={readback} />
  }

  function updateContact(field: keyof PublicInquiryFormInput['contact'], nextValue: string) {
    setValue((current) => ({ ...current, contact: { ...current.contact, [field]: nextValue } }))
  }

  async function submitFormValue() {
    setResult(undefined)

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
    setPending(true)
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
      setPending(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitFormValue()
  }

  const bodyError = errorByField.get('body')
  const emailError = errorByField.get('email')
  const phoneError = errorByField.get('phone')

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow={readback.businessName}
        title="Send inquiry details"
        description="Share the work, location, timing, and how the business should reply."
      />
      <form onSubmit={handleSubmit} noValidate className="mx-auto grid w-full max-w-3xl gap-6 px-4 pb-16 md:px-6">
        {result === undefined ? null : (
          <AeActionResultCard
            result={result}
            businessName={readback.businessName}
            serviceName={readback.serviceName}
            {...(origin === undefined ? {} : { answerHref: origin.backHref })}
          />
        )}
        {origin === undefined ? null : (
          <Card padding={4} className="grid gap-2" role="note" aria-label="Answer context">
            <Text type="supporting" color="secondary" weight="medium" display="block">From your answer</Text>
            <Text color="primary" display="block">
              This inquiry continues the business from your answer thread. Review the details, then describe the job for owner review.
            </Text>
            <div>
              <Button label="Back to answer" variant="secondary" size="sm" href={origin.backHref} />
            </div>
          </Card>
        )}

        <Card padding={5} className="grid gap-4">
          <div className="grid gap-1.5">
            <Text type="large" weight="semibold" color="primary" display="block">{readback.serviceName} inquiry</Text>
            <Text color="secondary" display="block">Write the message the business should review.</Text>
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
              label="Describe the inquiry"
              description={`${value.body.length}/${readback.maxBodyLength} characters. Include suburb, timing, and anything the business should know before replying.`}
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
          AE sends a qualified inquiry for owner review. The business replies with timing, quote, and availability; AE does not confirm them.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <AeActionButton type="button" state={pending ? 'loading' : 'idle'} leadingIcon={<SendIcon />} disabled={!hydrated || pending} onClick={() => void submitFormValue()}>
            Send inquiry
          </AeActionButton>
          <Button label={origin === undefined ? 'Back to service page' : 'Back to answer'} variant="secondary" href={origin?.backHref ?? `/${readback.slug}`} />
        </div>
      </form>
    </AePublicShell>
  )
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

  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[name="${first.field}"]`)?.focus()
  })
}

function publicInquiryFormField(value: string | undefined): PublicInquiryFormField | undefined {
  return value === 'body' || value === 'email' || value === 'phone' ? value : undefined
}

function UnavailableInquiry({ readback }: { readback: Extract<PublicInquiryRouteReadback, { kind: 'unavailable' }> }) {
  return (
    <AePublicShell>
      <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
        <AeEmptyState
          title="Handoff not open yet"
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
    },
  }
}
