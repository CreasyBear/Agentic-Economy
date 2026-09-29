import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import {
  MCP_JSON_REQUIRED_KEYS,
  PLUGIN_JSON_REQUIRED_KEYS,
  TACTILE,
  type Environment,
} from '../../supply-source-native-start-presentation'
import {
  SUPPLY_SOURCE_TYPE_COPY,
  type AgentPluginFieldsProps,
  type EnvironmentFieldProps,
  type McpSourceFieldsProps,
  type SupplySourceFieldsProps,
  type X402SourceFieldsProps,
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
  onFieldClear,
}: SupplySourceFieldsProps) {
  return (
    <>
      <EnvironmentField value={environment} disabled={disabled} onChange={onEnvironmentChange} />
      {sourceKind === 'openapi' ? (
        <UrlFieldWithPreflight
          id="supply-native-openapi-url"
          label="OpenAPI URL"
          value={definitionUrl}
          description={SUPPLY_SOURCE_TYPE_COPY.openApiUrl.description}
          placeholder={SUPPLY_SOURCE_TYPE_COPY.openApiUrl.placeholder}
        example={SUPPLY_SOURCE_TYPE_COPY.httpsExample.openapi}
          {...(discoverDiagnostic?.target === 'definitionUrl'
            ? { discoverDiagnostic: discoverDiagnostic.diagnostic }
            : {})}
          disabled={disabled}
          onChange={onDefinitionUrlChange}
        />
      ) : null}
      {sourceKind === 'mcp' ? (
        <McpSourceFields
          locator={mcpLocator}
          serverUrl={serverUrl}
          registryName={registryName}
          disabled={disabled}
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
          disabled={disabled}
          {...(discoverDiagnostic?.target === 'pluginJson'
            ? { pluginDiscoverDiagnostic: discoverDiagnostic.diagnostic }
            : {})}
          {...(discoverDiagnostic?.target === 'mcpJson'
            ? { mcpDiscoverDiagnostic: discoverDiagnostic.diagnostic }
            : {})}
          onPluginJsonChange={onPluginJsonChange}
          onMcpJsonChange={onMcpJsonChange}
          onError={onFieldError}
          onClearError={onFieldClear}
        />
      ) : null}
      {sourceKind === 'x402' ? (
        <X402SourceFields
          resourceUrl={resourceUrl}
          method={x402Method}
          disabled={disabled}
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
      <FieldLabel id="supply-native-environment-label">Environment <span aria-hidden="true" className="text-xs font-normal text-muted-foreground">{SUPPLY_SOURCE_TYPE_COPY.required}</span></FieldLabel>
      <RadioGroup aria-labelledby="supply-native-environment-label" aria-required="true" value={value} disabled={disabled} className="grid-cols-2" onValueChange={(next) => onChange(next as Environment)}>
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
  disabled,
  serverUrlDiscoverDiagnostic,
  onLocatorChange,
  onServerUrlChange,
  onRegistryNameChange,
}: McpSourceFieldsProps) {
  return (
    <>
      <Field>
        <FieldLabel id="supply-native-mcp-location-label">MCP location <span aria-hidden="true" className="text-xs font-normal text-muted-foreground">{SUPPLY_SOURCE_TYPE_COPY.required}</span></FieldLabel>
        <RadioGroup aria-labelledby="supply-native-mcp-location-label" aria-required="true" value={locator} disabled={disabled} className="grid-cols-2" onValueChange={(next) => onLocatorChange(next as 'url' | 'registry')}>
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
              description={SUPPLY_SOURCE_TYPE_COPY.mcpServerUrl.description}
              placeholder={SUPPLY_SOURCE_TYPE_COPY.mcpServerUrl.placeholder}
              example={SUPPLY_SOURCE_TYPE_COPY.httpsExample.mcp}
              disabled={disabled}
              discoverDiagnostic={serverUrlDiscoverDiagnostic}
              onChange={onServerUrlChange}
            />
          )
        : (
            <Field>
              <FieldLabel htmlFor="supply-native-mcp-registry">MCP Registry name <span aria-hidden="true" className="text-xs font-normal text-muted-foreground">{SUPPLY_SOURCE_TYPE_COPY.required}</span></FieldLabel>
              <Input id="supply-native-mcp-registry" aria-label="MCP Registry name" required placeholder={SUPPLY_SOURCE_TYPE_COPY.mcpRegistryName.placeholder} value={registryName} disabled={disabled} onChange={(event) => onRegistryNameChange(event.currentTarget.value)} />
              <FieldDescription>{SUPPLY_SOURCE_TYPE_COPY.mcpRegistryName.description}</FieldDescription>
            </Field>
          )}
    </>
  )
}

function AgentPluginFields({
  pluginJson,
  mcpJson,
  disabled,
  pluginDiscoverDiagnostic,
  mcpDiscoverDiagnostic,
  onPluginJsonChange,
  onMcpJsonChange,
  onError,
  onClearError,
}: AgentPluginFieldsProps) {
  return (
    <>
      <JsonFileField
        id="supply-native-plugin-json"
        label="plugin.json"
        loaded={pluginJson !== ''}
        jsonValue={pluginJson}
        requiredKeys={PLUGIN_JSON_REQUIRED_KEYS}
        disabled={disabled}
        discoverDiagnostic={pluginDiscoverDiagnostic}
        onChange={onPluginJsonChange}
        onError={onError}
        onClearError={onClearError}
      />
      <JsonFileField
        id="supply-native-mcp-json"
        label="mcp.json"
        loaded={mcpJson !== ''}
        jsonValue={mcpJson}
        requiredKeys={MCP_JSON_REQUIRED_KEYS}
        disabled={disabled}
        discoverDiagnostic={mcpDiscoverDiagnostic}
        onChange={onMcpJsonChange}
        onError={onError}
        onClearError={onClearError}
      />
    </>
  )
}

function X402SourceFields({
  resourceUrl,
  method,
  disabled,
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
        description={SUPPLY_SOURCE_TYPE_COPY.x402ResourceUrl.description}
        placeholder={SUPPLY_SOURCE_TYPE_COPY.x402ResourceUrl.placeholder}
        example={SUPPLY_SOURCE_TYPE_COPY.httpsExample.x402}
        disabled={disabled}
        discoverDiagnostic={resourceUrlDiscoverDiagnostic}
        onChange={onResourceUrlChange}
      />
      <Field>
        <FieldLabel id="supply-native-x402-method-label">Method <span aria-hidden="true" className="text-xs font-normal text-muted-foreground">{SUPPLY_SOURCE_TYPE_COPY.required}</span></FieldLabel>
        <RadioGroup aria-labelledby="supply-native-x402-method-label" aria-required="true" value={method} disabled={disabled} className="grid-cols-2" onValueChange={(next) => onMethodChange(next as 'GET' | 'POST')}>
          <Label className={cn('min-h-touch rounded-md border border-border p-3', TACTILE)}><RadioGroupItem value="GET" />GET</Label>
          <Label className={cn('min-h-touch rounded-md border border-border p-3', TACTILE)}><RadioGroupItem value="POST" />POST</Label>
        </RadioGroup>
        <FieldDescription>{SUPPLY_SOURCE_TYPE_COPY.x402Method.description}</FieldDescription>
      </Field>
    </>
  )
}
