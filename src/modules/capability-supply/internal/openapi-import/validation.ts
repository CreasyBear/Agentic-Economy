import { validate } from '@scalar/openapi-parser'

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
  if (!isRecord(document)) return { kind: 'refused', reason: 'source_invalid' }
  if (typeof document.openapi !== 'string' || !/^3\.(?:0|1)\./u.test(document.openapi)) {
    return { kind: 'refused', reason: 'source_version_unsupported' }
  }
  if (!isRecord(document.paths)) return { kind: 'refused', reason: 'schema_missing' }

  const result = await validate(document)
  const parsed = result.schema ?? result.specification
  const rootInvalid = (result.errors ?? []).some((error) => {
    const path = error.path
    if (path === undefined || path === '') return true
    if (Array.isArray(path)) return path[0] === 'info'
    return path.startsWith('/info')
  })
  if (!isRecord(parsed) || !isRecord(parsed.paths)
    || rootInvalid) {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  return { kind: 'valid', document: parsed as ValidOpenApiDocument }
}
