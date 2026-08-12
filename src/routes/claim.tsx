import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react'
import { Link, Outlet, createFileRoute, useLocation, useNavigate, useSearch } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ArrowRightIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AeClaimFormSection } from '@/components/ae/forms/AeClaimFormSection'
import { AeReviewBlock } from '@/components/ae/forms/AeReviewBlock'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { isRecord } from '@/modules/common/is-record'
import { submitOwnerClaimServer } from '@/modules/catalog/owner-claim.functions'
import {
  emptyPublicOwnerClaimInput,
  initialClaimDraftState,
  hasClaimDraftContent,
  readClaimTextField,
  reduceClaimDraft,
  updateClaimTextField,
  snapshotClaimDraft,
  type ClaimDraftField,
  type ClaimDraftSnapshot,
  type TextClaimField,
} from '@/modules/catalog/claim-draft'
import { enrichBusinessDraftServer, importStorefrontDraftServer } from '@/modules/storefront/storefront.functions'
import { AeFindMyBusiness } from '@/components/ae/claim/AeFindMyBusiness'
import { ClaimFormSections } from '@/components/ae/claim/ClaimFormSections'
import {
  clearClaimEnrichIntent,
  readClaimEnrichIntent,
  writeClaimEnrichIntent,
} from '@/components/ae/claim/AeFindMyBusiness.exports'
import { searchClaimableBusinessesServer } from '@/lib/claim/search-claimable-businesses'
import { validatePublicOwnerClaimFlowInput } from '@/modules/catalog/public'
import type { PublicOwnerClaimField, PublicOwnerClaimFlowInput, PublicOwnerClaimValidationError } from '@/modules/catalog/public'
import type { BusinessContext } from '@/modules/business/public'
import type { StorefrontImportDraft } from '@/modules/storefront/public'
import { useClientMounted } from '@/hooks/use-client-mounted'


const textClaimFields = [
  'providerWebsite',
  'providerIdentifier',
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

const claimFields = [...textClaimFields, 'businessContext', 'firstRequestMode'] as const satisfies readonly ClaimDraftField[]

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
  const source = isRecord(value) ? value : {}
  const normalized: PublicOwnerClaimFlowInput = {
    ...emptyPublicOwnerClaimInput,
    businessContext: readStoredBusinessContext(source.businessContext),
  }

  let next = normalized
  for (const field of textClaimFields) {
    const storedValue = readStoredClaimText(source, next.businessContext, field)
    if (typeof storedValue === 'string') {
      next = updateClaimTextField(next, field, storedValue)
    }
  }

  const storedFirstRequestMode = source.firstRequestMode
  return {
    ...next,
    firstRequestMode: typeof storedFirstRequestMode === 'string'
      ? toFirstRequestMode(storedFirstRequestMode)
      : emptyPublicOwnerClaimInput.firstRequestMode,
  }
}

function readStoredBusinessContext(value: unknown): BusinessContext {
  if (!isRecord(value)) return emptyPublicOwnerClaimInput.businessContext
  if (value.kind === 'programmable_provider') {
    return {
      kind: 'programmable_provider',
      website: typeof value.website === 'string' ? value.website : '',
      providerIdentifier: typeof value.providerIdentifier === 'string' ? value.providerIdentifier : '',
    }
  }
  return {
    kind: 'local_human',
    suburb: typeof value.suburb === 'string' ? value.suburb : '',
    stateTerritory: typeof value.stateTerritory === 'string' ? value.stateTerritory : '',
    ...(typeof value.postcode === 'string' && value.postcode.length > 0 ? { postcode: value.postcode } : {}),
    ...(typeof value.publishedPhone === 'string' && value.publishedPhone.length > 0 ? { publishedPhone: value.publishedPhone } : {}),
  }
}

function readStoredClaimText(
  source: Record<string, unknown>,
  context: BusinessContext,
  field: TextClaimField,
): unknown {
  if (field === 'providerWebsite') return context.kind === 'programmable_provider' ? context.website : undefined
  if (field === 'providerIdentifier') return context.kind === 'programmable_provider' ? context.providerIdentifier : undefined
  if (field === 'suburb') return context.kind === 'local_human' ? context.suburb : undefined
  if (field === 'stateTerritory') return context.kind === 'local_human' ? context.stateTerritory : undefined
  if (field === 'publishedPhone') return context.kind === 'local_human' ? context.publishedPhone : undefined
  return source[field]
}

function normalizeStoredDirtyFields(value: unknown): readonly ClaimDraftField[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((field): field is ClaimDraftField =>
    typeof field === 'string' && claimFields.some((candidate) => candidate === field)
  )
}

function readClaimInputWithStateFallback(
  form: HTMLFormElement,
  fallback: PublicOwnerClaimFlowInput,
  dirtyFields: ReadonlySet<ClaimDraftField>,
): PublicOwnerClaimFlowInput {
  const formValue = readClaimInput(form, fallback)
  let next = formValue

  for (const field of textClaimFields) {
    const fallbackValue = readClaimTextField(fallback, field)
    const formValueText = readClaimTextField(formValue, field)
    if (dirtyFields.has(field) && formValueText.trim().length === 0 && fallbackValue.trim().length > 0) {
      next = updateClaimTextField(next, field, fallbackValue)
    }
  }
  if (
    dirtyFields.has('businessContext')
    && formValue.businessContext.kind === emptyPublicOwnerClaimInput.businessContext.kind
    && fallback.businessContext.kind !== emptyPublicOwnerClaimInput.businessContext.kind
  ) {
    next = { ...next, businessContext: fallback.businessContext }
  }

  if (dirtyFields.has('firstRequestMode') && formValue.firstRequestMode === emptyPublicOwnerClaimInput.firstRequestMode) {
    next = { ...next, firstRequestMode: fallback.firstRequestMode }
  }

  return next
}

function readClaimInput(form: HTMLFormElement, fallback: PublicOwnerClaimFlowInput): PublicOwnerClaimFlowInput {
  const data = new FormData(form)
  const read = (field: TextClaimField) => {
    const control = form.elements.namedItem(field)
    if (
      control instanceof HTMLInputElement
      || control instanceof HTMLTextAreaElement
      || control instanceof HTMLSelectElement
    ) {
      return control.value
    }

    const value = data.get(field)
    return typeof value === 'string' ? value : readClaimTextField(fallback, field)
  }
  const businessContextKindValue = data.get('businessContextKind')
  const firstRequestModeValue = data.get('firstRequestMode')
  const businessContextKind = toBusinessContextKind(
    typeof businessContextKindValue === 'string' ? businessContextKindValue : fallback.businessContext.kind,
  )
  const publishedPhone = read('publishedPhone')
  const businessContext: BusinessContext = businessContextKind === 'programmable_provider'
    ? {
        kind: 'programmable_provider',
        website: read('providerWebsite'),
        providerIdentifier: read('providerIdentifier'),
      }
    : {
        kind: 'local_human',
        suburb: read('suburb'),
        stateTerritory: read('stateTerritory'),
        ...(fallback.businessContext.kind === 'local_human' && fallback.businessContext.postcode === undefined
          ? {}
          : fallback.businessContext.kind === 'local_human' ? { postcode: fallback.businessContext.postcode } : {}),
        ...(publishedPhone.length === 0 ? {} : { publishedPhone }),
      }

  return {
    businessContext,
    businessName: read('businessName'),
    category: read('category'),
    requestedSlug: read('requestedSlug'),
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

/** Prefill carried from the find step. It never overrides a stored draft. */
const prefillFields = ['businessName', 'category', 'requestedSlug'] as const

type ClaimSearchParams = Partial<Record<(typeof prefillFields)[number], string>> & {
  businessContext?: BusinessContext
  source?: 'supply'
}

function readClaimPrefill(search: Record<string, unknown>): ClaimSearchParams {
  const prefill: ClaimSearchParams = {}
  const source = search.source
  if (source === 'supply') {
    prefill.source = source
    prefill.businessContext = { kind: 'programmable_provider', website: '', providerIdentifier: '' }
  }
  if (isRecord(search.businessContext)) {
    prefill.businessContext = readStoredBusinessContext(search.businessContext)
  }
  for (const field of prefillFields) {
    const value = search[field]
    if (typeof value !== 'string') continue
    const trimmed = value.trim().slice(0, 120)
    if (trimmed.length > 0) prefill[field] = trimmed
  }
  return prefill
}

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
            {source === 'supply'
              ? 'Publish an operation AI assistants can call.'
              : 'Get your business found — and quoted — by AI assistants and the people they work for.'}
          </h1>
          <p className="block max-w-3xl text-lg text-muted-foreground">
            {source === 'supply'
              ? 'Claim your programmable-provider identity, create an Offering with an exact per-call price, then admit and test its source.'
              : 'When people ask their AI, your business is found and can answer with your real services and prices. You review every message before you confirm availability, price, and timing.'}
          </p>
        </div>
        <div className="grid max-w-md gap-2">
          <Button asChild variant="default" className="min-h-11 w-full sm:w-auto"><Link to="/claim/form" search={source === 'supply' ? { source: 'supply' } : {}}>{source === 'supply' ? 'Claim provider identity' : 'List your business'}</Link></Button>
          <p className="block text-sm text-muted-foreground">
            {source === 'supply' ? 'After identity claim, continue through the existing Offering editor and source admission flow.' : 'Sign in first — then you’ll add your services and prices and publish your page.'}
          </p>
          {source === 'supply' ? <Link to="/claim/form" className="min-h-11 w-fit py-3 text-sm font-semibold underline underline-offset-4">List a local human service instead</Link> : null}
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-6 md:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] md:px-6">
        <section aria-labelledby="claim-before-you-start" className="grid content-start gap-3 border-y border-border py-4">
          <h2 id="claim-before-you-start" className="text-lg font-semibold text-foreground">
            {source === 'supply' ? 'One identity, Offering, and admitted operation' : 'What people get when they ask their AI'}
          </h2>
          <ul className="m-0 grid list-none divide-y divide-border p-0 text-foreground">
            {source === 'supply' ? (
              <>
                <li className="grid gap-0.5 py-3 first:pt-1"><strong>Provider identity:</strong><span className="text-muted-foreground">Claim the programmable provider that owns the operation.</span></li>
                <li className="grid gap-0.5 py-3"><strong>Offering:</strong><span className="text-muted-foreground">Describe the operation and set its exact fixed price per call in the existing editor.</span></li>
                <li className="grid gap-0.5 py-3"><strong>Source admission:</strong><span className="text-muted-foreground">Attach the operation source to that Offering, then admit it through the existing supply flow.</span></li>
                <li className="grid gap-0.5 py-3 last:pb-1"><strong>Operation control:</strong><span className="text-muted-foreground">Read the canonical publication, binding, source, pricing, readiness, lifecycle, and live facts.</span></li>
              </>
            ) : (
              <>
                <li className="grid gap-0.5 py-3 first:pt-1"><strong>Your business facts:</strong><span className="text-muted-foreground">People asking their AI can find the name, trade, suburb, and phone number you publish.</span></li>
                <li className="grid gap-0.5 py-3"><strong>The services you offer:</strong><span className="text-muted-foreground">People can see the jobs you do, suburbs you cover, and hours you answer.</span></li>
                <li className="grid gap-0.5 py-3"><strong>Your prices:</strong><span className="text-muted-foreground">Answers use your real price and its unit, or tell people when you quote first.</span></li>
                <li className="grid gap-0.5 py-3"><strong>Messages to review:</strong><span className="text-muted-foreground">People can send a first message for you to review before you confirm the work.</span></li>
                <li className="grid gap-0.5 py-3 last:pb-1"><strong>Customer next step:</strong><span className="text-muted-foreground">Choose the phone, website, or message route people can use now.</span></li>
              </>
            )}
          </ul>
        </section>
        <section aria-labelledby="claim-control-title" className="grid content-start gap-3 rounded-lg border border-border bg-card p-5">
          <h2 id="claim-control-title" className="text-lg font-semibold text-foreground">{source === 'supply' ? 'You control each operation' : 'You stay in control'}</h2>
          <p className="block text-muted-foreground">{source === 'supply' ? 'Your claimed identity, exact price, admitted source, and publication state remain explicit owner-controlled facts.' : 'You review every public detail before anything appears.'}</p>
          <p className="block text-muted-foreground">{source === 'supply' ? 'Readiness is shown only from recorded observations for the exact admitted operation.' : 'You confirm availability, price, and every request before work begins.'}</p>
          <p className="block text-muted-foreground">{source === 'supply' ? 'Withdraw, republish, refresh readiness, and test from the same operation control.' : 'Change a detail any time. Nothing starts until you confirm the request.'}</p>
        </section>
      </div>
      {source === 'supply' ? null : (
        <section aria-label="Find your business" className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-6 md:px-6">
          <AeFindMyBusiness
            search={async (query) => await searchBusinesses({ data: { query } })}
            onBuildFromWeb={(businessName) => {
              writeClaimEnrichIntent({ businessName })
              void navigate({ to: '/claim/form' })
            }}
          />
        </section>
      )}
    </AePublicShell>
  )
}

export function ClaimFormRoute() {
  const navigate = useNavigate()
  const submitClaim = useServerFn(submitOwnerClaimServer)
  const hydrated = useClientMounted()
  const [draftState, dispatchDraft] = useReducer(reduceClaimDraft, initialClaimDraftState)
  const { value, factsConfirmed, dirtyFields } = draftState
  const [errors, setErrors] = useState<readonly PublicOwnerClaimValidationError[]>([])
  const [message, setMessage] = useState<string | undefined>()
  const [pending, setPending] = useState(false)
  const [draftNotice, setDraftNotice] = useState<string | undefined>()
  const persistedDraftRef = useRef<string>(undefined)
  const importDraft = useServerFn(importStorefrontDraftServer)
  const [importWebsiteUrl, setImportWebsiteUrl] = useState('')
  const [importPending, setImportPending] = useState(false)
  const [importDraftResult, setImportDraftResult] = useState<StorefrontImportDraft | undefined>()
  const [importMessage, setImportMessage] = useState<string | undefined>()
  const enrichDraft = useServerFn(enrichBusinessDraftServer)
  const [enrichPending, setEnrichPending] = useState(false)
  const [enrichMessage, setEnrichMessage] = useState<string | undefined>()
  const enrichAttemptedRef = useRef(false)
  const prefill = useSearch({ strict: false }) as ClaimSearchParams
  const errorByField = new Map(errors.map((error) => [error.field, error.message]))

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
    if (prefilled.length > 0 || prefill.businessContext !== undefined) {
      dispatchDraft({
        type: 'import',
        value: {
          ...emptyPublicOwnerClaimInput,
          ...Object.fromEntries(prefilled),
          ...(prefill.businessContext === undefined ? {} : { businessContext: prefill.businessContext }),
        },
      })
    }
  }, [draftState.phase, hydrated, prefill])

  useEffect(() => {
    if (!hydrated || draftState.phase !== 'ready' || enrichAttemptedRef.current) return

    const intent = readClaimEnrichIntent()
    if (intent === undefined) return

    clearClaimEnrichIntent()
    enrichAttemptedRef.current = true
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
  }, [draftState.phase, enrichDraft, hydrated])

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

  function updateBusinessContextKind(nextValue: string) {
    dispatchDraft({ type: 'edit_business_context_kind', value: toBusinessContextKind(nextValue) })
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
    const submittedDirtyFields: ClaimDraftField[] = []
    for (const field of textClaimFields) {
      if (readClaimTextField(nextValue, field).trim().length > 0) {
        submittedDirtyFields.push(field)
      }
    }
    if (nextValue.businessContext.kind !== emptyPublicOwnerClaimInput.businessContext.kind) {
      submittedDirtyFields.push('businessContext')
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
      if (result.kind === 'provider_claimed') {
        clearStoredClaimDraft()
        await navigate({
          to: '/owner/offerings/new',
          ...(prefill.source === undefined ? {} : { search: { next: 'supply' } }),
        })
        return
      }
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
        title={value.businessContext.kind === 'programmable_provider' ? 'Claim your provider identity' : 'Publish your business page'}
        description={value.businessContext.kind === 'programmable_provider'
          ? 'Claim your provider identity first. After this step, create an Offering in the existing editor.'
          : 'Add your facts, services, and how customers can reach you. Nothing publishes until you confirm it.'}
      />
      {!hydrated ? (
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 text-sm text-muted-foreground md:px-6" aria-live="polite">
          Preparing your business page form.
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        {message === undefined ? null : (
          <Alert variant="destructive">
            <AlertTitle>{value.businessContext.kind === 'programmable_provider' ? 'Provider claim was not completed' : 'Your page was not published'}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        <Card className="grid gap-1.5 bg-brand p-5 text-on-brand">
          <p className="block text-lg font-semibold text-on-brand">{value.businessContext.kind === 'programmable_provider' ? 'Free provider identity claim.' : 'Free to claim. No lead fees.'}</p>
          <p className="block text-on-brand/85">{value.businessContext.kind === 'programmable_provider' ? 'This step creates only your owned provider identity. Offering publication happens explicitly in the editor.' : 'You choose the facts, price, and contact route people see. Nothing publishes until you confirm it.'}</p>
        </Card>
        {value.businessContext.kind === 'programmable_provider' ? null : enrichMessage === undefined ? null : (
          <Alert variant={!enrichPending && importDraftResult === undefined ? 'destructive' : 'default'}>
            <AlertTitle>{enrichPending ? 'Gathering your public details' : importDraftResult === undefined ? 'We could not draft your page' : 'Details gathered for review'}</AlertTitle>
            <AlertDescription>{enrichMessage}</AlertDescription>
          </Alert>
        )}
        {value.businessContext.kind === 'programmable_provider' ? null : (
          <ImportDraftSection
            websiteUrl={importWebsiteUrl}
            draft={importDraftResult}
            message={importMessage}
            pending={importPending}
            onWebsiteUrlChange={setImportWebsiteUrl}
            onImport={handleImportDraft}
          />
        )}
        <ClaimFormSections
          value={value}
          errorByField={errorByField}
          updateTextField={updateTextField}
          disabled={pending}
          onBusinessContextKindChange={updateBusinessContextKind}
          onFirstRequestModeChange={(nextValue) => {
            dispatchDraft({ type: 'edit_first_request_mode', value: toFirstRequestMode(nextValue) })
          }}
        />
        <AeReviewBlock value={value} />
        <FieldGroup>
          <Field orientation="horizontal" {...(pending ? { 'data-disabled': true } : {})}>
            <Checkbox
              id="claimFactsConfirmed"
              checked={factsConfirmed}
              disabled={pending}
              aria-describedby="claimFactsConfirmed-description"
              onCheckedChange={(nextValue) => dispatchDraft({ type: 'set_facts_confirmed', value: nextValue === true })}
            />
            <FieldContent>
              <FieldLabel htmlFor="claimFactsConfirmed" className="min-h-11 items-center">
                I confirm these public details are supplied by the business and ready to publish.
              </FieldLabel>
              <FieldDescription id="claimFactsConfirmed-description">Review what will appear before continuing.</FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            aria-label={value.businessContext.kind === 'programmable_provider' ? 'Claim provider identity' : 'Publish my service page'}
            disabled={pending || !factsConfirmed}
            aria-busy={pending || undefined}
            data-state={pending ? 'loading' : 'idle'}
          >
            {pending ? <Spinner data-icon="inline-start" aria-label="Loading" /> : <ArrowRightIcon data-icon="inline-start" aria-hidden="true" />}
            {value.businessContext.kind === 'programmable_provider' ? 'Claim provider identity' : 'Publish my service page'}
          </Button>
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
function focusFirstError(errors: readonly PublicOwnerClaimValidationError[]) {
  const first = errors.at(0)
  if (first === undefined) {
    return
  }

  window.setTimeout(() => {
    document.querySelector<HTMLElement>(`[name="${first.field}"]`)?.focus()
  }, 0)
}

function toBusinessContextKind(value: string): BusinessContext['kind'] {
  return value === 'programmable_provider' ? 'programmable_provider' : 'local_human'
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
