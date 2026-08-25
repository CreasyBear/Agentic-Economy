import { useRef, useState, type FormEvent, type RefObject } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { CopyXIcon, FileWarningIcon, StoreIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/lib/ui/toast'
import { z } from 'zod'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { openRemovalDisputeThroughSource } from '@/modules/security/removal-dispute.functions'
import { useClientMounted } from '@/hooks/use-client-mounted'

const removalSchema = z.object({
  slug: z.string(),
  contactEmail: z.email(),
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
      { title: 'Supplier correction or removal | Agentic Economy' },
      { name: 'description', content: 'Request a correction or removal for an Agentic Economy supplier profile or published Operation.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: RemoveBusinessRoute,
})

const removalReasonOptions = [
  { value: 'privacy_removal_requested', label: 'Remove supplier profile' },
  { value: 'ownership_contested', label: 'Supplier ownership issue' },
  { value: 'duplicate_or_impersonation', label: 'Duplicate or impersonation' },
  { value: 'unsafe_or_inaccurate', label: 'Incorrect Operation or supplier facts' },
] as const

const correctionPaths = [
  {
    icon: FileWarningIcon,
    label: 'Details',
    title: 'Fix published facts',
    body: 'Wrong Operation, price, readiness, access, or supplier information.',
  },
  {
    icon: StoreIcon,
    label: 'Owner',
    title: 'Resolve supplier ownership',
    body: 'The profile is yours, contested, or attached to the wrong supplier.',
  },
  {
    icon: CopyXIcon,
    label: 'Remove',
    title: 'Remove or merge',
    body: 'Duplicate, impersonation, or a supplier profile that should come down.',
  },
] as const

function RemoveBusinessRoute() {
  const openRemoval = useServerFn(openRemovalServer)
  const hydrated = useClientMounted()
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
  const contactEmailRef = useRef<HTMLInputElement>(null)
  const evidenceSummaryRef = useRef<HTMLTextAreaElement>(null)
  const slugDescriptionId = 'slug-description'
  const contactDescriptionId = 'contactEmail-description'
  const contactErrorId = 'contactEmail-error'
  const evidenceDescriptionId = 'evidenceSummary-description'
  const evidenceErrorId = 'evidenceSummary-error'
  const contactDescribedBy = contactInvalid ? `${contactDescriptionId} ${contactErrorId}` : contactDescriptionId
  const evidenceDescribedBy = evidenceInvalid ? `${evidenceDescriptionId} ${evidenceErrorId}` : evidenceDescriptionId

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setReceipt(undefined)

    const nextValue = readRemovalInput(event.currentTarget, value)
    setValue(nextValue)

    if (nextValue.contactEmail.trim().length === 0) {
      setError('A contact email is required.')
      focusField(contactEmailRef)
      return
    }

    if (!z.email().safeParse(nextValue.contactEmail.trim()).success) {
      setError('Enter a valid contact email.')
      focusField(contactEmailRef)
      return
    }

    if (nextValue.evidenceSummary.trim().length === 0) {
      setError('Evidence summary is required.')
      focusField(evidenceSummaryRef)
      return
    }

    setPending(true)
    try {
      const result = await openRemoval({ data: nextValue })
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
        eyebrow="Privacy"
        title="Supplier corrections"
        description="Send the supplier slug, your email, and the exact Operation or profile fact that should change."
      />
      <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 pb-16 md:px-6">
        <section className="grid gap-4 md:grid-cols-3">
          {correctionPaths.map(({ icon: Icon, label, title, body }) => (
            <Card key={title} className="grid h-full gap-1.5 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Icon className="size-4 text-foreground" aria-hidden="true" /> {title}
                </p>
                <Badge variant="secondary">{label}</Badge>
              </div>
              <p className="block text-muted-foreground">{body}</p>
            </Card>
          ))}
        </section>

        {!hydrated ? (
          <div className="mx-auto w-full max-w-3xl text-sm text-muted-foreground" aria-live="polite">Preparing correction form.</div>
        ) : (
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
            <Field>
              <FieldLabel htmlFor="slug">Supplier slug</FieldLabel>
              <Input
                id="slug"
                name="slug"
                value={value.slug}
                disabled={pending}
                aria-describedby={slugDescriptionId}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value
                  setValue((current) => ({ ...current, slug: nextValue }))
                }}
              />
              <FieldDescription id={slugDescriptionId}>Shown in the supplier profile URL.</FieldDescription>
            </Field>
            <Field {...(contactInvalid ? { 'data-invalid': true } : {})}>
              <FieldLabel htmlFor="contactEmail">Your email</FieldLabel>
              <Input
                id="contactEmail"
                name="contactEmail"
                type="email"
                aria-describedby={contactDescribedBy}
                aria-invalid={contactInvalid}
                ref={contactEmailRef}
                value={value.contactEmail}
                disabled={pending}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value
                  setValue((current) => ({ ...current, contactEmail: nextValue }))
                }}
              />
              <FieldDescription id={contactDescriptionId}>Used only to follow up.</FieldDescription>
              {contactInvalid ? (
                <FieldError id={contactErrorId}>{error ?? ''}</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="reasonCode">Reason</FieldLabel>
              <input type="hidden" name="reasonCode" value={value.reasonCode} />
              <Select
                value={value.reasonCode}
                disabled={pending}
                onValueChange={(nextValue) => {
                  setValue((current) => ({ ...current, reasonCode: toRemovalReason(nextValue) }))
                }}
              >
                <SelectTrigger id="reasonCode" className="min-h-11 w-full">
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {removalReasonOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field {...(evidenceInvalid ? { 'data-invalid': true } : {})}>
              <FieldLabel htmlFor="evidenceSummary">What should change?</FieldLabel>
              <Textarea
                id="evidenceSummary"
                name="evidenceSummary"
                aria-describedby={evidenceDescribedBy}
                aria-invalid={evidenceInvalid}
                ref={evidenceSummaryRef}
                value={value.evidenceSummary}
                disabled={pending}
                className="min-h-28 resize-y"
                onChange={(event) => {
                  const nextValue = event.currentTarget.value
                  setValue((current) => ({ ...current, evidenceSummary: nextValue }))
                }}
              />
              <FieldDescription id={evidenceDescriptionId}>A short note is enough.</FieldDescription>
              {evidenceInvalid ? (
                <FieldError id={evidenceErrorId}>{error ?? ''}</FieldError>
              ) : null}
            </Field>
          </FieldGroup>
          <Button type="submit" disabled={pending} className="justify-self-start">
            {pending ? <Spinner /> : null}
            Send request
          </Button>
        </form>
        )}
      </div>
    </AePublicShell>
  )
}

function readRemovalInput(form: HTMLFormElement, fallback: RemovalInput): RemovalInput {
  const data = new FormData(form)
  const read = (field: keyof Pick<RemovalInput, 'slug' | 'contactEmail' | 'evidenceSummary'>) => {
    const value = data.get(field)
    return typeof value === 'string' ? value : ''
  }
  const reasonCodeValue = data.get('reasonCode')

  return {
    slug: read('slug'),
    contactEmail: read('contactEmail'),
    reasonCode: toRemovalReason(typeof reasonCodeValue === 'string' ? reasonCodeValue : fallback.reasonCode),
    evidenceSummary: read('evidenceSummary'),
  }
}

function focusField(ref: RefObject<HTMLElement | null>) {
  window.setTimeout(() => {
    ref.current?.focus()
  }, 0)
}

function toRemovalReason(value: string): RemovalInput['reasonCode'] {
  if (value === 'ownership_contested' || value === 'duplicate_or_impersonation' || value === 'unsafe_or_inaccurate') {
    return value
  }

  return 'privacy_removal_requested'
}
