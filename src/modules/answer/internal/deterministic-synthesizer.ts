import { readPublicRegistrySearchPage } from '@/modules/registry/registry.functions'
import type { PublicBusinessCatalogApiDto } from '@/modules/registry/public'
import {
  plainAvailabilityLabel,
  plainHoursLabel,
  plainNextStepLabel,
  plainTrustLabel,
} from '@/lib/ui/status-presentation'
import type { DiscoveryStatus } from '@/modules/discovery/public'
import type { FirstRequestMode } from '@/modules/catalog/public'
import type { TrustTier } from '@/modules/business/public'

import {
  buildAgentJsonUrl,
  buildDetailUrl,
  type AnswerEvent,
  type AnswerSnapshot,
  type AnswerSource,
  type AnswerSynthesizer,
  type AnswerSynthesizerInput,
} from '../answer-synthesizer'

/**
 * Phase-1 deterministic answer synthesizer.
 *
 * No LLM, no key. Builds the answer from real catalog fields returned by
 * `readPublicRegistrySearchPage`. Every provider fact is derivable from a live
 * {@link PublicBusinessCatalogApiDto}. Owner-supplied text is echoed verbatim
 * (summary, serviceArea, hoursOrUnknown) — never interpreted or paraphrased into
 * a claim the catalog does not support.
 *
 * Emits the full SSE event sequence even though the answer is computed up front,
 * so the streaming seam is real and tested: `thinking -> one-line -> sources ->
 * summary-delta* -> next-step -> complete`. A future LLM implementation
 * satisfies the same interface with genuine token streaming.
 */

const DEFAULT_LIMIT = 10
const MAX_QUERY_LENGTH = 200

export const deterministicSynthesizer: AnswerSynthesizer = {
  name: 'deterministic-phase-1',
  synthesize(input) {
    return synthesizeDeterministic(input)
  },
}

async function* synthesizeDeterministic(input: AnswerSynthesizerInput): AsyncIterable<AnswerEvent> {
  const query = sanitizeQuery(input.query)
  const limit = input.limit ?? DEFAULT_LIMIT

  // First pixel: paint the shell immediately, before any search work.
  yield { type: 'thinking' }

  let providers: readonly AnswerSource[]
  try {
    const page = await readPublicRegistrySearchPage({
      query,
      limit,
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    })
    providers = page.items.map((dto, index) => toAnswerSource(dto, index + 1))
  } catch (cause) {
    const copyId = makeCopyId()
    void cause
    yield { type: 'error', code: 'answer_search_failed', copyId }
    return
  }

  yield { type: 'one-line', oneLine: buildOneLine(query, providers) }
  yield { type: 'sources', providers }

  for (const delta of splitSentences(buildSummary(query, providers))) {
    yield { type: 'summary-delta', delta }
  }

  const nextStep = buildNextStep(query, providers)
  yield { type: 'next-step', nextStep }

  const answer: AnswerSnapshot = {
    query,
    oneLine: buildOneLine(query, providers),
    providers,
    summary: buildSummary(query, providers),
    nextStep,
    agentJsonUrl: buildAgentJsonUrl(query, limit),
  }
  yield { type: 'complete', answer }
}

function toAnswerSource(dto: PublicBusinessCatalogApiDto, citationIndex: number): AnswerSource {
  const primaryService = dto.services[0]
  const discoveryStatus = dto.discoveryStatus as DiscoveryStatus
  const firstRequestMode = (primaryService?.firstRequest.mode ?? 'not_available_yet') as FirstRequestMode
  const trustTier = dto.trustTier as TrustTier

  return {
    citationIndex,
    slug: dto.slug,
    name: dto.name,
    category: dto.category,
    suburb: dto.suburb,
    stateTerritory: dto.stateTerritory,
    serviceArea: primaryService?.serviceArea ?? dto.services.map((s) => s.serviceArea).filter(Boolean)[0] ?? '',
    hoursLabel: plainHoursLabel(primaryService?.hoursOrUnknown),
    availabilityLabel: plainAvailabilityLabel({ discoveryStatus, firstRequestMode }),
    trustLabel: plainTrustLabel(trustTier),
    nextStepLabel: plainNextStepLabel(firstRequestMode),
    detailUrl: buildDetailUrl(dto.slug),
    services: dto.services.map((service) => ({
      name: service.name,
      category: service.category,
      summary: service.summary,
    })),
  }
}

function buildOneLine(query: string, providers: readonly AnswerSource[]): string {
  if (providers.length === 0) {
    return query.length === 0
      ? 'No listed businesses match that yet.'
      : `No listed businesses match "${query}" yet.`
  }

  if (providers.length === 1) {
    return `One listed business matches "${query}".`
  }

  return `${providers.length} listed businesses match "${query}".`
}

function buildSummary(query: string, providers: readonly AnswerSource[]): string {
  if (providers.length === 0) {
    return [
      'No providers are listed for that yet.',
      'You can list a business, or try a different need or suburb.',
    ].join(' ')
  }

  const first = providers[0]
  if (first === undefined) {
    return [
      'No providers are listed for that yet.',
      'You can list a business, or try a different need or suburb.',
    ].join(' ')
  }

  const area = first.serviceArea || first.suburb
  const lead = area.length === 0
    ? `Here's what's listed for "${query}".`
    : `Here's what's listed for "${query}", including providers around ${area}.`

  const providerLine = providers.length === 1
    ? `${first.name} (${first.category}) works around ${first.serviceArea || first.suburb}. ${first.hoursLabel}.`
    : `${providers.length} providers are listed. ${first.name} (${first.category}) works around ${first.serviceArea || first.suburb}.`

  const boundary = 'No booking or payment happens on this page. Availability and quotes still need a reply from the business.'

  return [lead, providerLine, boundary].join(' ')
}

function buildNextStep(query: string, providers: readonly AnswerSource[]): string {
  if (providers.length === 0) {
    return 'List your business, or refine the search.'
  }

  return 'Open a provider\u2019s page for the contact or quote instructions. No booking or payment happens on this page.'
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function sanitizeQuery(raw: string): string {
  return raw.slice(0, MAX_QUERY_LENGTH).trim()
}

function makeCopyId(): string {
  return `answer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
