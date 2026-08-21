import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Field as UiField, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  BotIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  FilePenLineIcon,
  Link2Icon,
  StoreIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  OfferingPriceKindValues,
  OfferingPriceTaxTreatmentValues,
  OfferingPriceUnitValues,
  SUPPORTED_OFFERING_CURRENCIES,
  DEFAULT_OFFERING_PRICE_CURRENCY,
  isSupportedOfferingCurrency,
  normalizeOfferingPrice,
} from '@/modules/catalog/public'
import { formatExactAmount, parseDecimalExactAmount } from '@/modules/money/public'
import { createPrefixedRandomId } from '@/modules/common/random-id'

import type {
  BusinessOfferingProjection,
  BusinessOfferingStatus,
  OfferingAccessPathDescriptor,
  OfferingAccessPathStatus,
  OfferingPrice,
  OfferingPriceInput,
  OfferingPriceKind,
  OfferingPriceTaxTreatment,
  OfferingPriceUnit,
  PublicOfferingSupplyProjection,
} from '@/modules/catalog/public'
import type { OfferingRef } from '@/modules/common/ids'
import { clearStoredOfferingDraft, emptyOwnerOfferingEditorValue, publishGateRefusal, readStoredOfferingDraft, writeStoredOfferingDraft } from './AeOwnerOfferings.exports'

export type OwnerOfferingSummary = Readonly<{
  offering: BusinessOfferingProjection
  status: BusinessOfferingStatus
  accessPathCount: number
  support?: PublicOfferingSupplyProjection['support']
}>

export type OwnerOfferingEditorValue = Readonly<{
  offeringRef?: OfferingRef
  expectedRevision: number
  name: string
  category: string
  summary: string
  serviceAreaSummary: string
  availabilitySummary: string
  pricingSummary: string
  /**
   * The comparable twin of `pricingSummary`, never derived from it. Present as
   * a declared key so every construction site has to decide, and so clearing
   * the price group actually clears the published price.
   */
  price: OfferingPrice | undefined
  status: BusinessOfferingStatus
  accessPaths: readonly OwnerAccessPathEditorValue[]
}>

export type OwnerAccessPathEditorValue = Readonly<{
  accessPathRef?: string
  localDraftKey?: string
  status: OfferingAccessPathStatus
  descriptor: OfferingAccessPathDescriptor
}>
function ensureOwnerAccessPathDraftIdentity(value: OwnerOfferingEditorValue): OwnerOfferingEditorValue {
  return {
    ...value,
    accessPaths: value.accessPaths.map((path) => path.accessPathRef === undefined && path.localDraftKey === undefined
      ? { ...path, localDraftKey: createPrefixedRandomId('access-path-draft:') }
      : path),
  }
}

function stripOwnerAccessPathDraftIdentity(value: OwnerOfferingEditorValue): OwnerOfferingEditorValue {
  return {
    ...value,
    accessPaths: value.accessPaths.map(({ localDraftKey: _localDraftKey, ...path }) => path),
  }
}

export type OwnerOfferingSaveResult =
  | Readonly<{ kind: 'saved'; value: OwnerOfferingEditorValue; message: string }>
  | Readonly<{ kind: 'revision_conflict'; message: string }>
  | Readonly<{ kind: 'invalid'; field?: string; message: string }>
  | Readonly<{
      kind: 'refused'
      message: string
      retry?: Readonly<{ offeringRef: string; currentRevision: number; completedSteps: readonly string[] }>
    }>

export function AeOwnerOfferingsList({
  offerings,
  projectionState = 'current',
  onRetryProjection,
}: {
  offerings: readonly OwnerOfferingSummary[]
  projectionState?: 'current' | 'projection_pending'
  onRetryProjection?: () => void
}) {
  const publishedCount = offerings.filter((item) => item.status === 'published').length
  const reachableCount = offerings.filter((item) => item.accessPathCount > 0).length
  const supportedCount = offerings.filter((item) => item.support?.routeable === true).length

  return (
    <div className="grid gap-6">
      {projectionState === 'current' ? null : (
        <Alert>
          <AlertTitle>Your public page is still updating</AlertTitle>
          <AlertDescription>
            <p>Your changes are saved. People still see the last safe page until this update finishes.</p>
            {onRetryProjection === undefined ? null : (
              <Button type="button" variant="secondary" onClick={onRetryProjection}>Try publishing again</Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      <Card className="overflow-hidden border border-border bg-card p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)] lg:items-center">
          <div className="grid gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-brand text-on-brand">
              <StoreIcon className="size-5" aria-hidden="true" />
            </div>
            <div className="grid gap-1">
              <p className="block text-sm font-semibold text-muted-foreground">YOUR BUSINESS PAGE</p>
              <h2 className="text-xl font-semibold text-foreground">{offerings.length === 0 ? 'Show people what you do' : 'Your services at a glance'}</h2>
              <p className="block max-w-2xl text-muted-foreground">
                Each service explains one useful job your business provides. Publish the facts first, then add the easiest ways for customers to start.
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2" aria-label="Service summary">
            <OwnerSummaryStat value={publishedCount} label="Published" />
            <OwnerSummaryStat value={reachableCount} label="Contact paths" />
            <OwnerSummaryStat value={supportedCount} label="Assistant actions" />
          </dl>
        </div>
      </Card>
      {offerings.length === 0 ? (
        <Card className="grid gap-5 border border-dashed border-ring bg-muted/30 p-6 md:grid-cols-[auto_1fr_auto] md:items-center">
          <div className="flex size-12 items-center justify-center rounded-full border border-border bg-card">
            <FilePenLineIcon className="size-5 text-brand" aria-hidden="true" />
          </div>
          <div className="grid gap-1">
            <h2 className="text-xl font-semibold text-foreground">Add your first service</h2>
            <p className="block max-w-2xl text-muted-foreground">
              Start with one clear service people can ask for. Add a phone number or website next.
            </p>
          </div>
          <Button asChild variant="default">
            <a href="/owner/offerings/new">Add a service</a>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {offerings.map((item) => (
            <Card key={item.offering.offeringRef} className="group grid gap-4 border border-border p-5 transition-[border-color,box-shadow,transform] duration-base ease-standard motion-reduce:transition-none sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center hover:border-ring hover:shadow-med">
              <div className="grid min-w-0 gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-foreground">{item.offering.name}</h2>
                  <Badge variant="outline">{statusLabel(item.status)}</Badge>
                </div>
                <p className="line-clamp-2 text-muted-foreground">{item.offering.summary}</p>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-muted px-3">
                    <Link2Icon className="size-3.5" aria-hidden="true" />
                    {item.accessPathCount === 0 ? 'Add a way to begin' : `${item.accessPathCount} ${item.accessPathCount === 1 ? 'way' : 'ways'} to begin`}
                  </span>
                  {item.support?.routeable === true ? (
                    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-ring bg-muted px-3 font-medium text-foreground">
                      <BotIcon className="size-3.5" aria-hidden="true" /> AE action available
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button asChild variant="secondary" size="sm" className="min-h-11">
                  <a href={`/owner/offerings/${encodeURIComponent(item.offering.offeringRef)}?preview=true`}>Preview</a>
                </Button>
                <Button asChild variant="default" size="sm" className="min-h-11">
                  <a href={`/owner/offerings/${encodeURIComponent(item.offering.offeringRef)}`}>Edit</a>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export function AeOwnerOfferingEditor({
  initialValue,
  onSave,
  seed,
  draftKey,
}: {
  initialValue: OwnerOfferingEditorValue
  onSave: (value: OwnerOfferingEditorValue) => Promise<OwnerOfferingSaveResult>
  seed?: Readonly<{ label: string; value: Partial<OwnerOfferingEditorValue> }>
  draftKey?: string
}) {
  const [restoredDraft] = useState<OwnerOfferingEditorValue | undefined>(() => {
    if (draftKey === undefined) return undefined
    const stored = readStoredOfferingDraft(draftKey)
    return stored === undefined ? undefined : { ...stored, price: normalizeOfferingPrice(stored.price) }
  })
  const [value, setValue] = useState(() => ensureOwnerAccessPathDraftIdentity(restoredDraft ?? initialValue))
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<OwnerOfferingSaveResult | undefined>()
  const [dirty, setDirty] = useState(false)
  const [priceDraft, setPriceDraft] = useState(() => toOwnerPriceDraft((restoredDraft ?? initialValue).price))
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const categoryFieldRef = useRef<HTMLInputElement>(null)
  const summaryFieldRef = useRef<HTMLTextAreaElement>(null)
  const liveRegionId = useId()
  const retryingPartialSave = result?.kind === 'refused' && result.retry !== undefined
  const editorDisabled = pending || retryingPartialSave
  const invalidField = result?.kind === 'invalid' ? result.field : undefined
  const invalidMessage = result?.kind === 'invalid' ? result.message : undefined

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    if (draftKey === undefined || !dirty) return
    writeStoredOfferingDraft(draftKey, value)
  }, [draftKey, dirty, value])

  function update(patch: Partial<OwnerOfferingEditorValue>) {
    setDirty(true)
    setResult(undefined)
    setValue((current) => ({ ...current, ...patch }))
  }

  function focusInvalidField(field: string | undefined): void {
    if (field === 'category') {
      categoryFieldRef.current?.focus()
      return
    }
    if (field === 'summary') {
      summaryFieldRef.current?.focus()
      return
    }
    firstFieldRef.current?.focus()
  }

  function updatePrice(patch: Partial<OwnerOfferingPriceDraft>) {
    const next = { ...priceDraft, ...patch }
    setPriceDraft(next)
    // The boundary: a group that is not internally consistent is dropped here
    // rather than published as a number the business never agreed to.
    update({ price: normalizeOfferingPrice(offeringPriceInputFromDraft(next)) })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    // Requiredness belongs to the publish gate, not to saving a draft.
    const missing = publishGateRefusal(value)
    if (missing !== undefined) {
      setResult({ kind: 'invalid', field: missing.field, message: missing.message })
      focusInvalidField(missing.field)
      return
    }
    setPending(true)
    setResult(undefined)
    try {
      const next = await onSave(stripOwnerAccessPathDraftIdentity(value))
      setResult(next)
      if (next.kind === 'saved') {
        setValue(next.value)
        setDirty(false)
        if (draftKey !== undefined) clearStoredOfferingDraft(draftKey)
      } else if (next.kind === 'revision_conflict') {
        firstFieldRef.current?.focus()
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="grid gap-6" onSubmit={(event) => void submit(event)} noValidate>
      {result === undefined ? null : (
        <Alert variant={result.kind === 'invalid' || result.kind === 'refused' ? 'destructive' : 'default'}>
          <AlertTitle>{result.kind === 'saved' ? 'Service saved' : result.kind === 'revision_conflict' ? 'This service changed elsewhere' : 'Service needs attention'}</AlertTitle>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}
      <span id={liveRegionId} className="sr-only" role="status" aria-live="polite">
        {pending ? 'Saving service' : result?.message ?? ''}
      </span>
      <ol className="grid list-none gap-2 p-0 sm:grid-cols-3" aria-label="Service setup">
        <EditorStep icon={<FilePenLineIcon aria-hidden="true" />} label="Describe it" detail="What customers recognise" active />
        <EditorStep icon={<Link2Icon aria-hidden="true" />} label="Add ways to begin" detail="Phone, website, or assistant" active={value.accessPaths.length > 0} />
        <EditorStep icon={value.status === 'published' ? <CheckCircle2Icon aria-hidden="true" /> : <CircleDashedIcon aria-hidden="true" />} label="Publish" detail={value.status === 'published' ? 'Visible on your page' : 'Choose when it goes live'} active={value.status === 'published'} />
      </ol>
      {seed === undefined ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" disabled={editorDisabled} onClick={() => update(seed.value)}>
            Start from {seed.label}
          </Button>
          <p className="text-sm text-muted-foreground">Fills the details below. You can change every field.</p>
        </div>
      )}
      <Card className="grid gap-5 p-5">
        <div className="grid gap-1">
          <p className="block text-sm font-semibold text-muted-foreground">1 · THE SERVICE</p>
          <h2 className="text-xl font-semibold text-foreground">Service details</h2>
          <p className="block max-w-2xl text-muted-foreground">Describe the Market Operation or offering you publish—not your internal team or process.</p>
        </div>
        <FieldGroup className="gap-4">
          <TextInput label="Name" value={value.name} onChange={(name) => update({ name })} disabled={editorDisabled} inputRef={firstFieldRef} {...(invalidField === 'name' && invalidMessage !== undefined ? { error: invalidMessage } : {})} />
          <TextInput label="Category" value={value.category} onChange={(category) => update({ category })} disabled={editorDisabled} inputRef={categoryFieldRef} {...(invalidField === 'category' && invalidMessage !== undefined ? { error: invalidMessage } : {})} />
          <TextAreaInput label="Summary" value={value.summary} onChange={(summary) => update({ summary })} disabled={editorDisabled} inputRef={summaryFieldRef} {...(invalidField === 'summary' && invalidMessage !== undefined ? { error: invalidMessage } : {})} />
          <TextInput label="Service area" value={value.serviceAreaSummary} onChange={(serviceAreaSummary) => update({ serviceAreaSummary })} disabled={editorDisabled} optional />
          <TextInput label="Availability" value={value.availabilitySummary} onChange={(availabilitySummary) => update({ availabilitySummary })} disabled={editorDisabled} optional />
          <TextInput label="Pricing" value={value.pricingSummary} onChange={(pricingSummary) => update({ pricingSummary })} disabled={editorDisabled} optional />
          <div className="grid gap-4 rounded-lg border border-border p-4">
            <div className="grid gap-1">
              <p className="font-semibold text-foreground">Price customers can compare</p>
              <p className="block text-sm text-muted-foreground">Optional, and separate from the note above. Choose a supported currency so people and assistants can compare it. Your note is never read to fill this in, and this never rewrites your note.</p>
            </div>
            <Field label="Currency" inputID="offering-price-currency" description="Choose the currency for this exact amount.">
              <Select value={priceDraft.currency} disabled={editorDisabled} onValueChange={(chosen) => updatePrice({ currency: isSupportedOfferingCurrency(chosen) ? chosen : DEFAULT_OFFERING_PRICE_CURRENCY })}>
                <SelectTrigger id="offering-price-currency" className="min-h-11 w-full"><SelectValue placeholder="Choose one" /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {SUPPORTED_OFFERING_CURRENCIES.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field label="Price type" inputID="offering-price-kind" description="Leave unpublished to keep only the note above.">
              <Select value={priceDraft.kind === '' ? unsetOptionValue : priceDraft.kind} disabled={editorDisabled} onValueChange={(chosen) => updatePrice({ kind: OfferingPriceKindValues.find((kind) => kind === chosen) ?? '' })}>
                <SelectTrigger id="offering-price-kind" className="min-h-11 w-full"><SelectValue placeholder="Choose one" /></SelectTrigger>
                <SelectContent><SelectGroup>
                  <SelectItem value={unsetOptionValue}>Not published</SelectItem>
                  <SelectItem value="fixed">Fixed price</SelectItem>
                  <SelectItem value="from">From</SelectItem>
                  <SelectItem value="range">Range</SelectItem>
                  <SelectItem value="quote_only">Quoted on request</SelectItem>
                </SelectGroup></SelectContent>
              </Select>
            </Field>
            {priceDraft.kind === '' ? null : (
              <>
                {priceDraft.kind === 'quote_only' ? null : (
                  <TextInput label="Amount" value={priceDraft.amount} onChange={(amount) => updatePrice({ amount })} disabled={editorDisabled} inputMode="decimal" description={priceDraft.kind === 'range' ? 'Lowest price, in dollars.' : 'In dollars.'} />
                )}
                {priceDraft.kind === 'range' ? (
                  <TextInput label="Maximum amount" value={priceDraft.maximumAmount} onChange={(maximumAmount) => updatePrice({ maximumAmount })} disabled={editorDisabled} inputMode="decimal" description="Highest price, in dollars." />
                ) : null}
                <Field label="Charged per" inputID="offering-price-unit" description="Optional">
                  <Select value={priceDraft.unit === '' ? unsetOptionValue : priceDraft.unit} disabled={editorDisabled} onValueChange={(chosen) => updatePrice({ unit: OfferingPriceUnitValues.find((unit) => unit === chosen) ?? '' })}>
                    <SelectTrigger id="offering-price-unit" className="min-h-11 w-full"><SelectValue placeholder="Choose one" /></SelectTrigger>
                    <SelectContent><SelectGroup>
                      <SelectItem value={unsetOptionValue}>Not per unit</SelectItem>
                      <SelectItem value="call">Call</SelectItem>
                      <SelectItem value="job">Job</SelectItem>
                      <SelectItem value="hour">Hour</SelectItem>
                      <SelectItem value="visit">Visit</SelectItem>
                      <SelectItem value="item">Item</SelectItem>
                      <SelectItem value="day">Day</SelectItem>
                      <SelectItem value="week">Week</SelectItem>
                      <SelectItem value="month">Month</SelectItem>
                    </SelectGroup></SelectContent>
                  </Select>
                </Field>
                <Field label="Tax" inputID="offering-price-tax">
                  <Select value={priceDraft.taxTreatment} disabled={editorDisabled} onValueChange={(chosen) => updatePrice({ taxTreatment: OfferingPriceTaxTreatmentValues.find((treatment) => treatment === chosen) ?? 'unstated' })}>
                    <SelectTrigger id="offering-price-tax" className="min-h-11 w-full"><SelectValue placeholder="Choose one" /></SelectTrigger>
                    <SelectContent><SelectGroup>
                      <SelectItem value="inclusive">Includes tax</SelectItem>
                      <SelectItem value="exclusive">Excludes tax</SelectItem>
                      <SelectItem value="unstated">Not stated</SelectItem>
                    </SelectGroup></SelectContent>
                  </Select>
                </Field>
              </>
            )}
          </div>
          <Field label="Public state" inputID="offering-status" description="Draft stays private. Paused and retired services are removed from the public page.">
            <Select value={value.status} disabled={editorDisabled} onValueChange={(status) => update({ status: toStatus(status) })}>
              <SelectTrigger id="offering-status" className="min-h-11 w-full"><SelectValue placeholder="Choose one" /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="retired">Retired</SelectItem>
              </SelectGroup></SelectContent>
            </Select>
          </Field>
        </FieldGroup>
      </Card>

      <OwnerAccessPathsEditor paths={value.accessPaths} disabled={editorDisabled} onChange={(accessPaths) => update({ accessPaths })} />

      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-canvas/95 py-4 backdrop-blur sm:flex-row sm:justify-end">
        <Button asChild variant="secondary" className="min-h-11">
          <a href="/owner/offerings">Back to services</a>
        </Button>
        <Button type="submit" variant="default" disabled={pending || !dirty} aria-busy={pending} className="min-h-11">
          {retryingPartialSave ? 'Retry save' : value.status === 'published' ? 'Publish service' : 'Save draft'}
        </Button>
      </div>
    </form>
  )
}

function OwnerAccessPathsEditor({ paths, disabled, onChange }: { paths: readonly OwnerAccessPathEditorValue[]; disabled: boolean; onChange: (paths: readonly OwnerAccessPathEditorValue[]) => void }) {
  const [selectedKind, setSelectedKind] = useState<'phone' | 'website' | 'external_operation'>('phone')
  const [technicalExpanded, setTechnicalExpanded] = useState(false)
  const [draftDetail, setDraftDetail] = useState('')
  const [endpoint, setEndpoint] = useState(emptyOwnerEndpointDraft)
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [websiteUrlError, setWebsiteUrlError] = useState<string | undefined>()

  return (
    <Card className="grid gap-5 p-5">
      <div className="grid gap-1">
        <p className="block text-sm font-semibold text-muted-foreground">2 · WAYS TO BEGIN</p>
        <h2 className="text-xl font-semibold text-foreground">How customers can start</h2>
        <p className="block max-w-2xl text-muted-foreground">Give customers and assistants a clear next move. Each option stands on its own.</p>
      </div>
      {paths.length === 0 ? <p className="text-muted-foreground">Add a phone, website, or message route.</p> : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {paths.map((path) => (
            <li key={path.accessPathRef ?? path.localDraftKey} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="font-semibold text-foreground">{pathLabel(path.descriptor)}</p>
                <p className="text-sm text-muted-foreground">{path.descriptor.kind === 'human_request' ? path.descriptor.disclosure : path.descriptor.summary}</p>
              </div>
              <Button type="button" variant="secondary" size="sm" disabled={disabled || path.status === 'withdrawn'} onClick={() => onChange(paths.map((item) => item === path ? { ...item, status: 'withdrawn' } : item))}>Withdraw</Button>
            </li>
          ))}
        </ul>
      )}
      <FieldGroup className="gap-4 rounded-lg border border-border p-4">
        <Field label="Add a contact route" inputID="access-path-kind">
          <Select value={selectedKind} disabled={disabled} onValueChange={(kind) => { setSelectedKind(toAccessKind(kind)); setTechnicalExpanded(false) }}>
            <SelectTrigger id="access-path-kind" className="min-h-11 w-full"><SelectValue placeholder="Choose one" /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="phone">Call</SelectItem>
              <SelectItem value="website">Website</SelectItem>
              <SelectItem value="external_operation">Assistant request</SelectItem>
            </SelectGroup></SelectContent>
          </Select>
        </Field>
        <TextAreaInput label={selectedKind === 'external_operation' ? 'What this request does' : 'Instructions for customers'} value={draftDetail} onChange={setDraftDetail} disabled={disabled} />
        {selectedKind === 'website' ? (
          <TextInput
            label="Website URL"
            value={websiteUrl}
            onChange={(next) => { setWebsiteUrl(next); setWebsiteUrlError(undefined) }}
            disabled={disabled}
            inputMode="url"
            ariaInvalid={websiteUrlError !== undefined}
            {...(websiteUrlError === undefined ? {} : { error: websiteUrlError })}
          />
        ) : null}
        {selectedKind === 'external_operation' ? (
          <Collapsible open={technicalExpanded} onOpenChange={setTechnicalExpanded} className="grid gap-3">
            <CollapsibleTrigger asChild>
              <Button type="button" variant="link" className="h-auto min-h-11 justify-self-start px-0 font-semibold text-foreground underline">
                {technicalExpanded ? 'Hide request details' : 'Add request details'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <FieldGroup className="gap-4">
                <TextInput label="Request name" value={endpoint.name} onChange={(name) => setEndpoint((current) => ({ ...current, name }))} disabled={disabled} description="What an assistant should call this. Left blank, it publishes as “Assistant request”." />
                <TextInput label="Request URL" value={endpoint.url} onChange={(url) => setEndpoint((current) => ({ ...current, url }))} disabled={disabled} inputMode="url" />
                <Field label="Method" inputID="access-path-method" description="Optional">
                  <Select value={endpoint.method === '' ? unsetOptionValue : endpoint.method} disabled={disabled} onValueChange={(chosen) => setEndpoint((current) => ({ ...current, method: ownerEndpointMethods.find((method) => method === chosen) ?? '' }))}>
                    <SelectTrigger id="access-path-method" className="min-h-11 w-full"><SelectValue placeholder="Choose one" /></SelectTrigger>
                    <SelectContent><SelectGroup>
                      <SelectItem value={unsetOptionValue}>Not stated</SelectItem>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                      <SelectItem value="PATCH">PATCH</SelectItem>
                      <SelectItem value="DELETE">DELETE</SelectItem>
                    </SelectGroup></SelectContent>
                  </Select>
                </Field>
                <TextInput label="Instructions URL" value={endpoint.documentationUrl} onChange={(documentationUrl) => setEndpoint((current) => ({ ...current, documentationUrl }))} disabled={disabled} inputMode="url" optional />
                <Field label="Interface description" inputID="access-path-interface-format" description="Optional">
                  <Select value={endpoint.interfaceFormat === '' ? unsetOptionValue : endpoint.interfaceFormat} disabled={disabled} onValueChange={(chosen) => setEndpoint((current) => ({ ...current, interfaceFormat: ownerInterfaceFormats.find((format) => format === chosen) ?? '' }))}>
                    <SelectTrigger id="access-path-interface-format" className="min-h-11 w-full"><SelectValue placeholder="Choose one" /></SelectTrigger>
                    <SelectContent><SelectGroup>
                      <SelectItem value={unsetOptionValue}>Not stated</SelectItem>
                      <SelectItem value="OpenAPI">OpenAPI</SelectItem>
                      <SelectItem value="JSON Schema">JSON Schema</SelectItem>
                      <SelectItem value="MCP">MCP</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectGroup></SelectContent>
                  </Select>
                </Field>
                {endpoint.interfaceFormat === '' ? null : (
                  <TextInput label="Interface description URL" value={endpoint.interfaceUrl} onChange={(interfaceUrl) => setEndpoint((current) => ({ ...current, interfaceUrl }))} disabled={disabled} inputMode="url" optional />
                )}
                <TextInput label="Authentication" value={endpoint.authenticationSummary} onChange={(authenticationSummary) => setEndpoint((current) => ({ ...current, authenticationSummary }))} disabled={disabled} description="Optional. Explain how a caller signs in, in your own words." />
                <TextInput label="Request price note" value={endpoint.pricingSummary} onChange={(pricingSummary) => setEndpoint((current) => ({ ...current, pricingSummary }))} disabled={disabled} description="Optional. Published exactly as written." />
              </FieldGroup>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || draftDetail.trim().length === 0 || (selectedKind === 'external_operation' && endpoint.url.trim().length === 0) || (selectedKind === 'website' && websiteUrl.trim().length === 0)}
          onClick={() => {
            if (selectedKind === 'website' && !isHttpsUrl(websiteUrl)) {
              setWebsiteUrlError('Enter a full HTTPS website address, such as https://example.com/start.')
              return
            }
            const descriptor: OfferingAccessPathDescriptor = selectedKind === 'external_operation'
              ? externalOperationDescriptor(endpoint, draftDetail.trim())
              : { kind: 'human_request', channel: selectedKind, disclosure: draftDetail.trim(), ...(selectedKind === 'website' ? { url: websiteUrl.trim() } : {}) }
            onChange([...paths, { localDraftKey: createPrefixedRandomId('access-path-draft:'), status: 'draft', descriptor }])
            setDraftDetail('')
            setEndpoint(emptyOwnerEndpointDraft)
            setWebsiteUrl('')
            setWebsiteUrlError(undefined)
            setTechnicalExpanded(false)
          }}
        >
          Add this way
        </Button>
      </FieldGroup>
    </Card>
  )
}

function OwnerSummaryStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-lg border border-border bg-muted/40 p-3 text-center">
      <dd className="m-0 text-2xl font-semibold tabular-nums text-foreground">{value}</dd>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
    </div>
  )
}

function EditorStep({ icon, label, detail, active }: { icon: ReactNode; label: string; detail: string; active: boolean }) {
  return (
    <li className={cn('flex min-h-16 items-center gap-3 rounded-lg border p-3', active ? 'border-ring bg-muted/60' : 'border-border bg-card')}>
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', active ? 'bg-brand text-on-brand' : 'bg-muted text-muted-foreground')}>{icon}</span>
      <span className="grid min-w-0 gap-0.5">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </span>
    </li>
  )
}
function Field({
  label,
  inputID,
  description,
  error,
  invalid = false,
  children,
}: {
  label: string
  inputID: string
  description?: string
  error?: string
  invalid?: boolean
  children: ReactNode
}) {
  const errorID = `${inputID}-error`
  return (
    <UiField {...(invalid ? { 'data-invalid': true } : {})}>
      <FieldLabel htmlFor={inputID}>{label}</FieldLabel>
      {children}
      {description === undefined ? null : <FieldDescription>{description}</FieldDescription>}
      {error === undefined ? null : <FieldError id={errorID}>{error}</FieldError>}
    </UiField>
  )
}

function TextInput({
  label,
  value,
  onChange,
  disabled,
  optional = false,
  description,
  inputRef,
  inputMode,
  ariaInvalid,
  describedBy,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  optional?: boolean
  description?: string
  inputRef?: Ref<HTMLInputElement>
  inputMode?: 'url' | 'decimal'
  ariaInvalid?: boolean
  describedBy?: string
  error?: string
}) {
  const id = useId()
  const hint = description ?? (optional ? 'Optional' : undefined)
  const invalid = ariaInvalid === true || error !== undefined
  const describedByValue = [describedBy, error === undefined ? undefined : `${id}-error`]
    .filter((value): value is string => value !== undefined)
    .join(' ')
  return (
    <Field label={label} inputID={id} {...(hint === undefined ? {} : { description: hint })} {...(error === undefined ? {} : { error })} {...(invalid ? { invalid: true } : {})}>
      <Input
        ref={inputRef}
        id={id}
        aria-label={label}
        value={value}
        disabled={disabled}
        {...(inputMode === undefined ? {} : { inputMode })}
        {...(invalid ? { 'aria-invalid': true } : {})}
        {...(describedByValue.length === 0 ? {} : { 'aria-describedby': describedByValue })}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="min-h-11 bg-card"
      />
    </Field>
  )
}

function TextAreaInput({
  label,
  value,
  onChange,
  disabled,
  inputRef,
  ariaInvalid,
  describedBy,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  inputRef?: Ref<HTMLTextAreaElement>
  ariaInvalid?: boolean
  describedBy?: string
  error?: string
}) {
  const id = useId()
  const invalid = ariaInvalid === true || error !== undefined
  const describedByValue = [describedBy, error === undefined ? undefined : `${id}-error`]
    .filter((value): value is string => value !== undefined)
    .join(' ')
  return (
    <Field label={label} inputID={id} {...(error === undefined ? {} : { error })} {...(invalid ? { invalid: true } : {})}>
      <Textarea
        ref={inputRef}
        id={id}
        aria-label={label}
        value={value}
        disabled={disabled}
        {...(invalid ? { 'aria-invalid': true } : {})}
        {...(describedByValue.length === 0 ? {} : { 'aria-describedby': describedByValue })}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="min-h-28 bg-card"
      />
    </Field>
  )
}

function statusLabel(status: BusinessOfferingStatus) { return status[0]?.toUpperCase() + status.slice(1) }
function toStatus(value: string): BusinessOfferingStatus { return ['draft', 'published', 'paused', 'retired'].includes(value) ? value as BusinessOfferingStatus : 'draft' }
function toAccessKind(value: string): 'phone' | 'website' | 'external_operation' { return ['phone', 'website', 'external_operation'].includes(value) ? value as 'phone' | 'website' | 'external_operation' : 'phone' }
function pathLabel(descriptor: OfferingAccessPathDescriptor) { return descriptor.kind === 'external_operation' ? descriptor.name : descriptor.channel === 'phone' ? 'Call' : 'Website' }

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * What the owner typed into the price group. Amounts stay as entered dollar
 * text so a half-typed figure survives a re-render; the group only becomes a
 * comparable price at the editor boundary. Nothing here is ever read from, or
 * written back to, the free-text pricing note beside it.
 */
type OwnerOfferingPriceDraft = Readonly<{
  kind: OfferingPriceKind | ''
  currency: string
  amount: string
  maximumAmount: string
  unit: OfferingPriceUnit | ''
  taxTreatment: OfferingPriceTaxTreatment
}>

/** What the owner typed about an external operation before it is added. */
type OwnerEndpointDraft = Readonly<{
  name: string
  url: string
  method: string
  documentationUrl: string
  interfaceFormat: string
  interfaceUrl: string
  authenticationSummary: string
  pricingSummary: string
}>

/** The one select value that means "the owner has not chosen". */
const unsetOptionValue = 'none'

const emptyOwnerOfferingPriceDraft: OwnerOfferingPriceDraft = { kind: '', currency: DEFAULT_OFFERING_PRICE_CURRENCY, amount: '', maximumAmount: '', unit: '', taxTreatment: 'unstated' }
const emptyOwnerEndpointDraft: OwnerEndpointDraft = { name: '', url: '', method: '', documentationUrl: '', interfaceFormat: '', interfaceUrl: '', authenticationSummary: '', pricingSummary: '' }

const ownerEndpointMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
const ownerInterfaceFormats = ['OpenAPI', 'JSON Schema', 'MCP', 'Other'] as const

function toOwnerPriceDraft(price: OfferingPrice | undefined): OwnerOfferingPriceDraft {
  if (price === undefined) return emptyOwnerOfferingPriceDraft
  const amount = price.kind === 'range' ? price.minimum : price.kind === 'quote_only' ? undefined : price.amount
  const maximumAmount = price.kind === 'range' ? price.maximum : undefined
  return {
    kind: price.kind,
    currency: price.kind === 'quote_only' ? price.currency : amount?.currency ?? DEFAULT_OFFERING_PRICE_CURRENCY,
    amount: amount === undefined ? '' : formatExactAmount(amount) ?? '',
    maximumAmount: maximumAmount === undefined ? '' : formatExactAmount(maximumAmount) ?? '',
    unit: price.unit ?? '',
    taxTreatment: price.taxTreatment,
  }
}

/** Decimal text in, exact minor units out; absence is preserved until publish. */
function offeringPriceInputFromDraft(draft: OwnerOfferingPriceDraft): OfferingPriceInput | undefined {
  if (draft.kind === '') return undefined
  const currency = draft.currency.trim().toUpperCase()
  if (!isSupportedOfferingCurrency(currency)) return undefined
  const shared = {
    kind: draft.kind,
    taxTreatment: draft.taxTreatment,
    ...(draft.unit === '' ? {} : { unit: draft.unit }),
  }
  if (draft.kind === 'quote_only') return { ...shared, currency }
  if (draft.kind === 'range') {
    const minimum = parseDecimalExactAmount(currency, draft.amount, 2)
    const maximum = parseDecimalExactAmount(currency, draft.maximumAmount, 2)
    return {
      ...shared,
      ...(minimum === undefined ? {} : { minimum }),
      ...(maximum === undefined ? {} : { maximum }),
    }
  }
  const amount = parseDecimalExactAmount(currency, draft.amount, 2)
  return { ...shared, ...(amount === undefined ? {} : { amount }) }
}

/**
 * Everything the owner published about the endpoint. An untouched field is
 * absent rather than an empty string, so a caller can tell "not stated" apart
 * from "stated as nothing".
 */
function externalOperationDescriptor(draft: OwnerEndpointDraft, summary: string): OfferingAccessPathDescriptor {
  const name = draft.name.trim()
  const documentationUrl = draft.documentationUrl.trim()
  const interfaceUrl = draft.interfaceUrl.trim()
  const authenticationSummary = draft.authenticationSummary.trim()
  const pricingSummary = draft.pricingSummary.trim()
  return {
    kind: 'external_operation',
    name: name.length === 0 ? 'Assistant request' : name,
    summary,
    url: draft.url.trim(),
    ...(draft.method === '' ? {} : { method: draft.method }),
    ...(documentationUrl.length === 0 ? {} : { documentationUrl }),
    ...(draft.interfaceFormat === '' ? {} : { interfaceDescription: { format: draft.interfaceFormat, ...(interfaceUrl.length === 0 ? {} : { url: interfaceUrl }) } }),
    ...(authenticationSummary.length === 0 ? {} : { authenticationSummary }),
    ...(pricingSummary.length === 0 ? {} : { pricingSummary }),
    provenance: 'business_declared',
  }
}
