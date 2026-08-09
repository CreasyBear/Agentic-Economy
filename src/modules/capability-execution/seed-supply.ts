/**
 * Shared keyless seed-supply: project the curated onboard seed into executable
 * descriptors WITHOUT Convex, so both the answer chat and the market CLI get the
 * same keyless ops even before `listKeylessExecutable` is deployed/reachable.
 *
 * Fail-closed, mirroring the Convex reader: only keyless `http-json:v1` GET
 * operations, x402 listings and path-segment (shape-note) advisories excluded.
 * Memoized so it is computed once per process, not per request.
 */
import type { KeylessExecutableToolDescriptor } from './public'
import type { OperationExecutableDescriptor } from './public'
import {
  capabilityOperationId,
  createPublicOperationRef,
  normalizeCapabilityPublication,
} from '@/modules/capability-supply/public'
import { defineCapabilityContract } from '@/modules/capability-contract/public'
import { CURATED_PROVIDER_PUBLICATIONS } from '@/modules/capability-supply/curated-provider-publications'
import { isRecord } from '@/modules/common/is-record'

type AdapterConfig = {
  method?: 'GET' | 'POST'
  query?: readonly { inputPointer: string; parameter: string }[]
  fixedQuery?: readonly { parameter: string; value: string }[]
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
    ...(typeof parsed.requestTimeoutMs === 'number' ? { requestTimeoutMs: parsed.requestTimeoutMs } : {}),
  }
}


/** x402 listings carry an `ae-execution-boundary` (or x402) material term. */
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

/** ops declared with a `shape-note` path-segment advisory are NOT generic-harness executable. */
function isNonExecutableShape(offering: unknown): boolean {
  const presentation = isRecord(offering) ? offering.presentation : undefined
  const terms = isRecord(presentation) && Array.isArray(presentation.materialTerms) ? presentation.materialTerms : []
  for (const term of terms) {
    if (!isRecord(term)) continue
    if (term.termId !== 'shape-note') continue
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
    ? (properties.format.enum as unknown[])
    : []
  if (format.length !== 1 || format[0] !== 'json') return undefined
  if ((fixedQuery ?? []).some((f) => f.parameter === 'format')) return undefined
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
    const imp = item.publication
    if (imp.kind !== 'openapi_http') continue
    if (imp.operation.method !== 'get') continue
    if (isExecutionBoundaryX402(imp.commercial.offering)) continue
    if (isNonExecutableShape(imp.commercial.offering)) continue
    let normalized
    try {
      normalized = await normalizeCapabilityPublication(imp)
    } catch {
      continue
    }
    if (normalized.kind !== 'normalized') continue
    const binding = normalized.draft.binding
    if (binding.authority.kind !== 'keyless') continue
    if (binding.adapter.adapterId !== 'http-json:v1') continue
    const config = parseAdapterConfig(binding.adapter.config)
    if (config?.method !== 'GET') continue
    let contract
    try {
      contract = defineCapabilityContract(JSON.parse(normalized.draft.documentJson))
    } catch {
      continue
    }
    const inputSchema = contract.inputSchema as Record<string, unknown>
    const query = config.query ?? []
    const fixedQuery = jsonFormatFixedQuery(inputSchema, config.fixedQuery) ?? config.fixedQuery
    const props = isRecord(inputSchema) && isRecord(inputSchema.properties) ? Object.keys(inputSchema.properties).length : 0
    if (props === 0 && query.length === 0 && (fixedQuery?.length ?? 0) === 0) continue
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
      ...(contract.inputExamples === undefined ? {} : { inputExamples: contract.inputExamples }),
      endpointUrl: binding.endpointUrl,
      authority: binding.authority,
      adapterId: binding.adapter.adapterId,
      method: 'GET',
      ...(query.length === 0 ? {} : { query }),
      ...(fixedQuery === undefined || fixedQuery.length === 0 ? {} : { fixedQuery: [...fixedQuery] }),
      requestTimeoutMs: config.requestTimeoutMs ?? 10_000,
      inputSchema: inputSchema ?? { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: {}, required: [], additionalProperties: false },
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
