import type { RJSFSchema, UiSchema } from '@rjsf/utils'

/** x402 requests wrap the real parameters in one of these objects. */
const ENVELOPE_TITLES: Readonly<Record<string, string>> = { queryParams: 'Query parameters', pathParams: 'Path parameters', body: 'Body', headers: 'Headers' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** A field with exactly one allowed value (x402's `type: "http"`, `method: "GET"`) is transport, not input. So is x402's `bodyType` (json, form-data). */
function fixedValue(schema: unknown, key?: string): { value: unknown } | undefined {
  if (!isRecord(schema)) return undefined
  if (Object.hasOwn(schema, 'const')) return { value: schema.const }
  if (!Array.isArray(schema.enum)) return undefined
  if (schema.enum.length === 1) return { value: schema.enum[0] }
  return key === 'bodyType' && schema.enum.length > 0 ? { value: schema.enum.includes(schema.default) ? schema.default : schema.enum[0] } : undefined
}

function sentenceCase(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/gu, '$1 $2').replace(/[_-]+/gu, ' ').trim().toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function fieldsUi(schema: Record<string, unknown>, depth: number): UiSchema {
  const properties = schema.properties
  if (!isRecord(properties) || depth > 8) return {}
  const ui: UiSchema = {}
  for (const [key, child] of Object.entries(properties)) {
    if (!isRecord(child)) continue
    if (fixedValue(child, key) !== undefined) {
      ui[key] = { 'ui:widget': 'hidden' }
      continue
    }
    ui[key] = { ...fieldsUi(child, depth + 1), ...(typeof child.title === 'string' ? {} : { 'ui:title': ENVELOPE_TITLES[key] ?? sentenceCase(key) }) }
  }
  return ui
}

/** OpenRouter-style form: only the real parameters, with readable labels. Fixed transport values stay in the request but off the form. */
export function toolInputUiSchema(schema: RJSFSchema | undefined): UiSchema | undefined {
  if (schema === undefined) return undefined
  const ui = fieldsUi(schema, 0)
  const visible = Object.entries(isRecord(schema.properties) ? schema.properties : {}).filter(([key, child]) => fixedValue(child, key) === undefined)
  const only = visible.length === 1 ? visible[0] : undefined
  // With the transport fields hidden, a lone queryParams or body group title adds nothing.
  if (only !== undefined && isRecord(only[1]) && only[1].type === 'object') ui[only[0]] = { ...ui[only[0]], 'ui:label': false }
  return ui
}

/** The fixed transport values, so a request without a published sample still validates. */
export function toolInputFixedValues(schema: RJSFSchema | undefined): Record<string, unknown> | undefined {
  if (schema === undefined || !isRecord(schema.properties)) return undefined
  const entries = Object.entries(schema.properties).flatMap(([key, child]) => {
    const fixed = fixedValue(child, key)
    return fixed === undefined ? [] : [[key, fixed.value] as const]
  })
  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}
