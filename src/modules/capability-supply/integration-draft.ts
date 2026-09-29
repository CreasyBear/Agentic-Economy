import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import { degradeBackend } from '@/lib/observability/degrade-backend'

import { inspectSource } from './internal/publication-importer-types'
import { publicationMaterialContainsCredential } from './internal/publication/source'
import type { SupplySourceInput } from './source-preview'

const SHA256_REF = /^sha256:[0-9a-f]{64}$/u
const SOURCE_REVISION_PREFIX = { x402: 'x402:' } as const

/** Private owner-entered draft material. Publication attestations are intentionally excluded. */
export type SupplyIntegrationDraftTerms = Readonly<{
  name: string
  description: string
  category: string
  serviceArea: string
  availability: string
  pricingKind: 'free' | 'fixed_aud' | 'source_x402'
  price: string
  externalEffect: boolean
  dataRelease: boolean
  financialExposure: boolean
  dataClassification: 'public' | 'personal' | 'sensitive'
}>

export type SupplyIntegrationDraft = Readonly<{
  sourceKind: 'openapi' | 'mcp' | 'agent_plugin' | 'x402'
  sourceDescriptorJson: string
  sourceDigest: string
  sourceRevision: string
  candidateRef: string
  sourceSelectorJson: string
  connectionRef?: string
  validationInputJson?: string
  terms?: SupplyIntegrationDraftTerms
  updatedAt: number
}>

export type NormalizeSupplyIntegrationDraftInput = Readonly<{
  sourceKind: 'openapi' | 'mcp' | 'agent_plugin' | 'x402'
  sourceDescriptorJson: string
  sourceDigest: string
  sourceRevision: string
  candidateRef: string
  sourceSelectorJson: string
  connectionRef?: string | undefined
  validationInputJson?: string | undefined
  terms?: SupplyIntegrationDraftTerms | undefined
  updatedAt: number
}>

export type SupplyIntegrationDraftNormalization =
  | Readonly<{
      kind: 'valid'
      draft: SupplyIntegrationDraft
      source: SupplySourceInput
      sourceSelector: Readonly<Record<string, unknown>>
      targetUrl: string
      method?: string | undefined
    }>
  | Readonly<{ kind: 'refused'; reason: 'draft_invalid' | 'source_contains_credential' | 'candidate_changed' }>

export function normalizeSupplyIntegrationDraft(
  input: NormalizeSupplyIntegrationDraftInput,
): SupplyIntegrationDraftNormalization {
  if (input.sourceKind !== 'x402') return { kind: 'refused', reason: 'draft_invalid' }
  if (!SHA256_REF.test(input.sourceDigest) || !SHA256_REF.test(input.candidateRef)) {
    return { kind: 'refused', reason: 'draft_invalid' }
  }
  if (!input.sourceRevision.startsWith(SOURCE_REVISION_PREFIX.x402)) {
    return { kind: 'refused', reason: 'draft_invalid' }
  }
  if (!Number.isSafeInteger(input.updatedAt) || input.updatedAt <= 0) {
    return { kind: 'refused', reason: 'draft_invalid' }
  }
  if (input.connectionRef !== undefined && !boundedText(input.connectionRef, 200)) {
    return { kind: 'refused', reason: 'draft_invalid' }
  }

  let sourceValue: unknown
  let selectorValue: unknown
  let validationInput: unknown
  try {
    sourceValue = JSON.parse(input.sourceDescriptorJson)
    selectorValue = JSON.parse(input.sourceSelectorJson)
    validationInput = input.validationInputJson === undefined
      ? undefined
      : JSON.parse(input.validationInputJson)
  } catch (cause) {
    return degradeBackend(
      cause,
      { kind: 'refused', reason: 'draft_invalid' } as const,
      { site: 'normalizeSupplyIntegrationDraft', reason: 'invalid_response' },
    )
  }
  const source = normalizeSupplySourceDescriptor(sourceValue)
  if (source === undefined || source.kind !== input.sourceKind || !isRecord(selectorValue)) {
    return { kind: 'refused', reason: 'draft_invalid' }
  }
  for (const value of [source, selectorValue, validationInput]) {
    if (value === undefined) continue
    if (inspectSource(value).kind !== 'accepted') return { kind: 'refused', reason: 'draft_invalid' }
    if (publicationMaterialContainsCredential(value)) {
      return { kind: 'refused', reason: 'source_contains_credential' }
    }
  }
  const normalizedSourceJson = stableStringify(source as StableHashValue)
  const normalizedSelectorJson = stableStringify(selectorValue as StableHashValue)
  const normalizedValidationJson = validationInput === undefined
    ? undefined
    : stableStringify(validationInput as StableHashValue)
  if (
    input.sourceDescriptorJson !== normalizedSourceJson
    || input.sourceSelectorJson !== normalizedSelectorJson
    || (input.validationInputJson !== undefined && input.validationInputJson !== normalizedValidationJson)
  ) {
    return { kind: 'refused', reason: 'draft_invalid' }
  }
  if (canonicalDigest({ sourceDigest: input.sourceDigest, selector: selectorValue } as StableHashValue) !== input.candidateRef) {
    return { kind: 'refused', reason: 'candidate_changed' }
  }
  const target = sourceTarget(source, selectorValue)
  if (target === undefined) return { kind: 'refused', reason: 'draft_invalid' }
  return {
    kind: 'valid',
    draft: {
      sourceKind: input.sourceKind,
      sourceDescriptorJson: normalizedSourceJson,
      sourceDigest: input.sourceDigest,
      sourceRevision: input.sourceRevision,
      candidateRef: input.candidateRef,
      sourceSelectorJson: normalizedSelectorJson,
      ...(input.connectionRef === undefined ? {} : { connectionRef: input.connectionRef }),
      ...(input.terms === undefined ? {} : { terms: input.terms }),
      ...(normalizedValidationJson === undefined ? {} : { validationInputJson: normalizedValidationJson }),
      updatedAt: input.updatedAt,
    },
    source,
    sourceSelector: selectorValue,
    targetUrl: target.url,
    ...(target.method === undefined ? {} : { method: target.method }),
  }
}

export function normalizeSupplySourceDescriptor(value: unknown): SupplySourceInput | undefined {
  if (!isRecord(value) || value.kind !== 'x402') return undefined
  if (value.environment !== undefined && value.environment !== 'sandbox' && value.environment !== 'production') return undefined
  if (!exactKeys(value, ['kind', 'resourceUrl', 'method', 'environment'], true)) return undefined
  if (!validUrl(value.resourceUrl)) return undefined
  if (value.method !== undefined && value.method !== 'GET' && value.method !== 'POST') return undefined
  return {
    kind: 'x402',
    resourceUrl: value.resourceUrl,
    ...(value.method === 'GET' || value.method === 'POST' ? { method: value.method } : {}),
    ...(value.environment === 'sandbox' || value.environment === 'production' ? { environment: value.environment } : {}),
  }
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  optional = false,
): boolean {
  const actual = Object.keys(value)
  if (actual.some((key) => !allowed.includes(key))) return false
  return optional || allowed.every((key) => Object.hasOwn(value, key))
}

function validUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2_048) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === ''
  } catch (cause) {
    return degradeBackend(cause, false, { site: 'validUrl', reason: 'invalid_response' })
  }
}

export function supplyIntegrationDraftRefs(
  businessId: string,
  candidateRef: string,
): Readonly<{ offeringRef: string; accessPathRef: string }> {
  const identity = canonicalDigest({ version: 'supply-integration-draft:v1', businessId, candidateRef })
  const suffix = identity.slice('sha256:'.length)
  return {
    offeringRef: `offering:supply-draft:${suffix}`,
    accessPathRef: `access:supply-draft:${suffix}`,
  }
}

function sourceTarget(
  source: SupplySourceInput,
  selector: Readonly<Record<string, unknown>>,
): Readonly<{ url: string; method?: string }> | undefined {
  const value = typeof selector.resourceUrl === 'string' ? selector.resourceUrl : source.resourceUrl
  let url: string
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') return undefined
    url = parsed.toString()
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'sourceTarget', reason: 'invalid_response' })
  }
  const method = typeof selector.method === 'string' ? selector.method.toUpperCase() : undefined
  return { url, ...(method === undefined ? {} : { method }) }
}

function boundedText(value: string, maximum: number): boolean {
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= maximum && trimmed === value
}
