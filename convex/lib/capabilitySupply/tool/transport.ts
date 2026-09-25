import { degradeBackend } from '@/lib/observability/degrade-backend'
import {
  parseHttpJsonTransportConfiguration,
  parseMcpJsonRpcTransportConfiguration,
  parseX402FetchTransportConfiguration,
  type CapabilityBindingRow,
  type CatalogOfferingToolMapEntry,
  type PublicToolParameterMapping,
  type PublicToolTransport,
} from '@/modules/capability-supply/public'

export function publicAuthenticationFor(
  authority: CapabilityBindingRow['authority'],
  sourceKind: CatalogOfferingToolMapEntry['sourceKind'],
  adapterId: string,
  configJson: string,
): CatalogOfferingToolMapEntry['authentication'] {
  if (sourceKind === 'x402' || adapterId === 'x402-fetch:v2') return { kind: 'x402' }
  const config = parseTransportConfig(configJson)
  if (adapterId === 'http-json:v1') {
    const parsed = parseHttpJsonTransportConfiguration(config)
    if (parsed?.credential?.kind === 'api_key') {
      return { kind: 'platform_credential', scheme: 'api_key', in: parsed.credential.location, name: parsed.credential.name }
    }
    if (parsed?.credential?.kind === 'bearer') return { kind: 'platform_credential', scheme: 'bearer' }
    if (parsed?.credential?.kind === 'none') return authority.kind === 'public_upstream' ? { kind: 'ae_api_key' } : { kind: 'unknown' }
    if (parsed?.credential === undefined && authority.kind === 'public_upstream') return { kind: 'ae_api_key' }
  }
  if (adapterId === 'mcp-jsonrpc:v1') {
    const parsed = parseMcpJsonRpcTransportConfiguration(config)
    if (parsed?.credential?.kind === 'api_key') {
      return { kind: 'platform_credential', scheme: 'api_key', in: parsed.credential.location, name: parsed.credential.name }
    }
    if (parsed?.credential?.kind === 'bearer') return { kind: 'platform_credential', scheme: 'bearer' }
    if (parsed?.credential === undefined && authority.kind === 'public_upstream') return { kind: 'ae_api_key' }
  }
  return { kind: 'unknown' }
}

function publicPathTemplate(endpointUrl: string): string | undefined {
  try {
    const pathname = new URL(endpointUrl).pathname
    if (pathname === '/') return undefined
    return pathname.replace(/%7B/gi, '{').replace(/%7D/gi, '}')
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'publicPathTemplate', reason: 'invalid_response' })
  }
}

function parseTransportConfig(configJson: string): unknown {
  try {
    return JSON.parse(configJson) as unknown
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'parseTransportConfig', reason: 'invalid_response' })
  }
}

export function publicToolTransportFor(
  endpointUrl: string,
  adapterId: string,
  configJson: string,
): PublicToolTransport | undefined {
  const config = parseTransportConfig(configJson)
  const pathTemplate = publicPathTemplate(endpointUrl)
  if (adapterId === 'http-json:v1') {
    const parsed = parseHttpJsonTransportConfiguration(config)
    return parsed === undefined ? undefined : {
      method: parsed.method,
      ...(pathTemplate === undefined ? {} : { pathTemplate }),
      ...(parsed.responseStatus === undefined ? {} : { responseStatus: parsed.responseStatus }),
      ...(parsed.responseContentType === undefined ? {} : { responseContentType: parsed.responseContentType }),
      requestTimeoutMs: parsed.requestTimeoutMs,
    }
  }
  if (adapterId === 'x402-fetch:v2') {
    const parsed = parseX402FetchTransportConfiguration(config)
    return parsed === undefined ? undefined : {
      method: parsed.method,
      ...(pathTemplate === undefined ? {} : { pathTemplate }),
      requestTimeoutMs: parsed.requestTimeoutMs,
    }
  }
  if (adapterId === 'mcp-jsonrpc:v1') {
    const parsed = parseMcpJsonRpcTransportConfiguration(config)
    return parsed === undefined ? undefined : { method: 'POST', requestTimeoutMs: parsed.requestTimeoutMs }
  }
  return undefined
}

export function publicToolParameterMappingsFor(
  adapterId: string,
  configJson: string,
): readonly PublicToolParameterMapping[] | undefined {
  const config = parseTransportConfig(configJson)
  const mappings: PublicToolParameterMapping[] = []
  if (adapterId === 'http-json:v1') {
    const parsed = parseHttpJsonTransportConfiguration(config)
    if (parsed === undefined) return undefined
    for (const parameter of parsed.path ?? []) mappings.push({
      inputPointer: parameter.inputPointer, group: 'path', name: parameter.parameter,
      ...(parameter.required === undefined ? {} : { required: parameter.required }),
      ...(parameter.style === undefined ? {} : { style: parameter.style }),
      ...(parameter.explode === undefined ? {} : { explode: parameter.explode }),
    })
    for (const parameter of parsed.query ?? []) mappings.push({
      inputPointer: parameter.inputPointer, group: 'query', name: parameter.parameter,
      ...(parameter.required === undefined ? {} : { required: parameter.required }),
      ...(parameter.style === undefined ? {} : { style: parameter.style }),
      ...(parameter.explode === undefined ? {} : { explode: parameter.explode }),
    })
    for (const parameter of parsed.headers ?? []) mappings.push({
      inputPointer: parameter.inputPointer, group: 'header', name: parameter.parameter,
      ...(parameter.required === undefined ? {} : { required: parameter.required }),
      ...(parameter.style === undefined ? {} : { style: parameter.style }),
      ...(parameter.explode === undefined ? {} : { explode: parameter.explode }),
    })
    return mappings.length === 0 ? undefined : mappings
  }
  if (adapterId === 'x402-fetch:v2') {
    const parsed = parseX402FetchTransportConfiguration(config)
    if (parsed === undefined) return undefined
    for (const parameter of parsed.query ?? []) mappings.push({
      inputPointer: parameter.inputPointer, group: 'query', name: parameter.parameter,
      ...(parameter.required === undefined ? {} : { required: parameter.required }),
      ...(parameter.style === undefined ? {} : { style: parameter.style }),
      ...(parameter.explode === undefined ? {} : { explode: parameter.explode }),
    })
    return mappings.length === 0 ? undefined : mappings
  }
  return undefined
}
