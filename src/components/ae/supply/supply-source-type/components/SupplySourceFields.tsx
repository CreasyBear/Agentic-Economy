import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import {
  MCP_JSON_REQUIRED_KEYS,
  PLUGIN_JSON_REQUIRED_KEYS,
  TACTILE,
  type Environment,
} from '../../supply-source-native-start-presentation'
import { TextField } from '../../SupplyFieldPrimitives'
import type {
  AgentPluginFieldsProps,
  EnvironmentFieldProps,
  McpSourceFieldsProps,
  SupplySourceFieldsProps,
  X402SourceFieldsProps,
} from '../supply-source-type.contracts'
import { JsonFileField, UrlFieldWithPreflight } from './SourceValidationResults'

export function SupplySourceFields({
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
  discoverDiagnostic,
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
}: SupplySourceFieldsProps) {
  return (
    <>
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
          onChange={onDefinitionUrlChange}
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
          onLocatorChange={onMcpLocatorChange}
          onServerUrlChange={onServerUrlChange}
          onRegistryNameChange={onRegistryNameChange}
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
          onPluginJsonChange={onPluginJsonChange}
          onMcpJsonChange={onMcpJsonChange}
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
          onResourceUrlChange={onResourceUrlChange}
          onMethodChange={onX402MethodChange}
        />
      ) : null}
    </>
  )
}

function EnvironmentField({ value, disabled, onChange }: EnvironmentFieldProps) {
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

function McpSourceFields({
  locator,
  serverUrl,
  registryName,
  serverUrlDiscoverDiagnostic,
  onLocatorChange,
  onServerUrlChange,
  onRegistryNameChange,
}: McpSourceFieldsProps) {
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
}: AgentPluginFieldsProps) {
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

function X402SourceFields({
  resourceUrl,
  method,
  resourceUrlDiscoverDiagnostic,
  onResourceUrlChange,
  onMethodChange,
}: X402SourceFieldsProps) {
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
