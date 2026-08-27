import { isRecord } from '@/modules/common/is-record'

import type { SchemaDereferencer } from '../admit-provider-schema'
import { publicationMaterialContainsCredential } from '../publication/source'
import {
  inspectSource,
  validHttpsUrl,
  type CapabilityPublicationImportRefusal,
  type OpenApiDocumentPreflightResult,
  type OpenApiOperationPreflightOutcome,
} from '../publication-importer-types'
import { resolveOpenApiCredential } from './credentials'
import { resolveOpenApiRecord, validOpenApiPath, type OpenApiRecordResolution } from './document'
import { analyzeOpenApiOperation, defaultOpenApiParameterExclusions } from './operation'

const OPENAPI_PREFLIGHT_METHODS = [
  'get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace',
] as const
const MAX_OPENAPI_PREFLIGHT_OPERATIONS = 128

type PreflightDocument = Readonly<Record<string, unknown>> & Readonly<{
  paths: Readonly<Record<string, unknown>>
}>

export async function preflightOpenApiHttpDocument(
  document: unknown,
  derefSchema?: SchemaDereferencer,
): Promise<OpenApiDocumentPreflightResult> {
  const bounded = inspectSource(document)
  if (bounded.kind === 'refused') return bounded
  const admitted = admitPreflightDocument(document)
  if (admitted.kind === 'refused') return admitted
  const outcomes: OpenApiOperationPreflightOutcome[] = []
  const globalUnsafeReason = unsafeDocumentReason(admitted.document)
  const truncated = await collectOutcomes(
    admitted.document,
    outcomes,
    globalUnsafeReason,
    derefSchema,
  )
  return { kind: 'preflighted', sourceDigest: bounded.digest, outcomes, truncated }
}

function admitPreflightDocument(
  document: unknown,
): Readonly<{ kind: 'admitted'; document: PreflightDocument }> | Readonly<{
  kind: 'refused'
  reason: 'source_invalid' | 'source_version_unsupported' | 'schema_missing'
}> {
  if (!isRecord(document)) return { kind: 'refused', reason: 'source_invalid' }
  if (typeof document.openapi !== 'string' || !document.openapi.startsWith('3.1.')) {
    return { kind: 'refused', reason: 'source_version_unsupported' }
  }
  if (!isRecord(document.paths)) return { kind: 'refused', reason: 'schema_missing' }
  return { kind: 'admitted', document: document as PreflightDocument }
}

function unsafeDocumentReason(document: PreflightDocument): CapabilityPublicationImportRefusal | undefined {
  if (publicationMaterialContainsCredential(document)) return 'source_invalid'
  return singleServer(document.servers) === undefined ? 'transport_unsupported' : undefined
}

function singleServer(servers: unknown): string | undefined {
  if (!Array.isArray(servers) || servers.length !== 1) return undefined
  const server = servers[0]
  return isRecord(server) && typeof server.url === 'string' ? validHttpsUrl(server.url) : undefined
}

async function collectOutcomes(
  document: PreflightDocument,
  outcomes: OpenApiOperationPreflightOutcome[],
  globalUnsafeReason: CapabilityPublicationImportRefusal | undefined,
  derefSchema?: SchemaDereferencer,
): Promise<boolean> {
  for (const [path, rawPathItem] of Object.entries(document.paths)) {
    const pathItemResult = await resolveOpenApiRecord(rawPathItem, document, derefSchema)
    const methods = operationMethods(rawPathItem, pathItemResult)
    for (const method of methods) {
      if (outcomes.length >= MAX_OPENAPI_PREFLIGHT_OPERATIONS) return true
      outcomes.push(await preflightOperation(
        document,
        path,
        method,
        pathItemResult,
        globalUnsafeReason,
        derefSchema,
      ))
    }
  }
  return false
}

function operationMethods(
  rawPathItem: unknown,
  resolved: OpenApiRecordResolution,
): readonly (typeof OPENAPI_PREFLIGHT_METHODS)[number][] {
  const pathItem = resolved.kind === 'resolved' ? resolved.value : undefined
  return OPENAPI_PREFLIGHT_METHODS.filter((method) =>
    pathItem === undefined
      ? isRecord(rawPathItem) && method in rawPathItem
      : method in pathItem)
}

async function preflightOperation(
  document: PreflightDocument,
  path: string,
  method: (typeof OPENAPI_PREFLIGHT_METHODS)[number],
  pathItemResult: OpenApiRecordResolution,
  globalUnsafeReason: CapabilityPublicationImportRefusal | undefined,
  derefSchema?: SchemaDereferencer,
): Promise<OpenApiOperationPreflightOutcome> {
  const selector = { path, method }
  if (globalUnsafeReason !== undefined) return { selector, kind: 'unsafe', reason: globalUnsafeReason }
  if (pathItemResult.kind === 'refused') {
    return { selector, kind: 'unsupported_shape', reason: pathItemResult.reason }
  }
  const pathItem = pathItemResult.value
  if (!validOpenApiPath(path) || pathItem === undefined || !isRecord(pathItem[method])) {
    return { selector, kind: 'unsupported_shape', reason: 'openapi_operation_unsupported' }
  }
  const operation = await resolveOpenApiRecord(pathItem[method], document, derefSchema)
  if (operation.kind === 'refused') return { selector, kind: 'unsupported_shape', reason: operation.reason }
  if (operation.value === undefined) {
    return { selector, kind: 'unsupported_shape', reason: 'openapi_operation_unsupported' }
  }
  return await analyzePreflightOperation(document, pathItem, operation.value, selector, derefSchema)
}

async function analyzePreflightOperation(
  document: PreflightDocument,
  pathItem: Readonly<Record<string, unknown>>,
  operation: Readonly<Record<string, unknown>>,
  selector: OpenApiOperationPreflightOutcome['selector'],
  derefSchema?: SchemaDereferencer,
): Promise<OpenApiOperationPreflightOutcome> {
  const credential = resolveOpenApiCredential(document, operation)
  if (credential.kind === 'refused') return { selector, kind: 'unsafe', reason: 'transport_unsupported' }
  const analysis = await analyzeOpenApiOperation(
    operation,
    pathItem.parameters,
    selector.path,
    selector.method,
    defaultOpenApiParameterExclusions(credential),
    document,
    derefSchema,
  )
  if (analysis.kind === 'refused') return refusedOutcome(selector, analysis.reason)
  return credentialOutcome(selector, analysis.analysis.credential.spec)
}

function refusedOutcome(
  selector: OpenApiOperationPreflightOutcome['selector'],
  reason: CapabilityPublicationImportRefusal,
): OpenApiOperationPreflightOutcome {
  return {
    selector,
    kind: reason === 'transport_unsupported' ? 'unsafe' : 'unsupported_shape',
    reason,
  }
}

function credentialOutcome(
  selector: OpenApiOperationPreflightOutcome['selector'],
  credential: ReturnType<typeof resolveOpenApiCredential> extends infer Result
    ? Result extends { kind: 'resolved'; spec: infer Spec } ? Spec : never
    : never,
): OpenApiOperationPreflightOutcome {
  if (credential.kind === 'keyless') return { selector, kind: 'executable' }
  return {
    selector,
    kind: 'credential_required',
    credential: credential.kind === 'api_key'
      ? { kind: 'api_key', location: credential.location, name: credential.name }
      : { kind: 'http_bearer' },
  }
}
