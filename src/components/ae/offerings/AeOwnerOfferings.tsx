import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Field } from '@astryxdesign/core/Field'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Heading, Text } from '@astryxdesign/core/Text'
import {
  BotIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  FilePenLineIcon,
  Link2Icon,
  StoreIcon,
} from 'lucide-react'

import { AeSelectField } from '@/components/ae/forms/AeSelectField'
import type {
  BusinessOfferingProjection,
  BusinessOfferingStatus,
  OfferingAccessPathDescriptor,
  OfferingAccessPathStatus,
  PublicAccessPath,
  PublicOfferingSupplyProjection,
} from '@/modules/catalog/public'
import type { OfferingRef } from '@/modules/common/ids'

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
  status: BusinessOfferingStatus
  accessPaths: readonly OwnerAccessPathEditorValue[]
}>

export type OwnerAccessPathEditorValue = Readonly<{
  accessPathRef?: string
  status: OfferingAccessPathStatus
  descriptor: OfferingAccessPathDescriptor
}>

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
  projectionState?: 'current' | 'projection_pending' | 'migration_mismatch'
  onRetryProjection?: () => void
}) {
  const publishedCount = offerings.filter((item) => item.status === 'published').length
  const reachableCount = offerings.filter((item) => item.accessPathCount > 0).length
  const supportedCount = offerings.filter((item) => item.support?.routeable === true).length

  return (
    <div className="grid gap-6">
      {projectionState === 'current' ? null : (
        <Banner
          status="warning"
          title={projectionState === 'projection_pending' ? 'Public details are still updating' : 'The public version has not changed'}
          description={projectionState === 'projection_pending'
            ? 'Your changes are saved. The last safe public version remains visible until publishing catches up.'
            : 'AE found a difference during migration, so the earlier public version remains visible.'}
          {...(onRetryProjection === undefined ? {} : { endContent: <Button type="button" label="Retry publishing" variant="secondary" onClick={onRetryProjection} /> })}
        />
      )}
      <Card padding={5} className="overflow-hidden border border-border bg-card shadow-low">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)] lg:items-center">
          <div className="grid gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-accent text-on-accent">
              <StoreIcon className="size-5" aria-hidden="true" />
            </div>
            <div className="grid gap-1">
              <Text type="supporting" weight="semibold" color="secondary" display="block">YOUR BUSINESS PAGE</Text>
              <Heading level={2}>{offerings.length === 0 ? 'Show people what you do' : 'Your public catalogue at a glance'}</Heading>
              <Text color="secondary" display="block" className="max-w-2xl">
                Each Offering explains one useful thing your business provides. Publish the facts first, then add the easiest ways to begin.
              </Text>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2" aria-label="Offering summary">
            <OwnerSummaryStat value={publishedCount} label="Published" />
            <OwnerSummaryStat value={reachableCount} label="Reachable" />
            <OwnerSummaryStat value={supportedCount} label="AE actions" />
          </dl>
        </div>
      </Card>
      {offerings.length === 0 ? (
        <Card padding={6} className="grid gap-5 border border-dashed border-border-emphasized bg-muted/30 md:grid-cols-[auto_1fr_auto] md:items-center">
          <div className="flex size-12 items-center justify-center rounded-full border border-border bg-card shadow-low">
            <FilePenLineIcon className="size-5 text-accent" aria-hidden="true" />
          </div>
          <div className="grid gap-1">
            <Heading level={2}>Add your first Offering</Heading>
            <Text color="secondary" display="block" className="max-w-2xl">
              Start with one clear service, product, dataset, or task. Contact details and endpoints can come later.
            </Text>
          </div>
          <Button href="/owner/offerings/new" label="Add an Offering" variant="primary" />
        </Card>
      ) : (
        <div className="grid gap-3">
          {offerings.map((item) => (
            <Card key={item.offering.offeringRef} padding={5} className="group grid gap-4 border border-border transition-[border-color,box-shadow,transform] duration-base ease-standard motion-reduce:transition-none sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center hover:border-border-emphasized hover:shadow-med">
              <div className="grid min-w-0 gap-3">
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <Heading level={2}>{item.offering.name}</Heading>
                  <Badge label={statusLabel(item.status)} variant="neutral" />
                </HStack>
                <Text color="secondary" display="block" className="line-clamp-2">{item.offering.summary}</Text>
                <div className="flex flex-wrap gap-2 text-sm text-secondary">
                  <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-muted px-3">
                    <Link2Icon className="size-3.5" aria-hidden="true" />
                    {item.accessPathCount === 0 ? 'Add a way to begin' : `${item.accessPathCount} ${item.accessPathCount === 1 ? 'way' : 'ways'} to begin`}
                  </span>
                  {item.support?.routeable === true ? (
                    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border-emphasized bg-muted px-3 font-medium text-primary">
                      <BotIcon className="size-3.5" aria-hidden="true" /> AE action available
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button href={`/owner/offerings/${encodeURIComponent(item.offering.offeringRef)}?preview=true`} label="Preview" variant="secondary" size="sm" className="min-h-11" />
                <Button href={`/owner/offerings/${encodeURIComponent(item.offering.offeringRef)}`} label="Edit" variant="primary" size="sm" className="min-h-11" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export const OWNER_OFFERING_DRAFT_STORAGE_KEY = 'ae.ownerOfferingDraft.v1'

export function readStoredOfferingDraft(businessId: string): OwnerOfferingEditorValue | undefined {
  if (typeof window === 'undefined') return undefined
  const raw = window.sessionStorage.getItem(`${OWNER_OFFERING_DRAFT_STORAGE_KEY}:${businessId}`)
  if (raw === null) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    return { ...emptyOwnerOfferingEditorValue, ...parsed }
  } catch {
    return undefined
  }
}

export function writeStoredOfferingDraft(businessId: string, value: OwnerOfferingEditorValue): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(`${OWNER_OFFERING_DRAFT_STORAGE_KEY}:${businessId}`, JSON.stringify(value))
}

export function clearStoredOfferingDraft(businessId: string): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(`${OWNER_OFFERING_DRAFT_STORAGE_KEY}:${businessId}`)
}

/**
 * The single publish gate, shared by the editor and the save path. A draft may
 * park with any subset of fields; publishing needs the facts a customer reads
 * first. Returns the field to name and focus, or undefined to proceed.
 */
export function publishGateRefusal(
  value: OwnerOfferingEditorValue,
): Readonly<{ field: string; message: string }> | undefined {
  if (value.status !== 'published') return undefined
  if (value.name.trim().length === 0) return { field: 'name', message: 'Add a name before publishing this Offering.' }
  if (value.category.trim().length === 0) return { field: 'category', message: 'Add a category before publishing this Offering.' }
  if (value.summary.trim().length === 0) return { field: 'summary', message: 'Add a summary before publishing this Offering.' }
  return undefined
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
  const [value, setValue] = useState(initialValue)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<OwnerOfferingSaveResult | undefined>()
  const [dirty, setDirty] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const liveRegionId = useId()
  const retryingPartialSave = result?.kind === 'refused' && result.retry !== undefined
  const editorDisabled = pending || retryingPartialSave

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    if (draftKey === undefined || draftRestored) return
    setDraftRestored(true)
    const stored = readStoredOfferingDraft(draftKey)
    if (stored === undefined) return
    // A restored draft never overwrites the field the owner is typing in.
    const focusedName = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.offeringField : undefined
    setValue((current) => (focusedName === undefined ? stored : { ...stored, [focusedName]: current[focusedName as keyof OwnerOfferingEditorValue] }))
  }, [draftKey, draftRestored])

  useEffect(() => {
    if (draftKey === undefined || !dirty) return
    writeStoredOfferingDraft(draftKey, value)
  }, [draftKey, dirty, value])

  function update(patch: Partial<OwnerOfferingEditorValue>) {
    setDirty(true)
    setValue((current) => ({ ...current, ...patch }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    // Requiredness belongs to the publish gate, not to saving a draft.
    const missing = publishGateRefusal(value)
    if (missing !== undefined) {
      setResult({ kind: 'invalid', field: missing.field, message: missing.message })
      firstFieldRef.current?.focus()
      return
    }
    setPending(true)
    setResult(undefined)
    try {
      const next = await onSave(value)
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
        <Banner
          status={result.kind === 'saved' ? 'success' : result.kind === 'revision_conflict' ? 'warning' : 'error'}
          title={result.kind === 'saved' ? 'Offering saved' : result.kind === 'revision_conflict' ? 'This Offering changed elsewhere' : 'Offering needs attention'}
          description={result.message}
        />
      )}
      <span id={liveRegionId} className="sr-only" role="status" aria-live="polite">
        {pending ? 'Saving Offering' : result?.message ?? ''}
      </span>
      <ol className="grid list-none gap-2 p-0 sm:grid-cols-3" aria-label="Offering setup">
        <EditorStep icon={<FilePenLineIcon aria-hidden="true" />} label="Describe it" detail="What customers recognise" active />
        <EditorStep icon={<Link2Icon aria-hidden="true" />} label="Add ways to begin" detail="Phone, web, AE, or API" active={value.accessPaths.length > 0} />
        <EditorStep icon={value.status === 'published' ? <CheckCircle2Icon aria-hidden="true" /> : <CircleDashedIcon aria-hidden="true" />} label="Publish" detail={value.status === 'published' ? 'Visible on your page' : 'Choose when it goes live'} active={value.status === 'published'} />
      </ol>
      {seed === undefined ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            label={`Start from ${seed.label}`}
            variant="secondary"
            isDisabled={editorDisabled}
            onClick={() => update(seed.value)}
          />
          <Text type="supporting" color="secondary">Fills the details below. You can change every field.</Text>
        </div>
      )}
      <Card padding={5} className="grid gap-5">
        <div className="grid gap-1">
          <Text type="supporting" weight="semibold" color="secondary" display="block">1 · THE OFFERING</Text>
          <Heading level={2}>Offering details</Heading>
          <Text color="secondary" display="block" className="max-w-2xl">Describe the outcome or useful thing—not your internal team or process.</Text>
        </div>
        <FormLayout>
          <TextInput label="Name" value={value.name} onChange={(name) => update({ name })} disabled={editorDisabled} inputRef={firstFieldRef} />
          <TextInput label="Category" value={value.category} onChange={(category) => update({ category })} disabled={editorDisabled} />
          <TextAreaInput label="Summary" value={value.summary} onChange={(summary) => update({ summary })} disabled={editorDisabled} />
          <TextInput label="Service area" value={value.serviceAreaSummary} onChange={(serviceAreaSummary) => update({ serviceAreaSummary })} disabled={editorDisabled} optional />
          <TextInput label="Availability" value={value.availabilitySummary} onChange={(availabilitySummary) => update({ availabilitySummary })} disabled={editorDisabled} optional />
          <TextInput label="Pricing" value={value.pricingSummary} onChange={(pricingSummary) => update({ pricingSummary })} disabled={editorDisabled} optional />
          <Field label="Public state" inputID="offering-status" description="Draft stays private. Paused and retired Offerings are removed from the public page.">
            <AeSelectField id="offering-status" value={value.status} disabled={editorDisabled} onValueChange={(status) => update({ status: toStatus(status) })} options={[
              { value: 'draft', label: 'Draft' },
              { value: 'published', label: 'Published' },
              { value: 'paused', label: 'Paused' },
              { value: 'retired', label: 'Retired' },
            ]} />
          </Field>
        </FormLayout>
      </Card>

      <OwnerAccessPathsEditor paths={value.accessPaths} disabled={editorDisabled} onChange={(accessPaths) => update({ accessPaths })} />

      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-canvas/95 py-4 backdrop-blur sm:flex-row sm:justify-end">
        <Button href="/owner/offerings" label="Back to Offerings" variant="secondary" className="min-h-11" />
        <Button type="submit" label={retryingPartialSave ? 'Retry save' : value.status === 'published' ? 'Publish Offering' : 'Save draft'} variant="primary" isDisabled={pending || !dirty} isLoading={pending} className="min-h-11" />
      </div>
    </form>
  )
}

function OwnerAccessPathsEditor({ paths, disabled, onChange }: { paths: readonly OwnerAccessPathEditorValue[]; disabled: boolean; onChange: (paths: readonly OwnerAccessPathEditorValue[]) => void }) {
  const [selectedKind, setSelectedKind] = useState<'phone' | 'website' | 'ae_inquiry' | 'external_operation'>('phone')
  const [technicalExpanded, setTechnicalExpanded] = useState(false)
  const technicalId = useId()
  const [draftDetail, setDraftDetail] = useState('')
  const [endpointUrl, setEndpointUrl] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [websiteUrlError, setWebsiteUrlError] = useState<string | undefined>()
  return (
    <Card padding={5} className="grid gap-5">
      <div className="grid gap-1">
        <Text type="supporting" weight="semibold" color="secondary" display="block">2 · WAYS TO BEGIN</Text>
        <Heading level={2}>Ways to get started</Heading>
        <Text color="secondary" display="block" className="max-w-2xl">Give customers and agents a clear next move. Each option stands on its own.</Text>
      </div>
      {paths.length === 0 ? <Text color="secondary">Add a way customers or agents can begin.</Text> : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {paths.map((path, index) => (
            <li key={path.accessPathRef ?? `${path.descriptor.kind}-${index}`} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div><Text weight="semibold" display="block">{pathLabel(path.descriptor)}</Text><Text type="supporting" color="secondary">{path.descriptor.kind === 'human_request' ? path.descriptor.disclosure : path.descriptor.summary}</Text></div>
              <Button type="button" label="Withdraw" variant="secondary" size="sm" isDisabled={disabled || path.status === 'withdrawn'} onClick={() => onChange(paths.map((item, itemIndex) => itemIndex === index ? { ...item, status: 'withdrawn' } : item))} />
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-4 rounded-lg border border-border p-4">
        <Field label="Add a way to get started" inputID="access-path-kind">
          <AeSelectField id="access-path-kind" value={selectedKind} disabled={disabled} onValueChange={(kind) => { setSelectedKind(toAccessKind(kind)); setTechnicalExpanded(false) }} options={[
            { value: 'phone', label: 'Call' }, { value: 'website', label: 'Website' }, { value: 'ae_inquiry', label: 'Ask through AE' }, { value: 'external_operation', label: 'API or agent endpoint' },
          ]} />
        </Field>
        <TextAreaInput label={selectedKind === 'external_operation' ? 'What this endpoint provides' : 'Published instructions'} value={draftDetail} onChange={setDraftDetail} disabled={disabled} />
        {selectedKind === 'website' ? (
          <div className="grid gap-1">
            <TextInput
              label="Website URL"
              value={websiteUrl}
              onChange={(next) => { setWebsiteUrl(next); setWebsiteUrlError(undefined) }}
              disabled={disabled}
              inputMode="url"
              ariaInvalid={websiteUrlError !== undefined}
              describedBy="offering-website-url-error"
            />
            {websiteUrlError === undefined ? null : <Text id="offering-website-url-error" type="supporting" color="secondary" role="alert">{websiteUrlError}</Text>}
          </div>
        ) : null}
        {selectedKind === 'external_operation' ? (
          <div className="grid gap-3">
            <button type="button" className="min-h-11 justify-self-start text-sm font-semibold underline underline-offset-4" aria-expanded={technicalExpanded} aria-controls={technicalId} onClick={() => setTechnicalExpanded((current) => !current)}>
              {technicalExpanded ? 'Hide endpoint details' : 'Add endpoint details'}
            </button>
            {technicalExpanded ? <div id={technicalId}><TextInput label="Endpoint URL" value={endpointUrl} onChange={setEndpointUrl} disabled={disabled} /></div> : null}
          </div>
        ) : null}
        <Button type="button" label="Add this way" variant="secondary" isDisabled={disabled || draftDetail.trim().length === 0 || (selectedKind === 'external_operation' && endpointUrl.trim().length === 0) || (selectedKind === 'website' && websiteUrl.trim().length === 0)} onClick={() => {
          if (selectedKind === 'website' && !isHttpsUrl(websiteUrl)) {
            setWebsiteUrlError('Enter a full HTTPS website address, such as https://example.com/start.')
            return
          }
          const descriptor: OfferingAccessPathDescriptor = selectedKind === 'external_operation'
            ? { kind: 'external_operation', name: 'API or agent endpoint', summary: draftDetail.trim(), url: endpointUrl.trim(), provenance: 'business_declared' }
            : { kind: 'human_request', channel: selectedKind, disclosure: draftDetail.trim(), ...(selectedKind === 'website' ? { url: websiteUrl.trim() } : {}) }
          onChange([...paths, { status: 'draft', descriptor }]); setDraftDetail(''); setEndpointUrl(''); setWebsiteUrl(''); setWebsiteUrlError(undefined); setTechnicalExpanded(false)
        }} />
      </div>
    </Card>
  )
}

function OwnerSummaryStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-lg border border-border bg-muted/40 p-3 text-center">
      <dd className="m-0 text-2xl font-semibold tabular-nums text-primary">{value}</dd>
      <dt className="text-xs font-medium text-secondary">{label}</dt>
    </div>
  )
}

function EditorStep({ icon, label, detail, active }: { icon: ReactNode; label: string; detail: string; active: boolean }) {
  return (
    <li className={`flex min-h-16 items-center gap-3 rounded-lg border p-3 ${active ? 'border-border-emphasized bg-muted/60' : 'border-border bg-card'}`}>
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${active ? 'bg-accent text-on-accent' : 'bg-muted text-secondary'}`}>{icon}</span>
      <span className="grid min-w-0 gap-0.5">
        <Text weight="semibold" color="primary" display="block">{label}</Text>
        <Text type="supporting" color="secondary" display="block">{detail}</Text>
      </span>
    </li>
  )
}

function TextInput({ label, value, onChange, disabled, optional = false, inputRef, inputMode, ariaInvalid, describedBy }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; optional?: boolean; inputRef?: Ref<HTMLInputElement>; inputMode?: 'url'; ariaInvalid?: boolean; describedBy?: string }) {
  const id = `offering-${label.toLowerCase().replaceAll(' ', '-')}`
  return <Field label={label} inputID={id} {...(optional ? { description: 'Optional' } : {})}><input ref={inputRef} id={id} aria-label={label} value={value} disabled={disabled} inputMode={inputMode} aria-invalid={ariaInvalid} aria-describedby={describedBy} onChange={(event) => onChange(event.currentTarget.value)} className="min-h-11 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-primary outline-none focus:border-primary disabled:opacity-50" /></Field>
}

function TextAreaInput({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  const id = `offering-${label.toLowerCase().replaceAll(' ', '-')}`
  return <Field label={label} inputID={id}><textarea id={id} aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} className="min-h-28 w-full resize-y rounded-md border border-border bg-card px-3 py-2 text-sm text-primary outline-none focus:border-primary disabled:opacity-50" /></Field>
}

function statusLabel(status: BusinessOfferingStatus) { return status[0]?.toUpperCase() + status.slice(1) }
function toStatus(value: string): BusinessOfferingStatus { return ['draft', 'published', 'paused', 'retired'].includes(value) ? value as BusinessOfferingStatus : 'draft' }
function toAccessKind(value: string): 'phone' | 'website' | 'ae_inquiry' | 'external_operation' { return ['phone', 'website', 'ae_inquiry', 'external_operation'].includes(value) ? value as 'phone' | 'website' | 'ae_inquiry' | 'external_operation' : 'phone' }
function pathLabel(descriptor: OfferingAccessPathDescriptor) { return descriptor.kind === 'external_operation' ? descriptor.name : descriptor.channel === 'phone' ? 'Call' : descriptor.channel === 'website' ? 'Website' : 'Ask through AE' }

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function toOwnerOfferingSummary(projection: PublicOfferingSupplyProjection, status: BusinessOfferingStatus = 'published'): OwnerOfferingSummary {
  return { offering: projection.offering, status, accessPathCount: projection.accessPaths.length, support: projection.support }
}

export function toOwnerEditorValue(projection: PublicOfferingSupplyProjection, status: BusinessOfferingStatus = 'published'): OwnerOfferingEditorValue {
  return {
    offeringRef: projection.offering.offeringRef,
    expectedRevision: projection.offering.revision,
    name: projection.offering.name,
    category: projection.offering.category,
    summary: projection.offering.summary,
    serviceAreaSummary: projection.offering.serviceAreaSummary ?? '',
    availabilitySummary: projection.offering.availabilitySummary ?? '',
    pricingSummary: projection.offering.pricingSummary ?? '',
    status,
    accessPaths: projection.accessPaths.map((path: PublicAccessPath) => ({ accessPathRef: path.accessPathRef, status: 'published', descriptor: path.descriptor })),
  }
}

export const emptyOwnerOfferingEditorValue: OwnerOfferingEditorValue = {
  expectedRevision: 0, name: '', category: '', summary: '', serviceAreaSummary: '', availabilitySummary: '', pricingSummary: '', status: 'draft', accessPaths: [],
}
