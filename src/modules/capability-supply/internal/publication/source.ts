import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import type {
  CapabilityPublicationImport,
  CapabilityPublicationSourceSelector,
  CanonicalCapabilityPublicationDraft,
} from '../publication-importers'

export function isDirectPublicationSource(
  value: unknown,
): value is Readonly<{ kind: 'ae_envelope'; documentJson: string }> {
  return typeof value === 'object' && value !== null
    && 'kind' in value && value.kind === 'ae_envelope'
    && 'documentJson' in value && typeof value.documentJson === 'string'
}

export function decodeConvexPublicationSource(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return value
  try {
    if (value.kind === 'openapi_http' && 'documentJson' in value && typeof value.documentJson === 'string') {
      const { documentJson, ...source } = value
      return { ...source, document: JSON.parse(documentJson) }
    }
    if (value.kind === 'mcp' && 'toolJson' in value && typeof value.toolJson === 'string') {
      const { toolJson, ...source } = value
      return { ...source, tool: JSON.parse(toolJson) }
    }
    if (value.kind === 'agent_plugin_mcp'
      && 'manifestJson' in value && typeof value.manifestJson === 'string'
      && 'toolJson' in value && typeof value.toolJson === 'string') {
      const { manifestJson, toolJson, ...source } = value
      return { ...source, manifest: JSON.parse(manifestJson), tool: JSON.parse(toolJson) }
    }
    if (value.kind === 'x402' && 'resourceJson' in value && typeof value.resourceJson === 'string') {
      const { resourceJson, ...source } = value
      return { ...source, resource: JSON.parse(resourceJson) }
    }
  } catch {
    return undefined
  }
  return value
}

export function publicationSourceSelector(
  draft: CanonicalCapabilityPublicationDraft,
): CapabilityPublicationSourceSelector {
  return draft.source.kind === 'ae_envelope' ? {} : draft.source.selector
}
const AUTH_TOKEN68 = '[A-Za-z0-9._~+/-]{16,}={0,3}'
const SECRET_VALUE = new RegExp(`(?:\\b(?:Bearer|Basic)\\s+${AUTH_TOKEN68}(?![A-Za-z0-9._~+/-=])|sk_(?:live|test)_[A-Za-z0-9_-]+|gh[pousr]_[A-Za-z0-9_]+|AKIA[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----)`, 'i')
const QUERY_SECRET_VALUE = new RegExp(`^(?:bearer\\s+${AUTH_TOKEN68}|basic\\s+${AUTH_TOKEN68}|sk[-_][A-Za-z0-9_-]+|pk_live_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]*\\.[A-Za-z0-9_-]*\\.[A-Za-z0-9_-]*|[A-Fa-f0-9]{32,}|[A-Za-z0-9_-]{40,})$`, 'i')
const SECRET_MATERIAL_KEYS: Record<string, true> = {
  const: true, default: true, example: true, examples: true, value: true,
}

function sensitiveSourceKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return normalized === 'key'
    || normalized === 'sig'
    || normalized === 'signature'
    || normalized === 'hmac'
    || normalized === 'xamzsignature'
    || normalized === 'authorization'
    || normalized === 'password'
    || normalized === 'secret'
    || normalized === 'token'
    || normalized === 'apikey'
    || normalized === 'accesskey'
    || normalized === 'clientsecret'
    || normalized === 'privatekey'
    || normalized === 'credential'
    || normalized.endsWith('auth')
    || normalized.endsWith('signature')
    || normalized.endsWith('hmac')
    || normalized.endsWith('sig')
    || normalized.endsWith('password')
    || normalized.endsWith('secret')
    || normalized.endsWith('token')
    || normalized.endsWith('apikey')
    || normalized.endsWith('privatekey')
}

function sourceUrlContainsSecret(value: string): boolean {
  if (!value.includes('://')) return false
  try {
    const url = new URL(value)
    return url.username !== ''
      || url.password !== ''
      || [...url.searchParams.keys()].some(sensitiveSourceKey)
  } catch {
    return false
  }
}

function sensitiveQueryName(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return normalized === 'auth'
    || normalized === 'sig'
    || normalized === 'signature'
    || normalized === 'hmac'
    || normalized === 'xamzsignature'
    || normalized === 'authorization'
    || normalized === 'oauth'
    || normalized.endsWith('auth')
    || normalized.endsWith('signature')
    || normalized.endsWith('hmac')
    || normalized.endsWith('sig')
}

function isPublicPaginationQueryParameter(key: string): boolean {
  return key === 'next_token'
}

function queryEntryContainsCredential(value: Record<string, unknown>): boolean {
  const parameter = value.parameter
  if (typeof parameter === 'string'
    && sensitiveSourceKey(parameter)
    && !isPublicPaginationQueryParameter(parameter)) return true
  if (value.in === 'query' && typeof value.name === 'string' && sensitiveQueryName(value.name)) {
    return true
  }
  return typeof parameter === 'string'
    && typeof value.value === 'string'
    && QUERY_SECRET_VALUE.test(value.value)
}

function sourceContainsSecret(
  value: unknown,
  key = '',
  sensitiveContext = false,
  depth = 0,
): boolean {
  if (depth > 64) return true
  if (typeof value === 'string') {
    return SECRET_VALUE.test(value)
      || sourceUrlContainsSecret(value)
      || (sensitiveContext && SECRET_MATERIAL_KEYS[key.toLowerCase()] === true && value.trim() !== '')
      || sensitiveSourceKey(key)
  }
  if (Array.isArray(value)) {
    return value.some((item) => sourceContainsSecret(item, key, sensitiveContext, depth + 1))
  }
  if (!isRecord(value)) return false
  if (queryEntryContainsCredential(value)) return true
  const nextSensitiveContext = sensitiveContext || sensitiveSourceKey(key)
  return Object.entries(value).some(([entryKey, entryValue]) =>
    sourceContainsSecret(entryValue, entryKey, nextSensitiveContext, depth + 1)
  )
}

export function publicationMaterialContainsCredential(value: unknown): boolean {
  return sourceContainsSecret(value)
}

function canonicalAgentPluginDescriptor(
  source: Extract<CapabilityPublicationImport, { kind: 'agent_plugin_mcp' }>,
): unknown {
  const manifest = source.manifest
  if (!isRecord(manifest) || typeof manifest.name !== 'string' || !isRecord(manifest.mcpServers)) {
    throw new Error('publication_source_invalid')
  }
  const selectedServer = manifest.mcpServers[source.serverName]
  if (!isRecord(selectedServer)
    || selectedServer.type !== 'http'
    || typeof selectedServer.url !== 'string'
    || Object.keys(selectedServer).some((key) => key !== 'type' && key !== 'url')) {
    throw new Error('publication_source_invalid')
  }
  return {
    manifest: {
      name: manifest.name,
      mcpServers: {
        [source.serverName]: { type: 'http', url: selectedServer.url },
      },
    },
    serverName: source.serverName,
    tool: source.tool,
  }
}
function canonicalAgentPluginDescriptorFromParsed(value: unknown): unknown {
  if (!isRecord(value)
    || !isRecord(value.manifest)
    || typeof value.serverName !== 'string'
    || !isRecord(value.tool)
    || Object.keys(value).some((key) => key !== 'manifest' && key !== 'serverName' && key !== 'tool')) {
    return undefined
  }
  const manifest = value.manifest
  if (typeof manifest.name !== 'string' || !isRecord(manifest.mcpServers)
    || Object.keys(manifest).some((key) => key !== 'name' && key !== 'mcpServers')) {
    return undefined
  }
  const server = manifest.mcpServers[value.serverName]
  if (!isRecord(server) || server.type !== 'http' || typeof server.url !== 'string'
    || Object.keys(server).some((key) => key !== 'type' && key !== 'url')
    || Object.keys(manifest.mcpServers).length !== 1) {
    return undefined
  }
  return {
    manifest: {
      name: manifest.name,
      mcpServers: {
        [value.serverName]: { type: 'http', url: server.url },
      },
    },
    serverName: value.serverName,
    tool: value.tool,
  }
}

export function publicationSourceDescriptorIsCanonical(
  sourceKind: CanonicalCapabilityPublicationDraft['source']['kind'],
  descriptor: unknown,
): boolean {
  if (sourceKind !== 'agent_plugin_mcp') return true
  const canonical = canonicalAgentPluginDescriptorFromParsed(descriptor)
  return canonical !== undefined
    && stableStringify(canonical as StableHashValue) === stableStringify(descriptor as StableHashValue)
}

export function publicationSourceDescriptorJson(source: CapabilityPublicationImport): string {
  const descriptor = source.kind === 'ae_envelope'
    ? JSON.parse(source.documentJson) as unknown
    : source.kind === 'openapi_http'
      ? source.document
      : source.kind === 'mcp'
        ? { serverUrl: source.serverUrl, tool: source.tool }
        : source.kind === 'agent_plugin_mcp'
          ? canonicalAgentPluginDescriptor(source)
          : source.resource
  if (publicationMaterialContainsCredential(descriptor)) throw new Error('publication_source_contains_secret')
  return stableStringify(descriptor as StableHashValue)
}

export function publicationSourceDigest(input: Readonly<{
  sourceKind: CanonicalCapabilityPublicationDraft['source']['kind']
  selector: CapabilityPublicationSourceSelector
  descriptorJson: string
}>): string {
  return canonicalDigest(input as StableHashValue)
}
