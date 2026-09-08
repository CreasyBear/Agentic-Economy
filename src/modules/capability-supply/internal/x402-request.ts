import { parseBoundedJson } from '@/modules/common/bounded-json'
import { readJsonPointer } from '@/modules/common/json-pointer'
import { isRecord } from '@/modules/common/is-record'
import { requestTarget, type HttpJsonRequestPreparation } from './route-transport-http-json'
import type { X402FetchTransportConfiguration } from './transport-adapters'

/** One serialization contract for Quote inspection and the paid request. */
export function prepareX402Request(
  endpoint: URL,
  configuration: Pick<X402FetchTransportConfiguration, 'method' | 'bodyPointer' | 'queryObjectPointer' | 'path' | 'pathTemplate'> & { query?: readonly NonNullable<X402FetchTransportConfiguration['query']>[number][] },
  inputJson: string,
): HttpJsonRequestPreparation & { body?: string } {
  const input = parseBoundedJson(inputJson)
  if (input === undefined) return { kind: 'refused' as const, failureCode: 'input_invalid' }
  let query = configuration.query === undefined ? undefined : [...configuration.query]
  if (configuration.queryObjectPointer !== undefined) {
    if (!isRecord(input) || !isRecord(input.query) || Object.keys(input.query).length > 64) {
      return { kind: 'refused' as const, failureCode: 'input_invalid' }
    }
    query = []
    for (const [name, value] of Object.entries(input.query)) {
      if (!/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(name)
        || !(primitive(value) || (Array.isArray(value) && value.every(primitive)))) {
        return { kind: 'refused' as const, failureCode: 'input_invalid' }
      }
      query.push({ inputPointer: `/query/${name.replace(/~/g, '~0').replace(/\//g, '~1')}`, parameter: name, style: 'form', explode: true })
    }
  }
  // Discovery URLs may contain example values for mapped parameters. The
  // actual input replaces those defaults; unrelated fixed parameters remain.
  const requestEndpoint = new URL(endpoint)
  if (configuration.pathTemplate !== undefined) requestEndpoint.pathname = configuration.pathTemplate
  for (const mapping of configuration.path ?? []) {
    const value = readJsonPointer(input, mapping.inputPointer)
    if (value === '.' || value === '..') return { kind: 'refused', failureCode: 'input_invalid' }
  }
  for (const mapping of query ?? []) {
    const value = readJsonPointer(input, mapping.inputPointer)
    if (value !== undefined && value !== null) requestEndpoint.searchParams.delete(mapping.parameter)
  }
  const result = requestTarget(requestEndpoint, configuration.method, query, undefined, configuration.path, undefined, inputJson)
  if (result.kind === 'refused') return result
  if (configuration.method !== 'POST') return result
  if (configuration.bodyPointer !== undefined && (!isRecord(input) || !Object.hasOwn(input, 'body'))) {
    return { kind: 'refused' as const, failureCode: 'input_required' }
  }
  return { ...result, body: configuration.bodyPointer === undefined ? inputJson : JSON.stringify((input as Record<string, unknown>).body) }
}

function primitive(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
}
