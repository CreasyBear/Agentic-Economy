import {
  defineCapabilityContract,
} from '../../src/modules/capability-contract/public'
import type {
  KeylessExecutableSourcePort,
  KeylessExecutableToolDescriptor,
  OperationExecutableDescriptor,
} from '../../src/modules/capability-execution/public'
import {
  capabilityOperationId,
  createPublicOperationRef,
  isAnonymousKeylessOperationEligible,
  isPublicOperationRef,
  normalizeCapabilityPublication,
  rankOperationSearchText,
  type HttpJsonQueryParameterMapping,
} from '../../src/modules/capability-supply/public'
import { isRecord } from '../../src/modules/common/is-record'
import { CURATED_PROVIDER_PUBLICATIONS } from '../../src/modules/capability-supply/curated-provider-publications'

type AdapterConfig = {
  method?: 'GET' | 'POST'
  query?: readonly HttpJsonQueryParameterMapping[]
  fixedQuery?: readonly { parameter: string; value: string }[]
  requestContentType?: string
  responseContentType?: string
  responseStatus?: number
  requestTimeoutMs?: number
}

function parseAdapterConfig(config: unknown): AdapterConfig | undefined {
  let parsed: unknown
  try {
    parsed = typeof config === 'string' ? JSON.parse(config) : config
  } catch {
    return undefined
  }
  if (!isRecord(parsed)) return undefined
  return {
    ...(parsed.method === 'GET' || parsed.method === 'POST' ? { method: parsed.method } : {}),
    ...(Array.isArray(parsed.query) ? { query: parsed.query } : {}),
    ...(Array.isArray(parsed.fixedQuery) ? { fixedQuery: parsed.fixedQuery } : {}),
    ...(typeof parsed.requestContentType === 'string' ? { requestContentType: parsed.requestContentType } : {}),
    ...(typeof parsed.responseContentType === 'string' ? { responseContentType: parsed.responseContentType } : {}),
    ...(typeof parsed.responseStatus === 'number' ? { responseStatus: parsed.responseStatus } : {}),
    ...(typeof parsed.requestTimeoutMs === 'number' ? { requestTimeoutMs: parsed.requestTimeoutMs } : {}),
  }
}

function isExecutionBoundaryX402(offering: unknown): boolean {
  const presentation = isRecord(offering) ? offering.presentation : undefined
  const terms = isRecord(presentation) && Array.isArray(presentation.materialTerms) ? presentation.materialTerms : []
  for (const term of terms) {
    if (!isRecord(term)) continue
    if (term.termId === 'ae-execution-boundary') return true
    const text = `${term.label ?? ''} ${term.value ?? ''}`.toLowerCase()
    if (text.includes('x402') || text.includes('does not execute')) return true
  }
  return false
}

function isNonExecutableShape(offering: unknown): boolean {
  const presentation = isRecord(offering) ? offering.presentation : undefined
  const terms = isRecord(presentation) && Array.isArray(presentation.materialTerms) ? presentation.materialTerms : []
  for (const term of terms) {
    if (!isRecord(term) || term.termId !== 'shape-note') continue
    const text = `${term.label ?? ''} ${term.value ?? ''}`.toLowerCase()
    if (text.includes('path segment') || text.includes('url path')) return true
  }
  return false
}

function jsonFormatFixedQuery(
  inputSchema: Record<string, unknown> | undefined,
  fixedQuery: readonly { parameter: string; value: string }[] | undefined,
): readonly { parameter: string; value: string }[] | undefined {
  const properties = isRecord(inputSchema) && isRecord(inputSchema.properties) ? inputSchema.properties : {}
  const format = isRecord(properties.format) && Array.isArray(properties.format.enum)
    ? properties.format.enum as unknown[]
    : []
  if (format.length !== 1 || format[0] !== 'json') return undefined
  if ((fixedQuery ?? []).some((item) => item.parameter === 'format')) return undefined
  return [...(fixedQuery ?? []), { parameter: 'format', value: 'json' }]
}

type SeedDescriptor = OperationExecutableDescriptor & Readonly<{
  summary: string
  searchTerms: readonly string[]
  inputExamples?: KeylessExecutableToolDescriptor['inputExamples']
}>

let cache: SeedDescriptor[] | undefined

async function buildCache(): Promise<SeedDescriptor[]> {
  const out: SeedDescriptor[] = []
  for (const item of CURATED_PROVIDER_PUBLICATIONS) {
    const publication = item.publication
    if (publication.kind !== 'openapi_http') continue
    if (isExecutionBoundaryX402(publication.commercial.offering)) continue
    if (isNonExecutableShape(publication.commercial.offering)) continue

    let normalized
    try {
      normalized = await normalizeCapabilityPublication(publication)
    } catch {
      continue
    }
    if (normalized.kind !== 'normalized') continue
    const binding = normalized.draft.binding
    const config = parseAdapterConfig(binding.adapter.config)
    if (config === undefined) continue

    let contract
    try {
      contract = defineCapabilityContract(JSON.parse(normalized.draft.documentJson))
    } catch {
      continue
    }
    if (!isAnonymousKeylessOperationEligible({
      authority: binding.authority,
      adapterId: binding.adapter.adapterId,
      method: config.method ?? '',
      sourceKind: normalized.draft.source.kind,
      price: normalized.draft.offering.presentation.price,
      effects: contract.effects,
    })) continue
    const inputSchema = contract.inputSchema as Record<string, unknown>
    const query = config.query ?? []
    const fixedQuery = jsonFormatFixedQuery(inputSchema, config.fixedQuery) ?? config.fixedQuery
    const propertyCount = isRecord(inputSchema) && isRecord(inputSchema.properties)
      ? Object.keys(inputSchema.properties).length
      : 0
    if (propertyCount === 0 && query.length === 0 && (fixedQuery?.length ?? 0) === 0) continue

    const contractRef = contract.ref
    const operationRef = createPublicOperationRef({
      operationId: capabilityOperationId(contractRef.capabilityId),
      publicationRef: normalized.draft.offering.offeringId,
      publicationRevision: 1,
      contractRef,
    })
    out.push({
      operationRef,
      capabilityId: contractRef.capabilityId,
      name: contract.name,
      summary: contract.description,
      searchTerms: normalized.draft.offering.searchTerms,
      ...(item.publication.contract.inputExamples === undefined
        ? {}
        : { inputExamples: item.publication.contract.inputExamples }),
      endpointUrl: binding.endpointUrl,
      price: normalized.draft.offering.presentation.price,
      authority: binding.authority,
      adapterId: binding.adapter.adapterId,
      method: 'GET',
      effects: contract.effects.map(({ class: effectClass, authority }) => ({ class: effectClass, authority })),
      ...(query.length === 0 ? {} : { query }),
      ...(fixedQuery === undefined || fixedQuery.length === 0 ? {} : { fixedQuery: [...fixedQuery] }),
      ...(config.requestContentType === undefined ? {} : { requestContentType: config.requestContentType }),
      ...(config.responseContentType === undefined ? {} : { responseContentType: config.responseContentType }),
      ...(config.responseStatus === undefined ? {} : { responseStatus: config.responseStatus }),
      requestTimeoutMs: config.requestTimeoutMs ?? 10_000,
      inputSchema: inputSchema ?? {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
      outputSchema: contract.outputSchema as Record<string, unknown>,
      provenance: { publisher: 'ae_curated_external', sourceKind: 'openapi_http' },
    })
  }
  return out
}

export async function deriveKeylessDescriptors(): Promise<OperationExecutableDescriptor[]> {
  if (cache === undefined) cache = await buildCache()
  return cache
}

export async function seededKeylessSeeds(): Promise<KeylessExecutableToolDescriptor[]> {
  const descriptors = cache ?? (cache = await buildCache())
  return descriptors.map((descriptor) => ({
    operationRef: descriptor.operationRef,
    capabilityId: descriptor.capabilityId,
    name: descriptor.name,
    summary: descriptor.summary,
    searchTerms: descriptor.searchTerms,
    ...(descriptor.inputExamples === undefined ? {} : { inputExamples: descriptor.inputExamples }),
    inputSchema: descriptor.inputSchema,
  }))
}

export async function seededDescriptorFor(operationRef: string): Promise<OperationExecutableDescriptor | undefined> {
  const descriptors = await deriveKeylessDescriptors()
  return descriptors.find((descriptor) => descriptor.operationRef === operationRef)
}

export const seedKeylessExecutableSource: KeylessExecutableSourcePort = {
  list: seededKeylessSeeds,
  read: async (operationRef) => isPublicOperationRef(operationRef)
    ? await seededDescriptorFor(operationRef) ?? null
    : null,
  search: async (query, descriptors) => rankOperationSearchText(
    query,
    descriptors.map((descriptor) => ({
      value: descriptor.operationRef,
      operationRef: descriptor.operationRef,
      searchText: [descriptor.capabilityId, descriptor.name, descriptor.summary, ...descriptor.searchTerms],
    })),
  ),
}