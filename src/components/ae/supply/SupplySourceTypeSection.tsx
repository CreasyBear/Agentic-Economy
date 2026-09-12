import { AeSection } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SUPPLY_SOURCE_TYPE_COPY } from '@/content/reason-copy'
import type { SupplySourcePreview } from '@/modules/capability-supply/source-preview'
import { TextField } from './SupplyFieldPrimitives'
import type { Environment, SourceKind } from './supply-source-native-start-presentation'

type RequiredAction = Extract<SupplySourcePreview, { kind: 'action_required' }>['requiredAction']

export function SupplySourceTypeSection({
  error,
  requiredAction,
  success,
  sourceKind,
  environment,
  definitionUrl,
  mcpLocator,
  serverUrl,
  registryName,
  pluginJson,
  mcpJson,
  resourceUrl,
  x402Method,
  disabled,
  discovering,
  onSourceKindChange,
  onEnvironmentChange,
  onDefinitionUrlChange,
  onMcpLocatorChange,
  onServerUrlChange,
  onRegistryNameChange,
  onPluginJsonChange,
  onMcpJsonChange,
  onResourceUrlChange,
  onX402MethodChange,
  onFieldError,
  onDiscover,
}: Readonly<{
  error?: string
  requiredAction?: RequiredAction
  success?: string
  sourceKind: SourceKind
  environment: Environment
  definitionUrl: string
  mcpLocator: 'url' | 'registry'
  serverUrl: string
  registryName: string
  pluginJson: string
  mcpJson: string
  resourceUrl: string
  x402Method: 'GET' | 'POST'
  disabled: boolean
  discovering: boolean
  onSourceKindChange: (next: string) => void
  onEnvironmentChange: (next: Environment) => void
  onDefinitionUrlChange: (value: string) => void
  onMcpLocatorChange: (next: 'url' | 'registry') => void
  onServerUrlChange: (value: string) => void
  onRegistryNameChange: (value: string) => void
  onPluginJsonChange: (value: string) => void
  onMcpJsonChange: (value: string) => void
  onResourceUrlChange: (value: string) => void
  onX402MethodChange: (value: 'GET' | 'POST') => void
  onFieldError: (value: string) => void
  onDiscover: () => void
}>) {
  return (
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
          <Tabs value={sourceKind} onValueChange={onSourceKindChange}>
            <TabsList className="max-w-full overflow-x-auto" aria-label="Source type">
              <TabsTrigger value="openapi">OpenAPI</TabsTrigger>
              <TabsTrigger value="mcp">MCP</TabsTrigger>
              <TabsTrigger value="agent_plugin">Agent Plugin</TabsTrigger>
              <TabsTrigger value="x402">x402</TabsTrigger>
            </TabsList>
          </Tabs>
          <FieldDescription>{SUPPLY_SOURCE_TYPE_COPY[sourceKind]}</FieldDescription>
        </Field>
        <EnvironmentField value={environment} disabled={disabled} onChange={onEnvironmentChange} />
        {sourceKind === 'openapi' ? <TextField id="supply-native-openapi-url" label="OpenAPI URL" value={definitionUrl} type="url" onChange={onDefinitionUrlChange} description="OpenAPI 3.0 or 3.1, JSON or YAML, at a public HTTPS URL." /> : null}
        {sourceKind === 'mcp' ? <McpSourceFields locator={mcpLocator} serverUrl={serverUrl} registryName={registryName} onLocatorChange={onMcpLocatorChange} onServerUrlChange={onServerUrlChange} onRegistryNameChange={onRegistryNameChange} /> : null}
        {sourceKind === 'agent_plugin' ? <AgentPluginFields pluginJson={pluginJson} mcpJson={mcpJson} onPluginJsonChange={onPluginJsonChange} onMcpJsonChange={onMcpJsonChange} onError={onFieldError} /> : null}
        {sourceKind === 'x402' ? <X402SourceFields resourceUrl={resourceUrl} method={x402Method} onResourceUrlChange={onResourceUrlChange} onMethodChange={onX402MethodChange} /> : null}
        <Button type="button" className="min-h-touch justify-self-start" disabled={disabled} aria-busy={discovering || undefined} onClick={onDiscover}>
          {discovering ? 'Discovering endpoints…' : 'Discover endpoints'}
        </Button>
      </FieldGroup>
    </AeSection>
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

function X402SourceFields({ resourceUrl, method, onResourceUrlChange, onMethodChange }: Readonly<{ resourceUrl: string; method: 'GET' | 'POST'; onResourceUrlChange: (value: string) => void; onMethodChange: (value: 'GET' | 'POST') => void }>) {
  return <><TextField id="supply-native-x402-url" label="x402 resource URL" value={resourceUrl} type="url" onChange={onResourceUrlChange} description="AE reads payment facts from the live signed 402 response." /><Field><FieldLabel>Method</FieldLabel><RadioGroup value={method} className="grid-cols-2" onValueChange={(next) => onMethodChange(next as 'GET' | 'POST')}><Label className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value="GET" />GET</Label><Label className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value="POST" />POST</Label></RadioGroup></Field></>
}
