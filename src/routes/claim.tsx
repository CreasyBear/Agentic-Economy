import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react'
import { Link, Outlet, createFileRoute, useLocation, useNavigate, useSearch } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { ArrowRightIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AeClaimFormSection } from '@/components/ae/forms/AeClaimFormSection'
import { AeFileUploadField } from '@/components/ae/forms/AeFileUploadField'
import { AeRangeField } from '@/components/ae/forms/AeRangeField'
import { AeReviewBlock } from '@/components/ae/forms/AeReviewBlock'
import { AeCheckboxField } from '@/components/ae/forms/AeCheckboxField'
import { AeRadioCardGroup } from '@/components/ae/forms/AeRadioCardGroup'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { isRecord } from '@/modules/common/is-record'
import { AeActionButton } from '@/components/ae/motion/AeActionButton'
import { submitOwnerClaimServer } from '@/modules/catalog/owner-claim.functions'
import {
  emptyPublicOwnerClaimInput,
  hasClaimDraftContent,
  initialClaimDraftState,
  reduceClaimDraft,
  snapshotClaimDraft,
  type ClaimDraftSnapshot,
  type TextClaimField,
} from '@/modules/catalog/claim-draft'
import { enrichBusinessDraftServer, importStorefrontDraftServer } from '@/modules/storefront/storefront.functions'
import { readPublicOfferingRegistrySearchPage } from '@/modules/registry/registry.functions'
import {
  AeFindMyBusiness,
  clearClaimEnrichIntent,
  readClaimEnrichIntent,
  writeClaimEnrichIntent,
  type FoundBusiness,
} from '@/components/ae/claim/AeFindMyBusiness'
import { validatePublicOwnerClaimFlowInput } from '@/modules/catalog/public'
import type { PublicOwnerClaimField, PublicOwnerClaimFlowInput, PublicOwnerClaimValidationError } from '@/modules/catalog/public'
import type { StorefrontImportDraft } from '@/modules/storefront/public'
import { useClientMounted } from '@/hooks/use-client-mounted'


type FieldConfig = {
  field: TextClaimField
  label: string
  description: string
  control: 'input' | 'tel' | 'textarea'
  /** Native browser autofill token. Mobile keyboards and password managers use
   *  this; omitting it makes an owner retype details their device already has. */
  autoComplete?: string
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
  const source = isRecord(value) ? value as Partial<Record<PublicOwnerClaimField, unknown>> : {}
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
const enrichDraftServer = enrichBusinessDraftServer

const claimBusinessSearchSchema = z.object({ query: z.string().trim().min(1).max(120) })

export const searchClaimableBusinessesServer = createServerFn()
  .validator((data) => claimBusinessSearchSchema.parse(data))
  .handler(async ({ data }): Promise<readonly FoundBusiness[]> => {
    const page = await readPublicOfferingRegistrySearchPage({ query: data.query, limit: 5 })
    return page.items.map((item) => ({
      slug: item.slug,
      name: item.name,
      category: item.category,
      suburb: item.suburb,
      stateTerritory: item.stateTerritory,
    }))
  })

/** Prefill carried from the find step. It never overrides a stored draft. */
const prefillFields = ['businessName', 'category', 'suburb', 'stateTerritory', 'requestedSlug'] as const

type ClaimSearchParams = Partial<Record<(typeof prefillFields)[number], string>> & { source?: 'supply' }

function readClaimPrefill(search: Record<string, unknown>): ClaimSearchParams {
  const prefill: ClaimSearchParams = {}
  const source = search.source
  if (source === 'supply') prefill.source = source
  for (const field of prefillFields) {
    const value = search[field]
    if (typeof value !== 'string') continue
    const trimmed = value.trim().slice(0, 120)
    if (trimmed.length > 0) prefill[field] = trimmed
  }
  return prefill
}

const identityFields = [
  {
    field: 'businessName',
    label: 'Business name',
    description: 'Use the public name customers already know.',
    control: 'input',
    autoComplete: 'organization',
  },
  {
    field: 'category',
    label: 'Trade or service type',
    description: 'Example: Emergency plumbing.',
    control: 'input',
  },
  {
    field: 'suburb',
    label: 'Suburb',
    description: 'The primary local suburb.',
    control: 'input',
    autoComplete: 'address-level2',
  },
  {
    field: 'stateTerritory',
    label: 'State or territory',
    description: 'Use the short Australian state label.',
    control: 'input',
    autoComplete: 'address-level1',
  },
  {
    field: 'requestedSlug',
    label: 'Public page address',
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
    label: 'Where these facts came from',
    description: 'Name the website, sign, or person that supplied these details.',
    control: 'input',
  },
] as const satisfies readonly FieldConfig[]

const serviceFields = [
  {
    field: 'serviceName',
    label: 'Service name',
    description: 'Name the job customers ask for, such as emergency pipe repair.',
    control: 'input',
  },
  {
    field: 'serviceCategory',
    label: 'Service type',
    description: 'Use the same trade or service type as above.',
    control: 'input',
  },
  {
    field: 'serviceSummary',
    label: 'Service summary',
    description: 'Say what the customer gets and when the service helps them.',
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
    description: 'Write the hours customers can expect, or say if you are not sure.',
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
    label: 'No contact route yet',
    description: 'Use this when people should read your details but cannot contact you yet.',
  },
  {
    value: 'inquiry_available',
    label: 'People can ask a question',
    description: 'Let people send a first message for you to review.',
  },
  {
    value: 'quote_request_available',
    label: 'People can ask for a quote',
    description: 'Show how to request a quote. You confirm the price and timing.',
  },
] as const

export const Route = createFileRoute('/claim')({
  validateSearch: (search: Record<string, unknown>): ClaimSearchParams => readClaimPrefill(search),
  head: () => ({
    meta: [
      { title: 'Get your business found — and quoted — by AI assistants | Agentic Economy' },
      { name: 'description', content: 'Help AI assistants find your business, answer with your price, and show people exactly how to contact you.' },
      { name: 'robots', content: 'index,follow' },
    ],
  }),
  component: ClaimRoute,
})

function ClaimRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const searchBusinesses = useServerFn(searchClaimableBusinessesServer)
  const source = Route.useSearch().source

  if (location.pathname !== '/claim') return <Outlet />

  return (
    <AePublicShell>
      <header className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-8 md:px-6 md:py-10">
        <div className="grid max-w-5xl gap-3">
          <h1 className="max-w-4xl text-4xl leading-tight tracking-tight md:text-5xl">
            Get your business found — and quoted — by AI assistants and the people they work for.
          </h1>
          <p className="block max-w-3xl text-lg text-muted-foreground">
            When people ask their AI, your business is found and can answer with your real services and prices. You review every message before you confirm availability, price, and timing.
          </p>
        </div>
        <div className="grid max-w-md gap-1">
          <Button asChild variant="default" className="min-h-11 w-full sm:w-auto"><Link to="/claim/form" search={source === 'supply' ? { source: 'supply' } : {}}>List your business</Link></Button>
          <p className="block text-sm text-muted-foreground">
            Sign in first — then you’ll add your services and prices and publish your page.
          </p>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-6 md:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] md:px-6">
        <section aria-labelledby="claim-before-you-start" className="grid content-start gap-3 border-y border-border py-4">
          <h2 id="claim-before-you-start" className="text-lg font-semibold text-foreground">
            What people get when they ask their AI
          </h2>
          <ul className="m-0 grid list-none divide-y divide-border p-0 text-foreground">
            <li className="grid gap-0.5 py-3 first:pt-1"><strong>Your business facts:</strong><span className="text-muted-foreground">People asking their AI can find the name, trade, suburb, and phone number you publish.</span></li>
            <li className="grid gap-0.5 py-3"><strong>The services you offer:</strong><span className="text-muted-foreground">People can see the jobs you do, suburbs you cover, and hours you answer.</span></li>
            <li className="grid gap-0.5 py-3"><strong>Your prices:</strong><span className="text-muted-foreground">Answers use your real price and its unit, or tell people when you quote first.</span></li>
            <li className="grid gap-0.5 py-3"><strong>Messages to review:</strong><span className="text-muted-foreground">People can send a first message for you to review before you confirm the work.</span></li>
            <li className="grid gap-0.5 py-3 last:pb-1"><strong>Customer next step:</strong><span className="text-muted-foreground">Choose the phone, website, or message route people can use now.</span></li>
          </ul>
        </section>
        <section aria-labelledby="claim-control-title" className="grid content-start gap-3 rounded-lg border border-border bg-card p-5">
          <h2 id="claim-control-title" className="text-lg font-semibold text-foreground">You stay in control</h2>
          <p className="block text-muted-foreground">You review every public detail before anything appears.</p>
          <p className="block text-muted-foreground">You confirm availability, price, and every request before work begins.</p>
          <p className="block text-muted-foreground">Change a detail any time. Nothing starts until you confirm the request.</p>
        </section>
      </div>
      <section aria-label="Find your business" className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-6 md:px-6">
        <AeFindMyBusiness
          search={async (query) => await searchBusinesses({ data: { query } })}
          onBuildFromWeb={(businessName) => {
            writeClaimEnrichIntent({ businessName })
            void navigate({ to: '/claim/form', ...(source === 'supply' ? { search: { source: 'supply' } } : {}) })
          }}
        />
      </section>
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
  const [draftNotice, setDraftNotice] = useState<string | undefined>()
  const persistedDraftRef = useRef<string>(undefined)
  const importDraft = useServerFn(importDraftServer)
  const [importWebsiteUrl, setImportWebsiteUrl] = useState('')
  const [importPending, setImportPending] = useState(false)
  const [importDraftResult, setImportDraftResult] = useState<StorefrontImportDraft | undefined>()
  const [importMessage, setImportMessage] = useState<string | undefined>()
  const enrichDraft = useServerFn(enrichDraftServer)
  const [enrichPending, setEnrichPending] = useState(false)
  const [enrichMessage, setEnrichMessage] = useState<string | undefined>()
  const [enrichAttempted, setEnrichAttempted] = useState(false)
  const prefill = useSearch({ strict: false }) as ClaimSearchParams
  const errorByField = new Map(errors.map((error) => [error.field, error.message]))
  const firstRequestModeError = errorByField.get('firstRequestMode')
  const firstRequestModeInvalid = firstRequestModeError !== undefined

  useEffect(() => {
    if (!hydrated || draftState.phase !== 'awaiting_storage') {
      return
    }

    const storedDraft = readStoredClaimDraft()
    if (storedDraft !== undefined) {
      dispatchDraft({ type: 'hydrate', snapshot: storedDraft })
      // An autosaved-but-untouched draft is not work worth announcing; only a
      // draft the owner actually put something into is "restored".
      if (hasClaimDraftContent(storedDraft)) setDraftNotice('Draft restored from this device.')
      // The owner's own saved work outranks anything carried in from the find step.
      clearClaimEnrichIntent()
      return
    }

    dispatchDraft({ type: 'hydrate' })
    const prefilled = Object.entries(prefill).filter(([, entry]) => typeof entry === 'string' && entry.length > 0)
    if (prefilled.length > 0) {
      dispatchDraft({ type: 'import', value: { ...emptyPublicOwnerClaimInput, ...Object.fromEntries(prefilled) } })
    }
  }, [draftState.phase, hydrated, prefill])

  useEffect(() => {
    if (!hydrated || draftState.phase !== 'ready' || enrichAttempted) return

    const intent = readClaimEnrichIntent()
    if (intent === undefined) return

    clearClaimEnrichIntent()
    setEnrichAttempted(true)
    setEnrichPending(true)
    setEnrichMessage('Gathering your public details.')

    void (async () => {
      try {
        const result = await enrichDraft({ data: intent })
        if (result.kind === 'draft') {
          setImportDraftResult(result.draft)
          dispatchDraft({ type: 'import', value: result.draft.profile })
          setEnrichMessage('Review the gathered details below. Nothing publishes until you confirm and submit.')
          return
        }
        if (result.kind === 'unavailable') {
          setEnrichMessage(undefined)
          return
        }
        setEnrichMessage(result.reason)
      } finally {
        setEnrichPending(false)
      }
    })()
  }, [draftState.phase, enrichAttempted, enrichDraft, hydrated])

  // Only a write that actually changes the stored draft is worth announcing.
  // Persisting the snapshot we just restored is not a save the owner made.
  useEffect(() => {
    if (!hydrated) return
    const snapshot = snapshotClaimDraft(draftState)
    if (snapshot === undefined) return
    const serialized = JSON.stringify(snapshot)
    if (serialized === persistedDraftRef.current) return
    const isFirstWrite = persistedDraftRef.current === undefined
    persistedDraftRef.current = serialized
    writeStoredClaimDraft(snapshot)
    if (!isFirstWrite) setDraftNotice('Draft saved on this device.')
  }, [draftState, hydrated])

  // Autosave is per-device, not an account record: leaving still loses the work
  // on a different browser, so the owner gets the browser's own confirmation.
  useEffect(() => {
    if (!hydrated || draftState.phase !== 'ready' || dirtyFields.size === 0) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirtyFields.size, draftState.phase, hydrated])

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
      const result = await submitClaim({ data: { ...nextValue, ...(prefill.source === undefined ? {} : { source: prefill.source }) } })
      if (result.kind === 'ok') {
        clearStoredClaimDraft()
        await navigate({ to: '/claim/success', search: { slug: result.catalog.slug, ...(prefill.source === undefined ? {} : { source: prefill.source }) } })
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
      {/* The pitch belongs on /claim; someone who reached the form has already
          decided. Repeating the hero pushed the first field below the fold and
          made the two pages look like the same screen rendered twice. */}
      <AePageHeader
        density="operator"
        title="Publish your business page"
        description="Add your facts, services, and how customers can reach you. Nothing publishes until you confirm it."
      />
      {!hydrated ? (
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 text-sm text-muted-foreground md:px-6" aria-live="polite">
          Preparing your business page form.
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        {message === undefined ? null : (
          <Alert variant="destructive">
            <AlertTitle>Your page was not published</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        <Card className="grid gap-1.5 bg-brand p-5 text-on-brand">
          <p className="block text-lg font-semibold text-on-brand">Free to claim. No lead fees.</p>
          <p className="block text-on-brand/85">You choose the facts, price, and contact route people see. Nothing publishes until you confirm it.</p>
        </Card>
        {enrichMessage === undefined ? null : (
          <Alert variant={!enrichPending && importDraftResult === undefined ? 'destructive' : 'default'}>
            <AlertTitle>{enrichPending ? 'Gathering your public details' : importDraftResult === undefined ? 'We could not draft your page' : 'Details gathered for review'}</AlertTitle>
            <AlertDescription>{enrichMessage}</AlertDescription>
          </Alert>
        )}
        <ImportDraftSection
          websiteUrl={importWebsiteUrl}
          draft={importDraftResult}
          message={importMessage}
          pending={importPending}
          onWebsiteUrlChange={setImportWebsiteUrl}
          onImport={handleImportDraft}
        />
        <AeClaimFormSection title="Business identity" description="Enter the name, trade, and place customers use to find you.">
          <FieldGroup className="grid gap-4">
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
          </FieldGroup>
        </AeClaimFormSection>
        <AeClaimFormSection title="Service details" description="Name one job customers ask you to do, such as emergency pipe repair.">
          <FieldGroup className="grid gap-4">
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
          </FieldGroup>
        </AeClaimFormSection>
        <AeClaimFormSection title="First customer request" description="Tell people whether they can call, ask a question, or ask for a quote today.">
          <FieldGroup className="grid gap-4">
            <FieldSet {...(firstRequestModeInvalid ? { 'data-invalid': true } : {})}>
              <FieldLegend>First customer request</FieldLegend>
              <FieldDescription id="firstRequestMode-description">Choose no contact route if people should only read your details for now.</FieldDescription>
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
              {firstRequestModeError === undefined ? null : <FieldError id="firstRequestMode-error">{firstRequestModeError}</FieldError>}
            </FieldSet>
            <ClaimTextField
              config={{
                field: 'publicDisclosure',
                label: 'What people should know before asking',
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
                label: 'Why people cannot contact you yet',
                description: 'Required when no contact route is published.',
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
                label: 'Message from the business',
                description: 'Add context customers need. Do not put private contact details here.',
                control: 'textarea',
              }}
              value={value}
              errorByField={errorByField}
              updateTextField={updateTextField}
              disabled={pending}
            />
          </FieldGroup>
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
            Publish my service page
          </AeActionButton>
          {previewButton(value.requestedSlug)}
          {draftNotice === undefined ? null : (
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{draftNotice} Nothing publishes until you submit.</p>
          )}
        </div>
        </form>
      )}
    </AePublicShell>
  )
}

function ImportDraftSection({
  websiteUrl,
  draft,
  message,
  pending,
  onWebsiteUrlChange,
  onImport,
}: {
  websiteUrl: string
  draft: StorefrontImportDraft | undefined
  message: string | undefined
  pending: boolean
  onWebsiteUrlChange: (value: string) => void
  onImport: () => void
}) {
  const websiteDescriptionId = 'storefront-import-url-description'
  const websiteErrorId = 'storefront-import-url-error'
  const invalid = message !== undefined && draft === undefined
  const describedBy = invalid ? `${websiteDescriptionId} ${websiteErrorId}` : websiteDescriptionId

  return (
    <AeClaimFormSection
      title="Fastest way: paste your website"
      description="We read your site into a draft, then you review and edit every public detail before publishing. Prefer to type it yourself? The fields below are always open."
    >
      <div className="grid gap-4">
        {message === undefined ? null : (
          <Alert variant={draft === undefined ? 'destructive' : 'default'}>
            <AlertTitle>{draft === undefined ? 'Draft import needs attention' : 'Draft imported for review'}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        <FieldGroup className="grid gap-4">
          <Field {...(invalid ? { 'data-invalid': true } : {})} {...(pending ? { 'data-disabled': true } : {})}>
            <FieldLabel htmlFor="storefront-import-url">Business website URL</FieldLabel>
            <FieldDescription id={websiteDescriptionId}>We read the title, services, phone, and other public details into an unpublished draft.</FieldDescription>
            <Input
              id="storefront-import-url"
              name="storefront-import-url"
              type="url"
              value={websiteUrl}
              disabled={pending}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="min-h-11"
              onChange={(event) => onWebsiteUrlChange(event.currentTarget.value)}
            />
            {message === undefined || draft !== undefined ? null : <FieldError id={websiteErrorId}>{message}</FieldError>}
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={pending || websiteUrl.trim().length === 0}
              onClick={onImport}
            >
              {pending ? 'Importing draft' : 'Import draft'}
            </Button>
            <p className="text-sm text-muted-foreground">
              The draft stays unpublished until you confirm the reviewed form.
            </p>
          </div>
        </FieldGroup>
        {draft === undefined ? null : <ImportedDraftReview draft={draft} />}
      </div>
    </AeClaimFormSection>
  )
}

function ImportedDraftReview({ draft }: { draft: StorefrontImportDraft }) {
  return (
    <Card className="grid gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="block text-lg font-semibold text-foreground">Review imported draft</p>
          <p className="block text-sm text-muted-foreground">Review and adjust the imported details before you publish.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{draft.source.label}</Badge>
          <Badge variant="secondary">{draft.source.confirmation}</Badge>
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {draft.facts.map((fact) => (
          <div key={`${fact.field}:${fact.value}`} className="rounded-md border border-border bg-card p-3">
            <dt className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
              <span>{fact.label}</span>
              <Badge variant="outline">{fact.sourceLabel}</Badge>
              <Badge variant="secondary">{fact.confirmation}</Badge>
            </dt>
            <dd className="mt-1 break-words text-sm text-muted-foreground">{fact.value}</dd>
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
  const describedBy = invalid ? `${descriptionId} ${errorId}` : descriptionId

  const fieldInput = config.control === 'textarea' ? (
    <Textarea
      id={config.field}
      name={config.field}
      value={value[config.field] ?? ''}
      disabled={disabled}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className="min-h-28 resize-y"
      onChange={(event) => updateTextField(config.field, event.currentTarget.value)}
    />
  ) : (
    <Input
      id={config.field}
      name={config.field}
      type={config.control === 'tel' ? 'tel' : 'text'}
      {...(config.control === 'tel'
        ? { inputMode: 'tel' as const, autoComplete: 'tel' }
        : config.autoComplete === undefined ? {} : { autoComplete: config.autoComplete })}
      value={value[config.field] ?? ''}
      disabled={disabled}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className="min-h-11"
      onChange={(event) => updateTextField(config.field, event.currentTarget.value)}
    />
  )

  return (
    <Field {...(invalid ? { 'data-invalid': true } : {})} {...(disabled ? { 'data-disabled': true } : {})}>
      <FieldLabel htmlFor={config.field}>{config.label}</FieldLabel>
      <FieldDescription id={descriptionId}>{config.description}</FieldDescription>
      {fieldInput}
      {error === undefined ? null : <FieldError id={errorId}>{error}</FieldError>}
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
    return <Button type="button" variant="secondary" disabled>Preview public page</Button>
  }

  return <Button asChild variant="secondary"><a href={`/${slug}`}>Preview public page</a></Button>
}
