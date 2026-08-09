/**
 * Human-readable input-validation diagnostics for the market terminal. The
 * executor reports a flat `input_invalid`; these helpers tell a user WHICH keys
 * are missing or unexpected against a feed's derived (strict) input schema, and
 * project a shared input bag onto a feed's own keys (so `compare` can drive
 * different-schema feeds from one bag without `additionalProperties` rejecting
 * the whole thing).
 */
import { isRecord } from '@/modules/common/is-record'

function propertiesOf(schema: Record<string, unknown>): Record<string, unknown> {
  return isRecord(schema.properties) ? schema.properties : {}
}

function requiredOf(schema: Record<string, unknown>): string[] {
  return Array.isArray(schema.required) ? (schema.required as unknown[]).filter((v): v is string => typeof v === 'string') : []
}

export type InputDiagnostic = { missing: string[]; unexpected: string[] }

export function diagnoseInput(schema: Record<string, unknown>, input: Record<string, unknown>): InputDiagnostic {
  const properties = propertiesOf(schema)
  const required = requiredOf(schema)
  const missing = required.filter((key) => !(key in input))
  const unexpected = Object.keys(input).filter((key) => !(key in properties))
  return { missing, unexpected }
}

/** Keep only the keys this feed's schema accepts; mark a feed unusable when a required key is absent. */
export function projectInput(
  schema: Record<string, unknown>,
  input: Record<string, unknown>,
): { ok: true; input: Record<string, unknown> } | { ok: false; reason: string } {
  const properties = propertiesOf(schema)
  const projected: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (key in properties) projected[key] = value
  }
  const missing = requiredOf(schema).filter((key) => !(key in projected))
  if (missing.length > 0) {
    return { ok: false, reason: `missing required: ${missing.join(', ')}` }
  }
  return { ok: true, input: projected }
}

export function formatDiagnostic(diagnostic: InputDiagnostic): string {
  const parts: string[] = []
  if (diagnostic.missing.length > 0) parts.push(`missing required: ${diagnostic.missing.join(', ')}`)
  if (diagnostic.unexpected.length > 0) parts.push(`unexpected: ${diagnostic.unexpected.join(', ')}`)
  return parts.length === 0 ? 'input does not satisfy the feed schema' : parts.join('; ')
}
