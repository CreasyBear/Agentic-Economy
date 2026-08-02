import { createActor, setup } from 'xstate'
import { z } from 'zod'

import { isRecord } from '@/modules/common/is-record'

import {
  studyEvidenceClassSchema,
  studyQuoteSchema,
  studyRecommendationSchema,
  type StudyQuote,
  type StudyRecommendation,
} from './contract'
import type { TopsisResult } from './topsis'

/**
 * XState v5 is used only as a pure interpreter: `setup` and its typed
 * `createMachine` are declared in `node_modules/xstate/dist/declarations/src/setup.d.ts:125-143`,
 * the standalone machine constructor is documented in `createMachine.d.ts:4-49`,
 * and `createActor` is declared in `createActor.d.ts:173-214`. The event journal,
 * not an actor snapshot, is the durable source of truth.
 */

export const rfxStateSchema = z.enum(['enquiry', 'tender', 'qualification', 'award'])
export type RfxState = z.infer<typeof rfxStateSchema>


const journalEventBase = {
  operationKey: z.string().min(1),
  digest: z.string().min(1),
  projectId: z.string().min(1),
  treeId: z.string().min(1).optional(),
  nodeId: z.string().min(1),
  generation: z.number().int().min(1),
  revision: z.number().int().min(1),
  treeRevision: z.number().int().min(1).optional(),
  timestamp: z.number().int().nonnegative(),
  evidenceClass: studyEvidenceClassSchema,
} as const

export const studyJournalEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('scan_started'), ...journalEventBase }),
  z.strictObject({
    type: z.literal('candidate_observed'),
    ...journalEventBase,
    candidateRef: z.string().min(1),
    providerSlug: z.string().min(1).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
  z.strictObject({
    type: z.literal('candidate_quarantined'),
    ...journalEventBase,
    candidateRef: z.string().min(1),
    reasons: z.array(z.string().min(1)).min(1).max(16),
  }),
  z.strictObject({
    type: z.literal('quote_requested'),
    ...journalEventBase,
    quoteRef: z.string().min(1),
    providerRef: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal('quote_received'),
    ...journalEventBase,
    quoteRef: z.string().min(1),
    quote: studyQuoteSchema,
  }),
  z.strictObject({
    type: z.literal('quote_refused'),
    ...journalEventBase,
    quoteRef: z.string().min(1),
    providerRef: z.string().min(1),
    reason: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal('quote_unknown'),
    ...journalEventBase,
    quoteRef: z.string().min(1),
    providerRef: z.string().min(1),
    reason: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal('quote_expired'),
    ...journalEventBase,
    quoteRef: z.string().min(1),
    expiresAt: z.number().int(),
  }),
  z.strictObject({
    type: z.literal('scoring_completed'),
    ...journalEventBase,
    score: z.unknown(),
  }),
  z.strictObject({
    type: z.literal('recommended'),
    ...journalEventBase,
    recommendation: studyRecommendationSchema,
  }),
  z.strictObject({
    type: z.literal('refused'),
    ...journalEventBase,
    code: z.string().min(1),
    reason: z.string().min(1),
  }),
])
export type StudyJournalEvent = z.infer<typeof studyJournalEventSchema>
export type StudyJournalEventKind = StudyJournalEvent['type']

export const rfxEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('submit_enquiry') }),
  z.object({ type: z.literal('issue_tender') }),
  z.object({ type: z.literal('complete_qualification') }),
  z.object({ type: z.literal('make_award') }),
  ...studyJournalEventSchema.options,
])
export type RfxEvent = z.infer<typeof rfxEventSchema>

export const rfxLifecycleSetup = setup({
  types: {
    events: {} as RfxEvent,
  },
})

export const rfxLifecycleMachine = rfxLifecycleSetup.createMachine({
  id: 'ae-rfx-lifecycle',
  initial: 'enquiry',
  states: {
    enquiry: {
      on: {
        submit_enquiry: 'tender',
        scan_started: 'tender',
      },
    },
    tender: {
      on: {
        issue_tender: 'qualification',
        candidate_observed: 'tender',
        candidate_quarantined: 'tender',
        quote_requested: 'tender',
        quote_received: 'tender',
        quote_refused: 'tender',
        quote_unknown: 'tender',
        quote_expired: 'tender',
        refused: 'award',
        scoring_completed: 'qualification',
      },
    },
    qualification: {
      on: {
        complete_qualification: 'award',
        make_award: 'award',
        recommended: 'award',
        refused: 'award',
      },
    },
    award: {
      type: 'final',
    },
  },
})

export type RfxReplay = Readonly<{
  state: RfxState
  eventsApplied: number
}>

export class RfxReplayError extends Error {
  readonly code = 'rfx_invalid_transition' as const
  readonly state: RfxState
  readonly event: RfxEvent

  constructor(state: RfxState, event: RfxEvent) {
    super(`Cannot apply ${event.type} from ${state}`)
    this.name = 'RfxReplayError'
    this.state = state
    this.event = event
  }
}

export type StudyJournalCandidate = Readonly<{
  candidateRef: string
  providerSlug?: string
  status: 'observed' | 'quarantined'
  reasons?: readonly string[]
}>

export type StudyJournalQuote = Readonly<{
  quoteRef: string
  status: 'requested' | 'received' | 'refused' | 'unknown' | 'expired'
  quote?: StudyQuote
  reason?: string
  expiresAt?: number
}>

export type StudyJournalReplay = Readonly<{
  state: RfxState
  eventsApplied: number
  candidates: readonly StudyJournalCandidate[]
  quotes: readonly StudyJournalQuote[]
  score?: TopsisResult
  recommendation?: StudyRecommendation
  refusal?: Readonly<{ code: string; reason: string }>
  chronology: readonly StudyJournalEvent[]
}>

export function replayRfxEvents(events: readonly RfxEvent[]): RfxReplay {
  const actor = createActor(rfxLifecycleMachine)
  actor.start()
  try {
    for (const rawEvent of events) {
      const event = rfxEventSchema.parse(rawEvent)
      const before = readRfxState(actor.getSnapshot().value)
      actor.send(event)
      const after = readRfxState(actor.getSnapshot().value)
      if (before === after && !isJournalEvent(event)) throw new RfxReplayError(before, event)
    }
    return {
      state: readRfxState(actor.getSnapshot().value),
      eventsApplied: events.length,
    }
  } finally {
    actor.stop()
  }
}

export function replayStudyJournal(events: readonly StudyJournalEvent[]): StudyJournalReplay {
  const actor = createActor(rfxLifecycleMachine)
  actor.start()
  const candidates = new Map<string, StudyJournalCandidate>()
  const quotes = new Map<string, StudyJournalQuote>()
  let score: TopsisResult | undefined
  let recommendation: StudyRecommendation | undefined
  let refusal: Readonly<{ code: string; reason: string }> | undefined
  try {
    for (const rawEvent of events) {
      const event = studyJournalEventSchema.parse(rawEvent)
      const before = readRfxState(actor.getSnapshot().value)
      actor.send(event)
      const after = readRfxState(actor.getSnapshot().value)
      if (before === after && !isNoopJournalEvent(event)) throw new RfxReplayError(before, event)
      switch (event.type) {
        case 'candidate_observed':
          candidates.set(event.candidateRef, {
            candidateRef: event.candidateRef,
            ...(event.providerSlug === undefined ? {} : { providerSlug: event.providerSlug }),
            status: 'observed',
          })
          break
        case 'candidate_quarantined':
          candidates.set(event.candidateRef, {
            candidateRef: event.candidateRef,
            status: 'quarantined',
            reasons: event.reasons,
          })
          break
        case 'quote_requested':
          quotes.set(event.quoteRef, { quoteRef: event.quoteRef, status: 'requested' })
          break
        case 'quote_received':
          quotes.set(event.quoteRef, { quoteRef: event.quoteRef, status: 'received', quote: event.quote })
          break
        case 'quote_refused':
          quotes.set(event.quoteRef, { quoteRef: event.quoteRef, status: 'refused', reason: event.reason })
          break
        case 'quote_unknown':
          quotes.set(event.quoteRef, { quoteRef: event.quoteRef, status: 'unknown', reason: event.reason })
          break
        case 'quote_expired':
          quotes.set(event.quoteRef, { quoteRef: event.quoteRef, status: 'expired', expiresAt: event.expiresAt })
          break
        case 'scoring_completed':
          score = readTopsisResult(event.score)
          break
        case 'recommended':
          recommendation = event.recommendation
          refusal = undefined
          break
        case 'refused':
          refusal = { code: event.code, reason: event.reason }
          recommendation = undefined
          break
        case 'scan_started':
          break
      }
    }
    return {
      state: readRfxState(actor.getSnapshot().value),
      eventsApplied: events.length,
      candidates: [...candidates.values()],
      quotes: [...quotes.values()],
      ...(score === undefined ? {} : { score }),
      ...(recommendation === undefined ? {} : { recommendation }),
      ...(refusal === undefined ? {} : { refusal }),
      chronology: events.map((event) => studyJournalEventSchema.parse(event)),
    }
  } finally {
    actor.stop()
  }
}

function isJournalEvent(event: RfxEvent): event is StudyJournalEvent {
  return 'operationKey' in event
}

function isNoopJournalEvent(event: StudyJournalEvent): boolean {
  return event.type === 'candidate_observed'
    || event.type === 'candidate_quarantined'
    || event.type === 'quote_unknown'
    || event.type === 'quote_requested'
    || event.type === 'quote_received'
    || event.type === 'quote_refused'
    || event.type === 'quote_expired'
}

function readTopsisResult(value: unknown): TopsisResult {
  if (!isRecord(value)) throw new Error('study_score_invalid')
  return value as TopsisResult
}

function readRfxState(value: unknown): RfxState {
  return rfxStateSchema.parse(value)
}
