import { useState, type ReactNode } from 'react'
import { CheckCircle2Icon } from 'lucide-react'

import { AeSection } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SUPPLY_SOURCE_TYPE_COPY } from '@/content/reason-copy'
import { cn } from '@/lib/utils'
import {
  INSECURE_URL_DIAGNOSTIC,
  inspectHttpsUrl,
  inspectJsonPayload,
  MALFORMED_JSON_DIAGNOSTIC,
  MCP_JSON_REQUIRED_KEYS,
  PLUGIN_JSON_REQUIRED_KEYS,
  TACTILE,
  type Environment,
  type HttpsUrlPreflight,
  type JsonPreflight,
  type SourceKind,
} from './supply-source-native-start-presentation'
import { TextField } from './SupplyFieldPrimitives'

type UrlDiscoverDiagnostic = typeof INSECURE_URL_DIAGNOSTIC
type JsonDiscoverDiagnostic = typeof MALFORMED_JSON_DIAGNOSTIC

type DiscoverDiagnosticState =
  | Readonly<{ target: 'definitionUrl' | 'serverUrl' | 'resourceUrl'; diagnostic: UrlDiscoverDiagnostic }>
  | Readonly<{ target: 'pluginJson' | 'mcpJson'; diagnostic: JsonDiscoverDiagnostic }>

export function SupplySourceTypeSection({
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
  const [discoverDiagnostic, setDiscoverDiagnostic] = useState<DiscoverDiagnosticState>()

  function clearDiscoverDiagnostic() {
    setDiscoverDiagnostic(undefined)
  }

  function handleDiscover() {
    setDiscoverDiagnostic(undefined)

    if (sourceKind === 'openapi') {
      const preflight = inspectHttpsUrl(definitionUrl)
      if (preflight === 'invalid' || preflight === 'insecure') {
        setDiscoverDiagnostic({ target: 'definitionUrl', diagnostic: INSECURE_URL_DIAGNOSTIC })
        return
      }
    }
    if (sourceKind === 'mcp' && mcpLocator === 'url') {
      const preflight = inspectHttpsUrl(serverUrl)
      if (preflight === 'invalid' || preflight === 'insecure') {
        setDiscoverDiagnostic({ target: 'serverUrl', diagnostic: INSECURE_URL_DIAGNOSTIC })
        return
      }
    }
    if (sourceKind === 'x402') {
      const preflight = inspectHttpsUrl(resourceUrl)
      if (preflight === 'invalid' || preflight === 'insecure') {
        setDiscoverDiagnostic({ target: 'resourceUrl', diagnostic: INSECURE_URL_DIAGNOSTIC })
        return
      }
    }
    if (sourceKind === 'agent_plugin') {
      const pluginPreflight = inspectJsonPayload(pluginJson, PLUGIN_JSON_REQUIRED_KEYS)
      if (pluginPreflight === 'invalid' || pluginPreflight === 'not_object' || pluginPreflight === 'missing_fields') {
        setDiscoverDiagnostic({ target: 'pluginJson', diagnostic: MALFORMED_JSON_DIAGNOSTIC })
        return
      }
      const mcpPreflight = inspectJsonPayload(mcpJson, MCP_JSON_REQUIRED_KEYS)
      if (mcpPreflight === 'invalid' || mcpPreflight === 'not_object' || mcpPreflight === 'missing_fields') {
        setDiscoverDiagnostic({ target: 'mcpJson', diagnostic: MALFORMED_JSON_DIAGNOSTIC })
        return
      }
    }

    onDiscover()
  }

  return (
    <AeSection title="Source" description="Start with the interface you already operate. AE discovers the Tools and derives the protocol facts.">
      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel>Source type</FieldLabel>
          <Button
            type="button"
            variant={sourceKind === 'x402' ? 'secondary' : 'outline'}
            className={cn('h-auto w-full justify-start whitespace-normal p-4 text-left', TACTILE)}
            aria-pressed={sourceKind === 'x402'}
            disabled={disabled}
            onClick={() => onSourceKindChange('x402')}
          >
            <span className="grid gap-1">
              <span className="font-medium">x402 <span className="text-xs text-muted-foreground">Recommended for alpha</span></span>
              <span className="font-normal text-muted-foreground">Use an endpoint that already publishes its payment terms.</span>
            </span>
          </Button>
          <Collapsible defaultOpen={sourceKind !== 'x402'}>
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  className={cn('w-fit min-h-touch', TACTILE)}
                  disabled={disabled}
                >
                  Other source types
                </Button>
              }
            />
            <CollapsibleContent className="pt-2">
              <Tabs value={sourceKind} onValueChange={onSourceKindChange}>
                <TabsList className="max-w-full overflow-x-auto" aria-label="Other source types">
                  <TabsTrigger value="openapi" disabled={disabled} className={TACTILE}>OpenAPI</TabsTrigger>
                  <TabsTrigger value="mcp" disabled={disabled} className={TACTILE}>MCP</TabsTrigger>
                  <TabsTrigger value="agent_plugin" disabled={disabled} className={TACTILE}>Agent Plugin</TabsTrigger>
                </TabsList>
              </Tabs>
            </CollapsibleContent>
          </Collapsible>
          <FieldDescription>{SUPPLY_SOURCE_TYPE_COPY[sourceKind]}</FieldDescription>
        </Field>
        <EnvironmentField value={environment} disabled={disabled} onChange={onEnvironmentChange} />
        {sourceKind === 'openapi' ? (
          <UrlFieldWithPreflight
            id="supply-native-openapi-url"
            label="OpenAPI URL"
            value={definitionUrl}
            description="OpenAPI 3.0 or 3.1, JSON or YAML, at a public HTTPS URL."
            {...(discoverDiagnostic?.target === 'definitionUrl'
              ? { discoverDiagnostic: discoverDiagnostic.diagnostic }
              : {})}
            onChange={(next) => {
              clearDiscoverDiagnostic()
              onDefinitionUrlChange(next)
            }}
          />
        ) : null}
        {sourceKind === 'mcp' ? (
          <McpSourceFields
            locator={mcpLocator}
            serverUrl={serverUrl}
            registryName={registryName}
            {...(discoverDiagnostic?.target === 'serverUrl'
              ? { serverUrlDiscoverDiagnostic: discoverDiagnostic.diagnostic }
              : {})}
            onLocatorChange={(next) => {
              clearDiscoverDiagnostic()
              onMcpLocatorChange(next)
            }}
            onServerUrlChange={(next) => {
              clearDiscoverDiagnostic()
              onServerUrlChange(next)
            }}
            onRegistryNameChange={(next) => {
              clearDiscoverDiagnostic()
              onRegistryNameChange(next)
            }}
          />
        ) : null}
        {sourceKind === 'agent_plugin' ? (
          <AgentPluginFields
            pluginJson={pluginJson}
            mcpJson={mcpJson}
            {...(discoverDiagnostic?.target === 'pluginJson'
              ? { pluginDiscoverDiagnostic: discoverDiagnostic.diagnostic }
              : {})}
            {...(discoverDiagnostic?.target === 'mcpJson'
              ? { mcpDiscoverDiagnostic: discoverDiagnostic.diagnostic }
              : {})}
            onPluginJsonChange={(next) => {
              clearDiscoverDiagnostic()
              onPluginJsonChange(next)
            }}
            onMcpJsonChange={(next) => {
              clearDiscoverDiagnostic()
              onMcpJsonChange(next)
            }}
            onError={onFieldError}
          />
        ) : null}
        {sourceKind === 'x402' ? (
          <X402SourceFields
            resourceUrl={resourceUrl}
            method={x402Method}
            {...(discoverDiagnostic?.target === 'resourceUrl'
              ? { resourceUrlDiscoverDiagnostic: discoverDiagnostic.diagnostic }
              : {})}
            onResourceUrlChange={(next) => {
              clearDiscoverDiagnostic()
              onResourceUrlChange(next)
            }}
            onMethodChange={(next) => {
              clearDiscoverDiagnostic()
              onX402MethodChange(next)
            }}
          />
        ) : null}
        <Button
          type="button"
          className={cn('min-h-touch justify-self-start', TACTILE)}
          disabled={disabled}
          aria-busy={discovering || undefined}
          onClick={handleDiscover}
        >
          {discovering ? 'Discovering endpoints…' : 'Discover endpoints'}
        </Button>
      </FieldGroup>
    </AeSection>
  )
}

function EnvironmentField({ value, disabled, onChange }: Readonly<{ value: Environment; disabled: boolean; onChange: (value: Environment) => void }>) {
  return (
    <Field>
      <FieldLabel>Environment</FieldLabel>
      <RadioGroup value={value} disabled={disabled} className="grid-cols-2" onValueChange={(next) => onChange(next as Environment)}>
        <Label className={cn('min-h-touch rounded-md border border-border p-3', TACTILE)}><RadioGroupItem value="sandbox" />Sandbox</Label>
        <Label className={cn('min-h-touch rounded-md border border-border p-3', TACTILE)}><RadioGroupItem value="production" />Production</Label>
      </RadioGroup>
      <FieldDescription>Sandbox is selected by default.</FieldDescription>
    </Field>
  )
}

function UrlFieldWithPreflight({
  id,
  label,
  value,
  description,
  discoverDiagnostic,
  onChange,
}: Readonly<{
  id: string
  label: string
  value: string
  description: string
  discoverDiagnostic?: UrlDiscoverDiagnostic | undefined
  onChange: (value: string) => void
}>) {
  const preflight = inspectHttpsUrl(value)
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} type="url" value={value} onChange={(event) => onChange(event.currentTarget.value)} />
      <FieldDescription>{description}</FieldDescription>
      <PreflightSlot>
        {discoverDiagnostic !== undefined ? (
          <PreflightRule4Alert diagnostic={discoverDiagnostic} />
        ) : (
          <HttpsUrlPreflightBadge status={preflight} />
        )}
      </PreflightSlot>
    </Field>
  )
}

function McpSourceFields({
  locator,
  serverUrl,
  registryName,
  serverUrlDiscoverDiagnostic,
  onLocatorChange,
  onServerUrlChange,
  onRegistryNameChange,
}: Readonly<{
  locator: 'url' | 'registry'
  serverUrl: string
  registryName: string
  serverUrlDiscoverDiagnostic?: UrlDiscoverDiagnostic | undefined
  onLocatorChange: (value: 'url' | 'registry') => void
  onServerUrlChange: (value: string) => void
  onRegistryNameChange: (value: string) => void
}>) {
  return (
    <>
      <Field>
        <FieldLabel>MCP location</FieldLabel>
        <RadioGroup value={locator} className="grid-cols-2" onValueChange={(next) => onLocatorChange(next as 'url' | 'registry')}>
          <Label className={cn('min-h-touch rounded-md border border-border p-3', TACTILE)}><RadioGroupItem value="url" />Server URL</Label>
          <Label className={cn('min-h-touch rounded-md border border-border p-3', TACTILE)}><RadioGroupItem value="registry" />Registry name</Label>
        </RadioGroup>
      </Field>
      {locator === 'url'
        ? (
            <UrlFieldWithPreflight
              id="supply-native-mcp-url"
              label="MCP server URL"
              value={serverUrl}
              description="Remote streamable HTTP over public HTTPS."
              discoverDiagnostic={serverUrlDiscoverDiagnostic}
              onChange={onServerUrlChange}
            />
          )
        : <TextField id="supply-native-mcp-registry" label="MCP Registry name" value={registryName} onChange={onRegistryNameChange} description="The exact published Registry name." />}
    </>
  )
}

function AgentPluginFields({
  pluginJson,
  mcpJson,
  pluginDiscoverDiagnostic,
  mcpDiscoverDiagnostic,
  onPluginJsonChange,
  onMcpJsonChange,
  onError,
}: Readonly<{
  pluginJson: string
  mcpJson: string
  pluginDiscoverDiagnostic?: JsonDiscoverDiagnostic | undefined
  mcpDiscoverDiagnostic?: JsonDiscoverDiagnostic | undefined
  onPluginJsonChange: (value: string) => void
  onMcpJsonChange: (value: string) => void
  onError: (value: string) => void
}>) {
  return (
    <>
      <JsonFileField
        id="supply-native-plugin-json"
        label="plugin.json"
        loaded={pluginJson !== ''}
        jsonValue={pluginJson}
        requiredKeys={PLUGIN_JSON_REQUIRED_KEYS}
        discoverDiagnostic={pluginDiscoverDiagnostic}
        onChange={onPluginJsonChange}
        onError={onError}
      />
      <JsonFileField
        id="supply-native-mcp-json"
        label="mcp.json"
        loaded={mcpJson !== ''}
        jsonValue={mcpJson}
        requiredKeys={MCP_JSON_REQUIRED_KEYS}
        discoverDiagnostic={mcpDiscoverDiagnostic}
        onChange={onMcpJsonChange}
        onError={onError}
      />
    </>
  )
}

function JsonFileField({
  id,
  label,
  loaded,
  jsonValue,
  requiredKeys,
  discoverDiagnostic,
  onChange,
  onError,
}: Readonly<{
  id: string
  label: string
  loaded: boolean
  jsonValue: string
  requiredKeys: readonly string[]
  discoverDiagnostic?: JsonDiscoverDiagnostic | undefined
  onChange: (value: string) => void
  onError: (value: string) => void
}>) {
  const preflight = inspectJsonPayload(jsonValue, requiredKeys)
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="file"
        accept=".json,application/json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (file === undefined) return
          if (file.size > 262_144) {
            onError(`${label} must be 256 KB or smaller.`)
            return
          }
          void file.text().then(onChange).catch(() => onError(`${label} could not be read.`))
        }}
      />
      <FieldDescription>{loaded ? `${label} loaded. Choose another file to replace it.` : `Choose the official Agent Plugins 1.0 ${label} file.`}</FieldDescription>
      <PreflightSlot>
        {discoverDiagnostic !== undefined ? (
          <PreflightRule4Alert diagnostic={discoverDiagnostic} />
        ) : (
          <JsonPreflightBadge status={preflight} />
        )}
      </PreflightSlot>
    </Field>
  )
}

function X402SourceFields({
  resourceUrl,
  method,
  resourceUrlDiscoverDiagnostic,
  onResourceUrlChange,
  onMethodChange,
}: Readonly<{
  resourceUrl: string
  method: 'GET' | 'POST'
  resourceUrlDiscoverDiagnostic?: UrlDiscoverDiagnostic | undefined
  onResourceUrlChange: (value: string) => void
  onMethodChange: (value: 'GET' | 'POST') => void
}>) {
  return (
    <>
      <UrlFieldWithPreflight
        id="supply-native-x402-url"
        label="x402 resource URL"
        value={resourceUrl}
        description="AE reads payment facts from the live signed 402 response."
        discoverDiagnostic={resourceUrlDiscoverDiagnostic}
        onChange={onResourceUrlChange}
      />
      <Field>
        <FieldLabel>Method</FieldLabel>
        <RadioGroup value={method} className="grid-cols-2" onValueChange={(next) => onMethodChange(next as 'GET' | 'POST')}>
          <Label className={cn('min-h-touch rounded-md border border-border p-3', TACTILE)}><RadioGroupItem value="GET" />GET</Label>
          <Label className={cn('min-h-touch rounded-md border border-border p-3', TACTILE)}><RadioGroupItem value="POST" />POST</Label>
        </RadioGroup>
      </Field>
    </>
  )
}

function PreflightSlot({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-[2.5rem] items-center" aria-live="polite">
      {children}
    </div>
  )
}

function HttpsUrlPreflightBadge({ status }: Readonly<{ status: HttpsUrlPreflight }>) {
  if (status === 'empty') return null
  if (status === 'insecure') {
    return <Badge variant="warning">Insecure HTTP URL detected. Agentic Economy requires secure HTTPS endpoints.</Badge>
  }
  if (status === 'invalid') {
    return <Badge variant="warning">Enter a valid HTTPS URL (e.g. https://api.example.com/openapi.json).</Badge>
  }
  return (
    <Badge variant="success" className="gap-1.5">
      <CheckCircle2Icon className="size-3" />
      Valid HTTPS endpoint format
    </Badge>
  )
}

function JsonPreflightBadge({ status }: Readonly<{ status: JsonPreflight }>) {
  if (status === 'empty') return null
  if (status === 'invalid' || status === 'not_object') {
    return <Badge variant="warning">JSON syntax is invalid.</Badge>
  }
  if (status === 'missing_fields') {
    return <Badge variant="warning">JSON is missing required fields.</Badge>
  }
  return (
    <Badge variant="success" className="gap-1.5">
      <CheckCircle2Icon className="size-3" />
      Valid JSON payload
    </Badge>
  )
}

function PreflightRule4Alert({
  diagnostic,
}: Readonly<{
  diagnostic: UrlDiscoverDiagnostic | JsonDiscoverDiagnostic
}>) {
  return (
    <Alert variant="destructive" className="w-full">
      <AlertTitle>{diagnostic.whatHappened}</AlertTitle>
      <AlertDescription className="grid gap-0.5">
        <span className="tabular-nums">{diagnostic.financialImpact}</span>
        <span>{diagnostic.nextStep}</span>
      </AlertDescription>
    </Alert>
  )
}
