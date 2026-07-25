import { z } from 'zod'

import {
  StorefrontEnrichmentSourceLabel,
  StorefrontImportConfirmationState,
  type StorefrontImportDraft,
  type StorefrontImportedFact,
  type StorefrontImportedFactField,
} from './import-draft'

import type { AnswerLlmConfig } from '@/modules/answer/internal/llm-config'
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

export type BusinessEnrichmentFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type BusinessEnrichmentOptions = {
  fetch?: BusinessEnrichmentFetch
  timeoutMs?: number
}

const OPENROUTER_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_ENRICHMENT_REQUEST_BYTES = 1_000_000
const MAX_ENRICHMENT_ATTEMPTS = 2
const TRANSIENT_PROVIDER_STATUSES: Record<number, true> = { 408: true, 429: true, 500: true, 502: true, 503: true, 504: true }
const DEFAULT_ENRICHMENT_TIMEOUT_MS = 20_000
const WEB_SEARCH_MAX_RESULTS = 5

const ENRICHMENT_SYSTEM_INSTRUCTION = [
  'You draft public profile facts for Australian local businesses using web search results.',
  'Return a single JSON object with any of these keys: businessName, category, suburb, stateTerritory, websiteUrl, serviceName, serviceCategory, serviceSummary, serviceArea, hoursOrUnknown.',
  'Omit any key you cannot ground in a search result. Never invent phone numbers, hours, prices, or credentials.',
  'Values are short plain text. serviceSummary is one sentence.',
].join(' ')

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

const emptyClaimProfile: PublicOwnerClaimFlowInput = {
  businessName: '',
  category: '',
  suburb: '',
  stateTerritory: '',
  requestedSlug: '',
  publishedPhone: '',
  ownerMessage: '',
  sourceLabel: '',
  serviceName: '',
  serviceCategory: '',
  serviceSummary: '',
  serviceArea: '',
  hoursOrUnknown: '',
  photoUrl: '',
  responseTimeMinutes: '',
  firstRequestMode: 'not_available_yet',
  publicDisclosure: '',
  noContactReason: '',
}

export async function enrichBusinessFromWebSearch(
  input: BusinessEnrichmentInput,
  config: AnswerLlmConfig | undefined,
  options: BusinessEnrichmentOptions = {},
): Promise<BusinessEnrichmentResult> {
  if (config === undefined || config.apiKey.trim().length === 0 || config.model.trim().length === 0) {
    return { kind: 'unavailable', reason: 'llm_not_configured' }
  }

  const businessName = input.businessName.trim()
  if (businessName.length === 0) {
    return {
      kind: 'error',
      code: 'enrichment_no_facts',
      retryable: false,
      reason: 'Enter the business name before gathering public details.',
    }
  }

  const suburb = input.suburb?.trim()
  const requestBody = JSON.stringify({
    model: config.model,
    plugins: [{ id: 'web', max_results: WEB_SEARCH_MAX_RESULTS }],
    response_format: { type: 'json_object' },
    temperature: 0,
    messages: [
      { role: 'system', content: ENRICHMENT_SYSTEM_INSTRUCTION },
      {
        role: 'user',
        content: `Draft public profile facts for the Australian local business named "${businessName}" in ${suburb === undefined || suburb.length === 0 ? 'Australia' : suburb}.`,
      },
    ],
  })

  if (new TextEncoder().encode(requestBody).byteLength > MAX_ENRICHMENT_REQUEST_BYTES) {
    return enrichmentFailed('The enrichment request was too large to send.')
  }

  const completion = await requestCompletion(requestBody, config, options)
  if (completion.kind !== 'ok') {
    return completion.result
  }

  const fields = parseEnrichmentFields(completion.content)
  if (fields === undefined) {
    return enrichmentFailed('The gathered details could not be read. Try again.')
  }

  return buildEnrichmentDraft(fields, completion.citations, businessName)
}

type CompletionOutcome =
  | { kind: 'ok'; content: string; citations: readonly string[] }
  | { kind: 'failed'; result: BusinessEnrichmentResult }

async function requestCompletion(
  requestBody: string,
  config: AnswerLlmConfig,
  options: BusinessEnrichmentOptions,
): Promise<CompletionOutcome> {
  const doFetch = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_ENRICHMENT_TIMEOUT_MS
  const endpoint = config.apiBaseUrl === undefined
    ? OPENROUTER_COMPLETIONS_URL
    : `${config.apiBaseUrl.replace(/\/+$/u, '')}/chat/completions`

  for (let attempt = 1; attempt <= MAX_ENRICHMENT_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error('enrichment_timeout')), timeoutMs)
    let response: Response
    try {
      response = await doFetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Agentic Economy',
        },
        body: requestBody,
        signal: controller.signal,
      })
    } catch {
      if (attempt < MAX_ENRICHMENT_ATTEMPTS) continue
      return {
        kind: 'failed',
        result: enrichmentFailed('The details service did not respond. Try again.'),
      }
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      if (attempt < MAX_ENRICHMENT_ATTEMPTS && TRANSIENT_PROVIDER_STATUSES[response.status] === true) continue
      return {
        kind: 'failed',
        result: enrichmentFailed(`The details service refused the request (${response.status}).`),
      }
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      return { kind: 'failed', result: enrichmentFailed('The details service returned an unreadable response.') }
    }

    const content = readMessageContent(body)
    if (content === undefined) {
      return { kind: 'failed', result: enrichmentFailed('The details service returned no content.') }
    }

    return { kind: 'ok', content, citations: readCitationUrls(body) }
  }

  return { kind: 'failed', result: enrichmentFailed('The details service was unavailable.') }
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
    ...emptyClaimProfile,
    businessName,
    category: fields.category?.trim() ?? '',
    suburb: fields.suburb?.trim() ?? '',
    stateTerritory: fields.stateTerritory?.trim() ?? '',
    requestedSlug: businessName.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 80),
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

function readMessageContent(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.choices)) return undefined
  const first: unknown = value.choices[0]
  if (!isRecord(first) || !isRecord(first.message)) return undefined
  return typeof first.message.content === 'string' ? first.message.content : undefined
}

function readCitationUrls(value: unknown): readonly string[] {
  if (!isRecord(value) || !Array.isArray(value.choices)) return []
  const first: unknown = value.choices[0]
  if (!isRecord(first) || !isRecord(first.message)) return []
  const annotations: unknown = first.message.annotations
  if (!Array.isArray(annotations)) return []

  const urls: string[] = []
  for (const annotation of annotations) {
    if (!isRecord(annotation)) continue
    const citation: unknown = annotation.url_citation
    if (!isRecord(citation)) continue
    const url: unknown = citation.url
    if (typeof url === 'string' && url.trim().length > 0 && !urls.includes(url)) urls.push(url)
  }

  return urls
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function enrichmentFailed(reason: string): BusinessEnrichmentResult {
  return { kind: 'error', code: 'enrichment_failed', retryable: true, reason }
}
