import type { JsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'

import {
  residualSchemaReferenceRefusal,
  type AdmitProviderSchemaRefusal,
  type SchemaDereferencer,
} from '../admit-provider-schema'
import type { CapabilityPublicationImportRefusal } from '../publication-importer-types'

export type OpenApiRecordResolution =
  | Readonly<{ kind: 'resolved'; value: Readonly<Record<string, unknown>> | undefined }>
  | Readonly<{ kind: 'refused'; reason: CapabilityPublicationImportRefusal }>

export type OpenApiJsonContent = Readonly<{
  schema: Readonly<Record<string, JsonValue>>
  mediaType: string
}>

export async function resolveOpenApiRecord(
  value: unknown,
  root: unknown,
  derefSchema?: SchemaDereferencer,
): Promise<OpenApiRecordResolution> {
  if (value === undefined) return { kind: 'resolved', value: undefined }
  if (!isRecord(value)) return { kind: 'refused', reason: 'source_invalid' }
  if (typeof value.$ref !== 'string') return { kind: 'resolved', value }
  if (derefSchema === undefined) {
    return { kind: 'refused', reason: 'admit_schema_deref_unavailable' }
  }
  try {
    const resolved = await derefSchema(value as Readonly<Record<string, JsonValue>>, root)
    const residual = residualSchemaReferenceRefusal(resolved as JsonValue)
    if (residual !== undefined) return { kind: 'refused', reason: residual }
    return { kind: 'resolved', value: resolved as Readonly<Record<string, unknown>> }
  } catch (error) {
    return { kind: 'refused', reason: schemaDereferenceRefusal(error) }
  }
}

function schemaDereferenceRefusal(error: unknown): AdmitProviderSchemaRefusal {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('too_deep')) return 'admit_schema_too_deep'
  if (message.includes('circular')) return 'admit_schema_circular_reference'
  if (message.includes('deref_unavailable')) return 'admit_schema_deref_unavailable'
  return 'admit_schema_reference_unresolvable'
}

export function jsonContentDocument(content: unknown): OpenApiJsonContent | undefined {
  if (!isRecord(content)) return undefined
  const candidates = Object.entries(content)
    .map(([mediaType, value]) => ({
      mediaType,
      baseMediaType: mediaType.split(';', 1)[0]?.trim().toLowerCase() ?? '',
      value,
    }))
    .filter(isJsonContentCandidate)
    .sort(compareJsonContentCandidates)
  const first = candidates[0]
  return first === undefined
    ? undefined
    : {
        schema: first.value.schema as Readonly<Record<string, JsonValue>>,
        mediaType: first.baseMediaType,
      }
}

type JsonContentCandidate = Readonly<{
  mediaType: string
  baseMediaType: string
  value: Readonly<Record<string, JsonValue>>
}>

function isJsonContentCandidate(
  entry: Readonly<{ mediaType: string; baseMediaType: string; value: unknown }>,
): entry is JsonContentCandidate {
  return (entry.baseMediaType === 'application/json' || entry.baseMediaType.endsWith('+json'))
    && isRecord(entry.value)
    && isRecord(entry.value.schema)
}

function compareJsonContentCandidates(left: JsonContentCandidate, right: JsonContentCandidate): number {
  const leftExact = left.baseMediaType === 'application/json' ? 0 : 1
  const rightExact = right.baseMediaType === 'application/json' ? 0 : 1
  return leftExact - rightExact || left.mediaType.localeCompare(right.mediaType)
}

export function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

export function validOpenApiPath(value: string): boolean {
  return /^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%/-]|\{[A-Za-z][A-Za-z0-9_.-]{0,99}\}){1,1000}$/.test(value)
}
