import { answerOperationCandidateFromPublicDescriptor } from './operation-artifacts'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { jsonValueSchema, type JsonValue } from '@/modules/capability-contract/public'
import {
  ANSWER_OPERATION_CANDIDATE_LIMIT,
  answerOperationCandidateSetDigest,
  type AnswerOperationCandidate,
} from '../answer-schema'
import {
  isPublicOperationRef,
  isAnonymousKeylessOperationEligible,
  type PublicOperationDescriptor,
  type PublicOperationParameter,
  type PublicOperationRef,
} from '@/modules/capability-supply/public'
import {
  operationExecutionBindingDigest,
  type OperationExecutableDescriptor,
} from '@/modules/capability-execution/operation-execute.functions'
import type {
  KeylessExecutableSourcePort,
  KeylessExecutableToolDescriptor,
} from '@/modules/capability-execution/operation-execute.actions'
import { findStrictToolSchemaViolation } from '@/modules/harness/strict-schema'
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
  use: true,
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

function keylessCapabilityMatchScore(
  query: string,
  descriptor: KeylessExecutableToolDescriptor,
): number {
  const metadataValues = [
    descriptor.operationRef,
    descriptor.capabilityId,
    descriptor.name,
    descriptor.summary,
    ...descriptor.searchTerms,
    ...(descriptor.inputExamples?.map((example) => example.label ?? '') ?? []),
  ]
  const queryTokens = meaningfulDomainTokens([query])
  const metadata = meaningfulDomainTokens(metadataValues)
  const tokenScore = [...queryTokens]
    .filter((token) => metadata.has(token))
    .reduce((score, token) => score + (token.length <= 3 ? 0.25 : 1), 0)
  const normalizedQuery = (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).join(' ')
  const phraseScore = Math.max(0, ...metadataValues.map((value) => {
    const words = value.toLowerCase().match(/[a-z0-9]+/g) ?? []
    if (words.length === 0 || meaningfulDomainTokens([value]).size === 0) return 0
    return normalizedQuery.includes(words.join(' ')) ? words.length * 10 : 0
  }))
  return tokenScore + phraseScore
}

export function isKeylessCapabilityCompatible(
  query: string,
  descriptor: KeylessExecutableToolDescriptor,
): boolean {
  return keylessCapabilityMatchScore(query, descriptor) > 0
}

export type KeylessDataAskDecisionCandidate = AnswerOperationCandidate

export type KeylessDataAskClarificationStatus = 'changed' | 'unavailable'

export type KeylessDataAskDecision = Readonly<{
  kind: 'choose_operation'
  candidates: readonly KeylessDataAskDecisionCandidate[]
  candidateSetDigest: string
  status?: KeylessDataAskClarificationStatus
  invalidOperationRef?: string
}>

export type KeylessDataAskResolution =
  | Readonly<{
      kind: 'resolved'
      descriptors: readonly KeylessExecutableToolDescriptor[]
      candidates: readonly KeylessExecutableToolDescriptor[]
      selected?: KeylessExecutableToolDescriptor
      /** Rich registry projections are kept outside executable descriptors. */
      operationCandidates?: readonly AnswerOperationCandidate[]
      selectedCandidate?: AnswerOperationCandidate
      candidateSetDigest?: string
    }>
  | Readonly<{
      kind: 'needs_clarification'
      descriptors: readonly KeylessExecutableToolDescriptor[]
      candidates: readonly KeylessExecutableToolDescriptor[]
      /** Rich registry projections are kept outside executable descriptors. */
      operationCandidates?: readonly AnswerOperationCandidate[]
      decision: KeylessDataAskDecision
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
function parametersFromSchema(
  schema: Record<string, JsonValue>,
): Pick<AnswerOperationCandidate, 'requiredParameters' | 'optionalParameters'> {
  const required = new Set(Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === 'string')
    : [])
  const properties = schema.properties !== undefined && isJsonObject(schema.properties)
    ? schema.properties
    : {}
  const parameters = Object.entries(properties).slice(0, 32).flatMap(([name, value]) => {
    const property = isJsonObject(value) ? value : undefined
    if (property === undefined) return []
    const type = typeof property.type === 'string' ? property.type : 'value'
    const description = typeof property.description === 'string' ? property.description : undefined
    const example = property.example
    const enumValues = Array.isArray(property.enum)
      ? property.enum.filter((item): item is string => typeof item === 'string')
      : undefined
    const defaultValue = property.default
    const style: 'form' | 'simple' | undefined = property.style === 'form'
      ? 'form'
      : property.style === 'simple'
        ? 'simple'
        : undefined
    const explode = typeof property.explode === 'boolean' ? property.explode : undefined
    return [{
      group: 'body' as const,
      name,
      type,
      ...(description === undefined ? {} : { description }),
      ...(example === undefined ? {} : { example }),
      ...(enumValues === undefined || enumValues.length === 0 ? {} : { enumValues }),
      ...(defaultValue === undefined ? {} : { default: defaultValue }),
      ...(style === undefined ? {} : { style }),
      ...(explode === undefined ? {} : { explode }),
      required: required.has(name),
    }]
  })
  return {
    requiredParameters: parameters.filter(
      (parameter): parameter is typeof parameter & { required: true } => parameter.required,
    ),
    optionalParameters: parameters.filter(
      (parameter): parameter is typeof parameter & { required: false } => !parameter.required,
    ),
  }
}
function parametersFromPublicDescriptor(
  parameters: readonly PublicOperationParameter[],
): Pick<AnswerOperationCandidate, 'requiredParameters' | 'optionalParameters'> {
  const cloned = parameters.slice(0, 32).map((parameter) => ({
    group: parameter.group,
    name: parameter.name,
    type: parameter.type,
    ...(parameter.description === undefined ? {} : { description: parameter.description }),
    ...(parameter.example === undefined ? {} : { example: parameter.example }),
    ...(parameter.enumValues === undefined ? {} : { enumValues: [...parameter.enumValues] }),
    ...(parameter.default === undefined ? {} : { default: parameter.default }),
    required: parameter.required,
    ...(parameter.style === undefined ? {} : { style: parameter.style }),
    ...(parameter.explode === undefined ? {} : { explode: parameter.explode }),
  }))
  const requiredParameters: AnswerOperationCandidate['requiredParameters'] = []
  const optionalParameters: AnswerOperationCandidate['optionalParameters'] = []
  for (const parameter of cloned) {
    if (parameter.required) {
      requiredParameters.push({ ...parameter, required: true })
    } else {
      optionalParameters.push({ ...parameter, required: false })
    }
  }
  return { requiredParameters, optionalParameters }
}


function cloneJsonRecord(value: Readonly<Record<string, unknown>>): Record<string, JsonValue> | undefined {
  const parsed = jsonValueSchema.safeParse(value)
  if (!parsed.success || !isRecord(parsed.data)) return undefined
  return structuredClone(parsed.data) as Record<string, JsonValue>
}
function plainDescriptor(
  descriptor: KeylessExecutableToolDescriptor,
): KeylessExecutableToolDescriptor {
  if (!('publicOperation' in descriptor) && !('operationCandidate' in descriptor)) {
    return descriptor
  }
  const {
    publicOperation: _publicOperation,
    operationCandidate: _operationCandidate,
    ...plain
  } = descriptor
  return plain
}

function uniquelyNamedCandidate(
  query: string,
  candidates: readonly AnswerOperationCandidate[],
): AnswerOperationCandidate | undefined {
  if (candidates.length === 0) return undefined
  const normalizedQuery = normalizedSelectionText(query)
  const exact = candidates.filter((candidate) => [
    candidate.operationRef,
    candidate.operationId,
    candidate.business.name,
    candidate.business.slug,
    candidate.offering.label,
  ].some((alias) => normalizedSelectionText(alias) === normalizedQuery))
  if (exact.length === 1) return exact[0]
  const queryTokens = meaningfulDomainTokens([query])
  if (queryTokens.size === 0) return undefined
  const scored = candidates.map((candidate) => {
    const metadataTokens = meaningfulDomainTokens([
      candidate.operationId,
      candidate.business.name,
      candidate.business.slug,
      candidate.offering.label,
      candidate.summary,
    ])
    return {
      candidate,
      score: [...queryTokens].filter((token) => metadataTokens.has(token)).length,
    }
  })
  const bestScore = Math.max(...scored.map(({ score }) => score))
  if (bestScore === 0) return undefined
  const best = scored.filter(({ score }) => score === bestScore)
  return best.length === 1 ? best[0]!.candidate : undefined
}

function matchReasonForCandidate(
  query: string,
  descriptor: KeylessExecutableToolDescriptor,
  operation: PublicOperationDescriptor | undefined,
): string {
  const queryTokens = [...meaningfulDomainTokens([query])]
  const metadata = [
    descriptor.name,
    descriptor.capabilityId,
    descriptor.summary,
    ...descriptor.searchTerms,
    ...(operation === undefined ? [] : [
      operation.operationId,
      operation.business.name,
      operation.business.slug,
      operation.offering.label,
    ]),
  ]
  const matched = queryTokens.find((token) => meaningfulDomainTokens(metadata).has(token))
  return matched === undefined
    ? 'Matched the current executable operation catalogue.'
    : `Matched “${matched}” in the operation name, provider, or search terms.`
}

function candidateFromDescriptor(
  descriptor: KeylessExecutableToolDescriptor,
  rank: number,
  query: string,
  operation?: PublicOperationDescriptor,
): AnswerOperationCandidate {
  if (operation !== undefined) {
    const canonical = answerOperationCandidateFromPublicDescriptor(operation, rank, {
      matchReason: matchReasonForCandidate(query, descriptor, operation),
      includeInputSchema: true,
      ...(descriptor.executionBindingDigest === undefined ? {} : { executionBindingDigest: descriptor.executionBindingDigest }),
    })
    if (canonical !== undefined) {
      return canonical
    }
  }
  const inputSchema = operation?.contract.inputJsonSchema ?? descriptor.inputSchema
  const inputJsonSchema = cloneJsonRecord(inputSchema)
  const operationId = operation?.operationId ?? descriptor.capabilityId
  const business = operation?.business ?? {
    businessId: `capability:${descriptor.capabilityId}`,
    slug: descriptor.capabilityId,
    name: descriptor.name,
  }
  const offering = operation?.offering ?? {
    offeringRef: `offering:${descriptor.capabilityId}`,
    revision: 1,
    label: descriptor.name,
    summary: descriptor.summary,
  }
  const availability = operation?.availability ?? { posture: 'routeable' as const }
  const commercial = operation?.commercial ?? {
    price: { kind: 'on_request' as const },
    materialTerms: [],
    relationship: { kind: 'none' as const, summary: 'No published commercial relationship.' },
  }
  const provenance = operation?.provenance ?? {
    publisher: 'ae_curated_external' as const,
    sourceKind: 'openapi_http' as const,
  }
  const schemaParameters: Pick<AnswerOperationCandidate, 'requiredParameters' | 'optionalParameters'> = inputJsonSchema === undefined
    ? { requiredParameters: [], optionalParameters: [] }
    : parametersFromSchema(inputJsonSchema)
  const parameterSets = operation?.parameters === undefined
    ? schemaParameters
    : parametersFromPublicDescriptor(operation.parameters)
  const requiredParameters = parameterSets.requiredParameters
  const optionalParameters = parameterSets.optionalParameters
  const candidate: AnswerOperationCandidate = {
    rank,
    operationRef: descriptor.operationRef as AnswerOperationCandidate['operationRef'],
    operationId,
    descriptorDigest: canonicalDigest(operation ?? {
      operationRef: descriptor.operationRef,
      capabilityId: descriptor.capabilityId,
      name: descriptor.name,
      summary: descriptor.summary,
      inputSchema,
      availability,
      commercial,
      provenance,
    }).toString(),
    ...(descriptor.executionBindingDigest === undefined ? {} : { executionBindingDigest: descriptor.executionBindingDigest }),
    business,
    offering,
    matchReason: matchReasonForCandidate(query, descriptor, operation),
    summary: (operation?.summary ?? descriptor.summary).slice(0, 400),
    availability,
    commercial: {
      price: commercial.price,
      ...(commercial.priceEvidence === undefined ? {} : { priceEvidence: { ...commercial.priceEvidence, evidenceRefs: [...commercial.priceEvidence.evidenceRefs] } }),
      materialTerms: commercial.materialTerms.map((term) => ({ label: term.label, value: term.value })),
      relationship: { ...commercial.relationship },
    },
    requiredParameters,
    optionalParameters,
    inputSchemaDigest: canonicalDigest(inputSchema).toString(),
    ...(inputJsonSchema === undefined ? {} : { inputJsonSchema }),
    exactRebindRequired: inputJsonSchema === undefined,
    authority: {
      publisher: provenance.publisher,
      sourceKind: provenance.sourceKind,
      authentication: operation === undefined ? { kind: 'keyless' as const } : { ...operation.authentication },
    },
    dataUse: (operation?.dataUse ?? []).slice(0, 12).map((policy) => ({
      effectId: policy.effectId,
      inputPointer: policy.inputPointer,
      classification: policy.classification,
      phase: policy.phase,
      recipient: policy.recipient,
      purposes: [...policy.purposes],
    })),
    effects: (operation?.effects ?? []).slice(0, 12).map((effect) => ({ ...effect })),
    evidence: (operation?.evidence ?? []).slice(0, 12).map((item) => ({ ...item })),
    recovery: operation?.recovery === undefined
      ? { idempotency: 'not_applicable' as const, recovery: 'retry_safe' as const }
      : { ...operation.recovery },
    navigation: (operation?.navigation ?? []).slice(0, 12).map((relation) => {
      const relationInputSchema = relation.inputSchema === undefined
        ? undefined
        : cloneJsonRecord(relation.inputSchema)
      return {
        relation: relation.relation,
        ...(relation.pathTemplate === undefined ? {} : { pathTemplate: relation.pathTemplate }),
        method: relation.method,
        actionId: relation.actionId,
        authentication: relation.authentication,
        ...(relationInputSchema === undefined ? {} : { inputSchema: relationInputSchema }),
        ...(relation.surfaces === undefined ? {} : { surfaces: [...relation.surfaces] }),
        ...(relation.precondition === undefined ? {} : { precondition: relation.precondition }),
      }
    }),
  }
  return candidate
}

function candidateForDescriptor(
  descriptor: KeylessExecutableToolDescriptor,
  rank: number,
  query: string,
  richByRef: ReadonlyMap<string, AnswerOperationCandidate>,
): AnswerOperationCandidate {
  const existing = richByRef.get(descriptor.operationRef)
  return existing === undefined
    ? candidateFromDescriptor(descriptor, rank, query)
    : {
        ...existing,
        rank,
        matchReason: existing.matchReason || matchReasonForCandidate(query, descriptor, undefined),
      }
}


function isCapabilityOptionsQuery(query: string): boolean {
  const normalized = query.toLowerCase()
  return (
    /\b(?:without|do not|don't)\s+(?:running|run|fetching|fetch|executing|execute)\b/.test(
      normalized,
    ) ||
    /\b(?:which|what|list|show)\b.*\b(?:capabilities|feeds?|options?|sources?)\b/.test(
      normalized,
    ) ||
    /\b(?:compare|comparison)\b.*\b(?:feeds?|options?|sources?)\b/.test(
      normalized,
    )
  )
}
function uniquelyHighestScoringCandidate(
  query: string,
  descriptors: readonly KeylessExecutableToolDescriptor[],
  candidates: readonly AnswerOperationCandidate[],
): AnswerOperationCandidate | undefined {
  if (descriptors.length < 2 || isCapabilityOptionsQuery(query)) return undefined
  const scored = descriptors.map((descriptor) => ({
    candidate: candidates.find((candidate) => candidate.operationRef === descriptor.operationRef),
    score: keylessCapabilityMatchScore(query, descriptor),
  }))
  const bestScore = Math.max(0, ...scored.map(({ score }) => score))
  const best = scored.filter(({ score }) => score === bestScore)
  return bestScore > 0 && best.length === 1 ? best[0]?.candidate : undefined
}




function resolveCandidateOutcome(
  query: string,
  descriptors: readonly KeylessExecutableToolDescriptor[],
  candidates: readonly KeylessExecutableToolDescriptor[],
  operationCandidates: readonly AnswerOperationCandidate[] = [],
  forcedSelectedRef?: string,
): KeylessDataAskResolution {
  const descriptorSnapshot = descriptors.map(plainDescriptor)
  const seen = new Set<string>()
  const boundedDescriptors: KeylessExecutableToolDescriptor[] = []
  for (const candidate of candidates) {
    const descriptor = plainDescriptor(candidate)
    if (seen.has(descriptor.operationRef)) continue
    seen.add(descriptor.operationRef)
    boundedDescriptors.push(descriptor)
    if (boundedDescriptors.length >= MAX_CANDIDATES) break
  }
  const richByRef = new Map(operationCandidates.map((candidate) => [candidate.operationRef, candidate]))
  const boundedCandidates = boundedDescriptors.map((descriptor, index) =>
    candidateForDescriptor(descriptor, index + 1, query, richByRef))
  const setDigest = boundedCandidates.length === 0 ? undefined : answerOperationCandidateSetDigest(boundedCandidates)
  const soleDescriptor = boundedDescriptors.length === 1 ? boundedDescriptors[0] : undefined
  const uniquelyNamed = boundedDescriptors.length > 1 && isCapabilityOptionsQuery(query)
    ? undefined
    : uniquelyNamedCandidate(query, boundedCandidates)
  const selectedCandidate = forcedSelectedRef === undefined
    ? uniquelyNamed
      ?? uniquelyHighestScoringCandidate(query, boundedDescriptors, boundedCandidates)
      ?? (soleDescriptor !== undefined && isKeylessCapabilityCompatible(query, soleDescriptor)
        ? boundedCandidates[0]
        : undefined)
    : boundedCandidates.find((candidate) => candidate.operationRef === forcedSelectedRef)
  const selected = selectedCandidate === undefined
    ? undefined
    : boundedDescriptors.find((descriptor) => descriptor.operationRef === selectedCandidate.operationRef)
  const richValues = boundedCandidates.length === 0 ? {} : { operationCandidates: boundedCandidates }
  if (selected !== undefined && selectedCandidate !== undefined) {
    return {
      kind: 'resolved',
      descriptors: descriptorSnapshot,
      candidates: boundedDescriptors,
      selected,
      selectedCandidate,
      ...richValues,
      ...(setDigest === undefined ? {} : { candidateSetDigest: setDigest }),
    }
  }
  if (boundedCandidates.length === 0) {
    return { kind: 'resolved', descriptors: descriptorSnapshot, candidates: boundedDescriptors }
  }
  if (setDigest === undefined) throw new Error('answer_candidate_set_digest_missing')
  return {
    kind: 'needs_clarification',
    descriptors: descriptorSnapshot,
    candidates: boundedDescriptors,
    ...richValues,
    decision: {
      kind: 'choose_operation',
      candidates: boundedCandidates,
      candidateSetDigest: setDigest,
    },
  }
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
    const plain = plainDescriptor(descriptor)
    if (descriptorRefs.has(plain.operationRef)) continue
    descriptorRefs.add(plain.operationRef)
    descriptors.push(plain)
  }

  const candidates: KeylessExecutableToolDescriptor[] = []
  const richCandidates: AnswerOperationCandidate[] = []
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
      || !isAnonymousKeylessOperationEligible({
        authority: executable.authority,
        adapterId: executable.adapterId,
        method: executable.method,
        sourceKind: executable.provenance.sourceKind,
        price: executable.price,
        effects: executable.effects,
      })) {
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
      executionBindingDigest: operationExecutionBindingDigest(executable),
      ...(inputExamples === undefined ? {} : { inputExamples }),
    }
    let publicOperation: PublicOperationDescriptor | undefined
    if (source.readPublic !== undefined) {
      try {
        publicOperation = (await source.readPublic(operationRef)) ?? undefined
      } catch {
        publicOperation = undefined
      }
    }
    if (findStrictToolSchemaViolation(descriptor.inputSchema) !== null
      || !isKeylessCapabilityCompatible(query, descriptor)) {
      continue
    }
    const candidate = candidateFromDescriptor(descriptor, candidates.length + 1, query, publicOperation)
    descriptors.push(descriptor)
    candidates.push(descriptor)
    richCandidates.push(candidate)
  }

  return resolveCandidateOutcome(query, descriptors, candidates, richCandidates)
}
function descriptorFromCandidate(candidate: AnswerOperationCandidate): KeylessExecutableToolDescriptor | undefined {
  if (candidate.inputJsonSchema === undefined) return undefined
  return {
    operationRef: candidate.operationRef,
    capabilityId: candidate.operationId,
    name: candidate.offering.label,
    summary: candidate.summary,
    searchTerms: [
      candidate.operationId,
      candidate.business.name,
      candidate.business.slug,
      candidate.offering.label,
    ],
    inputSchema: candidate.inputJsonSchema,
    ...(candidate.executionBindingDigest === undefined ? {} : { executionBindingDigest: candidate.executionBindingDigest }),
  }
}


function isJsonObject(value: JsonValue): value is Record<string, JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export const ANSWER_OPERATION_INPUT_MAX_BYTES = 256 * 1024

export type AnswerOperationSelectionInput = Readonly<{
  operationRef: PublicOperationRef
  input: Record<string, JsonValue>
  candidateSetDigest: string
}>

export function parseAnswerOperationSelectionInput(query: string): AnswerOperationSelectionInput | undefined {
  if (new TextEncoder().encode(query).byteLength > ANSWER_OPERATION_INPUT_MAX_BYTES) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(query)
  } catch {
    return undefined
  }
  if (!isRecord(parsed)
    || Object.keys(parsed).some((key) => key !== 'operationRef' && key !== 'input' && key !== 'candidateSetDigest')
    || !isPublicOperationRef(parsed.operationRef)
    || typeof parsed.candidateSetDigest !== 'string'
    || !isCanonicalDigest(parsed.candidateSetDigest)
    || !isRecord(parsed.input)) {
    return undefined
  }
  const input = jsonValueSchema.safeParse(parsed.input)
  return input.success && isJsonObject(input.data)
    ? { operationRef: parsed.operationRef, input: input.data, candidateSetDigest: parsed.candidateSetDigest }
    : undefined
}

function normalizedSelectionText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9:]+/g, ' ').trim()
}

function selectionOrdinal(value: string): number | undefined {
  const normalized = value.toLowerCase().trim()
  const word = { first: 1, second: 2, third: 3, fourth: 4 }[normalized as 'first' | 'second' | 'third' | 'fourth']
  if (word !== undefined) return word
  const match = normalized.match(/^(?:(?:option|choice|number|candidate)\s*)?#?(\d+)$/)
  if (match === null) return undefined
  const ordinal = Number(match[1])
  return Number.isSafeInteger(ordinal) && ordinal > 0 ? ordinal : undefined
}

function candidateAliases(candidate: AnswerOperationCandidate): readonly string[] {
  return [
    candidate.operationRef,
    candidate.operationId,
    candidate.business.name,
    candidate.business.slug,
    candidate.offering.label,
  ].filter((value) => value.trim().length > 0)
}

function selectedCandidateForQuery(
  query: string,
  candidates: readonly AnswerOperationCandidate[],
): AnswerOperationCandidate | undefined {
  const parsedSelection = parseAnswerOperationSelectionInput(query)
  const trimmed = parsedSelection?.operationRef ?? query.trim()
  const normalized = normalizedSelectionText(trimmed)
  const selectionText = normalized.replace(/^(?:choose|pick|select|use)\s+(?:the\s+)?/, '')
  const ordinal = parsedSelection === undefined
    ? selectionOrdinal(query) ?? selectionOrdinal(selectionText)
    : undefined
  if (ordinal !== undefined) return candidates[ordinal - 1]
  const exactRef = candidates.find((candidate) => candidate.operationRef === trimmed)
  if (exactRef !== undefined) return exactRef
  if (selectionText.startsWith('operation:v1:')) return undefined
  const exactAliases = candidates.filter((candidate) =>
    candidateAliases(candidate)
      .filter((alias) => alias !== candidate.operationRef)
      .some((alias) => normalizedSelectionText(alias) === selectionText))
  if (exactAliases.length === 1) return exactAliases[0]
  const queryTokens = meaningfulDomainTokens([selectionText])
  if (queryTokens.size === 0) return undefined
  const tokenMatches = candidates.filter((candidate) => {
    const aliases = candidateAliases(candidate).filter((alias) => alias !== candidate.operationRef)
    const aliasTokens = meaningfulDomainTokens(aliases)
    return [...queryTokens].every((token) => aliasTokens.has(token))
  })
  return tokenMatches.length === 1 ? tokenMatches[0] : undefined
}

function selectionLooksIntentional(
  query: string,
  candidates: readonly AnswerOperationCandidate[],
): boolean {
  const parsedSelection = parseAnswerOperationSelectionInput(query)
  const trimmed = parsedSelection?.operationRef ?? query.trim()
  const normalized = normalizedSelectionText(trimmed)
  const selectionText = normalized.replace(/^(?:choose|pick|select|use)\s+(?:the\s+)?/, '')
  return parsedSelection !== undefined
    || query.trimStart().startsWith('{"operationRef"')
    || isPublicOperationRef(trimmed)
    || candidates.some((candidate) =>
      candidate.operationRef === trimmed || candidate.operationRef === selectionText)
    || selectionOrdinal(trimmed) !== undefined
    || /\b(?:choose|pick|select|use|option|candidate)\b/i.test(trimmed)
}

function needsClarificationForCandidates(
  candidates: readonly AnswerOperationCandidate[],
  status?: KeylessDataAskClarificationStatus,
  invalidOperationRef?: string,
): KeylessDataAskResolution {
  const uniqueCandidates = candidates
    .filter((candidate, index, all) =>
      all.findIndex((other) => other.operationRef === candidate.operationRef) === index)
    .slice(0, MAX_CANDIDATES)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }))
  const descriptors = uniqueCandidates.flatMap((candidate) => descriptorFromCandidate(candidate) ?? [])
  const operationCandidates = uniqueCandidates.length === 0 ? {} : { operationCandidates: uniqueCandidates }
  return {
    kind: 'needs_clarification',
    descriptors,
    candidates: descriptors,
    ...operationCandidates,
    decision: {
      kind: 'choose_operation',
      candidates: uniqueCandidates,
      candidateSetDigest: answerOperationCandidateSetDigest(uniqueCandidates),
      ...(status === undefined ? {} : { status }),
      ...(invalidOperationRef === undefined ? {} : { invalidOperationRef }),
    },
  }
}
export function keylessDataAskFromCandidates(
  candidates: readonly AnswerOperationCandidate[],
  status?: KeylessDataAskClarificationStatus,
): KeylessDataAskResolution {
  return needsClarificationForCandidates(candidates, status)
}

/**
 * Resolves an ordinal, exact ref, or unique provider/operation name only
 * against the candidate set frozen in the prior answer. A recognized but
 * invalid selection re-clarifies that same set; it never starts fresh search.
 */
export async function resolveKeylessDataAskSelection(
  query: string,
  previousCandidates: readonly AnswerOperationCandidate[],
  source: KeylessExecutableSourcePort,
): Promise<KeylessDataAskResolution | undefined> {
  if (previousCandidates.length === 0) return undefined
  const uniqueCandidates = previousCandidates
    .filter((candidate, index, all) =>
      all.findIndex((other) => other.operationRef === candidate.operationRef) === index)
    .slice(0, MAX_CANDIDATES)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }))
  if (!selectionLooksIntentional(query, uniqueCandidates)) return undefined
  const parsedSelection = parseAnswerOperationSelectionInput(query)
  if (
    parsedSelection !== undefined
    && parsedSelection.candidateSetDigest !== answerOperationCandidateSetDigest(uniqueCandidates)
  ) {
    return needsClarificationForCandidates(uniqueCandidates, 'changed')
  }
  const selectedCandidate = selectedCandidateForQuery(query, uniqueCandidates)
  if (selectedCandidate === undefined) {
    return needsClarificationForCandidates(uniqueCandidates)
  }
  let executable: OperationExecutableDescriptor | null
  try {
    executable = await source.read(selectedCandidate.operationRef)
  } catch {
    executable = null
  }
  const invalidCandidateSet = uniqueCandidates.filter(
    (candidate) => candidate.operationRef !== selectedCandidate.operationRef,
  )
  if (executable === null
    || executable.operationRef !== selectedCandidate.operationRef
    || !isAnonymousKeylessOperationEligible({
      authority: executable.authority,
      adapterId: executable.adapterId,
      method: executable.method,
      sourceKind: executable.provenance.sourceKind,
      price: executable.price,
      effects: executable.effects,
    })) {
    return needsClarificationForCandidates(
      invalidCandidateSet,
      'unavailable',
      selectedCandidate.operationRef,
    )
  }
  if (findStrictToolSchemaViolation(executable.inputSchema) !== null) {
    return needsClarificationForCandidates(
      invalidCandidateSet,
      'changed',
      selectedCandidate.operationRef,
    )
  }
  let publicOperation: PublicOperationDescriptor | undefined
  if (source.readPublic !== undefined) {
    try {
      publicOperation = (await source.readPublic(selectedCandidate.operationRef)) ?? undefined
    } catch {
      return needsClarificationForCandidates(
        invalidCandidateSet,
        'unavailable',
        selectedCandidate.operationRef,
      )
    }
    if (publicOperation === undefined) {
      return needsClarificationForCandidates(
        invalidCandidateSet,
        'unavailable',
        selectedCandidate.operationRef,
      )
    }
    if (publicOperation.availability.posture === 'unavailable') {
      return needsClarificationForCandidates(
        invalidCandidateSet,
        'unavailable',
        selectedCandidate.operationRef,
      )
    }
  }
  const currentDescriptor: KeylessExecutableToolDescriptor = {
    operationRef: executable.operationRef,
    capabilityId: executable.capabilityId,
    name: executable.name,
    summary: executable.name,
    searchTerms: [executable.capabilityId, executable.name],
    inputSchema: executable.inputSchema,
    executionBindingDigest: operationExecutionBindingDigest(executable),
  }
  const selectedIndex = uniqueCandidates.findIndex((candidate) =>
    candidate.operationRef === selectedCandidate.operationRef)
  const currentCandidate = candidateFromDescriptor(
    currentDescriptor,
    selectedIndex + 1,
    query,
    publicOperation,
  )
  if (currentCandidate.inputSchemaDigest !== selectedCandidate.inputSchemaDigest
    || (publicOperation !== undefined && currentCandidate.descriptorDigest !== selectedCandidate.descriptorDigest)
    || (selectedCandidate.executionBindingDigest !== undefined
      && currentCandidate.executionBindingDigest !== selectedCandidate.executionBindingDigest)) {
    return needsClarificationForCandidates(
      invalidCandidateSet,
      'changed',
      selectedCandidate.operationRef,
    )
  }
  const reboundCandidate = publicOperation === undefined
    ? { ...currentCandidate, descriptorDigest: selectedCandidate.descriptorDigest }
    : currentCandidate
  const reboundCandidates = uniqueCandidates.map((candidate, index) =>
    candidate.operationRef === selectedCandidate.operationRef
      ? { ...reboundCandidate, rank: index + 1, matchReason: candidate.matchReason }
      : { ...candidate, rank: index + 1 })
  const candidateDescriptors = reboundCandidates.flatMap((candidate) => descriptorFromCandidate(candidate) ?? [])
  return {
    kind: 'resolved',
    descriptors: [currentDescriptor],
    candidates: candidateDescriptors,
    selected: currentDescriptor,
    operationCandidates: reboundCandidates,
    selectedCandidate: reboundCandidate,
  }
}

const GENERIC_FOLLOW_UP_TOKENS: Record<string, true> = {
  about: true,
  again: true,
  also: true,
  another: true,
  earlier: true,
  follow: true,
  more: true,
  next: true,
  now: true,
  previous: true,
  same: true,
  then: true,
  tomorrow: true,
  up: true,
}

function isGenericFollowUpQuery(query: string): boolean {
  const normalized = query.toLowerCase().trim()
  if (!/\b(?:again|also|what about|how about|same|next|tomorrow|follow[- ]?up)\b/.test(normalized)) {
    return false
  }
  const tokens = meaningfulDomainTokens([normalized])
  return [...tokens].every((token) => GENERIC_FOLLOW_UP_TOKENS[token] === true)
}

export function filterKeylessDataAskCandidates(
  query: string,
  resolution: KeylessDataAskResolution | undefined,
): KeylessDataAskResolution | undefined {
  if (resolution === undefined || resolution.kind === 'unavailable') return resolution
  const richCandidates = resolution.operationCandidates ?? []
  if (resolution.kind === 'needs_clarification') {
    return resolveCandidateOutcome(
      query,
      resolution.descriptors,
      resolution.candidates,
      richCandidates,
    )
  }
  const selected = resolution.selected
  if (selected !== undefined && query.trim() === selected.operationRef) {
    return resolveCandidateOutcome(
      query,
      resolution.descriptors,
      resolution.candidates,
      richCandidates,
      selected.operationRef,
    )
  }
  const selectedMatchesQuery = selected !== undefined
    && (isKeylessCapabilityCompatible(query, selected)
      || [selected.name, selected.capabilityId, selected.operationRef, ...selected.searchTerms]
        .some((value) => query.toLowerCase().includes(value.trim().toLowerCase())))
  if (selected !== undefined && resolution.candidates.length === 1
    && resolution.candidates[0]?.operationRef === selected.operationRef
    && (selectedMatchesQuery || isGenericFollowUpQuery(query))) {
    return resolveCandidateOutcome(
      query,
      resolution.descriptors,
      [selected],
      richCandidates,
      selected.operationRef,
    )
  }
  if (resolution.candidates.length > 1) {
    return resolveCandidateOutcome(
      query,
      resolution.descriptors,
      resolution.candidates,
      richCandidates,
    )
  }
  const candidates = resolution.candidates.filter((descriptor) =>
    isKeylessCapabilityCompatible(query, descriptor))
  return resolveCandidateOutcome(
    query,
    resolution.descriptors,
    candidates,
    richCandidates,
  )
}

async function attachSelectedExecutionBinding(
  resolution: KeylessDataAskResolution,
  source: KeylessExecutableSourcePort,
): Promise<KeylessDataAskResolution> {
  if (resolution.kind !== 'resolved'
    || resolution.selected === undefined
    || resolution.selected.executionBindingDigest !== undefined) {
    return resolution
  }
  let executable: OperationExecutableDescriptor | null
  try {
    executable = await source.read(resolution.selected.operationRef)
  } catch {
    return resolution
  }
  if (executable === null || executable.operationRef !== resolution.selected.operationRef) {
    return resolution
  }
  const executionBindingDigest = operationExecutionBindingDigest(executable)
  const selected = { ...resolution.selected, executionBindingDigest }
  const descriptors = resolution.descriptors.map((descriptor) =>
    descriptor.operationRef === selected.operationRef
      ? { ...descriptor, executionBindingDigest }
      : descriptor)
  const candidates = resolution.candidates.map((descriptor) =>
    descriptor.operationRef === selected.operationRef
      ? { ...descriptor, executionBindingDigest }
      : descriptor)
  const operationCandidates = resolution.operationCandidates?.map((candidate) =>
    candidate.operationRef === selected.operationRef
      ? { ...candidate, executionBindingDigest }
      : candidate)
  return {
    ...resolution,
    descriptors,
    candidates,
    selected,
    ...(resolution.selectedCandidate === undefined
      ? {}
      : { selectedCandidate: { ...resolution.selectedCandidate, executionBindingDigest } }),
    ...(operationCandidates === undefined
      ? {}
      : {
          operationCandidates,
          candidateSetDigest: answerOperationCandidateSetDigest(operationCandidates),
        }),
  }
}

const MAX_CANDIDATES = ANSWER_OPERATION_CANDIDATE_LIMIT


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
      .map(plainDescriptor)
      .sort((left, right) => left.operationRef.localeCompare(right.operationRef))
  } catch {
    return { kind: 'unavailable', reason: 'source_unavailable' }
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
  const richCandidates: AnswerOperationCandidate[] = []
  const appendCandidate = async (descriptor: KeylessExecutableToolDescriptor): Promise<void> => {
    if (candidates.length >= MAX_CANDIDATES
      || candidateRefs.has(descriptor.operationRef)
      || findStrictToolSchemaViolation(descriptor.inputSchema) !== null
      || !isKeylessCapabilityCompatible(query, descriptor)) {
      return
    }
    candidateRefs.add(descriptor.operationRef)
    let publicOperation: PublicOperationDescriptor | undefined
    if (source.readPublic !== undefined) {
      try {
        publicOperation = (await source.readPublic(descriptor.operationRef)) ?? undefined
      } catch {
        publicOperation = undefined
      }
    }
    candidates.push(descriptor)
    richCandidates.push(candidateFromDescriptor(descriptor, candidates.length, query, publicOperation))
  }
  for (const operationRef of rankedRefs) {
    const descriptor = descriptorByRef.get(operationRef)
    if (descriptor !== undefined) await appendCandidate(descriptor)
  }
  // Registry search can rank a keyed twin while omitting the equivalent
  // executable keyless publication. Fall back only when none of its refs bind.
  if (candidates.length === 0) {
    const scored = descriptors.map((descriptor) => ({
      descriptor,
      score: keylessCapabilityMatchScore(query, descriptor),
    }))
    const bestScore = Math.max(0, ...scored.map(({ score }) => score))
    for (const { descriptor, score } of scored) {
      if (score === bestScore) await appendCandidate(descriptor)
    }
  }

  return attachSelectedExecutionBinding(
    resolveCandidateOutcome(query, descriptors, candidates, richCandidates),
    source,
  )
}
