import type { ReactNode } from 'react'

import type {
  Environment,
  HttpsUrlPreflight,
  JsonPreflight,
  SourceKind,
} from '../supply-source-native-start-presentation'

export const SUPPLY_SOURCE_TYPE_COPY = {
  sectionDescription: 'Connect a Tool you already run. Agentic Economy checks what agents can buy.',
  findTools: 'Find Tools',
  findingTools: 'Finding Tools…',
  required: 'Required',
  openApiUrl: {
    description: 'OpenAPI 3.0 or 3.1, JSON or YAML, at a public HTTPS URL. Example: https://api.example.com/openapi.json.',
    placeholder: 'https://api.example.com/openapi.json',
  },
  mcpServerUrl: {
    description: 'Remote streamable HTTP over public HTTPS. Example: https://mcp.example.com/sse.',
    placeholder: 'https://mcp.example.com/sse',
  },
  mcpRegistryName: {
    description: 'The exact published Registry name. Example: io.example/reference-tools.',
    placeholder: 'io.example/reference-tools',
  },
  x402ResourceUrl: {
    description: 'AE reads payment facts from the live signed 402 response. Example: https://api.example.com/paid-operation.',
    placeholder: 'https://api.example.com/paid-operation',
  },
  httpsExample: {
    openapi: 'https://api.example.com/openapi.json',
    mcp: 'https://mcp.example.com/sse',
    x402: 'https://api.example.com/paid-operation',
  },
  httpsPreflight: {
    insecure: 'Insecure HTTP URL detected. Agentic Economy requires secure HTTPS endpoints.',
    invalid: (example: string) => `Enter a valid HTTPS URL, for example ${example}.`,
    valid: 'Valid HTTPS endpoint format',
  },
  x402Method: {
    description: 'POST is selected by default.',
  },
  jsonPreflight: {
    invalid: 'JSON syntax is invalid.',
    notObject: 'JSON must contain one object.',
    missingFields: 'JSON object is missing required top-level keys.',
    valid: 'JSON object parsed; expected top-level keys present',
  },
} as const

export const URL_DISCOVER_DIAGNOSTICS = {
  invalid: {
    whatHappened: 'URL syntax is invalid.',
    financialImpact: 'A$0.00 affected. Tool discovery was blocked.',
    nextStep: 'Enter a complete public HTTPS URL.',
  },
  insecure: {
    whatHappened: 'The URL uses insecure HTTP.',
    financialImpact: 'A$0.00 affected. Tool discovery was blocked.',
    nextStep: 'Replace http:// with https:// and try again.',
  },
} as const

export const JSON_DISCOVER_DIAGNOSTICS = {
  syntax: {
    whatHappened: 'JSON file syntax is invalid.',
    financialImpact: 'A$0.00 affected. Tool discovery was blocked.',
    nextStep: 'Fix the JSON syntax, then choose the file again.',
  },
  schema: {
    whatHappened: 'Required schema fields are missing.',
    financialImpact: 'A$0.00 affected. Tool discovery was blocked.',
    nextStep: 'Use the official file with every required schema field.',
  },
} as const

export function httpsDiscoverNextStep(example: string): string {
  return `Enter a complete public HTTPS URL, such as ${example}.`
}

export type UrlDiscoverDiagnostic = Readonly<{
  whatHappened: (typeof URL_DISCOVER_DIAGNOSTICS)[keyof typeof URL_DISCOVER_DIAGNOSTICS]['whatHappened']
  financialImpact: (typeof URL_DISCOVER_DIAGNOSTICS)[keyof typeof URL_DISCOVER_DIAGNOSTICS]['financialImpact']
  nextStep: string
}>
export type JsonDiscoverDiagnostic =
  (typeof JSON_DISCOVER_DIAGNOSTICS)[keyof typeof JSON_DISCOVER_DIAGNOSTICS]
export type DiscoverDiagnosticState =
  | Readonly<{ target: 'definitionUrl' | 'serverUrl' | 'resourceUrl'; diagnostic: UrlDiscoverDiagnostic }>
  | Readonly<{ target: 'pluginJson' | 'mcpJson'; diagnostic: JsonDiscoverDiagnostic }>

export type SupplySourceTypeSectionProps = Readonly<{
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
  onFieldClear: () => void
  onDiscover: () => void
}>

export type SourceTypeChooserProps = Pick<
  SupplySourceTypeSectionProps,
  'sourceKind' | 'disabled' | 'onSourceKindChange'
>

export type SupplySourceFieldsProps = Pick<
  SupplySourceTypeSectionProps,
  | 'sourceKind'
  | 'environment'
  | 'definitionUrl'
  | 'mcpLocator'
  | 'serverUrl'
  | 'registryName'
  | 'pluginJson'
  | 'mcpJson'
  | 'resourceUrl'
  | 'x402Method'
  | 'disabled'
  | 'onEnvironmentChange'
  | 'onDefinitionUrlChange'
  | 'onMcpLocatorChange'
  | 'onServerUrlChange'
  | 'onRegistryNameChange'
  | 'onPluginJsonChange'
  | 'onMcpJsonChange'
  | 'onResourceUrlChange'
  | 'onX402MethodChange'
  | 'onFieldError'
  | 'onFieldClear'
> & Readonly<{ discoverDiagnostic?: DiscoverDiagnosticState | undefined }>

export type EnvironmentFieldProps = Readonly<{
  value: Environment
  disabled: boolean
  onChange: (value: Environment) => void
}>

export type UrlFieldWithPreflightProps = Readonly<{
  id: string
  label: string
  value: string
  description: string
  placeholder: string
  disabled: boolean
  discoverDiagnostic?: UrlDiscoverDiagnostic | undefined
  example: string
  onChange: (value: string) => void
}>

export type McpSourceFieldsProps = Readonly<{
  locator: 'url' | 'registry'
  serverUrl: string
  registryName: string
  disabled: boolean
  serverUrlDiscoverDiagnostic?: UrlDiscoverDiagnostic | undefined
  onLocatorChange: (value: 'url' | 'registry') => void
  onServerUrlChange: (value: string) => void
  onRegistryNameChange: (value: string) => void
}>

export type AgentPluginFieldsProps = Readonly<{
  pluginJson: string
  mcpJson: string
  disabled: boolean
  pluginDiscoverDiagnostic?: JsonDiscoverDiagnostic | undefined
  mcpDiscoverDiagnostic?: JsonDiscoverDiagnostic | undefined
  onPluginJsonChange: (value: string) => void
  onMcpJsonChange: (value: string) => void
  onError: (value: string) => void
  onClearError: () => void
}>

export type JsonFileFieldProps = Readonly<{
  id: string
  label: string
  loaded: boolean
  jsonValue: string
  requiredKeys: readonly string[]
  disabled: boolean
  discoverDiagnostic?: JsonDiscoverDiagnostic | undefined
  onChange: (value: string) => void
  onError: (value: string) => void
  onClearError: () => void
}>

export type X402SourceFieldsProps = Readonly<{
  resourceUrl: string
  method: 'GET' | 'POST'
  disabled: boolean
  resourceUrlDiscoverDiagnostic?: UrlDiscoverDiagnostic | undefined
  onResourceUrlChange: (value: string) => void
  onMethodChange: (value: 'GET' | 'POST') => void
}>

export type PreflightSlotProps = Readonly<{ children: ReactNode }>
export type HttpsUrlPreflightBadgeProps = Readonly<{ status: HttpsUrlPreflight }>
export type JsonPreflightBadgeProps = Readonly<{ status: JsonPreflight; requiredKeys: readonly string[] }>
export type PreflightRule4AlertProps = Readonly<{
  diagnostic: UrlDiscoverDiagnostic | JsonDiscoverDiagnostic
}>
