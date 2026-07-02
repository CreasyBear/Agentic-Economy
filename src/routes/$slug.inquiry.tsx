import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { SendIcon } from 'lucide-react'
import { toast } from 'sonner'

import { AeActionResultCard } from '@/components/ae/feedback/AeActionResultCard'
import { AeInquiryComposer } from '@/components/ae/inquiries/AeInquiryComposer'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, getFieldAccessibility } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
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
        toast.success('Inquiry sent to the business.')
      } else {
        toast.error('reason' in submitted ? submitted.reason : 'Inquiry could not be sent.')
      }
    } finally {
      setPending(false)
    }
  }

  const bodyError = errorByField.get('body')
  const nameField = getFieldAccessibility({ id: 'name', hasDescription: true })
  const emailInvalid = errorByField.has('email')
  const emailField = getFieldAccessibility({ id: 'email', invalid: emailInvalid, hasDescription: true, hasError: emailInvalid })
  const phoneInvalid = errorByField.has('phone')
  const phoneField = getFieldAccessibility({ id: 'phone', invalid: phoneInvalid, hasDescription: true, hasError: phoneInvalid })

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow={readback.businessName}
        title="Send the job details"
        description="Share the work, location, timing, and the best way for the business to reply."
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
            <CardTitle>{readback.serviceName} handoff</CardTitle>
            <CardDescription>Write the message the business should receive.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field {...nameField.fieldProps}>
                <FieldLabel htmlFor={nameField.controlProps.id}>Name</FieldLabel>
                <Input
                  {...nameField.controlProps}
                  name="name"
                  autoComplete="name"
                  value={value.contact.name}
                  disabled={!hydrated || pending}
                  onChange={(event) => updateContact('name', event.currentTarget.value)}
                />
                <FieldDescription {...nameField.descriptionProps}>Optional, but helpful for the business reply.</FieldDescription>
              </Field>
              <Field {...emailField.fieldProps}>
                <FieldLabel htmlFor={emailField.controlProps.id}>Contact details for the business reply</FieldLabel>
                <Input
                  {...emailField.controlProps}
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={value.contact.email}
                  disabled={!hydrated || pending}
                  onChange={(event) => updateContact('email', event.currentTarget.value)}
                />
                <FieldDescription {...emailField.descriptionProps}>Email is kept private and is not shown on public pages.</FieldDescription>
                {fieldError('email', errorByField, emailField.errorProps.id)}
              </Field>
              <Field {...phoneField.fieldProps}>
                <FieldLabel htmlFor={phoneField.controlProps.id}>Phone</FieldLabel>
                <Input
                  {...phoneField.controlProps}
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  value={value.contact.phone}
                  disabled={!hydrated || pending}
                  onChange={(event) => updateContact('phone', event.currentTarget.value)}
                />
                <FieldDescription {...phoneField.descriptionProps}>Use this instead of email if a phone reply is better.</FieldDescription>
                {fieldError('phone', errorByField, phoneField.errorProps.id)}
              </Field>
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
            </FieldGroup>
          </CardContent>
        </Card>
        <p className="text-sm leading-6 text-muted-foreground">
          AE sends this message to the business. The business replies with timing, quote, and availability.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!hydrated || pending}>
            {pending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
            Send job details
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
          title="Handoff not open yet"
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

function fieldError(field: PublicInquiryFormField, errorByField: ReadonlyMap<PublicInquiryFormField, string>, errorId?: string) {
  const error = errorByField.get(field)
  return error === undefined ? null : <FieldError id={errorId}>{error}</FieldError>
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
