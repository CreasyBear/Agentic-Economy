import { useEffect, useReducer, useState, type FormEvent } from 'react'
import { Outlet, createFileRoute, useLocation, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ArrowRightIcon } from 'lucide-react'
import { Banner } from '@astryxdesign/core/Banner'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Field } from '@astryxdesign/core/Field'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Text } from '@astryxdesign/core/Text'
import { AeClaimFormSection } from '@/components/ae/forms/AeClaimFormSection'
import { AeCheckboxField } from '@/components/ae/forms/AeCheckboxField'
import { AeFileUploadField } from '@/components/ae/forms/AeFileUploadField'
import { AeRadioCardGroup } from '@/components/ae/forms/AeRadioCardGroup'
import { AeRangeField } from '@/components/ae/forms/AeRangeField'
import { AeReviewBlock } from '@/components/ae/forms/AeReviewBlock'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeActionButton } from '@/components/ae/motion/AeActionButton'
import { submitOwnerClaimServer } from '@/modules/catalog/owner-claim.functions'
import {
  emptyPublicOwnerClaimInput,
  initialClaimDraftState,
  reduceClaimDraft,
  snapshotClaimDraft,
  type ClaimDraftSnapshot,
  type TextClaimField,
} from '@/modules/catalog/claim-draft'
import { importStorefrontDraftServer } from '@/modules/storefront/storefront.functions'
import { validatePublicOwnerClaimFlowInput } from '@/modules/catalog/public'
import type { PublicOwnerClaimField, PublicOwnerClaimFlowInput, PublicOwnerClaimValidationError } from '@/modules/catalog/public'
import type { StorefrontImportDraft } from '@/modules/storefront/public'
import { useClientMounted } from '@/hooks/use-client-mounted'

type FieldConfig = {
  field: TextClaimField
  label: string
  description: string
  control: 'input' | 'tel' | 'textarea'
}

const textClaimFields = [
  'businessName',
  'category',
  'suburb',
  'stateTerritory',
  'requestedSlug',
  'publishedPhone',
  'ownerMessage',
  'sourceLabel',
  'serviceName',
  'serviceCategory',
  'serviceSummary',
  'serviceArea',
  'hoursOrUnknown',
  'photoUrl',
  'responseTimeMinutes',
  'publicDisclosure',
  'noContactReason',
] as const satisfies readonly TextClaimField[]

const claimFields = [...textClaimFields, 'firstRequestMode'] as const satisfies readonly PublicOwnerClaimField[]
const claimFieldSet = new Set<PublicOwnerClaimField>(claimFields)

const CLAIM_DRAFT_STORAGE_KEY = 'ae.claimFormDraft.v1'

function readStoredClaimDraft(): ClaimDraftSnapshot | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const raw = window.sessionStorage.getItem(CLAIM_DRAFT_STORAGE_KEY)
  if (raw === null) {
    return undefined
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ClaimDraftSnapshot>
    return {
      value: normalizeStoredClaimInput(parsed.value),
      factsConfirmed: parsed.factsConfirmed === true,
      dirtyFields: normalizeStoredDirtyFields(parsed.dirtyFields),
    }
  } catch {
    window.sessionStorage.removeItem(CLAIM_DRAFT_STORAGE_KEY)
    return undefined
  }
}

function writeStoredClaimDraft(snapshot: ClaimDraftSnapshot) {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(CLAIM_DRAFT_STORAGE_KEY, JSON.stringify(snapshot))
}

function clearStoredClaimDraft() {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.removeItem(CLAIM_DRAFT_STORAGE_KEY)
}

function normalizeStoredClaimInput(value: unknown): PublicOwnerClaimFlowInput {
  const source = typeof value === 'object' && value !== null ? value as Partial<Record<PublicOwnerClaimField, unknown>> : {}
  const normalized: PublicOwnerClaimFlowInput = { ...emptyPublicOwnerClaimInput }

  for (const field of textClaimFields) {
    const storedValue = source[field]
    normalized[field] = typeof storedValue === 'string' ? storedValue : ''
  }

  const storedFirstRequestMode = source.firstRequestMode
  normalized.firstRequestMode = typeof storedFirstRequestMode === 'string'
    ? toFirstRequestMode(storedFirstRequestMode)
    : emptyPublicOwnerClaimInput.firstRequestMode

  return normalized
}

function normalizeStoredDirtyFields(value: unknown): readonly PublicOwnerClaimField[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((field): field is PublicOwnerClaimField => claimFieldSet.has(field as PublicOwnerClaimField))
}

function readClaimInputWithStateFallback(
  form: HTMLFormElement,
  fallback: PublicOwnerClaimFlowInput,
  dirtyFields: ReadonlySet<PublicOwnerClaimField>,
): PublicOwnerClaimFlowInput {
  const formValue = readClaimInput(form, fallback)
  const next = { ...formValue }

  for (const field of textClaimFields) {
    const fallbackValue = fallback[field]
    if (dirtyFields.has(field) && formValue[field].trim().length === 0 && fallbackValue.trim().length > 0) {
      next[field] = fallbackValue
    }
  }

  if (dirtyFields.has('firstRequestMode') && formValue.firstRequestMode === emptyPublicOwnerClaimInput.firstRequestMode) {
    next.firstRequestMode = fallback.firstRequestMode
  }

  return next
}

function readClaimInput(form: HTMLFormElement, fallback: PublicOwnerClaimFlowInput): PublicOwnerClaimFlowInput {
  const data = new FormData(form)
  const read = (field: TextClaimField) => {
    const control = form.elements.namedItem(field)
    if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement
    ) {
      return control.value
    }

    const value = data.get(field)
    return typeof value === 'string' ? value : fallback[field] ?? ''
  }
  const firstRequestModeValue = data.get('firstRequestMode')

  return {
    businessName: read('businessName'),
    category: read('category'),
    suburb: read('suburb'),
    stateTerritory: read('stateTerritory'),
    requestedSlug: read('requestedSlug'),
    publishedPhone: read('publishedPhone'),
    ownerMessage: read('ownerMessage'),
    sourceLabel: read('sourceLabel'),
    serviceName: read('serviceName'),
    serviceCategory: read('serviceCategory'),
    serviceSummary: read('serviceSummary'),
    serviceArea: read('serviceArea'),
    hoursOrUnknown: read('hoursOrUnknown'),
    photoUrl: read('photoUrl'),
    responseTimeMinutes: read('responseTimeMinutes'),
    firstRequestMode: toFirstRequestMode(typeof firstRequestModeValue === 'string' ? firstRequestModeValue : fallback.firstRequestMode),
    publicDisclosure: read('publicDisclosure'),
    noContactReason: read('noContactReason'),
  }
}

const submitClaimServer = submitOwnerClaimServer
const importDraftServer = importStorefrontDraftServer

const identityFields = [
  {
    field: 'businessName',
    label: 'Business name',
    description: 'Use the public name customers already know.',
    control: 'input',
  },
  {
    field: 'category',
    label: 'Business category',
    description: 'Example: Emergency plumbing.',
    control: 'input',
  },
  {
    field: 'suburb',
    label: 'Suburb',
    description: 'The primary local suburb.',
    control: 'input',
  },
  {
    field: 'stateTerritory',
    label: 'State or territory',
    description: 'Use the short Australian state label.',
    control: 'input',
  },
  {
    field: 'requestedSlug',
    label: 'Public page slug',
    description: 'Lowercase words separated by hyphens.',
    control: 'input',
  },
  {
    field: 'publishedPhone',
    label: 'Public phone (optional)',
    description: 'Published only when you enter it here. Use an Australian phone number.',
    control: 'tel',
  },
  {
    field: 'sourceLabel',
    label: 'Detail note',
    description: 'Describe where these public details came from.',
    control: 'input',
  },
] as const satisfies readonly FieldConfig[]

const serviceFields = [
  {
    field: 'serviceName',
    label: 'Service name',
    description: 'Name one service customers need to understand.',
    control: 'input',
  },
  {
    field: 'serviceCategory',
    label: 'Service category',
    description: 'Keep this close to the business category.',
    control: 'input',
  },
  {
    field: 'serviceSummary',
    label: 'Service summary',
    description: 'One clear public sentence about the service.',
    control: 'textarea',
  },
  {
    field: 'serviceArea',
    label: 'Service area',
    description: 'Name the suburbs or local area covered.',
    control: 'input',
  },
  {
    field: 'hoursOrUnknown',
    label: 'Hours (or say if not sure)',
    description: 'Use owner-supplied hours or say if you are not sure.',
    control: 'input',
  },
  {
    field: 'photoUrl',
    label: 'Photo URL (optional)',
    description: 'Link to one real work, vehicle, or team photo you can publish.',
    control: 'input',
  },
] as const satisfies readonly FieldConfig[]

const firstRequestModeOptions = [
  {
    value: 'not_available_yet',
    label: 'First request not available yet',
    description: 'Use this when customers should view details but contact another way.',
  },
  {
    value: 'inquiry_available',
    label: 'Qualified inquiry is available',
    description: 'AE may send a first-contact message for owner review.',
  },
  {
    value: 'quote_request_available',
    label: 'Quote request instructions supplied',
    description: 'Show public instructions and keep price and timing with the business.',
  },
] as const

export const Route = createFileRoute('/claim')({
  head: () => ({
    meta: [
      { title: 'Get your business found | Agentic Economy' },
      { name: 'description', content: 'Claim a free service page so people and assistants can understand and compare the public facts you supply.' },
      { name: 'robots', content: 'index,follow' },
    ],
  }),
  component: ClaimRoute,
})

function ClaimRoute() {
  const location = useLocation()

  if (location.pathname !== '/claim') return <Outlet />

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="For businesses"
        title="Publish a page customers can understand."
        description="Show what your business does, where you work, and the supported next step using facts you supply."
        actions={<Button label="Sign in to start" variant="primary" href="/claim/form" />}
      />
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)] md:px-6">
        <section aria-labelledby="claim-before-you-start" className="grid content-start gap-4">
          <Text id="claim-before-you-start" type="large" weight="semibold" display="block">
            What you’ll prepare
          </Text>
          <ul className="grid gap-3 text-primary">
            <li><strong>Business details:</strong> the public name, category, location, and an optional phone number.</li>
            <li><strong>One clear service:</strong> what it covers, where it is offered, and the hours you can honestly publish.</li>
            <li><strong>The next step:</strong> whether customers can send a written request now or should use another contact path.</li>
            <li><strong>A source note:</strong> where the public details came from so you can review them before publishing.</li>
          </ul>
        </section>
        <Card padding={5} className="grid content-start gap-3">
          <Text type="large" weight="semibold" display="block">You stay in control</Text>
          <Text color="secondary" display="block">You review every public detail before anything appears.</Text>
          <Text color="secondary" display="block">You choose whether to publish a phone number or accept a written first contact.</Text>
          <Text color="secondary" display="block">AE does not book, charge, confirm availability, or accept work for your business.</Text>
          <Text type="supporting" color="secondary" display="block">Claiming is free. Sign-in protects changes to the business page.</Text>
        </Card>
      </main>
    </AePublicShell>
  )
}

export function ClaimFormRoute() {
  const navigate = useNavigate()
  const submitClaim = useServerFn(submitClaimServer)
  const hydrated = useClientMounted()
  const [draftState, dispatchDraft] = useReducer(reduceClaimDraft, initialClaimDraftState)
  const { value, factsConfirmed, dirtyFields } = draftState
  const [errors, setErrors] = useState<readonly PublicOwnerClaimValidationError[]>([])
  const [message, setMessage] = useState<string | undefined>()
  const [pending, setPending] = useState(false)
  const importDraft = useServerFn(importDraftServer)
  const [importWebsiteUrl, setImportWebsiteUrl] = useState('')
  const [importAbn, setImportAbn] = useState('')
  const [importPending, setImportPending] = useState(false)
  const [importDraftResult, setImportDraftResult] = useState<StorefrontImportDraft | undefined>()
  const [importMessage, setImportMessage] = useState<string | undefined>()
  const errorByField = new Map(errors.map((error) => [error.field, error.message]))
  const firstRequestModeError = errorByField.get('firstRequestMode')
  const firstRequestModeInvalid = firstRequestModeError !== undefined

  useEffect(() => {
    if (!hydrated || draftState.phase !== 'awaiting_storage') {
      return
    }

    const storedDraft = readStoredClaimDraft()
    dispatchDraft(storedDraft === undefined ? { type: 'hydrate' } : { type: 'hydrate', snapshot: storedDraft })
  }, [draftState.phase, hydrated])

  useEffect(() => {
    if (!hydrated) return
    const snapshot = snapshotClaimDraft(draftState)
    if (snapshot !== undefined) writeStoredClaimDraft(snapshot)
  }, [draftState, hydrated])

  useEffect(() => {
    focusFirstError(errors)
  }, [errors])

  function updateTextField(field: TextClaimField, nextValue: string) {
    dispatchDraft({ type: 'edit_text', field, value: nextValue })
  }

  async function handleImportDraft() {
    setImportMessage(undefined)
    setImportPending(true)
    try {
      const result = await importDraft({
        data: {
          websiteUrl: importWebsiteUrl,
          ...(importAbn.trim().length === 0 ? {} : { abn: importAbn }),
        },
      })
      if (result.kind === 'ok') {
        setImportDraftResult(result.draft)
        dispatchDraft({ type: 'import', value: result.draft.profile })
        setImportMessage('Review the imported draft below. Nothing publishes until you confirm and submit.')
        return
      }

      setImportMessage(result.reason)
    } finally {
      setImportPending(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(undefined)
    const nextValue = readClaimInputWithStateFallback(event.currentTarget, value, dirtyFields)
    const submittedDirtyFields: PublicOwnerClaimField[] = []
    for (const field of textClaimFields) {
      if (nextValue[field].trim().length > 0) {
        submittedDirtyFields.push(field)
      }
    }
    if (nextValue.firstRequestMode !== emptyPublicOwnerClaimInput.firstRequestMode) {
      submittedDirtyFields.push('firstRequestMode')
    }
    dispatchDraft({ type: 'replace_from_form', value: nextValue, dirtyFields: submittedDirtyFields })
    const validation = validatePublicOwnerClaimFlowInput(nextValue)
    if (validation.kind === 'invalid') {
      setErrors(validation.errors)
      return
    }

    setErrors([])
    setPending(true)
    try {
      const result = await submitClaim({ data: nextValue })
      if (result.kind === 'ok') {
        clearStoredClaimDraft()
        await navigate({ to: '/claim/success', search: { slug: result.catalog.slug } })
        return
      }

      setMessage(result.reason)
      setErrors(result.errors ?? [])
    } finally {
      setPending(false)
    }
  }

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="For businesses"
        title="Get your business found."
        description="Publish the service facts you choose. People and assistants can read the same page; a written contact path appears only when it is ready."
      />
      {!hydrated ? (
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 text-sm text-secondary md:px-6" aria-live="polite">
          Preparing claim form.
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        {message === undefined ? null : (
          <Banner status="error" title="Publish did not complete" description={message} />
        )}
        <Card padding={5} className="grid gap-1.5 bg-accent text-on-accent">
          <Text type="large" weight="semibold" display="block" className="text-on-accent">Free to claim. No lead fees.</Text>
          <Text display="block" className="text-on-accent/85">You own the page, choose what appears, and set how customers reach you.</Text>
        </Card>
        <ImportDraftSection
          websiteUrl={importWebsiteUrl}
          abn={importAbn}
          draft={importDraftResult}
          message={importMessage}
          pending={importPending}
          onWebsiteUrlChange={setImportWebsiteUrl}
          onAbnChange={setImportAbn}
          onImport={handleImportDraft}
        />
        <AeClaimFormSection title="Business identity" description="This is how customers recognize the business.">
          <FormLayout>
            {identityFields.map((field) => (
              <ClaimTextField
                key={field.field}
                config={field}
                value={value}
                errorByField={errorByField}
                updateTextField={updateTextField}
                disabled={pending}
              />
            ))}
          </FormLayout>
        </AeClaimFormSection>
        <AeClaimFormSection title="Service details" description="Add one service people can understand quickly.">
          <FormLayout>
            {serviceFields.map((field) => (
              <ClaimTextField
                key={field.field}
                config={field}
                value={value}
                errorByField={errorByField}
                updateTextField={updateTextField}
                disabled={pending}
              />
            ))}
            <ResponseTimeField
              value={value}
              errorByField={errorByField}
              disabled={pending}
              updateTextField={updateTextField}
            />
            <AeFileUploadField
              label="Supporting files"
              description="Preview files while preparing the claim. Use the Photo URL field for the image that should publish."
              accept="image/*,.pdf"
            />
          </FormLayout>
        </AeClaimFormSection>
        <AeClaimFormSection title="First request" description="Say what this page can show today.">
          <FormLayout>
            <Field
              label="First request"
              inputID="firstRequestMode"
              description="Choose unavailable if you do not want a contact path on the page yet."
              descriptionID="firstRequestMode-description"
              {...(firstRequestModeInvalid ? { status: { type: 'error' as const, message: firstRequestModeError, messageID: 'firstRequestMode-error' } } : {})}
            >
              <AeRadioCardGroup
                name="firstRequestMode"
                value={value.firstRequestMode}
                options={firstRequestModeOptions}
                aria-describedby={firstRequestModeInvalid ? 'firstRequestMode-description firstRequestMode-error' : 'firstRequestMode-description'}
                aria-invalid={firstRequestModeInvalid}
                disabled={pending}
                onValueChange={(nextValue) => {
                  dispatchDraft({ type: 'edit_first_request_mode', value: toFirstRequestMode(nextValue) })
                }}
              />
            </Field>
            <ClaimTextField
              config={{
                field: 'publicDisclosure',
                label: 'Public first-request note',
                description: 'This note appears on the public service page.',
                control: 'textarea',
              }}
              value={value}
              errorByField={errorByField}
              updateTextField={updateTextField}
              disabled={pending}
            />
            <ClaimTextField
              config={{
                field: 'noContactReason',
                label: 'Unavailable reason',
                description: 'Required when the first request is not available yet.',
                control: 'textarea',
              }}
              value={value}
              errorByField={errorByField}
              updateTextField={updateTextField}
              disabled={pending}
            />
            <ClaimTextField
              config={{
                field: 'ownerMessage',
                label: 'Owner message',
                description: 'Optional context. Avoid private contact details here.',
                control: 'textarea',
              }}
              value={value}
              errorByField={errorByField}
              updateTextField={updateTextField}
              disabled={pending}
            />
          </FormLayout>
        </AeClaimFormSection>
        <AeReviewBlock value={value} />
        <AeCheckboxField
          id="claimFactsConfirmed"
          label="I confirm these public details are supplied by the business and ready to publish."
          description="Review what will appear before continuing."
          checked={factsConfirmed}
          disabled={pending}
          onCheckedChange={(nextValue) => dispatchDraft({ type: 'set_facts_confirmed', value: nextValue })}
        />
        <div className="flex flex-wrap items-center gap-3">
          <AeActionButton
            type="submit"
            state={pending ? 'loading' : 'idle'}
            leadingIcon={<ArrowRightIcon />}
            disabled={pending || !factsConfirmed}
          >
            Publish service page
          </AeActionButton>
          {previewButton(value.requestedSlug)}
        </div>
        </form>
      )}
    </AePublicShell>
  )
}

function ImportDraftSection({
  websiteUrl,
  abn,
  draft,
  message,
  pending,
  onWebsiteUrlChange,
  onAbnChange,
  onImport,
}: {
  websiteUrl: string
  abn: string
  draft: StorefrontImportDraft | undefined
  message: string | undefined
  pending: boolean
  onWebsiteUrlChange: (value: string) => void
  onAbnChange: (value: string) => void
  onImport: () => void
}) {
  const websiteDescriptionId = 'storefront-import-url-description'
  const abnDescriptionId = 'storefront-import-abn-description'
  const inputClassName = 'min-h-11 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-primary outline-none transition focus:border-primary disabled:opacity-50'

  return (
    <AeClaimFormSection
      title="Start from a website"
      description="Import a draft from a business website, then review and edit every public detail before publishing."
    >
      <div className="grid gap-4">
        {message === undefined ? null : (
          <Banner
            status={draft === undefined ? 'error' : 'success'}
            title={draft === undefined ? 'Draft import needs attention' : 'Draft imported for review'}
            description={message}
          />
        )}
        <FormLayout>
          <Field
            label="Business website URL"
            inputID="storefront-import-url"
            description="We read title, description, service, and contact cues into an unpublished draft."
            descriptionID={websiteDescriptionId}
          >
            <input
              id="storefront-import-url"
              name="storefront-import-url"
              type="url"
              aria-label="Business website URL"
              value={websiteUrl}
              disabled={pending}
              aria-describedby={websiteDescriptionId}
              className={inputClassName}
              onChange={(event) => onWebsiteUrlChange(event.currentTarget.value)}
            />
          </Field>
          <Field
            label="ABN (optional)"
            inputID="storefront-import-abn"
            description="Stored only in the draft review. It is not published by the import."
            descriptionID={abnDescriptionId}
          >
            <input
              id="storefront-import-abn"
              name="storefront-import-abn"
              aria-label="ABN (optional)"
              value={abn}
              disabled={pending}
              aria-describedby={abnDescriptionId}
              className={inputClassName}
              onChange={(event) => onAbnChange(event.currentTarget.value)}
            />
          </Field>
        </FormLayout>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            label={pending ? 'Importing draft' : 'Import draft'}
            type="button"
            variant="secondary"
            isDisabled={pending || websiteUrl.trim().length === 0}
            onClick={onImport}
          />
          <Text type="supporting" color="secondary">
            The draft stays unpublished until you confirm the reviewed form.
          </Text>
        </div>
        {draft === undefined ? null : <ImportedDraftReview draft={draft} />}
      </div>
    </AeClaimFormSection>
  )
}

function ImportedDraftReview({ draft }: { draft: StorefrontImportDraft }) {
  return (
    <Card padding={4} className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <Text type="large" weight="semibold" color="primary" display="block">Review imported draft</Text>
          <Text type="supporting" color="secondary" display="block">Review and adjust the imported details before you publish.</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="neutral" label={draft.source.label} />
          <Badge variant="warning" label={draft.source.confirmation} />
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {draft.facts.map((fact) => (
          <div key={`${fact.field}:${fact.value}`} className="rounded-md border border-border bg-surface p-3">
            <dt className="flex flex-wrap items-center gap-2 text-sm font-medium text-primary">
              <span>{fact.label}</span>
              <Badge variant="neutral" label={fact.sourceLabel} />
              <Badge variant="warning" label={fact.confirmation} />
            </dt>
            <dd className="mt-1 break-words text-sm text-secondary">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

function ResponseTimeField({
  value,
  errorByField,
  updateTextField,
  disabled,
}: {
  value: PublicOwnerClaimFlowInput
  errorByField: ReadonlyMap<PublicOwnerClaimField, string>
  updateTextField: (field: TextClaimField, nextValue: string) => void
  disabled: boolean
}) {
  const field = 'responseTimeMinutes'
  const error = errorByField.get(field)

  return (
    <AeRangeField
      name={field}
      label="Typical response time"
      description="Optional public cue. Adjust it only if the business can stand behind it."
      value={value.responseTimeMinutes ?? ''}
      disabled={disabled}
      {...(error === undefined ? {} : { errorMessage: error })}
      onValueChange={(nextValue) => updateTextField(field, nextValue)}
    />
  )
}

function ClaimTextField({
  config,
  value,
  errorByField,
  updateTextField,
  disabled,
}: {
  config: FieldConfig
  value: PublicOwnerClaimFlowInput
  errorByField: ReadonlyMap<PublicOwnerClaimField, string>
  updateTextField: (field: TextClaimField, nextValue: string) => void
  disabled: boolean
}) {
  const error = errorByField.get(config.field)
  const invalid = error !== undefined
  const descriptionId = `${config.field}-description`
  const errorId = `${config.field}-error`
  const describedBy = [
    config.description === undefined ? undefined : descriptionId,
    invalid ? errorId : undefined,
  ].filter(Boolean).join(' ') || undefined
  const status = error === undefined ? undefined : { type: 'error' as const, message: error, messageID: errorId }

  const inputClassName = 'min-h-11 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-primary outline-none transition focus:border-primary disabled:opacity-50'

  const fieldInput = config.control === 'textarea' ? (
    <textarea
      id={config.field}
      name={config.field}
      aria-label={config.label}
      value={value[config.field] ?? ''}
      disabled={disabled}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className={`${inputClassName} min-h-28 resize-y`}
      onChange={(event) => {
        const nextValue = event.currentTarget.value
        updateTextField(config.field, nextValue)
      }}
    />
  ) : (
    <input
      id={config.field}
      name={config.field}
      type={config.control === 'tel' ? 'tel' : 'text'}
      inputMode={config.control === 'tel' ? 'tel' : undefined}
      autoComplete={config.control === 'tel' ? 'tel' : undefined}
      aria-label={config.label}
      value={value[config.field] ?? ''}
      disabled={disabled}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className={inputClassName}
      onChange={(event) => updateTextField(config.field, event.currentTarget.value)}
    />
  )

  if (status === undefined) {
    return (
      <Field key={config.field} label={config.label} inputID={config.field} description={config.description} descriptionID={descriptionId}>
        {fieldInput}
      </Field>
    )
  }

  return (
    <Field key={config.field} label={config.label} inputID={config.field} description={config.description} descriptionID={descriptionId} status={status}>
      {fieldInput}
    </Field>
  )
}

function focusFirstError(errors: readonly PublicOwnerClaimValidationError[]) {
  const first = errors.at(0)
  if (first === undefined) {
    return
  }

  window.setTimeout(() => {
    document.querySelector<HTMLElement>(`[name="${first.field}"]`)?.focus()
  }, 0)
}

function toFirstRequestMode(value: string): PublicOwnerClaimFlowInput['firstRequestMode'] {
  if (value === 'inquiry_available' || value === 'quote_request_available') {
    return value
  }

  return 'not_available_yet'
}

function previewButton(requestedSlug: string) {
  const slug = requestedSlug.trim()
  if (slug.length === 0) {
    return <Button label="Preview public page" type="button" variant="secondary" isDisabled />
  }

  return <Button label="Preview public page" variant="secondary" href={`/${slug}`} />
}
