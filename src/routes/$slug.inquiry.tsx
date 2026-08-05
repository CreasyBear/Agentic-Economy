import { useRef, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from '@/components/ui/empty'

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
  readPublicInquiryRouteReadback,
  selectPublicInquiryTarget,
  validatePublicInquiryFormInput,
  type PublicInquiryFormInput,
  type PublicInquiryRouteReadback,
  type PublicInquiryValidationError,
} from '@/modules/inquiries/route-readbacks'
import {
  GOVERNED_SEND_CANONICAL_FIELDS,
  buildGovernedSendIntent,
  type InquiryOriginRef,
} from '@/modules/inquiries/public'

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

export function GovernedSendReviewRows({ values }: { values: Readonly<Record<string, string | null>> }) {
  return (
    <dl className="divide-y divide-border rounded-md border border-border">
      {GOVERNED_SEND_CANONICAL_FIELDS.map(({ key, label }) => (
        <div key={key} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
          <dt><span className="block text-sm font-semibold text-muted-foreground">{label}</span></dt>
          <dd><span className="block break-words whitespace-pre-wrap text-foreground">{values[key] ?? 'Not shared'}</span></dd>
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
      <div className="mx-auto grid w-full max-w-3xl gap-12 px-4 pb-16 md:px-6">
        <section className="grid gap-6" aria-labelledby="request-details-heading">
          <h2 id="request-details-heading" className="text-lg font-semibold text-foreground">Your request</h2>
          <Card className="grid gap-4 p-5">
            <form onSubmit={handleSubmit} noValidate className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="inquiry-name">Name</Label>
                <p id="inquiry-name-description" className="text-sm text-muted-foreground">Optional.</p>
                <Input id="inquiry-name" name="name" value={value.contact.name ?? ''} disabled={!hydrated || pending} aria-describedby="inquiry-name-description" onChange={(event) => updateContact('name', event.currentTarget.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inquiry-email">Email</Label>
                <p id="inquiry-email-description" className="text-sm text-muted-foreground">Shared only for this business reply.</p>
                <Input id="inquiry-email" name="email" type="email" value={value.contact.email ?? ''} disabled={!hydrated || pending} aria-describedby={emailError === undefined ? 'inquiry-email-description' : 'inquiry-email-description inquiry-email-error'} aria-invalid={emailError !== undefined} onChange={(event) => updateContact('email', event.currentTarget.value)} />
                {emailError === undefined ? null : <p id="inquiry-email-error" role="alert" className="text-sm text-destructive">{emailError}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inquiry-phone">Phone</Label>
                <p id="inquiry-phone-description" className="text-sm text-muted-foreground">Shared only when entered.</p>
                <Input id="inquiry-phone" name="phone" type="tel" value={value.contact.phone ?? ''} disabled={!hydrated || pending} aria-describedby={phoneError === undefined ? 'inquiry-phone-description' : 'inquiry-phone-description inquiry-phone-error'} aria-invalid={phoneError !== undefined} onChange={(event) => updateContact('phone', event.currentTarget.value)} />
                {phoneError === undefined ? null : <p id="inquiry-phone-error" role="alert" className="text-sm text-destructive">{phoneError}</p>}
              </div>
            </form>
            <AeInquiryComposer label="What do you need?" description={`${value.body.length}/${readback.maxBodyLength} characters. Include where, when, and useful constraints.`} value={value.body} maxLength={readback.maxBodyLength} invalid={bodyError !== undefined} {...(bodyError === undefined ? {} : { errorMessage: bodyError })} disabled={!hydrated || pending} pending={pending} onChange={(body) => setValue((current) => ({ ...current, body }))} onSubmit={() => void submitFormValue()} />
          </Card>
        </section>

        <form onSubmit={handleSubmit} noValidate className="contents">
          <section className="grid gap-6" aria-labelledby="exact-review-heading">
            <div className="grid gap-2">
              <h2 id="exact-review-heading" className="text-lg font-semibold text-foreground">Review what will be sent</h2>
              <p className="text-muted-foreground">These rows are the complete submitted snapshot, in order.</p>
            </div>
            <GovernedSendReviewRows values={canonicalValues} />
          </section>

          <section className="grid gap-4" aria-labelledby="send-limits-heading">
            <h2 id="send-limits-heading" className="text-lg font-semibold text-foreground">Limits</h2>
            <dl className="grid gap-3 rounded-md border border-border p-4">
              <div className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)]"><dt>Send limit</dt><dd>Once</dd></div>
              <div className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)]"><dt>Recipient</dt><dd>{readback.businessName} only</dd></div>
            </dl>
          </section>

          {result?.kind === 'error' ? <Card className="grid gap-2 border-destructive/50 p-4" role="alert"><p className="font-semibold text-foreground">Not sent</p><p className="text-muted-foreground">{result.reason}</p></Card> : null}

          <section className="grid gap-4" aria-labelledby="send-consequence-heading" aria-busy={pending}>
            <h2 id="send-consequence-heading" className="text-lg font-semibold text-foreground">Before you send</h2>
            <p className="text-foreground">This is exactly what will be sent. It can't change after you approve it.</p>
            <p className="text-foreground">This sends your request once to {readback.businessName}.</p>
            <p className="text-muted-foreground">Price is confirmed by {readback.businessName} in their reply.</p>
            {noDeliverableChannel ? <p className="text-muted-foreground">If you close this page without saving your link, you may not be able to see the reply.</p> : null}
            {pending ? (
              <Card className="grid gap-2 p-4" aria-busy="true">
                <Badge variant="outline">Sending your request</Badge>
                <p className="text-foreground">Creating a written handoff record.</p>
                <p className="text-muted-foreground">Do not close or send again.</p>
              </Card>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button asChild variant="secondary" disabled={pending}><a href={origin?.backHref ?? `/${readback.slug}`}>Don't send</a></Button>
              <Button variant="default" type="submit" disabled={!hydrated || pending} aria-busy={pending}>{pending ? `Sending to ${readback.businessName}…` : `Send request to ${readback.businessName}`}</Button>
            </div>
          </section>
        </form>
      </div>
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
      <div className="mx-auto w-full max-w-3xl px-4 py-16 md:px-6">
        <Empty className="border border-border bg-card p-5">
          <EmptyHeader>
            <h1 className="text-lg font-medium tracking-tight">Not sent</h1>
            <EmptyDescription>This request is not available to send right now.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="secondary">
              <a href={`/${readback.slug}`}>Back to business page</a>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    </AePublicShell>
  )
}
