import { APICallError, generateText, RetryError } from 'ai'
import { z } from 'zod'

import {
  openRouterModel,
  type OpenRouterGatewayConfig,
} from '@/modules/model-gateway/public'
import { stableUnique } from '@/modules/common/stable-unique'

import {
  StorefrontEnrichmentSourceLabel,
  StorefrontImportConfirmationState,
  normalizeStorefrontSlug,
  type StorefrontImportDraft,
  type StorefrontImportedFact,
  type StorefrontImportedFactField,
} from './import-draft'


import { emptyPublicOwnerClaimInput } from '@/modules/catalog/claim-draft'
import type { PublicOwnerClaimFlowInput } from '@/modules/catalog/public'

/**
 * Search-grounded draft of a business profile.
 *
 * The owner types a business name; AE runs exactly one web-search-grounded
 * model call and drafts the public facts it can ground in a search result.
 * Every drafted fact reuses the import draft contract, so it stays
 * `draft_unconfirmed` until the owner reviews and submits it. This module
 * never publishes, never fetches the business website, and never invents a
 * phone number, hours, or a credential.
 */

export type BusinessEnrichmentInput = {
  businessName: string
  suburb?: string | undefined
}

export type BusinessEnrichmentResult =
  | { kind: 'draft'; draft: StorefrontImportDraft }
  | { kind: 'unavailable'; reason: 'llm_not_configured' }
  | {
      kind: 'error'
      code: 'enrichment_failed' | 'enrichment_no_facts'
      retryable: boolean
      reason: string
    }

export type WebDiscoveryInput = {
  query: string
  location?: string | undefined
}

export type WebDiscoveryClaim = {
  businessName: string
  suburb: string
  phone?: string
  websiteUrl?: string
  serviceSummary?: string
  sourceUrl: string
}

export type WebDiscoveryResult =
  | { kind: 'found'; query: string; claims: readonly WebDiscoveryClaim[] }
  | { kind: 'none'; query: string; reason: 'no_matches' }
  | { kind: 'unavailable'; reason: 'llm_not_configured' }
  | {
      kind: 'error'
      code: 'discovery_failed'
      retryable: boolean
      reason: string
    }

export type BusinessEnrichmentFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type BusinessEnrichmentOptions = {
  fetch?: BusinessEnrichmentFetch
  timeoutMs?: number
}

const MAX_ENRICHMENT_REQUEST_BYTES = 1_000_000
const MAX_ENRICHMENT_ATTEMPTS = 2
const DEFAULT_ENRICHMENT_TIMEOUT_MS = 20_000
const WEB_SEARCH_MAX_RESULTS = 5

const ENRICHMENT_SYSTEM_INSTRUCTION = [
  'You draft public profile facts for Australian local businesses using web search results.',
  'Return a single JSON object with any of these keys: businessName, category, suburb, stateTerritory, websiteUrl, serviceName, serviceCategory, serviceSummary, serviceArea, hoursOrUnknown.',
  'Omit any key you cannot ground in a search result. Never invent phone numbers, hours, prices, or credentials.',
  'Values are short plain text. serviceSummary is one sentence.',
].join(' ')

const DISCOVERY_SYSTEM_INSTRUCTION = [
  'Find real Australian local businesses using web search results and return only businesses supported by those results.',
  'Return one JSON object with a businesses array. Each item must include businessName, suburb, and sourceUrl; sourceUrl must copy the exact supporting web-search citation URL for that business. It may also include phone, websiteUrl, and serviceSummary.',
  'Include a claim, phone number, or website only when it appears in that same cited search evidence. Never invent details, availability, prices, credentials, or AE listing status.',
  'Use the business suburb exactly as grounded by its cited result. Return at most five distinct businesses.',
  'If no suitable business exists in the requested place, widen to the nearest real Australian specialists and keep their actual suburb; do not imply they are local.',
].join(' ')

const discoveryFieldSchema = z.object({
  businesses: z.array(z.object({
    businessName: z.string().optional(),
    suburb: z.string().optional(),
    phone: z.string().optional(),
    websiteUrl: z.string().optional(),
    serviceSummary: z.string().optional(),
    sourceUrl: z.string().optional(),
  })).max(WEB_SEARCH_MAX_RESULTS),
})

type DiscoveryFields = z.infer<typeof discoveryFieldSchema>

const enrichmentFieldSchema = z.object({
  businessName: z.string().optional(),
  category: z.string().optional(),
  suburb: z.string().optional(),
  stateTerritory: z.string().optional(),
  websiteUrl: z.string().optional(),
  serviceName: z.string().optional(),
  serviceCategory: z.string().optional(),
  serviceSummary: z.string().optional(),
  serviceArea: z.string().optional(),
  hoursOrUnknown: z.string().optional(),
})

type EnrichmentFields = z.infer<typeof enrichmentFieldSchema>

const draftedFieldLabels: readonly {
  key: keyof EnrichmentFields
  field: StorefrontImportedFactField
  label: string
}[] = [
  { key: 'businessName', field: 'businessName', label: 'Business name' },
  { key: 'category', field: 'category', label: 'Business category' },
  { key: 'suburb', field: 'suburb', label: 'Suburb' },
  { key: 'stateTerritory', field: 'stateTerritory', label: 'State or territory' },
  { key: 'websiteUrl', field: 'websiteUrl', label: 'Website URL' },
  { key: 'serviceName', field: 'serviceName', label: 'Service name' },
  { key: 'serviceCategory', field: 'serviceCategory', label: 'Service category' },
  { key: 'serviceSummary', field: 'serviceSummary', label: 'Service summary' },
  { key: 'serviceArea', field: 'serviceArea', label: 'Service area' },
  { key: 'hoursOrUnknown', field: 'hoursOrUnknown', label: 'Hours' },
]


export async function enrichBusinessFromWebSearch(
  input: BusinessEnrichmentInput,
  config: OpenRouterGatewayConfig | undefined,
  options: BusinessEnrichmentOptions = {},
): Promise<BusinessEnrichmentResult> {
  if (config?.apiKey === undefined || config.apiKey.trim().length === 0 || config.model.trim().length === 0) {
    return { kind: 'unavailable', reason: 'llm_not_configured' }
  }

  const businessName = input.businessName.trim()
  const suburb = input.suburb?.trim()
  if (businessName.length === 0) {
    return {
      kind: 'error',
      code: 'enrichment_no_facts',
      retryable: false,
      reason: 'Enter the business name before gathering public details.',
    }
  }

  const prompt = `Draft public profile facts for the Australian local business named "${businessName}" in ${suburb === undefined || suburb.length === 0 ? 'Australia' : suburb}.`

  if (new TextEncoder().encode(ENRICHMENT_SYSTEM_INSTRUCTION + prompt).byteLength > MAX_ENRICHMENT_REQUEST_BYTES) {
    return enrichmentFailed('The enrichment request was too large to send.')
  }

  const completion = await requestCompletion(
    { system: ENRICHMENT_SYSTEM_INSTRUCTION, prompt },
    config,
    options,
    enrichmentFailed,
  )
  if (completion.kind !== 'ok') {
    return completion.result
  }

  const fields = parseEnrichmentFields(completion.content)
  if (fields === undefined) {
    return enrichmentFailed('The gathered details could not be read. Try again.')
  }

  return buildEnrichmentDraft(fields, completion.citations, businessName)
}
export async function discoverBusinessesFromWebSearch(
  input: WebDiscoveryInput,
  config: OpenRouterGatewayConfig | undefined,
  options: BusinessEnrichmentOptions = {},
): Promise<WebDiscoveryResult> {
  if (config?.apiKey === undefined || config.apiKey.trim().length === 0 || config.model.trim().length === 0) {
    return { kind: 'unavailable', reason: 'llm_not_configured' }
  }

  const query = input.query.trim()
  if (query.length === 0) {
    return { kind: 'none', query, reason: 'no_matches' }
  }

  const location = input.location?.trim()
  const prompt = `Find real Australian businesses for "${query}"${location === undefined || location.length === 0 ? '' : ` near ${location}`}.`

  if (new TextEncoder().encode(DISCOVERY_SYSTEM_INSTRUCTION + prompt).byteLength > MAX_ENRICHMENT_REQUEST_BYTES) {
    return discoveryFailed('The discovery request was too large to send.')
  }

  const completion = await requestCompletion(
    { system: DISCOVERY_SYSTEM_INSTRUCTION, prompt },
    config,
    options,
    discoveryFailed,
  )
  if (completion.kind !== 'ok') {
    return completion.result
  }

  const fields = parseDiscoveryFields(completion.content)
  if (fields === undefined || fields.businesses.length === 0 || completion.citations.length === 0) {
    return { kind: 'none', query, reason: 'no_matches' }
  }

  const claims = fields.businesses.flatMap((business) => {
    const businessName = business.businessName?.trim()
    const suburb = business.suburb?.trim()
    const sourceUrl = business.sourceUrl?.trim()
    if (businessName === undefined || businessName.length === 0 || suburb === undefined || suburb.length === 0
      || sourceUrl === undefined || !completion.citations.includes(sourceUrl)) {
      return []
    }
    return [{
      businessName,
      suburb,
      sourceUrl,
      ...(business.phone === undefined || business.phone.trim().length === 0 ? {} : { phone: business.phone.trim() }),
      ...(business.websiteUrl === undefined || business.websiteUrl.trim().length === 0 ? {} : { websiteUrl: business.websiteUrl.trim() }),
      ...(business.serviceSummary === undefined || business.serviceSummary.trim().length === 0 ? {} : { serviceSummary: business.serviceSummary.trim() }),
    }]
  })

  return claims.length === 0
    ? { kind: 'none', query, reason: 'no_matches' }
    : { kind: 'found', query, claims }
}

type CompletionOutcome<Result extends BusinessEnrichmentResult | WebDiscoveryResult> =
  | { kind: 'ok'; content: string; citations: readonly string[] }
  | { kind: 'failed'; result: Result }

async function requestCompletion<Result extends BusinessEnrichmentResult | WebDiscoveryResult>(
  request: Readonly<{ system: string; prompt: string }>,
  config: OpenRouterGatewayConfig,
  options: BusinessEnrichmentOptions,
  failure: (reason: string) => Result,
): Promise<CompletionOutcome<Result>> {
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_ENRICHMENT_TIMEOUT_MS)
  try {
    const result = await generateText({
      model: openRouterModel(config, config.model, {
        jsonObjectResponse: true,
        webSearchMaxResults: WEB_SEARCH_MAX_RESULTS,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      }),
      // One retry, so a transient provider status still gets two attempts.
      maxRetries: MAX_ENRICHMENT_ATTEMPTS - 1,
      temperature: 0,
      instructions: request.system,
      prompt: request.prompt,
      abortSignal: timeoutSignal,
    })
    if (result.text.length === 0) {
      return { kind: 'failed', result: failure('The details service returned no content.') }
    }
    // OpenRouter's web plugin returns its citations as URL sources; a claim is
    // only admissible when one of them backs it.
    const citations = stableUnique(result.sources.flatMap((source) => {
      if (source.sourceType !== 'url' || source.url.trim().length === 0) return []
      return [source.url]
    }))
    return { kind: 'ok', content: result.text, citations }
  } catch (error) {
    return { kind: 'failed', result: failure(enrichmentFailureReason(error, timeoutSignal)) }
  }
}

function enrichmentFailureReason(error: unknown, timeoutSignal: AbortSignal): string {
  if (timeoutSignal.aborted
    || (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))) {
    return 'The details service did not respond. Try again.'
  }
  const providerError = APICallError.isInstance(error)
    ? error
    : RetryError.isInstance(error) && APICallError.isInstance(error.lastError)
      ? error.lastError
      : undefined
  if (providerError === undefined) {
    return 'The details service was unavailable.'
  }
  return providerError.statusCode === undefined || providerError.statusCode === 200
    ? 'The details service returned an unreadable response.'
    : `The details service refused the request (${providerError.statusCode}).`
}

function parseDiscoveryFields(content: string): DiscoveryFields | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return undefined
  }

  const result = discoveryFieldSchema.safeParse(parsed)
  return result.success ? result.data : undefined
}

function parseEnrichmentFields(content: string): EnrichmentFields | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return undefined
  }

  const result = enrichmentFieldSchema.safeParse(parsed)
  return result.success ? result.data : undefined
}

function buildEnrichmentDraft(
  fields: EnrichmentFields,
  citations: readonly string[],
  requestedBusinessName: string,
): BusinessEnrichmentResult {
  const evidenceRef = citations[0] ?? ''
  const facts: StorefrontImportedFact[] = []

  for (const descriptor of draftedFieldLabels) {
    const value = fields[descriptor.key]?.trim()
    if (value === undefined || value.length === 0) continue
    facts.push({
      field: descriptor.field,
      label: descriptor.label,
      value,
      sourceLabel: StorefrontEnrichmentSourceLabel,
      confirmation: StorefrontImportConfirmationState,
      evidenceRef: citationFor(descriptor.key, fields, citations) ?? evidenceRef,
    })
  }

  if (facts.length === 0) {
    return {
      kind: 'error',
      code: 'enrichment_no_facts',
      retryable: false,
      reason: 'We could not find enough public details to draft a page.',
    }
  }

  const businessName = fields.businessName?.trim() || requestedBusinessName
  const profile: PublicOwnerClaimFlowInput = {
    ...emptyPublicOwnerClaimInput,
    businessName,
    category: fields.category?.trim() ?? '',
    suburb: fields.suburb?.trim() ?? '',
    stateTerritory: fields.stateTerritory?.trim() ?? '',
    requestedSlug: normalizeStorefrontSlug(businessName),
    sourceLabel: 'Gathered from a web search. Review before publishing.',
    serviceName: fields.serviceName?.trim() ?? '',
    serviceCategory: fields.serviceCategory?.trim() ?? '',
    serviceSummary: fields.serviceSummary?.trim() ?? '',
    serviceArea: fields.serviceArea?.trim() ?? '',
    hoursOrUnknown: fields.hoursOrUnknown?.trim() ?? '',
  }

  return {
    kind: 'draft',
    draft: {
      kind: 'draft',
      schemaVersion: 'storefront-import-draft:v1',
      status: 'draft_unconfirmed',
      profile,
      facts,
      source: {
        kind: 'web_search',
        url: evidenceRef,
        label: StorefrontEnrichmentSourceLabel,
        confirmation: StorefrontImportConfirmationState,
      },
      boundaryStatement:
        'These details were gathered from a web search and are unconfirmed until you review them. Nothing publishes until you confirm and submit this form.',
    },
  }
}

/** Prefer a citation whose host matches a drafted website URL. */
function citationFor(
  key: keyof EnrichmentFields,
  fields: EnrichmentFields,
  citations: readonly string[],
): string | undefined {
  if (key !== 'websiteUrl') return undefined
  const websiteUrl = fields.websiteUrl?.trim()
  if (websiteUrl === undefined || websiteUrl.length === 0) return undefined
  const host = safeHost(websiteUrl)
  if (host === undefined) return undefined
  return citations.find((citation) => safeHost(citation) === host)
}

function safeHost(value: string): string | undefined {
  try {
    return new URL(value).hostname.replace(/^www\./u, '')
  } catch {
    return undefined
  }
}


function enrichmentFailed(reason: string): BusinessEnrichmentResult {
  return { kind: 'error', code: 'enrichment_failed', retryable: true, reason }
}

function discoveryFailed(reason: string): WebDiscoveryResult {
  return { kind: 'error', code: 'discovery_failed', retryable: true, reason }
}
