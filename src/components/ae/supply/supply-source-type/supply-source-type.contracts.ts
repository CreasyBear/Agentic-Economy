import type { ReactNode } from 'react'

import {
  INSECURE_URL_DIAGNOSTIC,
  MALFORMED_JSON_DIAGNOSTIC,
  type Environment,
  type HttpsUrlPreflight,
  type JsonPreflight,
  type SourceKind,
} from '../supply-source-native-start-presentation'

export type UrlDiscoverDiagnostic = typeof INSECURE_URL_DIAGNOSTIC
export type JsonDiscoverDiagnostic = typeof MALFORMED_JSON_DIAGNOSTIC

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
  discoverDiagnostic?: UrlDiscoverDiagnostic | undefined
  onChange: (value: string) => void
}>

export type McpSourceFieldsProps = Readonly<{
  locator: 'url' | 'registry'
  serverUrl: string
  registryName: string
  serverUrlDiscoverDiagnostic?: UrlDiscoverDiagnostic | undefined
  onLocatorChange: (value: 'url' | 'registry') => void
  onServerUrlChange: (value: string) => void
  onRegistryNameChange: (value: string) => void
}>

export type AgentPluginFieldsProps = Readonly<{
  pluginJson: string
  mcpJson: string
  pluginDiscoverDiagnostic?: JsonDiscoverDiagnostic | undefined
  mcpDiscoverDiagnostic?: JsonDiscoverDiagnostic | undefined
  onPluginJsonChange: (value: string) => void
  onMcpJsonChange: (value: string) => void
  onError: (value: string) => void
}>

export type JsonFileFieldProps = Readonly<{
  id: string
  label: string
  loaded: boolean
  jsonValue: string
  requiredKeys: readonly string[]
  discoverDiagnostic?: JsonDiscoverDiagnostic | undefined
  onChange: (value: string) => void
  onError: (value: string) => void
}>

export type X402SourceFieldsProps = Readonly<{
  resourceUrl: string
  method: 'GET' | 'POST'
  resourceUrlDiscoverDiagnostic?: UrlDiscoverDiagnostic | undefined
  onResourceUrlChange: (value: string) => void
  onMethodChange: (value: 'GET' | 'POST') => void
}>

export type PreflightSlotProps = Readonly<{ children: ReactNode }>
export type HttpsUrlPreflightBadgeProps = Readonly<{ status: HttpsUrlPreflight }>
export type JsonPreflightBadgeProps = Readonly<{ status: JsonPreflight }>
export type PreflightRule4AlertProps = Readonly<{
  diagnostic: UrlDiscoverDiagnostic | JsonDiscoverDiagnostic
}>
