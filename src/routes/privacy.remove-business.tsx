import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { toast } from 'sonner'
import { z } from 'zod'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
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
  { value: 'privacy_removal_requested', label: 'Remove this public page' },
  { value: 'ownership_contested', label: 'Ownership is contested' },
  { value: 'duplicate_or_impersonation', label: 'Duplicate or impersonation concern' },
  { value: 'unsafe_or_inaccurate', label: 'Unsafe or inaccurate public facts' },
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
        eyebrow="Privacy and correction"
        title="Request removal or correction"
        description="Use this safety valve when a public service page should be removed, corrected, or reviewed for ownership."
      />
      <form onSubmit={handleSubmit} className="ae-public-page mx-auto grid w-full max-w-3xl gap-6 px-4 pb-16 md:px-6" noValidate>
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
            <FieldLabel htmlFor="slug">Public page slug</FieldLabel>
            <Input
              id="slug"
              name="slug"
              value={value.slug}
              disabled={!hydrated || pending}
              onChange={(event) => {
                const nextValue = event.currentTarget.value
                setValue((current) => ({ ...current, slug: nextValue }))
              }}
            />
            <FieldDescription>Use the slug from the page URL.</FieldDescription>
          </Field>
          <Field data-invalid={error?.includes('contact') ? true : undefined}>
            <FieldLabel htmlFor="contactEmail">Contact email</FieldLabel>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              value={value.contactEmail}
              aria-invalid={error?.includes('contact') || undefined}
              disabled={!hydrated || pending}
              onChange={(event) => {
                const nextValue = event.currentTarget.value
                setValue((current) => ({ ...current, contactEmail: nextValue }))
              }}
            />
            <FieldDescription>Stored behind private evidence; not shown on public pages.</FieldDescription>
            {error?.includes('contact') ? <FieldError>{error}</FieldError> : null}
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
          <Field data-invalid={error?.includes('Evidence') ? true : undefined}>
            <FieldLabel htmlFor="evidenceSummary">Evidence summary</FieldLabel>
            <Textarea
              id="evidenceSummary"
              name="evidenceSummary"
              value={value.evidenceSummary}
              aria-invalid={error?.includes('Evidence') || undefined}
              disabled={!hydrated || pending}
              onChange={(event) => {
                const nextValue = event.currentTarget.value
                setValue((current) => ({ ...current, evidenceSummary: nextValue }))
              }}
            />
            <FieldDescription>Summarize the correction or removal evidence. Do not include secrets.</FieldDescription>
            {error?.includes('Evidence') ? <FieldError>{error}</FieldError> : null}
          </Field>
        </FieldGroup>
        <Button type="submit" disabled={pending || !hydrated}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Submit request
        </Button>
      </form>
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
