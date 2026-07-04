import type { BusinessEndpointCapabilityDescriptor } from '@/modules/capabilities/public'
import { safePublicText } from '@/modules/discovery/public'
import { evaluateSchemaFacet, type ContradictionFacetResult, type SchemaFacetResult } from './check-standard'

export type BusinessOriginManifestRetainedCapability = Readonly<{
  kind: 'business_endpoint'
  callable: false
  paymentRequired: false
}>

export type BusinessOriginManifestRetained = Readonly<{
  schemaRef: 'ae-ucp:v1'
  originUrl: string
  manifestUrl: string
  endpointUrl: string
  generatedAt: string
  sourceHash: string
  businessName: string
  category: string
  claimedLocation: string
  claimedServiceIdentity: string
  publicUrl: string
  ownerIdentifiers: readonly string[]
  description: string
  publicDisclosure: string
  capabilities: readonly BusinessOriginManifestRetainedCapability[]
}>

export type BusinessOriginManifestOwnerText = Pick<
  BusinessOriginManifestRetained,
  'businessName' | 'category' | 'claimedLocation' | 'claimedServiceIdentity' | 'description' | 'publicDisclosure'
>

export type ParseBusinessOriginManifestResult =
  | Readonly<{
      kind: 'parsed'
      descriptor: BusinessEndpointCapabilityDescriptor
      endpointUrl: string
      ownerText: BusinessOriginManifestOwnerText
      retainedManifest: BusinessOriginManifestRetained
      forbiddenClaims: readonly string[]
    }>
  | Readonly<{ kind: 'rejected'; reason: 'schema_invalid' }>
  | Readonly<{ kind: 'rejected'; reason: 'forbidden_claim'; forbiddenClaims: readonly string[] }>
  | Readonly<{ kind: 'rejected'; reason: 'off_origin_url'; field: 'originUrl' | 'manifestUrl' | 'endpointUrl'; url: string }>

export type BusinessOriginManifestAeHeldFacts = Readonly<{
  businessName: string
  category: string
  claimedLocation: string
  claimedServiceIdentity: string
  publicUrl: string
  originUrl: string
  ownerIdentifiers: readonly string[]
}>

export function parseBusinessOriginManifest(input: unknown, allowlistedOrigin: string): ParseBusinessOriginManifestResult {
  if (!isRecord(input)) {
    return { kind: 'rejected', reason: 'schema_invalid' }
  }

  const forbiddenClaims = findForbiddenClaims(input)
  if (forbiddenClaims.length > 0) {
    return { kind: 'rejected', reason: 'forbidden_claim', forbiddenClaims }
  }

  if (!hasStringFields(input, requiredStringFields) || !Array.isArray(input.ownerIdentifiers)) {
    return { kind: 'rejected', reason: 'schema_invalid' }
  }

  if (input.schemaRef !== 'ae-ucp:v1') {
    return { kind: 'rejected', reason: 'schema_invalid' }
  }

  if (!input.ownerIdentifiers.every((identifier): identifier is string => typeof identifier === 'string')) {
    return { kind: 'rejected', reason: 'schema_invalid' }
  }

  const capability = readBusinessEndpointCapability(input.capabilities)
  if (capability === undefined) {
    return { kind: 'rejected', reason: 'schema_invalid' }
  }

  const urlFields = [
    ['originUrl', input.originUrl],
    ['manifestUrl', input.manifestUrl],
    ['endpointUrl', input.endpointUrl],
  ] as const

  for (const [field, url] of urlFields) {
    if (!isSameOrigin(url, allowlistedOrigin)) {
      return { kind: 'rejected', reason: 'off_origin_url', field, url }
    }
  }

  const ownerText: BusinessOriginManifestOwnerText = {
    businessName: safePublicText(input.businessName),
    category: safePublicText(input.category),
    claimedLocation: safePublicText(input.claimedLocation),
    claimedServiceIdentity: safePublicText(input.claimedServiceIdentity),
    description: safePublicText(input.description),
    publicDisclosure: safePublicText(input.publicDisclosure),
  }

  const retainedManifest: BusinessOriginManifestRetained = {
    schemaRef: 'ae-ucp:v1',
    originUrl: input.originUrl,
    manifestUrl: input.manifestUrl,
    endpointUrl: input.endpointUrl,
    generatedAt: input.generatedAt,
    sourceHash: input.sourceHash,
    businessName: ownerText.businessName,
    category: ownerText.category,
    claimedLocation: ownerText.claimedLocation,
    claimedServiceIdentity: ownerText.claimedServiceIdentity,
    publicUrl: input.publicUrl,
    ownerIdentifiers: input.ownerIdentifiers,
    description: ownerText.description,
    publicDisclosure: ownerText.publicDisclosure,
    capabilities: [capability],
  }

  return {
    kind: 'parsed',
    descriptor: {
      kind: 'business_endpoint',
      originUrl: input.originUrl,
      manifestUrl: input.manifestUrl,
      schemaRef: 'ae-ucp:v1',
    },
    endpointUrl: input.endpointUrl,
    ownerText,
    retainedManifest,
    forbiddenClaims: [],
  }
}

export function evaluateBusinessOriginManifestSchema(result: ParseBusinessOriginManifestResult): SchemaFacetResult {
  if (result.kind === 'parsed') {
    return evaluateSchemaFacet({ schemaRef: result.descriptor.schemaRef, strictParse: true, forbiddenClaims: [], exhausted: false })
  }

  if (result.reason === 'forbidden_claim') {
    return evaluateSchemaFacet({ schemaRef: 'ae-ucp:v1', strictParse: true, forbiddenClaims: result.forbiddenClaims, exhausted: true })
  }

  return evaluateSchemaFacet({ schemaRef: 'ae-ucp:v1', strictParse: false, forbiddenClaims: [], exhausted: true })
}

export function evaluateBusinessOriginManifestContradictions(input: {
  manifest: BusinessOriginManifestRetained
  aeHeldFacts: BusinessOriginManifestAeHeldFacts
}): ContradictionFacetResult {
  const fields: string[] = []
  const { aeHeldFacts, manifest } = input

  if (manifest.businessName !== aeHeldFacts.businessName) fields.push('businessName')
  if (manifest.category !== aeHeldFacts.category) fields.push('category')
  if (manifest.claimedLocation !== aeHeldFacts.claimedLocation) fields.push('claimedLocation')
  if (manifest.claimedServiceIdentity !== aeHeldFacts.claimedServiceIdentity) fields.push('claimedServiceIdentity')
  if (manifest.publicUrl !== aeHeldFacts.publicUrl) fields.push('publicUrl')
  if (manifest.originUrl !== aeHeldFacts.originUrl) fields.push('originUrl')
  if (!sameStringSet(manifest.ownerIdentifiers, aeHeldFacts.ownerIdentifiers)) fields.push('ownerIdentifiers')

  if (fields.length === 0) {
    return { facet: 'contradiction', outcome: 'pass', code: 'not_contradicted' }
  }

  return { facet: 'contradiction', outcome: 'contradicted', code: 'ae_held_fact_conflict', fields }
}

const requiredStringFields = [
  'schemaRef',
  'originUrl',
  'manifestUrl',
  'endpointUrl',
  'generatedAt',
  'sourceHash',
  'businessName',
  'category',
  'claimedLocation',
  'claimedServiceIdentity',
  'publicUrl',
  'description',
  'publicDisclosure',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasStringFields<TField extends string>(value: Record<string, unknown>, fields: readonly TField[]): value is Record<TField, string> & Record<string, unknown> {
  return fields.every((field) => typeof value[field] === 'string')
}

function readBusinessEndpointCapability(value: unknown): BusinessOriginManifestRetainedCapability | undefined {
  if (!Array.isArray(value)) return undefined

  const capability = value.find((candidate): candidate is Record<string, unknown> => isRecord(candidate) && candidate.kind === 'business_endpoint')
  if (capability === undefined) return undefined
  if (capability.callable !== false || capability.paymentRequired !== false) return undefined

  return { kind: 'business_endpoint', callable: false, paymentRequired: false }
}

const forbiddenClaimFields = ['verified', 'price', 'checked', 'authority', 'authorityUrl', 'endpoint', 'actionUrl'] as const
type ForbiddenClaimField = (typeof forbiddenClaimFields)[number]

function findForbiddenClaims(input: Record<string, unknown>): readonly string[] {
  const claims: string[] = []

  if (input.callable === true || capabilityBooleanClaim(input.capabilities, 'callable')) claims.push('callable')
  if (input.paymentRequired === true || capabilityBooleanClaim(input.capabilities, 'paymentRequired')) claims.push('paymentRequired')
  for (const field of forbiddenClaimFields) {
    if (field in input || capabilityKeyClaim(input.capabilities, field)) claims.push(field)
  }

  return claims
}

function capabilityBooleanClaim(value: unknown, field: 'callable' | 'paymentRequired'): boolean {
  return Array.isArray(value) && value.some((candidate) => isRecord(candidate) && candidate[field] === true)
}

function capabilityKeyClaim(value: unknown, field: ForbiddenClaimField): boolean {
  return Array.isArray(value) && value.some((candidate) => isRecord(candidate) && field in candidate)
}

function isSameOrigin(url: string, allowlistedOrigin: string): boolean {
  try {
    return new URL(url).origin === new URL(allowlistedOrigin).origin
  } catch {
    return false
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false

  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((value, index) => value === sortedRight[index])
}
