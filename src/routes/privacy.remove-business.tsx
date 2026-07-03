import { useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { CopyXIcon, FileWarningIcon, StoreIcon } from 'lucide-react'
import { Banner } from '@astryxdesign/core/Banner'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Field } from '@astryxdesign/core/Field'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Text } from '@astryxdesign/core/Text'
import { toast } from '@/lib/ui/toast'
import { z } from 'zod'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeSelectField } from '@/components/ae/forms/AeSelectField'
import { openRemovalDisputeThroughSource } from '@/modules/security/removal-dispute.functions'
import { useClientMounted } from '@/hooks/use-client-mounted'

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setReceipt(undefined)

    const nextValue = readRemovalInput(event.currentTarget, value)
    setValue(nextValue)

    if (nextValue.contactEmail.trim().length === 0) {
      setError('A contact email is required.')
      focusField('contactEmail')
      return
    }

    if (nextValue.evidenceSummary.trim().length === 0) {
      setError('Evidence summary is required.')
      focusField('evidenceSummary')
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
        eyebrow="Corrections"
        title="Corrections"
        description="Send the page slug, your email, and what should change."
      />
      <main className="mx-auto grid w-full max-w-5xl gap-10 px-4 pb-16 md:px-6">
        <section className="grid gap-4 md:grid-cols-3">
          {correctionPaths.map(({ icon: Icon, label, title, body }) => (
            <Card key={title} padding={5} className="grid h-full gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <Text type="large" weight="semibold" color="primary" className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" aria-hidden="true" /> {title}
                </Text>
                <Badge variant="neutral" label={label} />
              </div>
              <Text color="secondary" display="block">{body}</Text>
            </Card>
          ))}
        </section>

        {!hydrated ? (
          <div className="mx-auto w-full max-w-3xl text-sm text-secondary" aria-live="polite">Preparing correction form.</div>
        ) : (
        <form onSubmit={handleSubmit} className="mx-auto grid w-full max-w-3xl gap-6" noValidate>
          {error === undefined ? null : (
            <Banner status="error" title="Request needs attention" description={error} />
          )}
          {receipt === undefined ? null : (
            <Banner status="success" title="Request recorded" description={receipt} />
          )}
          <FormLayout>
            <Field label="Page slug" inputID="slug" description="Shown in the page URL.">
              <input
                id="slug"
                name="slug"
                value={value.slug}
                disabled={pending}
                className="min-h-11 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-primary outline-none transition focus:border-primary disabled:opacity-50"
                onChange={(event) => {
                  const nextValue = event.currentTarget.value
                  setValue((current) => ({ ...current, slug: nextValue }))
                }}
              />
            </Field>
            <Field
              label="Your email"
              inputID="contactEmail"
              description="Used only to follow up."
              {...(contactInvalid ? { status: { type: 'error' as const, message: error ?? '' } } : {})}
            >
              <input
                id="contactEmail"
                name="contactEmail"
                type="email"
                value={value.contactEmail}
                disabled={pending}
                className="min-h-11 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-primary outline-none transition focus:border-primary disabled:opacity-50"
                onChange={(event) => {
                  const nextValue = event.currentTarget.value
                  setValue((current) => ({ ...current, contactEmail: nextValue }))
                }}
              />
            </Field>
            <Field label="Reason" inputID="reasonCode">
              <AeSelectField
                id="reasonCode"
                name="reasonCode"
                value={value.reasonCode}
                options={removalReasonOptions}
                disabled={pending}
                onValueChange={(nextValue) => {
                  setValue((current) => ({ ...current, reasonCode: toRemovalReason(nextValue) }))
                }}
              />
            </Field>
            <Field
              label="What should change?"
              inputID="evidenceSummary"
              description="A short note is enough."
              {...(evidenceInvalid ? { status: { type: 'error' as const, message: error ?? '' } } : {})}
            >
              <textarea
                id="evidenceSummary"
                name="evidenceSummary"
                value={value.evidenceSummary}
                disabled={pending}
                className="min-h-28 w-full resize-y rounded-md border border-border bg-card px-3 py-2 text-sm text-primary outline-none transition focus:border-primary disabled:opacity-50"
                onChange={(event) => {
                  const nextValue = event.currentTarget.value
                  setValue((current) => ({ ...current, evidenceSummary: nextValue }))
                }}
              />
            </Field>
          </FormLayout>
          <Button label="Send request" type="submit" variant="primary" isDisabled={pending} isLoading={pending} />
        </form>
        )}
      </main>
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
