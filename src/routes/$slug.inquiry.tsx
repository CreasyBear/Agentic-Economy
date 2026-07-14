import { useRef, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeInquiryComposer } from '@/components/ae/inquiries/AeInquiryComposer'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { useClientMounted } from '@/hooks/use-client-mounted'
import { encodePrivateRecordFragment } from '@/lib/observability/private-route-safety'
import { encodeGovernedAction } from '@/modules/governed-action/public'
import { readPublicBusinessPageServer } from '@/modules/catalog/owner-claim.functions'
import {
  readPublicTargetAdmissionServer,
  submitPublicInquiryServer,
  type PublicInquirySubmitServerResult,
} from '@/modules/inquiries/inquiry.functions'
import {
  GOVERNED_SEND_CANONICAL_FIELDS,
  buildGovernedSendIntent,
} from '@/modules/inquiries/internal/governed-send'
import {
  readPublicInquiryRouteReadback,
  selectPublicInquiryTarget,
  validatePublicInquiryFormInput,
  type PublicInquiryFormInput,
  type PublicInquiryRouteReadback,
  type PublicInquiryValidationError,
} from '@/modules/inquiries/route-readbacks'
import type { InquiryOriginRef } from '@/modules/inquiries/public'

const emptyInquiryFormInput = {
  body: '',
  contact: { name: '', email: '', phone: '' },
} satisfies PublicInquiryFormInput

const submitInquiryServer = submitPublicInquiryServer

type PublicInquirySearch = { from?: 'thread'; id?: string }

export const Route = createFileRoute('/$slug/inquiry')({
  validateSearch: (search: Record<string, unknown>): PublicInquirySearch => {
    const from = search.from === 'thread' ? search.from : undefined
    const id = typeof search.id === 'string' && search.id.trim().length > 0 ? search.id.trim() : undefined
    return { ...(from === undefined ? {} : { from }), ...(id === undefined ? {} : { id }) }
  },
  loader: async ({ params }) => {
    const page = await readPublicBusinessPageServer({ data: { slug: params.slug } })
    if (page.kind !== 'available') return readPublicInquiryRouteReadback({ slug: params.slug, page })
    const target = selectPublicInquiryTarget(page.catalog)
    const admissionResult = target === undefined ? undefined : await readPublicTargetAdmissionServer({ data: target })
    return readPublicInquiryRouteReadback({
      slug: params.slug,
      page,
      ...(admissionResult?.kind === 'ok' ? { admission: admissionResult.admission } : {}),
    })
  },
  head: () => ({
    meta: [
      { title: 'Confirm what will be sent | Agentic Economy' },
      { name: 'description', content: 'Review every detail before sending one request.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: PublicInquiryRoute,
})

export { readPublicInquiryRouteReadback, validatePublicInquiryFormInput }

export function GovernedSendReviewRows({ values }: { values: Readonly<Record<string, string | null>> }) {
  return (
    <dl className="divide-y divide-border rounded-md border border-border">
      {GOVERNED_SEND_CANONICAL_FIELDS.map(({ key, label }) => (
        <div key={key} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
          <dt><Text type="supporting" color="secondary" weight="semibold" display="block">{label}</Text></dt>
          <dd><Text type="body" color="primary" display="block" className="break-words whitespace-pre-wrap">{values[key] ?? 'Not shared'}</Text></dd>
        </div>
      ))}
    </dl>
  )
}
function PublicInquiryRoute() {
  const readback = Route.useLoaderData()
  const search = Route.useSearch()
  const submitInquiry = useServerFn(submitInquiryServer)
  const hydrated = useClientMounted()
  const [value, setValue] = useState<PublicInquiryFormInput>(emptyInquiryFormInput)
  const [errors, setErrors] = useState<readonly PublicInquiryValidationError[]>([])
  const [result, setResult] = useState<PublicInquirySubmitServerResult>()
  const [pending, setPending] = useState(false)
  const submitLockRef = useRef(false)
  const operationKeyRef = useRef(`inquiry-review:${crypto.randomUUID()}`)
  const errorByField = new Map(errors.map((error) => [error.field, error.message]))
  const origin = inquiryOrigin(search)

  if (readback.kind === 'unavailable') return <UnavailableInquiry readback={readback} />
  const availableReadback = readback

  const reviewValidation = validatePublicInquiryFormInput(value)
  const reviewInput = reviewValidation.kind === 'valid'
    ? reviewValidation.input
    : {
        body: value.body,
        contact: {
          ...((value.contact.name ?? '').trim().length === 0 ? {} : { name: value.contact.name }),
          ...((value.contact.email ?? '').trim().length === 0 ? {} : { email: value.contact.email }),
          ...((value.contact.phone ?? '').trim().length === 0 ? {} : { phone: value.contact.phone }),
        },
      }
  const canonicalValues = buildGovernedSendIntent({
    target: availableReadback.target,
    body: reviewInput.body,
    contact: reviewInput.contact,
    ...(origin === undefined ? {} : { origin: origin.submitOrigin }),
  }).payload

  function updateContact(field: keyof PublicInquiryFormInput['contact'], nextValue: string) {
    setValue((current) => ({ ...current, contact: { ...current.contact, [field]: nextValue } }))
  }

  async function submitFormValue() {
    if (submitLockRef.current) return
    const validation = validatePublicInquiryFormInput(value)
    if (validation.kind === 'invalid') {
      setErrors(validation.errors)
      focusFirstPublicInquiryError(validation.errors)
      return
    }

    const reviewedIntent = buildGovernedSendIntent({
      target: availableReadback.target,
      body: validation.input.body,
      contact: validation.input.contact,
      ...(origin === undefined ? {} : { origin: origin.submitOrigin }),
    })
    const encoding = encodeGovernedAction(reviewedIntent)
    if (encoding.kind !== 'encoded') {
      setResult({ kind: 'error', code: encoding.code, retryable: false, reason: 'This review could not be prepared. Check the details and try again.' })
      return
    }

    setErrors([])
    setResult(undefined)
    submitLockRef.current = true
    setPending(true)
    try {
      const submitted = await submitInquiry({
        data: {
          target: availableReadback.target,
          body: validation.input.body,
          contact: validation.input.contact,
          expectedDigest: encoding.digest,
          operationKey: operationKeyRef.current,
          ...(origin === undefined ? {} : { inquiryOrigin: origin.submitOrigin }),
        },
      })
      setResult(submitted)
      if (submitted.kind === 'ok') {
        const fragment = encodePrivateRecordFragment(submitted.receipt.accessKey)
        const href = `/t/${encodeURIComponent(submitted.receipt.threadId)}${fragment}`
        window.location.replace(href)
        return
      }

      if (submitted.field === 'body' || submitted.field === 'email' || submitted.field === 'phone') {
        const nextErrors: readonly PublicInquiryValidationError[] = [{ field: submitted.field, message: submitted.reason }]
        setErrors(nextErrors)
        focusFirstPublicInquiryError(nextErrors)
      }
      submitLockRef.current = false
      setPending(false)
    } catch {
      setResult({ kind: 'error', code: 'source_unavailable', retryable: true, reason: 'Your request could not be sent right now. Try again.' })
      submitLockRef.current = false
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
  const noDeliverableChannel = (value.contact.email ?? '').trim().length === 0 && (value.contact.phone ?? '').trim().length === 0

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow={readback.businessName}
        title="Confirm what will be sent"
        description="Review every detail below. Nothing is sent until you choose the action."
      />
      <form onSubmit={handleSubmit} noValidate className="mx-auto grid w-full max-w-3xl gap-12 px-4 pb-16 md:px-6">
        <section className="grid gap-6" aria-labelledby="request-details-heading">
          <Text id="request-details-heading" as="h2" type="large" weight="semibold" color="primary" display="block">Your request</Text>
          <Card padding={5} className="grid gap-4">
            <FormLayout>
              <TextInput label="Name" description="Optional." htmlName="name" value={value.contact.name ?? ''} isDisabled={!hydrated || pending} onChange={(nextValue) => updateContact('name', nextValue)} />
              <TextInput label="Email" description="Shared only for this business reply." htmlName="email" type="email" value={value.contact.email ?? ''} isDisabled={!hydrated || pending} {...(emailError === undefined ? {} : { status: { type: 'error' as const, message: emailError } })} onChange={(nextValue) => updateContact('email', nextValue)} />
              <TextInput label="Phone" description="Shared only when entered." htmlName="phone" type={'tel' as 'text'} value={value.contact.phone ?? ''} isDisabled={!hydrated || pending} {...(phoneError === undefined ? {} : { status: { type: 'error' as const, message: phoneError } })} onChange={(nextValue) => updateContact('phone', nextValue)} />
              <AeInquiryComposer label="What do you need?" description={`${value.body.length}/${readback.maxBodyLength} characters. Include where, when, and useful constraints.`} value={value.body} maxLength={readback.maxBodyLength} invalid={bodyError !== undefined} {...(bodyError === undefined ? {} : { errorMessage: bodyError })} disabled={!hydrated || pending} pending={pending} onChange={(body) => setValue((current) => ({ ...current, body }))} />
            </FormLayout>
          </Card>
        </section>

        <section className="grid gap-6" aria-labelledby="exact-review-heading">
          <div className="grid gap-2">
            <Text id="exact-review-heading" as="h2" type="large" weight="semibold" color="primary" display="block">Review what will be sent</Text>
            <Text color="secondary" display="block">These rows are the complete submitted snapshot, in order.</Text>
          </div>
          <GovernedSendReviewRows values={canonicalValues} />
        </section>

        <section className="grid gap-4" aria-labelledby="send-limits-heading">
          <Text id="send-limits-heading" as="h2" type="large" weight="semibold" color="primary" display="block">Limits</Text>
          <dl className="grid gap-3 rounded-md border border-border p-4">
            <div className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)]"><dt>Send limit</dt><dd>Once</dd></div>
            <div className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)]"><dt>Recipient</dt><dd>{readback.businessName} only</dd></div>
          </dl>
        </section>

        {result?.kind === 'error' ? <Card padding={4} className="grid gap-2" role="alert"><Text weight="semibold" color="primary" display="block">Not sent</Text><Text color="secondary" display="block">{result.reason}</Text></Card> : null}

        <section className="grid gap-4" aria-labelledby="send-consequence-heading" aria-busy={pending}>
          <Text id="send-consequence-heading" as="h2" type="large" weight="semibold" color="primary" display="block">Before you send</Text>
          <Text as="p" color="primary" display="block">This is exactly what will be sent. It can't change after you approve it.</Text>
          <Text as="p" color="primary" display="block">This sends your request once to {readback.businessName}.</Text>
          <Text as="p" color="secondary" display="block">Price is confirmed by {readback.businessName} in their reply.</Text>
          {noDeliverableChannel ? <Text as="p" color="secondary" display="block">If you close this page without saving your link, you may not be able to see the reply.</Text> : null}
          {pending ? (
            <Card padding={4} className="grid gap-2" aria-busy="true">
              <Badge variant="neutral" label="Sending your request" />
              <Text color="primary" display="block">Creating a written handoff record.</Text>
              <Text color="secondary" display="block">Do not close or send again.</Text>
            </Card>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button label="Don't send" variant="secondary" href={origin?.backHref ?? `/${readback.slug}`} isDisabled={pending} />
            <Button label={pending ? `Sending to ${readback.businessName}…` : `Send request to ${readback.businessName}`} variant="primary" type="submit" isDisabled={!hydrated || pending} aria-busy={pending} />
          </div>
        </section>
      </form>
    </AePublicShell>
  )
}

function inquiryOrigin(search: PublicInquirySearch): { backHref: string; submitOrigin: InquiryOriginRef } | undefined {
  if (search.from !== 'thread' || search.id === undefined) return undefined
  return { backHref: `/t/${encodeURIComponent(search.id)}`, submitOrigin: { kind: 'answer_thread', threadId: search.id } }
}

function focusFirstPublicInquiryError(errors: readonly PublicInquiryValidationError[]) {
  const field = errors[0]?.field
  if (field === undefined || typeof document === 'undefined') return
  document.querySelector<HTMLElement>(`[name="${field}"]`)?.focus()
}


function UnavailableInquiry({ readback }: { readback: Extract<PublicInquiryRouteReadback, { kind: 'unavailable' }> }) {
  return (
    <AePublicShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-16 md:px-6">
        <AeEmptyState
          title="Not sent"
          description="This request is not available to send right now."
          action={<Button label="Back to business page" variant="secondary" href={`/${readback.slug}`} />}
        />
      </main>
    </AePublicShell>
  )
}
