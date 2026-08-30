import { isRecord } from '@/modules/common/is-record'

import type { AdmitCredentialSpec } from '../admit-provider-schema'
import { publicationMaterialContainsCredential } from '../publication/source'
import { MAX_TOOL_NAME_LENGTH, boundedTrimmed } from '../publication-importer-types'

export type OpenApiCredentialResolution =
  | Readonly<{ kind: 'resolved'; spec: AdmitCredentialSpec; parameterNames: readonly string[] }>
  | Readonly<{ kind: 'refused' }>

export type OpenApiParameterExclusions = Readonly<{
  query: ReadonlySet<string>
  header: ReadonlySet<string>
}>

export function openApiParameterExclusions(
  credential: Extract<OpenApiCredentialResolution, { kind: 'resolved' }>,
  fixedQueryNames: ReadonlySet<string>,
): OpenApiParameterExclusions {
  const query = new Set(fixedQueryNames)
  const header = new Set<string>()
  if (credential.spec.kind === 'api_key') {
    if (credential.spec.location === 'query') query.add(credential.spec.name)
    else header.add(credential.spec.name.toLowerCase())
  }
  return { query, header }
}

export function fixedQueryContainsCredential(
  value: readonly Readonly<{ parameter: string; value: string }>[] | undefined,
  declaredCredentialParameters: readonly string[],
): boolean {
  const declared = new Set(declaredCredentialParameters.map((parameter) => parameter.toLowerCase()))
  return value?.some((item) =>
    declared.has(item.parameter.toLowerCase()) || publicationMaterialContainsCredential(item)) ?? false
}

export function fixedQueryMapping(
  value: readonly Readonly<{ parameter: string; value: string }>[] | undefined,
  dynamic: readonly Readonly<{ parameter: string }>[] | undefined,
): readonly Readonly<{ parameter: string; value: string }>[] | undefined {
  if (value === undefined) return []
  if (value.length > 64) return undefined
  const dynamicNames = new Set((dynamic ?? []).map(({ parameter }) => parameter))
  const seen = new Set<string>()
  const result: Array<{ parameter: string; value: string }> = []
  for (const item of value) {
    if (!validFixedQueryItem(item, seen, dynamicNames)) return undefined
    seen.add(item.parameter)
    result.push({ parameter: item.parameter, value: item.value })
  }
  return result
}

function validFixedQueryItem(
  item: Readonly<{ parameter: string; value: string }>,
  seen: ReadonlySet<string>,
  dynamicNames: ReadonlySet<string>,
): boolean {
  return /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(item.parameter)
    && typeof item.value === 'string'
    && item.value.length > 0
    && item.value.length <= 200
    && !seen.has(item.parameter)
    && !dynamicNames.has(item.parameter)
}

export function resolveOpenApiCredential(
  document: unknown,
  operation: Readonly<Record<string, unknown>>,
): OpenApiCredentialResolution {
  const security = selectedSecurity(document, operation)
  if (security === null) return { kind: 'refused' }
  if (security === undefined || security.length === 0) {
    return { kind: 'resolved', spec: { kind: 'public_upstream' }, parameterNames: [] }
  }
  const securitySchemes = readSecuritySchemes(document)
  if (securitySchemes === undefined || security.length !== 1) return { kind: 'refused' }
  const selection = selectedSecurityScheme(security[0], securitySchemes)
  if (selection === undefined) return { kind: 'refused' }
  return credentialFromScheme(selection.schemeName, selection.scheme)
}

function selectedSecurity(
  document: unknown,
  operation: Readonly<Record<string, unknown>>,
): readonly unknown[] | null | undefined {
  if (operation.security !== undefined) {
    return Array.isArray(operation.security) ? operation.security : null
  }
  if (!isRecord(document) || document.security === undefined) return undefined
  return Array.isArray(document.security) ? document.security : null
}

function readSecuritySchemes(document: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(document)
    && isRecord(document.components)
    && isRecord(document.components.securitySchemes)
    ? document.components.securitySchemes
    : undefined
}

function selectedSecurityScheme(
  entry: unknown,
  securitySchemes: Readonly<Record<string, unknown>>,
): Readonly<{ schemeName: string; scheme: Readonly<Record<string, unknown>> }> | undefined {
  if (!isRecord(entry)) return undefined
  const schemes = Object.entries(entry)
  if (schemes.length !== 1 || schemes[0] === undefined) return undefined
  const [schemeName, scope] = schemes[0]
  if (!Array.isArray(scope) || !scope.every((value) => typeof value === 'string')) return undefined
  const scheme = securitySchemes[schemeName]
  if (!isRecord(scheme) || !boundedTrimmed(schemeName, MAX_TOOL_NAME_LENGTH)) return undefined
  return { schemeName, scheme }
}

function credentialFromScheme(
  schemeName: string,
  scheme: Readonly<Record<string, unknown>>,
): OpenApiCredentialResolution {
  if (isApiKeyScheme(scheme)) {
    return {
      kind: 'resolved',
      spec: { kind: 'api_key', location: scheme.in, name: scheme.name, schemeName },
      parameterNames: [scheme.name],
    }
  }
  if (isBearerScheme(scheme)) {
    return { kind: 'resolved', spec: { kind: 'http_bearer', schemeName }, parameterNames: [] }
  }
  return { kind: 'refused' }
}

function isApiKeyScheme(
  scheme: Readonly<Record<string, unknown>>,
): scheme is Readonly<{ type: 'apiKey'; in: 'query' | 'header'; name: string }> {
  return scheme.type === 'apiKey'
    && (scheme.in === 'query' || scheme.in === 'header')
    && typeof scheme.name === 'string'
    && /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(scheme.name)
}

function isBearerScheme(scheme: Readonly<Record<string, unknown>>): boolean {
  return scheme.type === 'http'
    && typeof scheme.scheme === 'string'
    && scheme.scheme.toLowerCase() === 'bearer'
}
