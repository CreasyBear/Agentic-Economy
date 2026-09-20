import type { JsonSchemaProperty } from '@/modules/capability-supply/tool-test.contracts'

export function mapHttpStatus(status: number): string {
  switch (status) {
    case 400:
      return '400 Bad Request'
    case 401:
      return '401 Unauthorized'
    case 403:
      return '403 Forbidden'
    case 404:
      return '404 Not Found'
    case 408:
      return '408 Request Timeout'
    case 429:
      return '429 Too Many Requests'
    case 500:
      return '500 Error'
    case 502:
      return '502 Bad Gateway'
    case 503:
      return '503 Service Unavailable'
    case 504:
      return '504 Gateway Timeout'
    default:
      return `${status} Error`
  }
}

export function extractExamplePayload(schema?: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return {}
  const properties = ((schema as Record<string, unknown>).properties ?? {}) as Record<string, JsonSchemaProperty>
  const payload: Record<string, unknown> = {}

  for (const [key, prop] of Object.entries(properties)) {
    if (!prop || typeof prop !== 'object') {
      payload[key] = null
      continue
    }
    payload[key] = exampleValueForProperty(key, prop)
  }

  return payload
}

function exampleValueForProperty(key: string, prop: JsonSchemaProperty): unknown {
  if (prop.default !== undefined) return prop.default
  if (Array.isArray(prop.examples) && prop.examples.length > 0) return prop.examples[0]
  if (prop.example !== undefined) return prop.example
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return prop.enum[0]
  return typeBasedExample(key, prop)
}

function typeBasedExample(key: string, prop: JsonSchemaProperty): unknown {
  const type = prop.type
  switch (type) {
    case 'string':
      return stringFormatExample(key, prop.format)
    case 'number':
    case 'integer':
      return typeof prop.minimum === 'number' ? prop.minimum : 1
    case 'boolean':
      return true
    case 'array':
      return []
    case 'object':
      if (prop.properties && typeof prop.properties === 'object') {
        const nested: Record<string, unknown> = {}
        for (const [nestedKey, nestedProp] of Object.entries(prop.properties)) {
          nested[nestedKey] = exampleValueForProperty(nestedKey, nestedProp)
        }
        return nested
      }
      return {}
    default:
      return null
  }
}

function stringFormatExample(key: string, format?: string): string {
  switch (format) {
    case 'email':
      return 'operator@example.com'
    case 'uri':
    case 'url':
      return 'https://example.com'
    case 'date':
      return '2026-09-19'
    case 'date-time':
      return '2026-09-19T00:00:00.000Z'
    default:
      return key
  }
}

export function extractDefaultPayload(schema?: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return {}
  const properties = ((schema as Record<string, unknown>).properties ?? {}) as Record<string, { default?: unknown; type?: string }>
  const defaults: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(properties)) {
    if (value && typeof value === 'object') {
      if (value.default !== undefined) {
        defaults[key] = value.default
      } else if (value.type === 'string') {
        defaults[key] = ''
      } else if (value.type === 'number' || value.type === 'integer') {
        defaults[key] = 0
      } else if (value.type === 'boolean') {
        defaults[key] = false
      }
    }
  }

  return defaults
}
