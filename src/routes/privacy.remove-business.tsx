import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { CopyXIcon, FileWarningIcon, StoreIcon } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, getFieldAccessibility } from '@/components/ui/field'
import { AeSelectField } from '@/components/ae/forms/AeSelectField'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { openRemovalDisputeThroughSource } from '@/modules/security/removal-dispute.functions'

const removalSchema = z.object({
  slug: z.string(),
  contactEmail: z.string(),
  reasonCode: z.enum(['privacy_removal_requested', 'ownership_contested', 'duplicate_or_impersonation', 'unsafe_or_inaccurate']),
  evidenceSummary: z.string(),
})

type RemovalInput = z.infer<typeof removalSchema>

const openRemovalServer = createServerFn({ method: 'POST' })
  .validator((data) => removalSchema.parse(data))
  .handler(async ({ data, context }) => openRemovalDisputeThroughSource(data, context))

export const Route = createFileRoute('/privacy/remove-business')({
  head: () => ({
    meta: [
      { title: 'Request removal or correction | Agentic Economy' },
      { name: 'description', content: 'Request removal or correction for an Agentic Economy public service page.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: RemoveBusinessRoute,
})

const removalReasonOptions = [
  { value: 'privacy_removal_requested', label: 'Remove page' },
  { value: 'ownership_contested', label: 'Ownership issue' },
  { value: 'duplicate_or_impersonation', label: 'Duplicate or impersonation' },
  { value: 'unsafe_or_inaccurate', label: 'Incorrect details' },
] as const

const correctionPaths = [
  {
    icon: FileWarningIcon,
    label: 'Details',
    title: 'Fix page facts',
    body: 'Wrong service, place, hours, or public wording.',
  },
  {
    icon: StoreIcon,
    label: 'Owner',
    title: 'Sort ownership',
    body: 'The page is yours, contested, or needs the right owner.',
  },
  {
    icon: CopyXIcon,
    label: 'Remove',
    title: 'Remove or merge',
    body: 'Duplicate, impersonation, or page should come down.',
  },
] as const

function RemoveBusinessRoute() {
  const openRemoval = useServerFn(openRemovalServer)
  const [hydrated, setHydrated] = useState(false)
  const [value, setValue] = useState<RemovalInput>({
    slug: '',
    contactEmail: '',
    reasonCode: 'privacy_removal_requested',
    evidenceSummary: '',
  })
  const [error, setError] = useState<string | undefined>()
  const [receipt, setReceipt] = useState<string | undefined>()
  const [pending, setPending] = useState(false)
  const contactInvalid = error?.includes('contact') === true
  const evidenceInvalid = error?.includes('Evidence') === true
  const slugField = getFieldAccessibility({ id: 'slug', hasDescription: true })
  const contactEmailField = getFieldAccessibility({ id: 'contactEmail', invalid: contactInvalid, hasDescription: true, hasError: contactInvalid })
  const evidenceSummaryField = getFieldAccessibility({
    id: 'evidenceSummary',
    invalid: evidenceInvalid,
    hasDescription: true,
    hasError: evidenceInvalid,
  })

  useEffect(() => {
    setHydrated(true)
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setReceipt(undefined)

    if (value.contactEmail.trim().length === 0) {
      setError('A contact email is required.')
      focusField('contactEmail')
      return
    }

    if (value.evidenceSummary.trim().length === 0) {
      setError('Evidence summary is required.')
      focusField('evidenceSummary')
      return
    }

    setPending(true)
    try {
      const result = await openRemoval({ data: value })
      if (result.kind === 'ok') {
        const message = `Request ${result.receipt.status}. Reference ${result.receipt.disputeId}.`
        setReceipt(message)
        toast.success('Request recorded', { description: message })
        return
      }

      setError(result.reason)
      toast.error(result.reason)
    } finally {
      setPending(false)
    }
  }

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Corrections"
        title="Fix a business page"
        description="Send the page slug, your email, and what should change."
      />
      <main className="ae-public-page mx-auto grid w-full max-w-5xl gap-10 px-4 pb-16 md:px-6">
        <section className="grid gap-4 md:grid-cols-3">
          {correctionPaths.map(({ icon: Icon, label, title, body }) => (
            <Card key={title} className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="size-4 text-[var(--ae-amber)]" aria-hidden="true" /> {title}
                  </CardTitle>
                  <Badge variant="outline">{label}</Badge>
                </div>
                <CardDescription>{body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>

        <form onSubmit={handleSubmit} className="mx-auto grid w-full max-w-3xl gap-6" noValidate>
          {error === undefined ? null : (
            <Alert variant="destructive">
              <AlertTitle>Request needs attention</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {receipt === undefined ? null : (
            <Alert>
              <AlertTitle>Request recorded</AlertTitle>
              <AlertDescription>{receipt}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <Field {...slugField.fieldProps}>
              <FieldLabel htmlFor={slugField.controlProps.id}>Page slug</FieldLabel>
              <Input
                {...slugField.controlProps}
                name="slug"
                value={value.slug}
                disabled={!hydrated || pending}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value
                  setValue((current) => ({ ...current, slug: nextValue }))
                }}
              />
              <FieldDescription {...slugField.descriptionProps}>Shown in the page URL.</FieldDescription>
            </Field>
            <Field {...contactEmailField.fieldProps}>
              <FieldLabel htmlFor={contactEmailField.controlProps.id}>Your email</FieldLabel>
              <Input
                {...contactEmailField.controlProps}
                name="contactEmail"
                type="email"
                value={value.contactEmail}
                disabled={!hydrated || pending}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value
                  setValue((current) => ({ ...current, contactEmail: nextValue }))
                }}
              />
              <FieldDescription {...contactEmailField.descriptionProps}>Used only to follow up.</FieldDescription>
              {contactInvalid ? <FieldError id={contactEmailField.errorProps.id}>{error}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="reasonCode">Reason</FieldLabel>
              <AeSelectField
                id="reasonCode"
                name="reasonCode"
                value={value.reasonCode}
                options={removalReasonOptions}
                disabled={!hydrated || pending}
                onValueChange={(nextValue) => {
                  setValue((current) => ({ ...current, reasonCode: toRemovalReason(nextValue) }))
                }}
              />
            </Field>
            <Field {...evidenceSummaryField.fieldProps}>
              <FieldLabel htmlFor={evidenceSummaryField.controlProps.id}>What should change?</FieldLabel>
              <Textarea
                {...evidenceSummaryField.controlProps}
                name="evidenceSummary"
                value={value.evidenceSummary}
                disabled={!hydrated || pending}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value
                  setValue((current) => ({ ...current, evidenceSummary: nextValue }))
                }}
              />
              <FieldDescription {...evidenceSummaryField.descriptionProps}>A short note is enough.</FieldDescription>
              {evidenceInvalid ? <FieldError id={evidenceSummaryField.errorProps.id}>{error}</FieldError> : null}
            </Field>
          </FieldGroup>
          <Button type="submit" disabled={pending || !hydrated}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Send request
          </Button>
        </form>
      </main>
    </AePublicShell>
  )
}

function focusField(name: keyof Pick<RemovalInput, 'contactEmail' | 'evidenceSummary'>) {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[name="${name}"]`)?.focus()
  })
}

function toRemovalReason(value: string): RemovalInput['reasonCode'] {
  if (value === 'ownership_contested' || value === 'duplicate_or_impersonation' || value === 'unsafe_or_inaccurate') {
    return value
  }

  return 'privacy_removal_requested'
}
