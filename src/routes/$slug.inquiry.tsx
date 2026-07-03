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
  type PublicInquiryRouteReadback,
  type PublicInquirySubmittedReceipt,
  type PublicInquiryValidationError,
} from '@/modules/inquiries/route-readbacks'

const emptyInquiryFormInput = {
  body: '',
  contact: {
    name: '',
    email: '',
    phone: '',
  },
} satisfies PublicInquiryFormInput

const submitInquiryServer = submitPublicInquiryServer

export const Route = createFileRoute('/$slug/inquiry')({
  loader: async ({ params }) => {
    const page = await readPublicBusinessPageServer({ data: { slug: params.slug } })
    return readPublicInquiryRouteReadback({ slug: params.slug, page })
  },
  head: () => ({
    meta: [
      { title: 'Send job details | Agentic Economy' },
      { name: 'description', content: 'Send job details to a published service.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: PublicInquiryRoute,
})

export { readPublicInquiryRouteReadback, validatePublicInquiryFormInput }

function PublicInquiryRoute() {
  const readback = Route.useLoaderData()
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
        },
      })

      setResult(submitted)
      if (submitted.kind === 'ok') {
        setValue(emptyInquiryFormInput)
        toast.success('Inquiry sent to the business.')
      } else {
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
        title="Send the job details"
        description="Share the work, location, timing, and the best way for the business to reply."
      />
      <form onSubmit={handleSubmit} noValidate className="mx-auto grid w-full max-w-3xl gap-6 px-4 pb-16 md:px-6">
        {result === undefined ? null : (
          <AeActionResultCard
            result={result}
            businessName={readback.businessName}
            serviceName={readback.serviceName}
          />
        )}

        <Card padding={5} className="grid gap-4">
          <div className="grid gap-1.5">
            <Text type="large" weight="semibold" color="primary" display="block">{readback.serviceName} handoff</Text>
            <Text color="secondary" display="block">Write the message the business should receive.</Text>
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
              label="Describe the job"
              description={`${value.body.length}/${readback.maxBodyLength} characters. Include suburb, timing, and anything the business should know.`}
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
          AE sends this message to the business. The business replies with timing, quote, and availability.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <AeActionButton type="button" state={pending ? 'loading' : 'idle'} leadingIcon={<SendIcon />} disabled={!hydrated || pending} onClick={() => void submitFormValue()}>
            Send job details
          </AeActionButton>
          <Button label="Back to service page" variant="secondary" href={`/${readback.slug}`} />
        </div>
      </form>
    </AePublicShell>
  )
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
