import { useEffect, useState } from 'react'

import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { isRecord } from '@/modules/common/is-record'
import type { ProviderConnectionOwnerProjection } from '@/modules/capability-supply/provider-connection'
import type {
  CapabilityContractMetadata,
  CapabilityImporterCommercialInput,
  CapabilityPublicationImport,
  OpenApiDocumentPreflightResult,
  OpenApiOperationPreflightOutcome,
  PreparedPublicationMaterial,
} from '@/modules/capability-supply/public'

export type SupplySourceKind = 'openapi_http' | 'mcp' | 'agent_plugin_mcp' | 'x402'
export type SupplyAuthority = Readonly<
  | { kind: 'public_upstream' }
  | { kind: 'provider_connection'; connectionRef: string; providerRef: string }
>
export type SupplyAuthorityOption = ProviderConnectionOwnerProjection
export type SupplyEndpointConfigValue = Readonly<{
  sourceKind: SupplySourceKind
  sourceRevision: string
  contract: Record<string, unknown>
  commercial: Record<string, unknown>
  evidenceRefs: readonly string[]
  requestTimeoutMs: number
  authority: SupplyAuthority
} & (
  | { sourceKind: 'openapi_http'; documentJson: string; operation: Readonly<{ path: string; method: 'get' | 'post' }>; fixedQuery: readonly Readonly<{ parameter: string; value: string }>[] }
  | { sourceKind: 'mcp'; serverUrl: string; toolJson: string; protocolVersion: string }
  | { sourceKind: 'agent_plugin_mcp'; manifestJson: string; serverName: string; toolJson: string; protocolVersion: string }
  | { sourceKind: 'x402'; resourceJson: string }
)>
export type SupplyEndpointPreflightResult =
  | Readonly<{ kind: 'prepared'; prepared: PreparedPublicationMaterial }>
  | Readonly<{ kind: 'refused'; reason: string; fix: string }>
export type SupplyEndpointDocumentPreflightResult = OpenApiDocumentPreflightResult | Readonly<{
  kind: 'refused'
  reason: string
}>
export type SupplyEndpointDocumentPreflight = Extract<OpenApiDocumentPreflightResult, { kind: 'preflighted' }>
export type SupplyEndpointOperationOutcome = OpenApiOperationPreflightOutcome
export type SupplyEndpointDraftSaveResult =
  | Readonly<{ kind: 'saved' | 'replayed'; revision: number; sourceDigest: string }>
  | Readonly<{ kind: 'refused'; reason: string; fix: string }>
export type SupplyPublicationImport = CapabilityPublicationImport & Readonly<{ sourceRevision: string }>
export type EndpointField = 'sourceRevision' | 'contractJson' | 'commercialJson' | 'evidenceRefsJson' | 'documentJson' | 'operationPath' | 'fixedQueryJson' | 'serverUrl' | 'toolJson' | 'protocolVersion' | 'manifestJson' | 'serverName' | 'resourceJson' | 'requestTimeoutMs' | 'authority'
export type EndpointErrors = Partial<Record<EndpointField, string>>
export type PreflightExtras = Readonly<{ toolName: string; resourceUrl: string }>

type EditableSource = Readonly<{
  sourceKind: SupplySourceKind
  sourceRevision: string
  contractJson: string
  commercialJson: string
  evidenceRefsJson: string
  requestTimeoutMs: string
  authority: SupplyAuthority
  documentJson: string
  operationPath: string
  operationMethod: 'get' | 'post'
  fixedQueryJson: string
  serverUrl: string
  toolJson: string
  protocolVersion: string
  manifestJson: string
  serverName: string
  resourceJson: string
}>
const MAX_SOURCE_BYTES = 262_144
export function AeSupplyEndpointConfigStep({
  initialValue,
  initialDocumentPreflight,
  authorityOptions = [],
  disabled,
  onPreflight,
  onPreflightDocument,
  onSaveDraft,
  onSubmit,
}: Readonly<{
  initialValue?: SupplyEndpointConfigValue
  initialDocumentPreflight?: SupplyEndpointDocumentPreflight
  authorityOptions?: readonly SupplyAuthorityOption[]
  disabled?: boolean
  onPreflight: (value: SupplyPublicationImport) => Promise<SupplyEndpointPreflightResult>
  onPreflightDocument?: (document: Record<string, unknown>) => Promise<SupplyEndpointDocumentPreflightResult>
  onSaveDraft?: (value: SupplyPublicationImport) => Promise<SupplyEndpointDraftSaveResult>
  onSubmit: (value: SupplyPublicationImport, prepared: PreparedPublicationMaterial) => Promise<void>
}>) {
  const [value, setValue] = useState<EditableSource>(() => editableSource(initialValue))
  const [toolName, setToolName] = useState(() => initialToolName(initialValue))
  const [resourceUrl, setResourceUrl] = useState(() => initialResourceUrl(initialValue))
  const [documentPreflight, setDocumentPreflight] = useState<SupplyEndpointDocumentPreflight | undefined>(initialDocumentPreflight)
  const [documentPreflightPending, setDocumentPreflightPending] = useState(false)
  const [errors, setErrors] = useState<EndpointErrors>({})
  const [announcement, setAnnouncement] = useState<string>()
  const [pending, setPending] = useState(false)
  const formDisabled = disabled || pending || documentPreflightPending

  useEffect(() => {
    if (initialValue === undefined) return
    setValue(editableSource(initialValue))
    setToolName(initialToolName(initialValue))
    setResourceUrl(initialResourceUrl(initialValue))
    setDocumentPreflight(initialDocumentPreflight)
    setErrors({})
    setAnnouncement(undefined)
  }, [initialDocumentPreflight, initialValue])

  function update(patch: Readonly<Partial<EditableSource>>) {
    setValue((current) => ({ ...current, ...patch }))
    if (patch.documentJson !== undefined) setDocumentPreflight(undefined)
    setErrors({})
  }

  function changeSourceKind(next: SupplySourceKind) {
    setValue((current) => ({
      ...editableSource(),
      sourceKind: next,
      sourceRevision: current.sourceRevision,
      contractJson: current.contractJson,
      commercialJson: current.commercialJson,
      evidenceRefsJson: current.evidenceRefsJson,
      requestTimeoutMs: current.requestTimeoutMs,
    }))
    setToolName('')
    setResourceUrl('')
    setErrors({})
    setAnnouncement(undefined)
    setDocumentPreflight(undefined)
  }

  function selectedConnectionIsAvailable(): boolean {
    const authority = value.authority
    if (authority.kind !== 'provider_connection') return true
    return authorityOptions.some((option) => option.connectionRef === authority.connectionRef
      && option.providerRef === authority.providerRef
      && option.adapterId === authorityAdapterId(value.sourceKind)
      && option.available)
  }

  async function inspectOpenApiDocument() {
    if (value.sourceKind !== 'openapi_http' || onPreflightDocument === undefined) return
    const document = parseObject(value.documentJson)
    if (document === undefined) {
      const message = 'Enter valid OpenAPI JSON before inspecting operations.'
      setErrors({ documentJson: message })
      setAnnouncement(message)
      focusField('documentJson')
      return
    }
    setDocumentPreflightPending(true)
    setErrors({})
    try {
      const result = await onPreflightDocument(document)
      if (result.kind === 'refused') {
        const message = `${result.reason}: ${documentPreflightFix(result.reason)}`
        setErrors({ documentJson: documentPreflightFix(result.reason) })
        setAnnouncement(message)
        focusField('documentJson')
        setDocumentPreflight(undefined)
        return
      }
      setDocumentPreflight(result)
      setAnnouncement(`AE inspected ${result.outcomes.length} operation${result.outcomes.length === 1 ? '' : 's'}. Select one executable GET or POST operation to continue.`)
    } finally {
      setDocumentPreflightPending(false)
    }
  }

  async function submit() {
    if (!selectedConnectionIsAvailable()) {
      const message = 'This supplier connection is unavailable. Ask your AE administrator to reconnect it, then choose the refreshed connection.'
      setErrors({ authority: message })
      setAnnouncement(message)
      focusField('authority')
      return
    }
    if (value.sourceKind === 'openapi_http' && onPreflightDocument !== undefined) {
      const selected = documentPreflight?.outcomes.find((outcome) => (
        outcome.selector.path === value.operationPath
        && outcome.selector.method.toLowerCase() === value.operationMethod
      ))
      if (selected === undefined || !isSelectableOpenApiOperation(selected, value.authority, authorityOptions)) {
        const message = 'Inspect the OpenAPI document and select an executable or credential-authorized GET or POST operation before continuing.'
        setErrors({ operationPath: message })
        setAnnouncement(message)
        focusField('operationPath')
        return
      }
    }
    const checked = buildEndpointValue(value, { toolName, resourceUrl })
    if (checked.kind === 'refused') {
      setErrors(checked.errors)
      setAnnouncement(checked.message)
      focusField(checked.field)
      return
    }
    setPending(true)
    try {
      const publicationImport = toCapabilityPublicationImport(checked.value)
      const saved = onSaveDraft === undefined ? undefined : await onSaveDraft(publicationImport)
      if (saved?.kind === 'refused') {
        setErrors({ sourceRevision: saved.fix })
        setAnnouncement(`${saved.reason}: ${saved.fix}`)
        focusField('sourceRevision')
        return
      }
      const preflight = await onPreflight(publicationImport)
      if (preflight.kind === 'refused') {
        const field = preflightField(preflight.reason, checked.value.sourceKind)
        setErrors({ [field]: preflight.fix })
        setAnnouncement(`${preflight.reason}: ${preflight.fix}`)
        focusField(field)
        return
      }
      setAnnouncement('AE accepted the source structure. No publication state was written.')
      await onSubmit(publicationImport, preflight.prepared)
    } finally {
      setPending(false)
    }
  }

  return (
    <AeSection
      title="Connect the Operation"
      description="Choose the interface this Operation exposes. AE validates the source before publication changes."
    >
      <FieldGroup className="gap-4">
          <Field {...(formDisabled ? { 'data-disabled': true } : {})}>
            <FieldLabel htmlFor="supply-source-kind">Connection type</FieldLabel>
            <Select value={value.sourceKind} disabled={formDisabled} onValueChange={(next) => changeSourceKind(sourceKindFromValue(next))}>
              <SelectTrigger id="supply-source-kind" className="min-h-touch"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="openapi_http">OpenAPI HTTP API</SelectItem>
                <SelectItem value="mcp">MCP server</SelectItem>
                <SelectItem value="agent_plugin_mcp">Agent Plugin MCP</SelectItem>
                <SelectItem value="x402">x402 endpoint</SelectItem>
              </SelectGroup></SelectContent>
            </Select>
            <FieldDescription>Changing the interface clears fields that belong to the previous interface.</FieldDescription>
          </Field>
          <TextField id="supply-source-revision" label="Source revision" value={value.sourceRevision} disabled={formDisabled} {...(errors.sourceRevision === undefined ? {} : { error: errors.sourceRevision })} description="Use a stable revision such as provider-api/2026-08-09." onChange={(next) => update({ sourceRevision: next })} />
          <JsonField id="supply-contract" label="Capability contract metadata (JSON)" value={value.contractJson} disabled={formDisabled} {...(errors.contractJson === undefined ? {} : { error: errors.contractJson })} description="Include input/output schemas, input examples, data-use, effects, and required output evidence." onChange={(next) => update({ contractJson: next })} />
          <JsonField id="supply-commercial" label="Commercial metadata (JSON)" value={value.commercialJson} disabled={formDisabled} {...(errors.commercialJson === undefined ? {} : { error: errors.commercialJson })} description="Include the offering, binding id, and payment terms. Do not include keys, tokens, or env locators." onChange={(next) => update({ commercialJson: next })} />
          <JsonField id="supply-evidence-refs" label="Registration evidence references (JSON array)" value={value.evidenceRefsJson} disabled={formDisabled} {...(errors.evidenceRefsJson === undefined ? {} : { error: errors.evidenceRefsJson })} description="Use references to source or owner evidence, not raw headers or response bodies." onChange={(next) => update({ evidenceRefsJson: next })} />
          {value.sourceKind === 'openapi_http' ? <OpenApiFields
            value={value}
            authority={value.authority}
            authorityOptions={authorityOptions}
            disabled={formDisabled}
            errors={errors}
            {...(documentPreflight === undefined ? {} : { documentPreflight })}
            documentPreflightPending={documentPreflightPending}
            {...(onPreflightDocument === undefined ? {} : { onPreflightDocument })}
            onInspect={() => void inspectOpenApiDocument()}
            onChange={update}
          /> : null}
          {value.sourceKind === 'mcp' ? <McpFields value={value} disabled={formDisabled} errors={errors} toolName={toolName} onToolNameChange={setToolName} onChange={update} /> : null}
          {value.sourceKind === 'agent_plugin_mcp' ? <AgentPluginFields value={value} disabled={formDisabled} errors={errors} toolName={toolName} onToolNameChange={setToolName} onChange={update} /> : null}
          {value.sourceKind === 'x402' ? <X402Fields value={value} disabled={formDisabled} errors={errors} resourceUrl={resourceUrl} onResourceUrlChange={setResourceUrl} onChange={update} /> : null}
          <TextField id="supply-timeout" label="Request timeout (milliseconds)" value={value.requestTimeoutMs} disabled={formDisabled} {...(errors.requestTimeoutMs === undefined ? {} : { error: errors.requestTimeoutMs })} description="Allowed range: 100–120,000 milliseconds." onChange={(next) => update({ requestTimeoutMs: next })} type="number" />
          <AuthorityField value={value.authority} sourceKind={value.sourceKind} authorityOptions={authorityOptions} disabled={formDisabled} {...(errors.authority === undefined ? {} : { error: errors.authority })} onChange={(next) => update({ authority: next })} />
          <p className="text-sm text-muted-foreground">Public upstream access is supported. For keyed OpenAPI or MCP, choose an existing compatible provider connection; this form never asks for or stores a raw key. x402 authority is non-secret and checked on the server.</p>
          <div role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{announcement}</div>
        </FieldGroup>
      <Button type="button" variant="default" disabled={formDisabled} aria-busy={pending || undefined} onClick={() => void submit()} className="min-h-touch">
        {pending ? 'Checking source' : 'Check and continue'}
      </Button>
    </AeSection>
  )
}

function OpenApiFields({
  value,
  authority,
  authorityOptions,
  disabled,
  errors,
  documentPreflight,
  documentPreflightPending,
  onPreflightDocument,
  onInspect,
  onChange,
}: Readonly<{
  value: EditableSource
  authority: SupplyAuthority
  authorityOptions: readonly SupplyAuthorityOption[]
  disabled: boolean
  errors: EndpointErrors
  documentPreflight?: SupplyEndpointDocumentPreflight
  documentPreflightPending: boolean
  onPreflightDocument?: (document: Record<string, unknown>) => Promise<SupplyEndpointDocumentPreflightResult>
  onInspect: () => void
  onChange: (patch: Readonly<Partial<EditableSource>>) => void
}>) {
  const guidedSelection = onPreflightDocument !== undefined
  return <>
    <JsonField id="supply-openapi-document" label="OpenAPI document (JSON)" value={value.documentJson} disabled={disabled} {...(errors.documentJson === undefined ? {} : { error: errors.documentJson })} description="Use one OpenAPI 3.1 document with one public HTTPS server and JSON request/response schemas." onChange={(next) => onChange({ documentJson: next })} />
    {guidedSelection ? (
      <div className="grid gap-3 rounded-md border border-border p-4">
        <div>
          <p className="font-semibold text-foreground">Inspect operations before choosing one</p>
          <p className="text-sm text-muted-foreground">AE checks every bounded GET and POST operation and names credential, safety, and shape rules before any source is saved.</p>
        </div>
        <Button type="button" variant="secondary" disabled={disabled || documentPreflightPending} aria-busy={documentPreflightPending || undefined} onClick={onInspect}>
          {documentPreflightPending ? 'Inspecting operations' : 'Inspect operations'}
        </Button>
        {documentPreflight === undefined ? null : <OpenApiOperationOutcomes
          outcomes={documentPreflight.outcomes}
          authority={authority}
          authorityOptions={authorityOptions}
          selected={{ path: value.operationPath, method: value.operationMethod }}
          disabled={disabled}
          onSelect={(operation) => onChange({ operationPath: operation.path, operationMethod: operation.method })}
        />}
      </div>
    ) : (
      <>
        <TextField id="supply-openapi-operation" label="Operation path / selector" value={value.operationPath} disabled={disabled} {...(errors.operationPath === undefined ? {} : { error: errors.operationPath })} description="Example: /weather. The selected method must exist in the document." onChange={(next) => onChange({ operationPath: next })} />
        <SelectField id="supply-openapi-method" label="HTTP method" value={value.operationMethod} disabled={disabled} {...(errors.operationPath === undefined ? {} : { error: errors.operationPath })} options={[{ value: 'get', label: 'GET' }, { value: 'post', label: 'POST' }]} onChange={(next) => onChange({ operationMethod: next as 'get' | 'post' })} />
      </>
    )}
    {guidedSelection ? <TextField id="supply-openapi-operation" label="Selected operation" value={value.operationPath === '' ? 'None selected' : `${value.operationMethod.toUpperCase()} ${value.operationPath}`} disabled {...(errors.operationPath === undefined ? {} : { error: errors.operationPath })} description="Only an executable or credential-authorized GET or POST outcome can be selected." onChange={() => undefined} /> : null}
    <JsonField id="supply-openapi-fixed-query" label="Fixed query mapping (JSON)" value={value.fixedQueryJson} disabled={disabled} {...(errors.fixedQueryJson === undefined ? {} : { error: errors.fixedQueryJson })} description="Use [] when no fixed query values are needed. Never put credentials here." onChange={(next) => onChange({ fixedQueryJson: next })} />
  </>
}
function OpenApiOperationOutcomes({
  outcomes,
  authority,
  authorityOptions,
  selected,
  disabled,
  onSelect,
}: Readonly<{
  outcomes: readonly OpenApiOperationPreflightOutcome[]
  authority: SupplyAuthority
  authorityOptions: readonly SupplyAuthorityOption[]
  selected: Readonly<{ path: string; method: 'get' | 'post' }>
  disabled: boolean
  onSelect: (operation: Readonly<{ path: string; method: 'get' | 'post' }>) => void
}>) {
  const selectedOutcome = outcomes.find((outcome) => (
    selected.path === outcome.selector.path
    && selected.method === outcome.selector.method.toLowerCase()
  ))
  const selectedValue = selectedOutcome === undefined
    ? ''
    : `${selectedOutcome.selector.method}:${selectedOutcome.selector.path}`
  return (
    <fieldset className="grid gap-2" aria-label="OpenAPI operation outcomes">
      <legend className="text-sm font-semibold text-foreground">Operation outcomes</legend>
      {outcomes.length === 0 ? <p className="text-sm text-muted-foreground">No operations were found in this document.</p> : null}
      <RadioGroup
        name="supply-openapi-operation-outcome"
        value={selectedValue}
        disabled={disabled}
        className="grid gap-2"
        onValueChange={(next) => {
          const outcome = outcomes.find((candidate) => `${candidate.selector.method}:${candidate.selector.path}` === next)
          if (outcome !== undefined && isSelectableOpenApiOperation(outcome, authority, authorityOptions)) {
            onSelect({ path: outcome.selector.path, method: outcome.selector.method.toLowerCase() as 'get' | 'post' })
          }
        }}
      >
        {outcomes.map((outcome) => {
          const operationLabel = `${outcome.selector.method.toUpperCase()} ${outcome.selector.path}`
          const selectable = isSelectableOpenApiOperation(outcome, authority, authorityOptions)
          const value = `${outcome.selector.method}:${outcome.selector.path}`
          return (
            <Field key={`${outcome.selector.method}:${outcome.selector.path}`} orientation="horizontal" className="gap-0" {...(!selectable || disabled ? { 'data-disabled': true } : {})}>
              <FieldLabel
                htmlFor={`supply-openapi-operation-${value}`}
                className={`grid w-full grid-cols-[auto_1fr] gap-3 rounded-md border p-3 ${selectable ? 'border-border' : 'border-muted bg-muted/30'}`}
              >
                {selectable ? (
                  <RadioGroupItem
                    id={`supply-openapi-operation-${value}`}
                    value={value}
                    disabled={disabled}
                    aria-label={`Select ${operationLabel}`}
                  />
                ) : <span aria-hidden="true" className="size-4" />}
                <span className="grid gap-1">
                  <span className="font-mono text-sm text-foreground">{operationLabel}</span>
                  <span className="text-sm font-semibold text-foreground">{outcome.kind}</span>
                  {outcome.kind === 'credential_required' ? (
                    <span className="text-sm text-muted-foreground">Credential: {outcome.credential.kind}{outcome.credential.name === undefined ? '' : ` · ${outcome.credential.name}`}{outcome.credential.location === undefined ? '' : ` · ${outcome.credential.location}`}</span>
                  ) : outcome.kind === 'unsafe' || outcome.kind === 'unsupported_shape' ? (
                    <span className="font-mono text-sm text-muted-foreground">{outcome.reason}</span>
                  ) : null}
                </span>
              </FieldLabel>
            </Field>
          )
        })}
      </RadioGroup>
    </fieldset>
  )
}

function McpFields({ value, disabled, errors, toolName, onToolNameChange, onChange }: Readonly<{ value: EditableSource; disabled: boolean; errors: EndpointErrors; toolName: string; onToolNameChange: (value: string) => void; onChange: (patch: Readonly<Partial<EditableSource>>) => void }>) {
  return <>
    <TextField id="supply-mcp-server-url" label="MCP server HTTPS URL" value={value.serverUrl} disabled={disabled} {...(errors.serverUrl === undefined ? {} : { error: errors.serverUrl })} description="The URL must be public HTTPS." onChange={(next) => onChange({ serverUrl: next })} type="url" />
    <TextField id="supply-mcp-tool-name" label="MCP tool name / selector" value={toolName} disabled={disabled} {...(errors.toolJson === undefined ? {} : { error: errors.toolJson })} description="This must match name in the tool definition JSON." onChange={onToolNameChange} />
    <JsonField id="supply-mcp-tool" label="MCP tool definition (JSON)" value={value.toolJson} disabled={disabled} {...(errors.toolJson === undefined ? {} : { error: errors.toolJson })} description="Include name, inputSchema, and outputSchema. Do not include a key or token." onChange={(next) => onChange({ toolJson: next })} />
    <TextField id="supply-mcp-protocol" label="MCP protocol version" value={value.protocolVersion} disabled={disabled} {...(errors.protocolVersion === undefined ? {} : { error: errors.protocolVersion })} description="Example: 2025-06-18." onChange={(next) => onChange({ protocolVersion: next })} />
  </>
}

function AgentPluginFields({ value, disabled, errors, toolName, onToolNameChange, onChange }: Readonly<{ value: EditableSource; disabled: boolean; errors: EndpointErrors; toolName: string; onToolNameChange: (value: string) => void; onChange: (patch: Readonly<Partial<EditableSource>>) => void }>) {
  return <>
    <JsonField id="supply-agent-plugin-manifest" label="Agent Plugin manifest (JSON)" value={value.manifestJson} disabled={disabled} {...(errors.manifestJson === undefined ? {} : { error: errors.manifestJson })} description="Use one remote streamable HTTP MCP server. Local command, args, env, and SSE entries are not accepted." onChange={(next) => onChange({ manifestJson: next })} />
    <TextField id="supply-agent-plugin-server" label="Manifest MCP server / selector" value={value.serverName} disabled={disabled} {...(errors.serverName === undefined ? {} : { error: errors.serverName })} description="This must name one server in mcpServers." onChange={(next) => onChange({ serverName: next })} />
    <TextField id="supply-agent-plugin-tool-name" label="MCP tool name / selector" value={toolName} disabled={disabled} {...(errors.toolJson === undefined ? {} : { error: errors.toolJson })} description="This must match name in the tool definition JSON." onChange={onToolNameChange} />
    <JsonField id="supply-agent-plugin-tool" label="MCP tool definition (JSON)" value={value.toolJson} disabled={disabled} {...(errors.toolJson === undefined ? {} : { error: errors.toolJson })} description="Include name, inputSchema, and outputSchema. Do not include a key or token." onChange={(next) => onChange({ toolJson: next })} />
    <TextField id="supply-agent-plugin-protocol" label="MCP protocol version" value={value.protocolVersion} disabled={disabled} {...(errors.protocolVersion === undefined ? {} : { error: errors.protocolVersion })} description="Example: 2025-06-18." onChange={(next) => onChange({ protocolVersion: next })} />
  </>
}

function X402Fields({ value, disabled, errors, resourceUrl, onResourceUrlChange, onChange }: Readonly<{ value: EditableSource; disabled: boolean; errors: EndpointErrors; resourceUrl: string; onResourceUrlChange: (value: string) => void; onChange: (patch: Readonly<Partial<EditableSource>>) => void }>) {
  return <>
    <JsonField id="supply-x402-resource" label="x402 resource and payment metadata (JSON)" value={value.resourceJson} disabled={disabled} {...(errors.resourceJson === undefined ? {} : { error: errors.resourceJson })} description="Include resourceUrl, inputSchema, outputSchema, exact payment terms, and any PaymentRequired challenge." onChange={(next) => onChange({ resourceJson: next })} />
    <TextField id="supply-x402-resource-url" label="x402 resource HTTPS URL / selector" value={resourceUrl} disabled={disabled} {...(errors.resourceJson === undefined ? {} : { error: errors.resourceJson })} description="This must exactly match resourceUrl in the JSON." onChange={onResourceUrlChange} type="url" />
  </>
}

function JsonField({ id, label, value, disabled, error, description, onChange }: Readonly<{ id: string; label: string; value: string; disabled: boolean; error?: string; description: string; onChange: (value: string) => void }>) {
  return <Field {...(error === undefined ? {} : { 'data-invalid': true })}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Textarea id={id} value={value} disabled={disabled} aria-invalid={error !== undefined || undefined} aria-describedby={`${id}-description`} onChange={(event) => onChange(event.currentTarget.value)} rows={7} className="font-mono text-sm" />
    <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
    {error === undefined ? null : <FieldError>{error}</FieldError>}
  </Field>
}

function TextField({ id, label, value, disabled, error, description, onChange, type = 'text' }: Readonly<{ id: string; label: string; value: string; disabled: boolean; error?: string; description: string; onChange: (value: string) => void; type?: string }>) {
  return <Field {...(error === undefined ? {} : { 'data-invalid': true })}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Input id={id} type={type} value={value} disabled={disabled} aria-invalid={error !== undefined || undefined} aria-describedby={`${id}-description`} onChange={(event) => onChange(event.currentTarget.value)} className="min-h-touch" />
    <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
    {error === undefined ? null : <FieldError>{error}</FieldError>}
  </Field>
}

function SelectField({ id, label, value, disabled, error, options, onChange }: Readonly<{ id: string; label: string; value: string; disabled: boolean; error?: string; options: readonly Readonly<{ value: string; label: string }>[]; onChange: (value: string) => void }>) {
  return <Field {...(error === undefined ? {} : { 'data-invalid': true })}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select value={value} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger id={id} className="min-h-touch"><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
    {error === undefined ? null : <FieldError>{error}</FieldError>}
  </Field>
}

function AuthorityField({ value, sourceKind, authorityOptions, disabled, error, onChange }: Readonly<{ value: SupplyAuthority; sourceKind: SupplySourceKind; authorityOptions: readonly SupplyAuthorityOption[]; disabled: boolean; error?: string; onChange: (value: SupplyAuthority) => void }>) {
  const compatible = authorityOptions.filter((option) => option.adapterId === authorityAdapterId(sourceKind))
  const selected = value.kind === 'public_upstream' ? 'public_upstream' : `provider_connection:${value.connectionRef}`
  return <Field {...(error === undefined ? {} : { 'data-invalid': true })}>
    <FieldLabel htmlFor="supply-authority">Access authority</FieldLabel>
    <Select value={selected} disabled={disabled} onValueChange={(next) => {
      if (next === 'public_upstream') onChange({ kind: 'public_upstream' })
      else {
        const option = compatible.find((item) => `provider_connection:${item.connectionRef}` === next)
        if (option !== undefined) onChange({ kind: 'provider_connection', connectionRef: option.connectionRef, providerRef: option.providerRef })
      }
    }}>
      <SelectTrigger id="supply-authority" className="min-h-touch"><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>
        <SelectItem value="public_upstream">{sourceKind === 'x402' ? 'Choose an x402 provider connection' : 'Public upstream (no supplier secret)'}</SelectItem>
        {compatible.map((option) => <SelectItem key={option.connectionRef} value={`provider_connection:${option.connectionRef}`} disabled={!option.available}>{option.providerRef} · {option.available ? 'available' : 'needs reconnection'}</SelectItem>)}
      </SelectGroup></SelectContent>
    </Select>
    <FieldDescription>Only an existing owner-scoped connection with this adapter can be used. Credential locators are never displayed.</FieldDescription>
    {error === undefined ? null : <FieldError>{error}</FieldError>}
  </Field>
}

function editableSource(value?: SupplyEndpointConfigValue): EditableSource {
  const common = {
    sourceRevision: value?.sourceRevision ?? '',
    contractJson: value?.contract === undefined ? '' : JSON.stringify(value.contract, null, 2),
    commercialJson: value?.commercial === undefined ? '' : JSON.stringify(value.commercial, null, 2),
    evidenceRefsJson: value?.evidenceRefs === undefined ? '[]' : JSON.stringify(value.evidenceRefs, null, 2),
    requestTimeoutMs: String(value?.requestTimeoutMs ?? 10_000),
  }
  if (value?.sourceKind === 'openapi_http') return { ...emptyEditable('openapi_http'), ...common, documentJson: value.documentJson, operationPath: value.operation.path, operationMethod: value.operation.method, fixedQueryJson: JSON.stringify(value.fixedQuery, null, 2), authority: value.authority }
  if (value?.sourceKind === 'mcp') return { ...emptyEditable('mcp'), ...common, serverUrl: value.serverUrl, toolJson: value.toolJson, protocolVersion: value.protocolVersion, authority: value.authority }
  if (value?.sourceKind === 'agent_plugin_mcp') return { ...emptyEditable('agent_plugin_mcp'), ...common, manifestJson: value.manifestJson, serverName: value.serverName, toolJson: value.toolJson, protocolVersion: value.protocolVersion, authority: value.authority }
  if (value?.sourceKind === 'x402') return { ...emptyEditable('x402'), ...common, resourceJson: value.resourceJson, authority: value.authority }
  return emptyEditable('openapi_http')
}

function emptyEditable(sourceKind: SupplySourceKind): EditableSource {
  return { sourceKind, sourceRevision: '', contractJson: '', commercialJson: '', evidenceRefsJson: '[]', requestTimeoutMs: '10000', authority: { kind: 'public_upstream' }, documentJson: '', operationPath: '', operationMethod: 'post', fixedQueryJson: '[]', serverUrl: '', toolJson: '', protocolVersion: '', manifestJson: '', serverName: '', resourceJson: '' }
}

function initialToolName(value?: SupplyEndpointConfigValue): string {
  if (value?.sourceKind !== 'mcp' && value?.sourceKind !== 'agent_plugin_mcp') return ''
  const tool = parseObject(value.toolJson)
  return typeof tool?.name === 'string' ? tool.name : ''
}

function initialResourceUrl(value?: SupplyEndpointConfigValue): string {
  if (value?.sourceKind !== 'x402') return ''
  const resource = parseObject(value.resourceJson)
  return typeof resource?.resourceUrl === 'string' ? resource.resourceUrl : ''
}

function sourceKindFromValue(value: string): SupplySourceKind {
  if (value === 'mcp' || value === 'agent_plugin_mcp' || value === 'x402') return value
  return 'openapi_http'
}

function authorityAdapterId(sourceKind: SupplySourceKind): string {
  return sourceKind === 'openapi_http' ? 'http-json:v1' : sourceKind === 'x402' ? 'x402-fetch:v2' : 'mcp-jsonrpc:v1'
}

function buildEndpointValue(value: EditableSource, extras: PreflightExtras): Readonly<{ kind: 'accepted'; value: SupplyEndpointConfigValue } | { kind: 'refused'; field: EndpointField; errors: EndpointErrors; message: string }> {
  if (value.sourceRevision.trim() === '') return invalid('sourceRevision', 'Enter a source revision before checking the Operation.')
  if (new TextEncoder().encode(value.documentJson + value.contractJson + value.commercialJson + value.manifestJson + value.toolJson + value.resourceJson).byteLength > MAX_SOURCE_BYTES) return invalid('sourceRevision', 'The source is too large. Keep the submitted material under 256 KiB.')
  const contract = parseObject(value.contractJson)
  if (contract === undefined) return invalid('contractJson', 'Enter valid contract JSON.')
  if (!Array.isArray(contract.evidence) || !contract.evidence.some((item) => isRecord(item) && typeof item.outputPointer === 'string' && item.outputPointer.length > 0)) return invalid('contractJson', 'The contract must declare at least one output evidence pointer.')
  const commercial = parseObject(value.commercialJson)
  if (commercial === undefined) return invalid('commercialJson', 'Enter valid commercial metadata JSON.')
  if (containsCredentialValue(commercial)) return invalid('commercialJson', 'Commercial metadata must not contain a raw credential, token, secret, password, or environment locator.')
  const evidenceRefs = parseEvidenceRefs(value.evidenceRefsJson)
  if (evidenceRefs === undefined) return invalid('evidenceRefsJson', 'Enter evidence references as a JSON array of non-empty strings.')
  const requestTimeoutMs = Number(value.requestTimeoutMs)
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 100 || requestTimeoutMs > 120_000) return invalid('requestTimeoutMs', 'Use a whole-number timeout from 100 to 120,000 milliseconds.')
  if (value.sourceKind === 'x402' && value.authority.kind === 'public_upstream') return invalid('authority', 'Choose an existing x402 supplier connection before checking this Operation.')
  if (value.authority.kind === 'provider_connection' && (value.authority.connectionRef.trim() === '' || value.authority.providerRef.trim() === '' || /(env:|secret|token|password|key)/i.test(`${value.authority.connectionRef} ${value.authority.providerRef}`))) return invalid('authority', 'Choose an existing owner provider connection. Raw credentials and env locators are not accepted.')
  if (!isRecord(commercial.offering) || typeof commercial.bindingId !== 'string' || commercial.bindingId.trim() === '') return invalid('commercialJson', 'Commercial metadata must include an offering object and bindingId.')
  const commercialInput: CapabilityImporterCommercialInput = {
    offering: commercial.offering as CapabilityImporterCommercialInput['offering'],
    bindingId: commercial.bindingId.trim(),
    authority: value.authority,
    registrationEvidenceRefs: evidenceRefs,
    requestTimeoutMs,
  }
  const shared = { sourceRevision: value.sourceRevision.trim(), contract: contract as CapabilityContractMetadata, commercial: commercialInput, evidenceRefs, requestTimeoutMs, authority: value.authority }
  if (value.sourceKind === 'openapi_http') {
    const document = parseObject(value.documentJson)
    if (document === undefined) return invalid('documentJson', 'Enter valid OpenAPI JSON.')
    if (typeof document.openapi !== 'string' || !document.openapi.startsWith('3.1.')) return invalid('documentJson', 'Use an OpenAPI 3.1 document.')
    const servers = document.servers
    if (!Array.isArray(servers) || servers.length !== 1 || !isRecord(servers[0]) || typeof servers[0].url !== 'string' || !validPublicHttpsUrl(servers[0].url)) return invalid('documentJson', 'The document must contain exactly one public HTTPS server URL.')
    if (!value.operationPath.startsWith('/')) return invalid('operationPath', 'Enter an operation path beginning with /.')
    const path = isRecord(document.paths) ? document.paths[value.operationPath] : undefined
    if (!isRecord(path) || !isRecord(path[value.operationMethod])) return invalid('operationPath', 'Choose a path and method that exist in the OpenAPI document.')
    const fixedQuery = parseFixedQuery(value.fixedQueryJson)
    if (fixedQuery === undefined) return invalid('fixedQueryJson', 'Enter fixed query mapping as a JSON array of {parameter,value} objects, or [].')
    return { kind: 'accepted', value: { sourceKind: 'openapi_http', ...shared, documentJson: value.documentJson, operation: { path: value.operationPath, method: value.operationMethod }, fixedQuery } }
  }
  if (value.sourceKind === 'mcp') {
    if (!validPublicHttpsUrl(value.serverUrl)) return invalid('serverUrl', 'Enter a public HTTPS MCP server URL.')
    const tool = parseObject(value.toolJson)
    if (tool === undefined || typeof tool.name !== 'string' || tool.name.trim() === '' || !isRecord(tool.inputSchema) || !isRecord(tool.outputSchema)) return invalid('toolJson', 'Enter tool JSON with name, inputSchema, and outputSchema.')
    if (extras.toolName.trim() === '' || extras.toolName.trim() !== tool.name) return invalid('toolJson', 'The visible tool selector must exactly match tool.name in the JSON.')
    if (value.protocolVersion.trim() === '') return invalid('protocolVersion', 'Enter the MCP protocol version.')
    return { kind: 'accepted', value: { sourceKind: 'mcp', ...shared, serverUrl: value.serverUrl, toolJson: value.toolJson, protocolVersion: value.protocolVersion.trim() } }
  }
  if (value.sourceKind === 'agent_plugin_mcp') {
    const manifest = parseObject(value.manifestJson)
    if (manifest === undefined || typeof manifest.name !== 'string' || !isRecord(manifest.mcpServers)) return invalid('manifestJson', 'Enter a valid Agent Plugin manifest with mcpServers.')
    const selected = manifest.mcpServers[value.serverName]
    if (value.serverName.trim() === '' || !isRecord(selected)) return invalid('serverName', 'Choose a server name that exists in mcpServers.')
    if (selected.type !== 'http' || typeof selected.url !== 'string' || !validPublicHttpsUrl(selected.url) || selected.command !== undefined || selected.args !== undefined || selected.env !== undefined) return invalid('manifestJson', 'The selected manifest server must use remote HTTPS streamable HTTP without command, args, or env.')
    const tool = parseObject(value.toolJson)
    if (tool === undefined || typeof tool.name !== 'string' || tool.name.trim() === '' || !isRecord(tool.inputSchema) || !isRecord(tool.outputSchema)) return invalid('toolJson', 'Enter tool JSON with name, inputSchema, and outputSchema.')
    if (extras.toolName.trim() === '' || extras.toolName.trim() !== tool.name) return invalid('toolJson', 'The visible tool selector must exactly match tool.name in the JSON.')
    if (value.protocolVersion.trim() === '') return invalid('protocolVersion', 'Enter the MCP protocol version.')
    return { kind: 'accepted', value: { sourceKind: 'agent_plugin_mcp', ...shared, manifestJson: value.manifestJson, serverName: value.serverName.trim(), toolJson: value.toolJson, protocolVersion: value.protocolVersion.trim() } }
  }
  const resource = parseObject(value.resourceJson)
  if (resource === undefined || typeof resource.resourceUrl !== 'string' || !validPublicHttpsUrl(resource.resourceUrl)) return invalid('resourceJson', 'Enter x402 resource JSON with a public HTTPS resourceUrl.')
  if (extras.resourceUrl.trim() === '' || extras.resourceUrl.trim() !== resource.resourceUrl) return invalid('resourceJson', 'The visible resource selector must exactly match resourceUrl in the JSON.')

  if (!isRecord(resource.inputSchema) || !isRecord(resource.outputSchema)) return invalid('resourceJson', 'The x402 resource must include inputSchema and outputSchema.')
  if (resource.scheme !== 'exact' || typeof resource.network !== 'string' || typeof resource.asset !== 'string' || typeof resource.payTo !== 'string') return invalid('resourceJson', 'x402 metadata must declare exact scheme, network, asset, and payTo.')
  const declaredPrice = isRecord(resource.price) ? resource.price : undefined
  const offeringPrice = isRecord(commercial.offering) && isRecord(commercial.offering.presentation) && isRecord(commercial.offering.presentation.price) && isRecord(commercial.offering.presentation.price.amount) ? commercial.offering.presentation.price.amount : undefined
  if (declaredPrice !== undefined && offeringPrice !== undefined && (declaredPrice.currency !== offeringPrice.currency || declaredPrice.units !== offeringPrice.units || declaredPrice.exponent !== offeringPrice.exponent)) return invalid('resourceJson', 'The x402 resource price does not match the commercial offering price.')
  return { kind: 'accepted', value: { sourceKind: 'x402', ...shared, resourceJson: value.resourceJson } }
}
export function toCapabilityPublicationImport(value: SupplyEndpointConfigValue): SupplyPublicationImport {
  const common = {
    sourceRevision: value.sourceRevision,
    contract: value.contract as CapabilityContractMetadata,
    commercial: value.commercial as CapabilityImporterCommercialInput,
    evidenceRefs: value.evidenceRefs,
  }
  if (value.sourceKind === 'openapi_http') {
    return {
      kind: 'openapi_http',
      document: parseRequiredObject(value.documentJson),
      operation: value.operation,
      fixedQuery: value.fixedQuery,
      ...common,
    }
  }
  if (value.sourceKind === 'mcp') {
    return {
      kind: 'mcp',
      serverUrl: value.serverUrl,
      tool: parseRequiredObject(value.toolJson),
      protocolVersion: value.protocolVersion,
      ...common,
    }
  }
  if (value.sourceKind === 'agent_plugin_mcp') {
    return {
      kind: 'agent_plugin_mcp',
      manifest: parseRequiredObject(value.manifestJson),
      serverName: value.serverName,
      tool: parseRequiredObject(value.toolJson),
      protocolVersion: value.protocolVersion,
      ...common,
    }
  }
  return {
    kind: 'x402',
    resource: parseRequiredObject(value.resourceJson),
    ...common,
  }
}

function parseRequiredObject(value: string): Record<string, unknown> {
  const parsed = parseObject(value)
  if (parsed === undefined) throw new Error('source_form_invalid')
  return parsed
}

function invalid(field: EndpointField, message: string) {
  return { kind: 'refused' as const, field, errors: { [field]: message }, message }
}
function parseObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}
function parseEvidenceRefs(value: string): readonly string[] | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) && parsed.every((item): item is string => typeof item === 'string' && item.trim() !== '') ? parsed : undefined
  } catch {
    return undefined
  }
}
function parseFixedQuery(value: string): readonly Readonly<{ parameter: string; value: string }>[] | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return undefined
    const result: Array<{ parameter: string; value: string }> = []
    for (const item of parsed) {
      if (!isRecord(item) || typeof item.parameter !== 'string' || item.parameter.trim() === '' || typeof item.value !== 'string' || item.value.trim() === '') return undefined
      result.push({ parameter: item.parameter, value: item.value })
    }
    return result
  } catch {
    return undefined
  }
}
function containsCredentialValue(value: unknown, key = ''): boolean {
  if (typeof value === 'string') return /(?:env:|secret|token|password|authorization|api[_-]?key)/i.test(key)
  if (Array.isArray(value)) return value.some((item) => containsCredentialValue(item, key))
  if (!isRecord(value)) return false
  return Object.entries(value).some(([entryKey, entryValue]) => containsCredentialValue(entryValue, entryKey))
}
function validPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hash !== '') return false
    if (hostname === 'localhost' || hostname === 'local' || hostname.endsWith('.local') || hostname === '::1' || hostname.startsWith('127.') || hostname.startsWith('10.') || hostname.startsWith('192.168.') || hostname.startsWith('172.16.') || hostname.startsWith('172.17.') || hostname.startsWith('172.18.') || hostname.startsWith('172.19.') || hostname.startsWith('172.2') || hostname.startsWith('172.30.') || hostname.startsWith('172.31.')) return false
    return hostname.length > 0
  } catch {
    return false
  }
}
function isSelectableOpenApiOperation(
  outcome: OpenApiOperationPreflightOutcome,
  authority: SupplyAuthority,
  authorityOptions: readonly SupplyAuthorityOption[],
): boolean {
  if (outcome.selector.method.toLowerCase() !== 'get' && outcome.selector.method.toLowerCase() !== 'post') return false
  if (outcome.kind === 'executable') return true
  if (outcome.kind !== 'credential_required' || authority.kind !== 'provider_connection') return false
  return authorityOptions.some((option) => option.connectionRef === authority.connectionRef
    && option.providerRef === authority.providerRef
    && option.adapterId === authorityAdapterId('openapi_http')
    && option.available)
}
function documentPreflightFix(reason: string): string {
  switch (reason) {
    case 'source_too_large': return 'Reduce the OpenAPI document below AE’s bounded size limit.'
    case 'source_too_deep': return 'Simplify the OpenAPI document nesting and inspect it again.'
    case 'source_version_unsupported': return 'Use an OpenAPI 3.1 document.'
    case 'schema_missing': return 'Add a paths object with guarded JSON request and response schemas.'
    case 'transport_unsupported': return 'Use one public HTTPS server URL.'
    case 'openapi_path_parameter_required': return 'Declare every {placeholder} as an in:path parameter with required: true, then inspect again.'
    default: return 'Correct the named source rule and inspect the document again.'
  }
}
function preflightField(reason: string, sourceKind: SupplySourceKind): EndpointField {
  if (reason.includes('path_parameter')) return sourceKind === 'openapi_http' ? 'documentJson' : 'authority'
  if (reason.includes('selector') || reason.includes('operation')) return sourceKind === 'openapi_http' ? 'operationPath' : sourceKind === 'agent_plugin_mcp' ? 'serverName' : sourceKind === 'x402' ? 'resourceJson' : 'toolJson'
  if (reason.includes('transport') || reason.includes('target')) return sourceKind === 'openapi_http' ? 'documentJson' : sourceKind === 'mcp' ? 'serverUrl' : sourceKind === 'agent_plugin_mcp' ? 'manifestJson' : 'resourceJson'
  if (reason.includes('schema') || reason.includes('source') || reason.includes('output') || reason.includes('payment')) return sourceKind === 'openapi_http' ? 'documentJson' : sourceKind === 'mcp' || sourceKind === 'agent_plugin_mcp' ? 'toolJson' : 'resourceJson'
  return 'authority'
}
function focusField(field: EndpointField) {
  const ids: Record<EndpointField, string> = {
    sourceRevision: 'supply-source-revision', contractJson: 'supply-contract', commercialJson: 'supply-commercial', evidenceRefsJson: 'supply-evidence-refs', documentJson: 'supply-openapi-document', operationPath: 'supply-openapi-operation', fixedQueryJson: 'supply-openapi-fixed-query', serverUrl: 'supply-mcp-server-url', toolJson: 'supply-mcp-tool', protocolVersion: 'supply-mcp-protocol', manifestJson: 'supply-agent-plugin-manifest', serverName: 'supply-agent-plugin-server', resourceJson: 'supply-x402-resource', requestTimeoutMs: 'supply-timeout', authority: 'supply-authority',
  }
  document.getElementById(ids[field])?.focus()
}
