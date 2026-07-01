import type { PublicBusinessCatalogApiDto } from '@/modules/registry/public'

import type { AnswerArtifact } from './answer-schema'
import type { AnswerLayoutProfile } from './internal/answer-layout-profile'

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

export type AnswerSynthesizerFollowUpIntent =
  | 'refine_search'
  | 'filter_known'
  | 'compare_known'
  | 'explain_boundary'
  | 'unsupported'

export type AnswerSynthesizerInput = {
  query: string
  limit?: number
  cursor?: string
  /** When set, skip the registry search and use these providers (follow-up filter/compare). */
  prefetchedProviders?: readonly AnswerSource[]
  /** Registry query for agent JSON URL when the turn query is not a search (e.g. boundary chip). */
  registryQuery?: string
  /** Thread follow-up intent from the turn orchestrator. */
  followUpIntent?: AnswerSynthesizerFollowUpIntent
  /** Chip or panel label shown in the transcript (may differ from registry query). */
  displayQuery?: string
  /** When true, follow-up turns use a quieter cards-first layout. */
  compactFollowUp?: boolean
  /** When false, the synthesizer should not emit its own thinking event (orchestrator owns steps). */
  emitThinking?: boolean
  /** OpenRouter model override for gated LLM prose (dev / structured chat path). */
  model?: string
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
  responseTimeLabel: string
  trustCue: string
  photoUrl?: string
  nextStepLabel: string
  detailUrl: string
  inquiryUrl?: string
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
  /** Quieter artifact layout for in-thread follow-ups. */
  compactLayout?: boolean
  /** Generative panel shape for this turn. */
  layoutProfile?: AnswerLayoutProfile
}

/** SSE event stream shape. Order: thread? -> thinking* -> one-line -> sources -> summary-delta* -> next-step -> artifact* -> complete | error. */
export type AnswerEvent =
  | { type: 'thread'; threadId: string; turnId: string; turnSeq: number }
  | { type: 'thinking'; step?: 'search' | 'read' | 'write'; label?: string }
  | { type: 'one-line'; oneLine: string }
  | { type: 'sources'; providers: readonly AnswerSource[] }
  | { type: 'summary-delta'; delta: string }
  | { type: 'next-step'; nextStep: string }
  | { type: 'artifact'; artifact: AnswerArtifact }
  | { type: 'complete'; answer: AnswerSnapshot }
  | { type: 'error'; code: string; copyId: string }

export type AnswerSynthesizer = {
  readonly name: string
  synthesize(input: AnswerSynthesizerInput): AsyncIterable<AnswerEvent>
}

export function buildAgentJsonUrl(
  query: string,
  limit?: number,
  scope?: { mode?: 'near_me' | 'whole_catalogue'; location?: string },
): string {
  const params = new URLSearchParams()
  params.set('q', query)
  if (limit !== undefined) {
    params.set('limit', String(limit))
  }
  if (scope?.mode !== undefined) {
    params.set('mode', scope.mode)
  }
  if (scope?.location !== undefined && scope.location.trim().length > 0) {
    params.set('location', scope.location.trim())
  }
  return `/api/businesses/search?${params.toString()}`
}

export function buildDetailUrl(slug: string): string {
  return `/${slug}`
}
