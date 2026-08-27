import type { JsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'

import {
  admitProviderSchema,
  type SchemaDereferencer,
} from '../admit-provider-schema'
import { publicationMaterialContainsCredential } from '../publication/source'
import {
  inspectSource,
  normalizedFromSchemas,
  validHttpsUrl,
  type CapabilityPublicationImport,
  type CapabilityPublicationImportRefusal,
  type CapabilityPublicationImportResult,
} from '../publication-importer-types'
import {
  fixedQueryContainsCredential,
  fixedQueryMapping,
  openApiParameterExclusions,
  resolveOpenApiCredential,
  type OpenApiCredentialResolution,
} from './credentials'
import { ensureTrailingSlash, resolveOpenApiRecord, validOpenApiPath } from './document'
import { analyzeOpenApiOperation, type OpenApiOperationAnalysis } from './operation'

type OpenApiImportInput = Extract<CapabilityPublicationImport, { kind: 'openapi_http' }>
type Refusal = Readonly<{ kind: 'refused'; reason: CapabilityPublicationImportRefusal }>
type AdmittedDocument = Readonly<{
  kind: 'admitted'
  document: Readonly<Record<string, unknown>>
  descriptorDigest: string
  baseUrl: string
}>
type SelectedOperation = Readonly<{
  pathItem: Readonly<Record<string, unknown>>
  operation: Readonly<Record<string, unknown>>
  credential: Extract<OpenApiCredentialResolution, { kind: 'resolved' }>
}>

export async function importOpenApiHttpCapability(
  input: OpenApiImportInput,
  derefSchema?: SchemaDereferencer,
): Promise<CapabilityPublicationImportResult> {
  const admittedDocument = admitImportDocument(input)
  if (admittedDocument.kind === 'refused') return admittedDocument
  const selected = await resolveSelectedOperation(input, admittedDocument.document, derefSchema)
  if (selected.kind === 'refused') return selected
  const analysis = await analyzeSelectedOperation(input, admittedDocument.document, selected, derefSchema)
  if (analysis.kind === 'refused') return analysis
  return await admitAndProject(input, admittedDocument, analysis.analysis, derefSchema)
}

function admitImportDocument(input: OpenApiImportInput): AdmittedDocument | Refusal {
  const bounded = inspectSource(input.document)
  if (bounded.kind === 'refused') return bounded
  if (publicationMaterialContainsCredential(input.document) || !isRecord(input.document)) {
    return refused('source_invalid')
  }
  if (typeof input.document.openapi !== 'string' || !input.document.openapi.startsWith('3.1.')) {
    return refused('source_version_unsupported')
  }
  if (!validOpenApiPath(input.operation.path)) return refused('selector_invalid')
  const baseUrl = singleServerUrl(input.document.servers)
  return baseUrl === undefined
    ? refused('transport_unsupported')
    : { kind: 'admitted', document: input.document, descriptorDigest: bounded.digest, baseUrl }
}

function singleServerUrl(servers: unknown): string | undefined {
  if (!Array.isArray(servers) || servers.length !== 1) return undefined
  const server = servers[0]
  return isRecord(server) && typeof server.url === 'string' ? validHttpsUrl(server.url) : undefined
}

async function resolveSelectedOperation(
  input: OpenApiImportInput,
  document: Readonly<Record<string, unknown>>,
  derefSchema?: SchemaDereferencer,
): Promise<(SelectedOperation & Readonly<{ kind: 'selected' }>) | Refusal> {
  const paths = document.paths
  const rawPathItem = isRecord(paths) ? paths[input.operation.path] : undefined
  const pathItem = await resolveOpenApiRecord(rawPathItem, document, derefSchema)
  if (pathItem.kind === 'refused') return pathItem
  if (pathItem.value === undefined) return refused('operation_not_found')
  const operation = await resolveOpenApiRecord(
    pathItem.value[input.operation.method],
    document,
    derefSchema,
  )
  if (operation.kind === 'refused') return operation
  if (operation.value === undefined) return refused('operation_not_found')
  const credential = resolveOpenApiCredential(document, operation.value)
  return credential.kind === 'refused'
    ? refused('transport_unsupported')
    : { kind: 'selected', pathItem: pathItem.value, operation: operation.value, credential }
}

async function analyzeSelectedOperation(
  input: OpenApiImportInput,
  document: Readonly<Record<string, unknown>>,
  selected: SelectedOperation,
  derefSchema?: SchemaDereferencer,
): Promise<Readonly<{ kind: 'analyzed'; analysis: OpenApiOperationAnalysis }> | Refusal> {
  const credentialRequired = selected.credential.spec.kind !== 'keyless'
  if (credentialRequired !== (input.commercial.authority.kind === 'provider_connection')) {
    return refused('commercial_metadata_inconsistent')
  }
  if (fixedQueryContainsCredential(input.fixedQuery, selected.credential.parameterNames)) {
    return refused('commercial_metadata_inconsistent')
  }
  const fixedParameterNames = new Set((input.fixedQuery ?? []).map(({ parameter }) => parameter))
  return await analyzeOpenApiOperation(
    selected.operation,
    selected.pathItem.parameters,
    input.operation.path,
    input.operation.method,
    openApiParameterExclusions(selected.credential, fixedParameterNames),
    document,
    derefSchema,
  )
}

async function admitAndProject(
  input: OpenApiImportInput,
  document: AdmittedDocument,
  analysis: OpenApiOperationAnalysis,
  derefSchema?: SchemaDereferencer,
): Promise<CapabilityPublicationImportResult> {
  const fixedQuery = fixedQueryMapping(input.fixedQuery, analysis.parameters.query)
  if (fixedQuery === undefined) return refused('selector_invalid')
  const admit = await admitProviderSchema({
    inputSchema: analysis.inputSchema,
    outputSchema: analysis.outputContent.schema,
    contract: input.contract,
    authority: input.commercial.authority,
    credential: analysis.credential.spec,
    resolutionRoot: document.document,
    credentialParameterNames: analysis.credential.parameterNames,
  }, derefSchema)
  if (admit.kind === 'refused') return refused(admit.reason)
  return normalizedFromSchemas({
    source: {
      kind: 'openapi_http',
      descriptorDigest: document.descriptorDigest,
      selector: input.operation,
      evidenceRefs: input.evidenceRefs,
    },
    contract: admit.contract,
    inputSchema: admit.inputSchema,
    outputSchema: admit.outputSchema,
    commercial: input.commercial,
    endpointUrl: selectedEndpoint(document.baseUrl, input.operation.path),
    adapter: {
      adapterId: 'http-json:v1',
      config: adapterConfig(input, analysis, fixedQuery),
    },
  })
}

function selectedEndpoint(baseUrl: string, path: string): string {
  return new URL(path.replace(/^\/+/, ''), ensureTrailingSlash(baseUrl)).toString()
}

function adapterConfig(
  input: OpenApiImportInput,
  analysis: OpenApiOperationAnalysis,
  fixedQuery: readonly Readonly<{ parameter: string; value: string }>[],
) {
  return {
    method: input.operation.method === 'get' ? ('GET' as const) : ('POST' as const),
    ...(analysis.parameters.query.length === 0 ? {} : { query: analysis.parameters.query }),
    ...(analysis.parameters.path.length === 0 ? {} : { path: analysis.parameters.path }),
    ...(analysis.parameters.headers.length === 0 ? {} : { headers: analysis.parameters.headers }),
    ...(fixedQuery.length === 0 ? {} : { fixedQuery }),
    ...(analysis.requestContent === undefined ? {} : { requestContentType: analysis.requestContent.mediaType }),
    responseContentType: analysis.outputContent.mediaType,
    responseStatus: analysis.responseStatus,
    requestTimeoutMs: input.commercial.requestTimeoutMs,
    credential: credentialConfig(analysis.credential.spec),
  }
}

function credentialConfig(spec: OpenApiOperationAnalysis['credential']['spec']): JsonValue {
  if (spec.kind === 'keyless') return { kind: 'none' as const }
  if (spec.kind === 'api_key') return { kind: 'api_key' as const, location: spec.location, name: spec.name }
  return { kind: 'bearer' as const }
}

function refused(reason: CapabilityPublicationImportRefusal): Refusal {
  return { kind: 'refused', reason }
}
