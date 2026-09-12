import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import type { CapabilityPublicationSourceSelector } from './publication-importer-types'
import { degradeBackend } from '@/lib/observability/degrade-backend'

export function sourceRouteRef(input: Readonly<{
  sourceKind: 'ae_envelope' | 'openapi_http' | 'mcp' | 'agent_plugin_mcp' | 'x402'
  sourceSelector: CapabilityPublicationSourceSelector
  sourceDescriptorJson: string
  endpointUrl: string
}>): string | undefined {
  const endpoint = canonicalEndpoint(input.endpointUrl)
  if (endpoint === undefined || input.sourceKind === 'ae_envelope') return undefined
  if (input.sourceKind === 'openapi_http'
    && 'path' in input.sourceSelector
    && typeof input.sourceSelector.path === 'string'
    && typeof input.sourceSelector.method === 'string') {
    return canonicalDigest({
      version: 'source-route:v1', kind: 'openapi',
      origin: new URL(endpoint).origin,
      method: input.sourceSelector.method.toUpperCase(),
      path: canonicalPath(input.sourceSelector.path),
    })
  }
  if ((input.sourceKind === 'mcp' || input.sourceKind === 'agent_plugin_mcp')
    && 'toolName' in input.sourceSelector
    && typeof input.sourceSelector.toolName === 'string') {
    return canonicalDigest({
      version: 'source-route:v1', kind: 'mcp',
      serverUrl: endpoint, toolName: input.sourceSelector.toolName,
    })
  }
  if (input.sourceKind === 'x402') {
    let descriptor: unknown
    try {
      descriptor = JSON.parse(input.sourceDescriptorJson)
    } catch (cause) {
      return degradeBackend(cause, undefined, { site: 'sourceRouteRef', reason: 'invalid_response' })
    }
    const method = isRecord(descriptor) && typeof descriptor.method === 'string'
      ? descriptor.method.toUpperCase()
      : 'POST'
    if (method !== 'GET' && method !== 'POST') return undefined
    return canonicalDigest({
      version: 'source-route:v1', kind: 'x402', resourceUrl: endpoint, method,
    })
  }
  return undefined
}

function canonicalEndpoint(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return undefined
    url.hash = ''
    return url.toString()
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'canonicalEndpoint', reason: 'invalid_response' })
  }
}

function canonicalPath(value: string): string {
  const trimmed = value.trim()
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}
