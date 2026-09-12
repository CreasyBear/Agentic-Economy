import { validate } from '@scalar/openapi-parser'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { isRecord } from '@/modules/common/is-record'

export type ValidOpenApiDocument = Readonly<Record<string, unknown>> & Readonly<{
  paths: Readonly<Record<string, unknown>>
}>

type OpenApiValidation =
  | Readonly<{ kind: 'valid'; document: ValidOpenApiDocument }>
  | Readonly<{
      kind: 'refused'
      reason: 'source_invalid' | 'source_version_unsupported' | 'schema_missing'
    }>

export async function validateOpenApiDocument(document: unknown): Promise<OpenApiValidation> {
  if (typeof document !== 'string' && !isRecord(document)) {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  let result: Awaited<ReturnType<typeof validate>>
  try {
    result = await validate(document)
  } catch (cause) {
    return degradeBackend(cause, { kind: 'refused', reason: 'source_invalid' } as const, {
      site: 'validateOpenApiDocument', reason: 'invalid_response',
    })
  }
  const parsed = parsedSpecification(result)
  if (!isRecord(parsed)) return { kind: 'refused', reason: 'source_invalid' }
  const parsedRecord = parsed as Record<string, unknown>
  if (typeof parsedRecord.openapi !== 'string' || !/^3\.(?:0|1)\./u.test(parsedRecord.openapi)) {
    return { kind: 'refused', reason: 'source_version_unsupported' }
  }
  if (!isRecord(parsedRecord.paths)) return { kind: 'refused', reason: 'schema_missing' }

  const rootInvalid = (result.errors ?? []).some((error) => {
    const path = error.path
    if (path === undefined || path === '') return true
    if (Array.isArray(path)) return path[0] === 'info'
    return path.startsWith('/info')
  })
  if (rootInvalid) {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  return { kind: 'valid', document: parsedRecord as ValidOpenApiDocument }
}

function parsedSpecification(result: Awaited<ReturnType<typeof validate>>): unknown {
  return result.schema ?? result.specification
}
