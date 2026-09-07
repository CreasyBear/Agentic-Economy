import { useRef, useState } from 'react'

import { AeInlineState } from '@/components/ae/feedback/AeInlineState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import type { ProviderConnectionOwnerProjection } from '@/modules/capability-supply/provider-connection'
import type {
  SupplyToolCandidate,
  SupplyMcpRemote,
  SupplySourceInput,
  SupplySourcePreview,
} from '@/modules/capability-supply/source-preview'
import type {
  PublishSupplyToolV2Input,
} from '@/modules/capability-supply/supply-publication-v2'
import type { SupplyPublishResult } from '@/modules/capability-supply/supply-actions'
import { parseDecimalExactAmount, rescaleExactAmount } from '@/modules/money/public'

type SourceKind = SupplySourceInput['kind']
type Environment = SupplySourceInput['environment']
type AttestationKey = keyof PublishSupplyToolV2Input['attestation']

export function AeSupplySourceNativeStart({
  businessRef,
  connections = [],
  initial,
  onPreview,
  onConnect,
  onSelectCandidate,
  onDraftSaved,
  onPublish,
}: Readonly<{
  businessRef: string
  connections?: readonly ProviderConnectionOwnerProjection[]
  initial?: Readonly<{
    source: SupplySourceInput
    preview?: Extract<SupplySourcePreview, { kind: 'ready' }>
    candidateRef: string
    connectionRef?: string
  }>
  onPreview: (source: SupplySourceInput, idempotencyKey: string) => Promise<SupplySourcePreview>
  onConnect: (input: Readonly<{
    businessId: string
    source: SupplySourceInput
    expectedSourceDigest: string
    candidateRef: string
    idempotencyKey: string
  }>) => Promise<SupplySourcePreview>
  onSelectCandidate: (input: Readonly<{
    businessRef: string
    source: SupplySourceInput
    sourceDigest: string
    sourceRevision: string
    candidate: Pick<SupplyToolCandidate, 'candidateRef' | 'sourceSelector' | 'title' | 'description'>
  }>) => Promise<Readonly<{ kind: 'saved' | 'replayed' }> | Readonly<{ kind: 'refused'; reason: string }>>
  onDraftSaved?: (candidateRef: string, connectionRef?: string) => Promise<void> | void
  onPublish: (input: PublishSupplyToolV2Input) => Promise<SupplyPublishResult>
}>) {
  const initialCandidate = initial?.preview?.candidates.find(({ candidateRef }) => candidateRef === initial.candidateRef)
  const [sourceKind, setSourceKind] = useState<SourceKind>(initial?.source.kind ?? 'openapi')
  const [environment, setEnvironment] = useState<Environment>(initial?.source.environment ?? 'sandbox')
  const [definitionUrl, setDefinitionUrl] = useState(initial?.source.kind === 'openapi' ? initial.source.definitionUrl : '')
  const [mcpLocator, setMcpLocator] = useState<'url' | 'registry'>(initial?.source.kind === 'mcp' && initial.source.registryName !== undefined ? 'registry' : 'url')
  const [serverUrl, setServerUrl] = useState(initial?.source.kind === 'mcp' ? initial.source.serverUrl ?? '' : '')
  const [registryName, setRegistryName] = useState(initial?.source.kind === 'mcp' ? initial.source.registryName ?? '' : '')
  const [pluginJson, setPluginJson] = useState(initial?.source.kind === 'agent_plugin' ? JSON.stringify(initial.source.pluginJson, null, 2) : '')
  const [mcpJson, setMcpJson] = useState(initial?.source.kind === 'agent_plugin' ? JSON.stringify(initial.source.mcpJson, null, 2) : '')
  const [selectedRemoteRef, setSelectedRemoteRef] = useState(initial?.source.kind === 'mcp' || initial?.source.kind === 'agent_plugin' ? initial.source.remoteRef ?? '' : '')
  const [resourceUrl, setResourceUrl] = useState(initial?.source.kind === 'x402' ? initial.source.resourceUrl : '')
  const [x402Method, setX402Method] = useState<'GET' | 'POST'>(initial?.source.kind === 'x402' ? initial.source.method : 'POST')
  const [preview, setPreview] = useState<Extract<SupplySourcePreview, { kind: 'ready' }> | undefined>(initial?.preview)
  const [remoteSelection, setRemoteSelection] = useState<Extract<SupplySourcePreview, { kind: 'remote_selection_required' }>>()
  const [selectedRef, setSelectedRef] = useState(initial?.candidateRef ?? '')
  const [name, setName] = useState(initialCandidate?.title ?? '')
  const [description, setDescription] = useState(initialCandidate?.description ?? '')
  const [category, setCategory] = useState('')
  const [serviceArea, setServiceArea] = useState('')
  const [availability, setAvailability] = useState('')
  const [pricingKind, setPricingKind] = useState<'free' | 'fixed_aud' | 'source_x402'>(initialCandidate?.x402 === undefined ? 'free' : 'source_x402')
  const [price, setPrice] = useState('')
  const [connectionRef, setConnectionRef] = useState(initial?.connectionRef ?? '')
  const [externalEffect, setExternalEffect] = useState(false)
  const [dataRelease, setDataRelease] = useState(false)
  const [financialExposure, setFinancialExposure] = useState(false)
  const [dataClassification, setDataClassification] = useState<'public' | 'personal' | 'sensitive'>('public')
  const [attestation, setAttestation] = useState<Record<AttestationKey, boolean>>({
    authorisedToPublish: false,
    informationAccurate: false,
    publishAfterSuccessfulValidation: false,
  })
  const [pending, setPending] = useState<'preview' | 'select' | 'connect' | 'publish'>()
  const [error, setError] = useState<string>()
  const [requiredAction, setRequiredAction] = useState<Extract<SupplySourcePreview, { kind: 'action_required' }>['requiredAction']>()
  const [success, setSuccess] = useState<string>()
  const idempotencyKey = useRef(`owner-supply:${crypto.randomUUID()}`)
  const previewIdempotencyKey = useRef(`owner-supply-preview:${crypto.randomUUID()}`)
  const connectionIdempotencyKey = useRef(`owner-supply-connection:${crypto.randomUUID()}`)
  const selected = preview?.candidates.find(({ candidateRef }) => candidateRef === selectedRef)
  const source = sourceInput({
    sourceKind,
    environment,
    definitionUrl,
    mcpLocator,
    serverUrl,
    registryName,
    pluginJson,
    mcpJson,
    remoteRef: selectedRemoteRef,
    resourceUrl,
    x402Method,
  })
  const requiredAdapterId = sourceKind === 'openapi'
    ? 'http-json:v1'
    : sourceKind === 'x402'
      ? 'x402-fetch:v2'
      : 'mcp-jsonrpc:v1'
  const eligibleConnections = selected === undefined
    ? []
    : connections.filter((connection) =>
        connection.available
        && connection.businessId === businessRef
        && connection.adapterId === requiredAdapterId)

  function changeSourceKind(next: string) {
    setSourceKind(next as SourceKind)
    setPreview(undefined)
    setRemoteSelection(undefined)
    setSelectedRemoteRef('')
    setSelectedRef('')
    setError(undefined)
    setRequiredAction(undefined)
    setSuccess(undefined)
  }

  async function findTools(remoteRefOverride?: string) {
    const currentSource = remoteRefOverride === undefined
      ? source
      : sourceInput({
          sourceKind, environment, definitionUrl, mcpLocator, serverUrl, registryName,
          pluginJson, mcpJson, remoteRef: remoteRefOverride, resourceUrl, x402Method,
        })
    if (currentSource === undefined) {
      setError(sourceInputError(sourceKind, mcpLocator))
      return
    }
    setPending('preview')
    setError(undefined)
    setSuccess(undefined)
    try {
      const result = await onPreview(currentSource, previewIdempotencyKey.current)
      if (result.kind === 'action_required') {
        setPreview(undefined)
        setRemoteSelection(undefined)
        setRequiredAction(result.requiredAction)
        return
      }
      if (result.kind === 'remote_selection_required') {
        setPreview(undefined)
        setRequiredAction(undefined)
        setRemoteSelection(result)
        setSelectedRemoteRef('')
        return
      }
      setRequiredAction(undefined)
      setRemoteSelection(undefined)
      setPreview(result)
      setSelectedRef('')
      if (result.candidates.length === 0) setError('No Tools were found in this source.')
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('AE could not inspect this source. Check the source and try again.')
    } finally {
      setPending(undefined)
    }
  }

  async function selectCandidate(candidate: SupplyToolCandidate) {
    if (source === undefined || preview === undefined || pending !== undefined) return
    setPending('select')
    setError(undefined)
    try {
      const saved = await onSelectCandidate({
        businessRef,
        source,
        sourceDigest: preview.sourceDigest,
        sourceRevision: preview.sourceRevision,
        candidate: {
          candidateRef: candidate.candidateRef,
          sourceSelector: candidate.sourceSelector,
          title: candidate.title,
          description: candidate.description,
        },
      })
      if (saved.kind === 'refused') {
        setError('AE could not save this selection. Find Tools again, then select the current source candidate.')
        return
      }
      setSelectedRef(candidate.candidateRef)
      setName(candidate.title)
      setDescription(candidate.description)
      setConnectionRef((current) => connections.some((connection) => (
        connection.connectionRef === current
        && connection.available
        && connection.businessId === businessRef
        && connection.adapterId === requiredAdapterId
      )) ? current : '')
      setPricingKind(candidate.x402 === undefined ? 'free' : 'source_x402')
      await onDraftSaved?.(candidate.candidateRef, connectionRef === '' ? undefined : connectionRef)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('AE could not save this selection. Find Tools again, then try again.')
    } finally {
      setPending(undefined)
    }
  }

  async function submit() {
    if (source === undefined || preview === undefined || selected === undefined) {
      setError('Select one supported Tool before submitting it.')
      return
    }
    if (category.trim() === '') {
      setError('Enter a category before submitting this Tool.')
      return
    }
    const pricing = pricingInput(pricingKind, price)
    if (pricing === undefined) {
      setError('Enter a valid AUD price, or choose Free.')
      return
    }
    if (selected.authentication.kind !== 'public' && connectionRef === '') {
      setError('Choose a connected source before submitting this Tool.')
      return
    }
    if (!Object.values(attestation).every(Boolean)) {
      setError('Confirm all three publication statements before submitting.')
      return
    }
    const dataEffectIndex = dataRelease ? 0 : -1
    const effects: PublishSupplyToolV2Input['consequences']['effects'] = [
      ...(dataRelease ? [{ class: 'data_release' as const, authority: 'explicit' as const, reversibility: 'not_applicable' as const }] : []),
      ...(financialExposure ? [{ class: 'financial_exposure' as const, authority: 'explicit' as const, reversibility: 'conditional' as const }] : []),
      ...(externalEffect ? [{ class: 'external_state_change' as const, authority: 'explicit' as const, reversibility: 'conditional' as const }] : []),
    ]
    const input: PublishSupplyToolV2Input = {
      businessRef,
      source,
      candidateRef: selected.candidateRef,
      expectedSourceDigest: preview.sourceDigest,
      ...(connectionRef === '' ? {} : { connectionRef }),
      presentation: {
        name: name.trim(),
        description: description.trim(),
        category: category.trim(),
        ...(serviceArea.trim() === '' ? {} : { serviceArea: serviceArea.trim() }),
        ...(availability.trim() === '' ? {} : { availability: availability.trim() }),
      },
      consequences: {
        effects,
        dataUse: dataEffectIndex < 0 ? [] : [{
          inputPointer: '/',
          classification: dataClassification,
          phase: 'execution',
          purposes: ['Perform the Tool'],
        }],
        evidence: [{ outputPointer: '', purpose: 'completion' }],
      },
      pricing,
      environment,
      idempotencyKey: idempotencyKey.current,
      attestation: {
        authorisedToPublish: true,
        informationAccurate: true,
        publishAfterSuccessfulValidation: true,
      },
    }
    setPending('publish')
    setError(undefined)
    try {
      const result = await onPublish(input)
      if (result.kind === 'refused') {
        setError(publicationError(result.reason))
        return
      }
      setSuccess(`Tool submitted for validation. AE will publish it after the required checks pass. Reference: ${result.toolRef}`)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('AE could not confirm submission. Reload Tools before trying again.')
    } finally {
      setPending(undefined)
    }
  }

  async function connectSelectedSource() {
    if (source === undefined || preview === undefined || selected === undefined || pending !== undefined) return
    setPending('connect')
    setError(undefined)
    try {
      const result = await onConnect({
        businessId: businessRef,
        source,
        expectedSourceDigest: preview.sourceDigest,
        candidateRef: selected.candidateRef,
        idempotencyKey: connectionIdempotencyKey.current,
      })
      if (result.kind !== 'action_required') {
        setError('This source no longer requires a connection. Find Tools again to continue with its current contract.')
        return
      }
      setRequiredAction(result.requiredAction)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('AE could not start this connection. Find Tools again, then retry the current source.')
    } finally {
      setPending(undefined)
    }
  }

  return (
    <div className="grid gap-section">
      <AeSection title="Add service" description="Start with the interface you already operate. AE discovers the Tools and derives the protocol facts.">
        {error === undefined ? null : <Alert variant="destructive" role="alert"><AlertTitle>Action required</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {requiredAction === undefined ? null : (
          <Alert role="status">
            <AlertTitle>{requiredAction.title}</AlertTitle>
            <AlertDescription>
              <p>{requiredAction.description}</p>
              {requiredAction.cta === null ? null : (
                <Button asChild variant="secondary" className="mt-4 min-h-touch">
                  <a href={requiredAction.cta}>{requiredAction.ctaLabel}</a>
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        {success === undefined ? null : <Alert><AlertTitle>Submitted</AlertTitle><AlertDescription>{success}</AlertDescription></Alert>}
        <FieldGroup className="gap-5">
          <Field>
            <FieldLabel>Source type</FieldLabel>
            <Tabs value={sourceKind} onValueChange={changeSourceKind}>
              <TabsList className="max-w-full overflow-x-auto" aria-label="Source type">
                <TabsTrigger value="openapi">OpenAPI</TabsTrigger>
                <TabsTrigger value="mcp">MCP</TabsTrigger>
                <TabsTrigger value="agent_plugin">Agent Plugin</TabsTrigger>
                <TabsTrigger value="x402">x402</TabsTrigger>
              </TabsList>
            </Tabs>
            <FieldDescription>AE reads the source. You do not need to recreate its schemas or payment metadata.</FieldDescription>
          </Field>
          <EnvironmentField value={environment} disabled={pending !== undefined} onChange={(next) => {
            setEnvironment(next)
            setRemoteSelection(undefined)
            setSelectedRemoteRef('')
          }} />
          {sourceKind === 'openapi' ? <TextField id="supply-native-openapi-url" label="OpenAPI URL" value={definitionUrl} type="url" onChange={setDefinitionUrl} description="OpenAPI 3.0 or 3.1, JSON or YAML, at a public HTTPS URL." /> : null}
          {sourceKind === 'mcp' ? <McpSourceFields locator={mcpLocator} serverUrl={serverUrl} registryName={registryName} onLocatorChange={(next) => {
            setMcpLocator(next)
            setRemoteSelection(undefined)
            setSelectedRemoteRef('')
          }} onServerUrlChange={(next) => {
            setServerUrl(next)
            setRemoteSelection(undefined)
            setSelectedRemoteRef('')
          }} onRegistryNameChange={(next) => {
            setRegistryName(next)
            setRemoteSelection(undefined)
            setSelectedRemoteRef('')
          }} /> : null}
          {sourceKind === 'agent_plugin' ? <AgentPluginFields pluginJson={pluginJson} mcpJson={mcpJson} onPluginJsonChange={(next) => {
            setPluginJson(next)
            setRemoteSelection(undefined)
            setSelectedRemoteRef('')
          }} onMcpJsonChange={(next) => {
            setMcpJson(next)
            setRemoteSelection(undefined)
            setSelectedRemoteRef('')
          }} onError={setError} /> : null}
          {sourceKind === 'x402' ? <X402SourceFields resourceUrl={resourceUrl} method={x402Method} onResourceUrlChange={setResourceUrl} onMethodChange={setX402Method} /> : null}
          <Button type="button" className="min-h-touch justify-self-start" disabled={pending !== undefined} aria-busy={pending === 'preview' || undefined} onClick={() => void findTools()}>
            {pending === 'preview' ? 'Finding Tools…' : 'Find Tools'}
          </Button>
        </FieldGroup>
      </AeSection>

      {remoteSelection === undefined ? null : (
        <AeSection title="Select MCP server" description="Choose the exact remote server AE should inspect. AE will not contact another server or fail over silently.">
          <FieldGroup className="gap-4">
            <RemoteSelectionField remotes={remoteSelection.remotes} value={selectedRemoteRef} onChange={setSelectedRemoteRef} />
            <Button type="button" className="min-h-touch justify-self-start" disabled={pending !== undefined || selectedRemoteRef === ''} onClick={() => void findTools(selectedRemoteRef)}>
              Continue with selected server
            </Button>
          </FieldGroup>
        </AeSection>
      )}

      {preview === undefined ? null : (
        <AeSection title="Select a Tool" description={`${preview.candidates.length} candidate${preview.candidates.length === 1 ? '' : 's'} found. Unsupported source methods remain visible with their correction.`}>
          <RadioGroup value={selectedRef} onValueChange={(value) => {
            const candidate = preview.candidates.find(({ candidateRef }) => candidateRef === value)
            if (candidate !== undefined && candidate.disposition.kind === 'supported') void selectCandidate(candidate)
          }}>
            {preview.candidates.map((candidate) => <CandidateRow key={candidate.candidateRef} candidate={candidate} />)}
          </RadioGroup>
        </AeSection>
      )}

      {selected === undefined ? null : (
        <AeSection title="Review and submit" description="Review facts derived from the source, then declare only the terms AE owns.">
          <FieldGroup className="gap-5">
            <TextField id="supply-native-name" label="Tool name" value={name} onChange={setName} description="Shown to agents in discovery." />
            <TextAreaField id="supply-native-description" label="Description" value={description} onChange={setDescription} description="What this Tool does and returns." />
            <TextField id="supply-native-category" label="Category" value={category} onChange={setCategory} description="A familiar service category, such as Research or Data." />
            <TextField id="supply-native-service-area" label="Service area (optional)" value={serviceArea} onChange={setServiceArea} description="Where this service is available, if relevant." />
            <TextField id="supply-native-availability" label="Availability (optional)" value={availability} onChange={setAvailability} description="Any operating-hours or availability constraint." />
            <PricingField kind={pricingKind} price={price} x402={selected.x402 !== undefined} onKindChange={setPricingKind} onPriceChange={setPrice} />
            {selected.authentication.kind === 'public' ? (
              <Alert><AlertTitle>Public source</AlertTitle><AlertDescription>AE will validate this source. Publication remains Under review until Provider authority is established.</AlertDescription></Alert>
            ) : (
              <ConnectionField
                value={connectionRef}
                options={eligibleConnections}
                connecting={pending === 'connect'}
                onChange={setConnectionRef}
                onConnect={() => void connectSelectedSource()}
              />
            )}
            <ConsequencesField externalEffect={externalEffect} dataRelease={dataRelease} financialExposure={financialExposure} dataClassification={dataClassification} onExternalEffectChange={setExternalEffect} onDataReleaseChange={setDataRelease} onFinancialExposureChange={setFinancialExposure} onDataClassificationChange={setDataClassification} />
            <AttestationField values={attestation} onChange={(key, checked) => setAttestation((current) => ({ ...current, [key]: checked }))} />
            <div role="status" aria-live="polite">{pending === 'publish' ? <AeInlineState state="saving" description="Submitting the exact source revision for validation." /> : null}</div>
            <Button type="button" className="min-h-touch justify-self-start" disabled={pending !== undefined || success !== undefined} aria-busy={pending === 'publish' || undefined} onClick={() => void submit()}>
              {pending === 'publish' ? 'Submitting…' : 'Submit for validation'}
            </Button>
          </FieldGroup>
        </AeSection>
      )}
      {pending === 'select' ? <div role="status" aria-live="polite"><AeInlineState state="saving" description="Saving the selected Tool so you can return later." /></div> : null}
    </div>
  )
}

type SourceFieldState = Readonly<{
  sourceKind: SourceKind
  environment: Environment
  definitionUrl: string
  mcpLocator: 'url' | 'registry'
  serverUrl: string
  registryName: string
  pluginJson: string
  mcpJson: string
  remoteRef: string
  resourceUrl: string
  x402Method: 'GET' | 'POST'
}>

function sourceInput(value: SourceFieldState): SupplySourceInput | undefined {
  if (value.sourceKind === 'openapi') return value.definitionUrl.trim() === '' ? undefined : { kind: 'openapi', definitionUrl: value.definitionUrl.trim(), environment: value.environment }
  if (value.sourceKind === 'mcp') {
    if (value.mcpLocator === 'url') return value.serverUrl.trim() === '' ? undefined : { kind: 'mcp', serverUrl: value.serverUrl.trim(), environment: value.environment }
    return value.registryName.trim() === '' ? undefined : {
      kind: 'mcp',
      registryName: value.registryName.trim(),
      ...(value.remoteRef === '' ? {} : { remoteRef: value.remoteRef }),
      environment: value.environment,
    }
  }
  if (value.sourceKind === 'agent_plugin') {
    const plugin = parseObject(value.pluginJson)
    const mcp = parseObject(value.mcpJson)
    return plugin === undefined || mcp === undefined ? undefined : {
      kind: 'agent_plugin',
      pluginJson: plugin,
      mcpJson: mcp,
      ...(value.remoteRef === '' ? {} : { remoteRef: value.remoteRef }),
      environment: value.environment,
    }
  }
  return value.resourceUrl.trim() === '' ? undefined : { kind: 'x402', resourceUrl: value.resourceUrl.trim(), method: value.x402Method, environment: value.environment }
}

function sourceInputError(kind: SourceKind, locator: 'url' | 'registry'): string {
  if (kind === 'openapi') return 'Enter the public HTTPS URL for the OpenAPI document.'
  if (kind === 'mcp') return locator === 'url' ? 'Enter the MCP server URL.' : 'Enter its MCP Registry name.'
  if (kind === 'agent_plugin') return 'Provide valid plugin.json and mcp.json documents.'
  return 'Enter the x402 resource URL.'
}

function parseObject(value: string): Readonly<Record<string, never>> | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Readonly<Record<string, never>>
      : undefined
  } catch {
    return undefined
  }
}

function pricingInput(
  kind: 'free' | 'fixed_aud' | 'source_x402',
  value: string,
): PublishSupplyToolV2Input['pricing'] | undefined {
  if (kind === 'free') return { kind: 'free' }
  if (kind === 'source_x402') return { kind: 'source_x402' }
  const parsed = parseDecimalExactAmount('AUD', value, 2)
  const amount = parsed === undefined ? undefined : rescaleExactAmount(parsed, 6)
  return amount === undefined ? undefined : { kind: 'fixed_aud', amount }
}

function publicationError(reason: string): string {
  if (reason === 'source_changed' || reason === 'candidate_changed') return 'The source changed after preview. Find Tools again, then review the current facts.'
  if (reason === 'connection_required' || reason === 'connection_unavailable') return 'The source connection is unavailable. Reconnect it, then submit again.'
  if (reason === 'source_authority_review_required') return 'AE received the service. It remains Under review until source authority is confirmed.'
  return `AE could not submit this Tool (${reason}). Review the source and try again.`
}

function CandidateRow({ candidate }: Readonly<{ candidate: SupplyToolCandidate }>) {
  const supported = candidate.disposition.kind === 'supported'
  return (
    <div className="grid grid-cols-[auto_1fr] gap-3 rounded-lg border border-border p-4" data-disabled={!supported || undefined}>
      <RadioGroupItem value={candidate.candidateRef} disabled={!supported} aria-label={`Select ${candidate.title}`} />
      <div className="grid min-w-0 gap-1">
        <p className="font-semibold text-foreground">{candidate.title}</p>
        <p className="text-sm text-muted-foreground">{candidate.description}</p>
        <p className="text-sm text-muted-foreground">{candidate.authentication.kind === 'public' ? 'Public' : 'Connection required'} · {candidate.validationExampleAvailable ? 'Validation input available' : 'Validation input required'}</p>
        {supported ? null : <p className="text-sm text-destructive">Action required: update this Tool at its source ({candidate.disposition.reason}).</p>}
      </div>
    </div>
  )
}

function EnvironmentField({ value, disabled, onChange }: Readonly<{ value: Environment; disabled: boolean; onChange: (value: Environment) => void }>) {
  return <Field><FieldLabel>Environment</FieldLabel><RadioGroup value={value} disabled={disabled} className="grid-cols-2" onValueChange={(next) => onChange(next as Environment)}>
    <Label className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value="sandbox" />Sandbox</Label>
    <Label className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value="production" />Production</Label>
  </RadioGroup><FieldDescription>Sandbox is selected by default.</FieldDescription></Field>
}

function McpSourceFields({ locator, serverUrl, registryName, onLocatorChange, onServerUrlChange, onRegistryNameChange }: Readonly<{ locator: 'url' | 'registry'; serverUrl: string; registryName: string; onLocatorChange: (value: 'url' | 'registry') => void; onServerUrlChange: (value: string) => void; onRegistryNameChange: (value: string) => void }>) {
  return <><Field><FieldLabel>MCP location</FieldLabel><RadioGroup value={locator} className="grid-cols-2" onValueChange={(next) => onLocatorChange(next as 'url' | 'registry')}>
    <Label className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value="url" />Server URL</Label>
    <Label className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value="registry" />Registry name</Label>
  </RadioGroup></Field>{locator === 'url'
    ? <TextField id="supply-native-mcp-url" label="MCP server URL" value={serverUrl} type="url" onChange={onServerUrlChange} description="Remote streamable HTTP over public HTTPS." />
    : <TextField id="supply-native-mcp-registry" label="MCP Registry name" value={registryName} onChange={onRegistryNameChange} description="The exact published Registry name." />}</>
}

function AgentPluginFields({ pluginJson, mcpJson, onPluginJsonChange, onMcpJsonChange, onError }: Readonly<{ pluginJson: string; mcpJson: string; onPluginJsonChange: (value: string) => void; onMcpJsonChange: (value: string) => void; onError: (value: string) => void }>) {
  return <><JsonFileField id="supply-native-plugin-json" label="plugin.json" loaded={pluginJson !== ''} onChange={onPluginJsonChange} onError={onError} /><JsonFileField id="supply-native-mcp-json" label="mcp.json" loaded={mcpJson !== ''} onChange={onMcpJsonChange} onError={onError} /></>
}

function JsonFileField({ id, label, loaded, onChange, onError }: Readonly<{ id: string; label: string; loaded: boolean; onChange: (value: string) => void; onError: (value: string) => void }>) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} type="file" accept=".json,application/json" onChange={(event) => {
    const file = event.currentTarget.files?.[0]
    if (file === undefined) return
    if (file.size > 262_144) {
      onError(`${label} must be 256 KB or smaller.`)
      return
    }
    void file.text().then(onChange).catch(() => onError(`${label} could not be read.`))
  }} /><FieldDescription>{loaded ? `${label} loaded. Choose another file to replace it.` : `Choose the official Agent Plugins 1.0 ${label} file.`}</FieldDescription></Field>
}

function RemoteSelectionField({ remotes, value, onChange }: Readonly<{ remotes: readonly SupplyMcpRemote[]; value: string; onChange: (value: string) => void }>) {
  return <Field><FieldLabel>Remote MCP server</FieldLabel><RadioGroup value={value} onValueChange={onChange}>{remotes.map((remote) => <Label key={remote.remoteRef} className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value={remote.remoteRef} aria-label={`Select ${remote.name}`} /><span className="grid min-w-0"><span className="font-medium">{remote.name}</span><span className="break-all text-sm text-muted-foreground">{remote.serverUrl}</span></span></Label>)}</RadioGroup><FieldDescription>Only this exact endpoint will be contacted.</FieldDescription></Field>
}

function X402SourceFields({ resourceUrl, method, onResourceUrlChange, onMethodChange }: Readonly<{ resourceUrl: string; method: 'GET' | 'POST'; onResourceUrlChange: (value: string) => void; onMethodChange: (value: 'GET' | 'POST') => void }>) {
  return <><TextField id="supply-native-x402-url" label="x402 resource URL" value={resourceUrl} type="url" onChange={onResourceUrlChange} description="AE reads payment facts from the live signed 402 response." /><Field><FieldLabel>Method</FieldLabel><RadioGroup value={method} className="grid-cols-2" onValueChange={(next) => onMethodChange(next as 'GET' | 'POST')}><Label className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value="GET" />GET</Label><Label className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value="POST" />POST</Label></RadioGroup></Field></>
}

function PricingField({ kind, price, x402, onKindChange, onPriceChange }: Readonly<{ kind: 'free' | 'fixed_aud' | 'source_x402'; price: string; x402: boolean; onKindChange: (kind: 'free' | 'fixed_aud' | 'source_x402') => void; onPriceChange: (value: string) => void }>) {
  return <Field><FieldLabel>Price</FieldLabel><RadioGroup value={kind} className="grid gap-2 sm:grid-cols-2" onValueChange={(next) => onKindChange(next as typeof kind)}>{x402 ? <Label className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value="source_x402" />Use source payment</Label> : <><Label className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value="free" />Free</Label><Label className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value="fixed_aud" />Fixed AUD price</Label></>}</RadioGroup>{kind === 'fixed_aud' ? <Input aria-label="AUD price" inputMode="decimal" value={price} onChange={(event) => onPriceChange(event.currentTarget.value)} /> : null}<FieldDescription>Exact buyer price is confirmed during inspection.</FieldDescription></Field>
}

function ConnectionField({ value, options, connecting, onChange, onConnect }: Readonly<{ value: string; options: readonly ProviderConnectionOwnerProjection[]; connecting: boolean; onChange: (value: string) => void; onConnect: () => void }>) {
  return <Field><FieldLabel>Source connection</FieldLabel>{options.length === 0 ? <Alert><AlertTitle>Connect this source</AlertTitle><AlertDescription><p>This Tool requires the source’s standard authentication. Your selected Tool is saved.</p><Button type="button" variant="secondary" className="mt-4 min-h-touch" disabled={connecting} onClick={onConnect}>{connecting ? 'Opening connection…' : 'Connect service'}</Button></AlertDescription></Alert> : <RadioGroup value={value} onValueChange={onChange}>{options.map((option) => <Label key={option.connectionRef} className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value={option.connectionRef} />{option.adapterId} · connected</Label>)}</RadioGroup>}<FieldDescription>The connection is durable and separately revocable.</FieldDescription></Field>
}

function ConsequencesField({ externalEffect, dataRelease, financialExposure, dataClassification, onExternalEffectChange, onDataReleaseChange, onFinancialExposureChange, onDataClassificationChange }: Readonly<{ externalEffect: boolean; dataRelease: boolean; financialExposure: boolean; dataClassification: 'public' | 'personal' | 'sensitive'; onExternalEffectChange: (value: boolean) => void; onDataReleaseChange: (value: boolean) => void; onFinancialExposureChange: (value: boolean) => void; onDataClassificationChange: (value: 'public' | 'personal' | 'sensitive') => void }>) {
  return <Field><FieldLabel>What can this Tool do?</FieldLabel><div className="grid gap-3"><CheckRow id="supply-effect-external" label="Change an external system" checked={externalEffect} onChange={onExternalEffectChange} /><CheckRow id="supply-effect-data" label="Send input data to the Provider" checked={dataRelease} onChange={onDataReleaseChange} /><CheckRow id="supply-effect-financial" label="Create financial exposure" checked={financialExposure} onChange={onFinancialExposureChange} /></div>{dataRelease ? <RadioGroup value={dataClassification} className="mt-3 grid gap-2 sm:grid-cols-3" onValueChange={(next) => onDataClassificationChange(next as typeof dataClassification)}>{(['public', 'personal', 'sensitive'] as const).map((classification) => <Label key={classification} className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value={classification} />{classification[0]?.toUpperCase()}{classification.slice(1)} data</Label>)}</RadioGroup> : null}<FieldDescription>AE uses these declarations for agent approval and evidence requirements.</FieldDescription></Field>
}

function AttestationField({ values, onChange }: Readonly<{ values: Record<AttestationKey, boolean>; onChange: (key: AttestationKey, checked: boolean) => void }>) {
  return <fieldset className="grid gap-3"><legend className="text-sm font-medium">Publication statements</legend><CheckRow id="supply-attest-authorised" label="I am authorised to publish this service" checked={values.authorisedToPublish} onChange={(checked) => onChange('authorisedToPublish', checked)} /><CheckRow id="supply-attest-accurate" label="The information is accurate" checked={values.informationAccurate} onChange={(checked) => onChange('informationAccurate', checked)} /><CheckRow id="supply-attest-validation" label="Publish after validation succeeds" checked={values.publishAfterSuccessfulValidation} onChange={(checked) => onChange('publishAfterSuccessfulValidation', checked)} /></fieldset>
}

function CheckRow({ id, label, checked, onChange }: Readonly<{ id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }>) {
  return <Label htmlFor={id} className="min-h-touch rounded-md border border-border p-3"><Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />{label}</Label>
}

function TextField({ id, label, value, description, type = 'text', onChange }: Readonly<{ id: string; label: string; value: string; description: string; type?: string; onChange: (value: string) => void }>) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} type={type} value={value} onChange={(event) => onChange(event.currentTarget.value)} /><FieldDescription>{description}</FieldDescription></Field>
}

function TextAreaField({ id, label, value, description, onChange }: Readonly<{ id: string; label: string; value: string; description: string; onChange: (value: string) => void }>) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Textarea id={id} rows={6} value={value} onChange={(event) => onChange(event.currentTarget.value)} /><FieldDescription>{description}</FieldDescription><FieldError /></Field>
}
