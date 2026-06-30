import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { SendIcon } from 'lucide-react'

import { AeActionResultCard } from '@/components/ae/feedback/AeActionResultCard'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { readPublicBusinessPageServer } from '@/modules/catalog/owner-claim.functions'
import {
  submitPublicInquiryServer,
  type PublicInquirySubmitServerResult,
} from '@/modules/inquiries/inquiry.functions'
import {
  readPublicInquiryRouteReadback,
  validatePublicInquiryFormInput,
  type PublicInquiryFormField,
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
      { title: 'Send inquiry | Agentic Economy' },
      { name: 'description', content: 'Send a human inquiry for a published service.' },
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
  const [hydrated, setHydrated] = useState(false)
  const [value, setValue] = useState<PublicInquiryFormInput>(emptyInquiryFormInput)
  const [errors, setErrors] = useState<readonly PublicInquiryValidationError[]>([])
  const [result, setResult] = useState<PublicInquirySubmitServerResult | undefined>(initialResult)
  const [pending, setPending] = useState(false)
  const errorByField = new Map(errors.map((error) => [error.field, error.message]))

  useEffect(() => {
    setHydrated(true)
  }, [])

  if (readback.kind === 'unavailable') {
    return <UnavailableInquiry readback={readback} />
  }

  function updateContact(field: keyof PublicInquiryFormInput['contact'], nextValue: string) {
    setValue((current) => ({ ...current, contact: { ...current.contact, [field]: nextValue } }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(undefined)

    if (readback.kind !== 'available') {
      return
    }

    const validation = validatePublicInquiryFormInput(value)
    if (validation.kind === 'invalid') {
      setErrors(validation.errors)
      focusFirstError(validation.errors)
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
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow={readback.businessName}
        title="Send a human inquiry to the owner"
        description="This sends a first-contact message for owner review. It does not create a booking, payment, or automated action."
      />
      <form onSubmit={handleSubmit} noValidate className="ae-public-page mx-auto grid w-full max-w-3xl gap-6 px-4 pb-16 md:px-6">
        {result === undefined ? null : (
          <AeActionResultCard
            result={result}
            businessName={readback.businessName}
            serviceName={readback.serviceName}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle>{readback.serviceName}</CardTitle>
            <CardDescription>{readback.disclosure}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  value={value.contact.name}
                  disabled={!hydrated || pending}
                  onChange={(event) => updateContact('name', event.currentTarget.value)}
                />
                <FieldDescription>Optional, but helpful for the owner reply.</FieldDescription>
              </Field>
              <Field data-invalid={errorByField.has('email') ? true : undefined}>
                <FieldLabel htmlFor="email">Contact details for the owner reply</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={value.contact.email}
                  aria-invalid={errorByField.has('email') || undefined}
                  disabled={!hydrated || pending}
                  onChange={(event) => updateContact('email', event.currentTarget.value)}
                />
                <FieldDescription>Email is kept private and is not shown on public pages.</FieldDescription>
                {fieldError('email', errorByField)}
              </Field>
              <Field data-invalid={errorByField.has('phone') ? true : undefined}>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  value={value.contact.phone}
                  aria-invalid={errorByField.has('phone') || undefined}
                  disabled={!hydrated || pending}
                  onChange={(event) => updateContact('phone', event.currentTarget.value)}
                />
                <FieldDescription>Use this instead of email if a phone reply is better.</FieldDescription>
                {fieldError('phone', errorByField)}
              </Field>
              <Field data-invalid={errorByField.has('body') ? true : undefined}>
                <FieldLabel htmlFor="body">What do you need help with?</FieldLabel>
                <Textarea
                  id="body"
                  name="body"
                  value={value.body}
                  maxLength={readback.maxBodyLength}
                  aria-invalid={errorByField.has('body') || undefined}
                  disabled={!hydrated || pending}
                  onChange={(event) => {
                    const nextBody = event.currentTarget.value
                    setValue((current) => ({ ...current, body: nextBody }))
                  }}
                />
                <FieldDescription>{value.body.length}/{readback.maxBodyLength} characters.</FieldDescription>
                {fieldError('body', errorByField)}
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!hydrated || pending}>
            {pending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
            Submit inquiry
          </Button>
          <Button asChild variant="outline">
            <a href={`/${readback.slug}`}>Back to service page</a>
          </Button>
        </div>
      </form>
    </AePublicShell>
  )
}

function UnavailableInquiry({ readback }: { readback: Extract<PublicInquiryRouteReadback, { kind: 'unavailable' }> }) {
  return (
    <AePublicShell>
      <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
        <AeEmptyState
          title="Inquiry unavailable"
          description={readback.reason}
          action={
            <Button asChild>
              <a href={`/${readback.slug}`}>Back to service page</a>
            </Button>
          }
        />
      </section>
    </AePublicShell>
  )
}

function fieldError(field: PublicInquiryFormField, errorByField: ReadonlyMap<PublicInquiryFormField, string>) {
  const error = errorByField.get(field)
  return error === undefined ? null : <FieldError>{error}</FieldError>
}

function focusFirstError(errors: readonly PublicInquiryValidationError[]) {
  const first = errors.at(0)
  if (first === undefined) {
    return
  }

  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[name="${first.field}"]`)?.focus()
  })
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
