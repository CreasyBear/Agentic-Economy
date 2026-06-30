import type { PublicBusinessCatalogApiDto } from '@/modules/registry/public'

/**
 * Provider-agnostic answer synthesizer.
 *
 * Phase 1 ships a deterministic implementation (template prose from real catalog
 * fields, no LLM). The interface is async-iterator shaped so a future LLM provider
 * (Nemotron / Exa / Perplexity Sonar) can drop in by implementing the same
 * `synthesize` method with real token streaming — no route or client rewrite.
 *
 * Contract: every field on {@link AnswerSource} must be derivable from a live
 * {@link PublicBusinessCatalogApiDto}. No hardcoded answer text, no invented
 * availability, no booking/payment/dispatch/callable claims, no "verified" claim
 * unless a real trust standard was met. Read-only synthesis over the public,
 * non-suppressed catalog.
 */

export type AnswerSynthesizerInput = {
  query: string
  limit?: number
  cursor?: string
}

/**
 * A single provider source card. Plain, Google-Maps-clean. Every string is
 * derived from real catalog fields via the plain label mappers in
 * `src/lib/ui/status-presentation.ts`.
 */
export type AnswerSource = {
  citationIndex: number
  slug: string
  name: string
  category: string
  suburb: string
  stateTerritory: string
  serviceArea: string
  hoursLabel: string
  availabilityLabel: string
  trustLabel: string
  nextStepLabel: string
  detailUrl: string
  services: readonly {
    name: string
    category: string
    summary: string
  }[]
}

/** The final, fully-assembled answer (carried by the `complete` event). */
export type AnswerSnapshot = {
  query: string
  oneLine: string
  providers: readonly AnswerSource[]
  summary: string
  nextStep: string
  agentJsonUrl: string
}

/** SSE event stream shape. Order: thinking -> one-line -> sources -> summary-delta* -> next-step -> complete | error. */
export type AnswerEvent =
  | { type: 'thinking' }
  | { type: 'one-line'; oneLine: string }
  | { type: 'sources'; providers: readonly AnswerSource[] }
  | { type: 'summary-delta'; delta: string }
  | { type: 'next-step'; nextStep: string }
  | { type: 'complete'; answer: AnswerSnapshot }
  | { type: 'error'; code: string; copyId: string }

export type AnswerSynthesizer = {
  readonly name: string
  synthesize(input: AnswerSynthesizerInput): AsyncIterable<AnswerEvent>
}

export function buildAgentJsonUrl(query: string, limit?: number): string {
  const params = new URLSearchParams()
  params.set('q', query)
  if (limit !== undefined) {
    params.set('limit', String(limit))
  }
  return `/api/businesses/search?${params.toString()}`
}

export function buildDetailUrl(slug: string): string {
  return `/${slug}`
}
