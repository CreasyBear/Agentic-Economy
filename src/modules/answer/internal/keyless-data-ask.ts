import { findStrictToolSchemaViolation } from '@/modules/harness/strict-schema'
import { isRecord } from '@/modules/common/is-record'
import {
  isPublicOperationRef,
  type PublicOperationRef,
} from '@/modules/capability-supply/public'
import {
  seedKeylessExecutableSource,
  type KeylessExecutableSourcePort,
  type KeylessExecutableToolDescriptor,
} from '@/modules/capability-execution/operation-execute.actions'
import type { OperationExecutableDescriptor } from '@/modules/capability-execution/operation-execute.functions'

const GENERIC_DOMAIN_TOKENS: Record<string, true> = {
  a: true,
  an: true,
  and: true,
  are: true,
  ask: true,
  available: true,
  capability: true,
  api: true,
  apis: true,
  capabilities: true,
  can: true,
  current: true,
  data: true,
  do: true,
  fetch: true,
  find: true,
  for: true,
  from: true,
  get: true,
  give: true,
  how: true,
  i: true,
  image: true,
  images: true,
  in: true,
  information: true,
  into: true,
  is: true,
  it: true,
  latest: true,
  live: true,
  lookup: true,
  me: true,
  my: true,
  need: true,
  now: true,
  of: true,
  on: true,
  or: true,
  photo: true,
  photos: true,
  picture: true,
  pictures: true,
  please: true,
  price: true,
  prices: true,
  rate: true,
  rates: true,
  provide: true,
  request: true,
  result: true,
  results: true,
  retrieve: true,
  return: true,
  search: true,
  show: true,
  tell: true,
  that: true,
  the: true,
  this: true,
  to: true,
  today: true,
  value: true,
  values: true,
  want: true,
  what: true,
  when: true,
  where: true,
  which: true,
  who: true,
  with: true,
}

function normalizedDomainToken(token: string): string {
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`
  if (token.endsWith('s') && token.length > 4) return token.slice(0, -1)
  return token
}

function meaningfulDomainTokens(values: readonly string[]): Set<string> {
  const tokens = new Set<string>()
  for (const value of values) {
    for (const token of value.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      const normalized = normalizedDomainToken(token)
      if (GENERIC_DOMAIN_TOKENS[normalized] !== true) tokens.add(normalized)
    }
  }
  return tokens
}

export function isKeylessCapabilityCompatible(
  query: string,
  descriptor: KeylessExecutableToolDescriptor,
): boolean {
  const queryTokens = meaningfulDomainTokens([query])
  if (queryTokens.size === 0) return false
  const metadata = meaningfulDomainTokens([
    descriptor.capabilityId,
    descriptor.name,
    descriptor.summary,
    ...descriptor.searchTerms,
    ...(descriptor.inputExamples?.map((example) => example.label ?? '') ?? []),
  ])
  return [...queryTokens].some((token) => metadata.has(token))
}

export type KeylessDataAskResolution =
  | Readonly<{
      kind: 'resolved'
      descriptors: readonly KeylessExecutableToolDescriptor[]
      candidates: readonly KeylessExecutableToolDescriptor[]
      selected?: KeylessExecutableToolDescriptor
    }>
  | Readonly<{
      kind: 'unavailable'
      reason: 'source_unavailable' | 'duplicate_operation_ref'
    }>

type RegistryOperationSearchItem = Readonly<Record<string, unknown>>

/**
 * Extracts only canonical refs from a completed operation-search result.
 * Search descriptors are navigation hints; the rebind path reads each ref
 * again before allowing it to become an executable tool.
 */
export function extractCanonicalOperationRefsFromRegistrySearchResult(
  result: unknown,
): readonly PublicOperationRef[] {
  if (!isRecord(result) || result.kind !== 'ok' || !Array.isArray(result.items)) {
    return []
  }
  const refs: PublicOperationRef[] = []
  const seen = new Set<string>()
  for (const item of result.items) {
    if (!isRecord(item) || !isPublicOperationRef(item.operationRef)) {
      continue
    }
    if (seen.has(item.operationRef)) {
      continue
    }
    seen.add(item.operationRef)
    refs.push(item.operationRef)
  }
  return refs
}

function registrySearchItemsByRef(result: unknown): ReadonlyMap<string, RegistryOperationSearchItem> {
  if (!isRecord(result) || !Array.isArray(result.items)) {
    return new Map()
  }
  const items = new Map<string, RegistryOperationSearchItem>()
  for (const item of result.items) {
    if (!isRecord(item) || !isPublicOperationRef(item.operationRef) || items.has(item.operationRef)) {
      continue
    }
    items.set(item.operationRef, item)
  }
  return items
}

function collectSearchMetadata(item: RegistryOperationSearchItem | undefined): string[] {
  if (item === undefined) {
    return []
  }
  const metadata: string[] = []
  const append = (value: unknown) => {
    if (typeof value === 'string' && value.trim().length > 0) {
      metadata.push(value)
    }
  }
  append(item.operationId)
  append(item.summary)
  const contract = isRecord(item.contract) ? item.contract : undefined
  append(contract?.capabilityId)
  const business = isRecord(item.business) ? item.business : undefined
  append(business?.slug)
  append(business?.name)
  const offering = isRecord(item.offering) ? item.offering : undefined
  append(offering?.label)
  append(offering?.summary)
  if (Array.isArray(item.parameters)) {
    for (const parameter of item.parameters) {
      if (!isRecord(parameter)) continue
      append(parameter.name)
      append(parameter.description)
    }
  }
  if (isRecord(item.contract) && Array.isArray(item.contract.customerAnnotations)) {
    for (const annotation of item.contract.customerAnnotations) {
      if (!isRecord(annotation)) continue
      append(annotation.label)
      append(annotation.semanticIdentity)
    }
  }
  return metadata
}

function readPublishedInputExamples(
  item: RegistryOperationSearchItem | undefined,
): KeylessExecutableToolDescriptor['inputExamples'] {
  if (item === undefined || !Array.isArray(item.inputExamples)) {
    return undefined
  }
  const examples = item.inputExamples.flatMap((example) => {
    if (!isRecord(example) || !isRecord(example.input)) {
      return []
    }
    const label = typeof example.label === 'string' ? example.label : undefined
    return [{
      ...(label === undefined ? {} : { label }),
      input: example.input,
    }]
  })
  return examples.length > 0 ? examples : undefined
}

/**
 * Rebinds operation refs returned by the model-facing registry search to
 * current executable descriptors. Endpoint, credential, method, and schema
 * state come only from `source.read`; the public search payload contributes
 * display/search metadata and is never passed to the executor.
 */
export async function rebindKeylessDataAskFromRegistrySearch(
  query: string,
  result: unknown,
  source: KeylessExecutableSourcePort,
  existingDescriptors: readonly KeylessExecutableToolDescriptor[] = [],
): Promise<KeylessDataAskResolution> {
  const items = registrySearchItemsByRef(result)
  const refs = extractCanonicalOperationRefsFromRegistrySearchResult(result)
  const descriptors: KeylessExecutableToolDescriptor[] = []
  const descriptorRefs = new Set<string>()
  for (const descriptor of existingDescriptors) {
    if (descriptorRefs.has(descriptor.operationRef)) continue
    descriptorRefs.add(descriptor.operationRef)
    descriptors.push(descriptor)
  }

  const candidates: KeylessExecutableToolDescriptor[] = []
  const candidateRefs = new Set<string>()
  for (const operationRef of refs) {
    if (candidates.length >= MAX_CANDIDATES) {
      break
    }
    if (candidateRefs.has(operationRef)) {
      continue
    }
    candidateRefs.add(operationRef)
    let executable: OperationExecutableDescriptor | null
    try {
      executable = await source.read(operationRef)
    } catch {
      continue
    }
    if (executable === null
      || executable.operationRef !== operationRef
      || executable.authority.kind !== 'keyless'
      || executable.adapterId !== 'http-json:v1'
      || executable.method !== 'GET'
      || executable.provenance.sourceKind === 'x402') {
      continue
    }
    const item = items.get(operationRef)
    const inputExamples = readPublishedInputExamples(item)
    const descriptor: KeylessExecutableToolDescriptor = {
      operationRef,
      capabilityId: executable.capabilityId,
      name: executable.name,
      summary: typeof item?.summary === 'string' && item.summary.trim().length > 0
        ? item.summary
        : executable.name,
      searchTerms: [
        executable.capabilityId,
        executable.name,
        ...collectSearchMetadata(item),
      ],
      inputSchema: executable.inputSchema,
      ...(inputExamples === undefined ? {} : { inputExamples }),
    }
    if (findStrictToolSchemaViolation(descriptor.inputSchema) !== null
      || !isKeylessCapabilityCompatible(query, descriptor)) {
      continue
    }
    if (!descriptorRefs.has(operationRef)) {
      descriptorRefs.add(operationRef)
      descriptors.push(descriptor)
    }
    candidates.push(descriptor)
  }

  const selected = candidates.length === 1 ? candidates[0] : undefined
  return {
    kind: 'resolved',
    descriptors,
    candidates,
    ...(selected === undefined ? {} : { selected }),
  }
}

export function filterKeylessDataAskCandidates(
  query: string,
  resolution: KeylessDataAskResolution | undefined,
): KeylessDataAskResolution | undefined {
  if (resolution === undefined || resolution.kind === 'unavailable') return resolution
  const candidates = resolution.candidates.filter((descriptor) =>
    isKeylessCapabilityCompatible(query, descriptor))
  const selected = resolution.selected !== undefined
    && isKeylessCapabilityCompatible(query, resolution.selected)
    && candidates.some(({ operationRef }) => operationRef === resolution.selected?.operationRef)
    ? resolution.selected
    : undefined
  return {
    kind: 'resolved',
    descriptors: resolution.descriptors,
    candidates,
    ...(selected === undefined ? {} : { selected }),
  }
}

const MAX_CANDIDATES = 5

async function matchesSeededKeylessCapability(query: string): Promise<boolean> {
  if (query.trim().length === 0) return true
  const descriptors = await seedKeylessExecutableSource.list()
  const rankedRefs = await seedKeylessExecutableSource.search(query, descriptors)
  const rankedSet = new Set(rankedRefs)
  return descriptors.some((descriptor) =>
    rankedSet.has(descriptor.operationRef)
      && isKeylessCapabilityCompatible(query, descriptor))
}

export async function resolveKeylessDataAsk(
  query: string,
  source: KeylessExecutableSourcePort,
): Promise<KeylessDataAskResolution> {
  let descriptors: KeylessExecutableToolDescriptor[]

  try {
    // Keep every listed descriptor in the snapshot. The executor re-reads the
    // canonical operation descriptor, while search receives the same snapshot
    // used to resolve ranked candidates.
    descriptors = [...await source.list()]
      .sort((left, right) => left.operationRef.localeCompare(right.operationRef))
  } catch {
    return await matchesSeededKeylessCapability(query)
      ? { kind: 'unavailable', reason: 'source_unavailable' }
      : { kind: 'resolved', descriptors: [], candidates: [] }
  }

  const seen = new Set<string>()
  for (const descriptor of descriptors) {
    if (seen.has(descriptor.operationRef)) {
      return { kind: 'unavailable', reason: 'duplicate_operation_ref' }
    }
    seen.add(descriptor.operationRef)
  }

  let rankedRefs: readonly string[]
  try {
    rankedRefs = await source.search(query, descriptors)
  } catch {
    return { kind: 'unavailable', reason: 'source_unavailable' }
  }

  const descriptorByRef = new Map<string, KeylessExecutableToolDescriptor>(
    descriptors.map((descriptor) => [descriptor.operationRef, descriptor]),
  )
  const candidateRefs = new Set<string>()
  const candidates: KeylessExecutableToolDescriptor[] = []
  for (const operationRef of rankedRefs) {
    if (candidates.length >= MAX_CANDIDATES) {
      break
    }
    if (candidateRefs.has(operationRef)) {
      continue
    }
    candidateRefs.add(operationRef)
    const descriptor = descriptorByRef.get(operationRef)
    if (descriptor === undefined
      || findStrictToolSchemaViolation(descriptor.inputSchema) !== null
      || !isKeylessCapabilityCompatible(query, descriptor)) {
      continue
    }
    candidates.push(descriptor)
  }

  const selected = candidates.length === 1 ? candidates[0] : undefined
  return {
    kind: 'resolved',
    descriptors,
    candidates,
    ...(selected === undefined ? {} : { selected }),
  }
}