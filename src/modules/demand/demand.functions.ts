import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  callPublicSourceMutation,
  callSourceQuery,
  ConvexSourceError,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import {
  evaluateSearchGaps,
} from './public'
import type {
  SearchGapCandidate,
  SearchGapFact,
  SearchGapSurface,
} from './public'

type SearchGapMutationInput = Readonly<{
  queryText: string
  surface: SearchGapSurface
  requiredFacts: readonly SearchGapFact[]
  candidateCount: number
  gaps: readonly Readonly<{ slug: string; missingFacts: readonly SearchGapFact[] }>[]
}>

type SearchGapMutationResult =
  | Readonly<{ kind: 'ok'; recorded: number }>
  | Readonly<{ kind: 'refused'; code: 'empty_query' }>

export type SearchGapRecorder = (input: Readonly<{
  queryText: string
  surface: SearchGapSurface
  candidates: readonly SearchGapCandidate[]
}>) => Promise<void>

const recordSearchGapsMutation = sourceMutation<SearchGapMutationInput, SearchGapMutationResult>(
  'searchGap:recordSearchGaps',
)

let searchGapRecorderForTests: SearchGapRecorder | undefined

export function setSearchGapRecorderForTests(
  recorder: SearchGapRecorder | undefined,
): () => void {
  const previous = searchGapRecorderForTests
  searchGapRecorderForTests = recorder
  return () => {
    searchGapRecorderForTests = previous
  }
}

export const recordSearchGaps: SearchGapRecorder = async (input) => {
  if (input.queryText.trim().length === 0) return
  if (searchGapRecorderForTests !== undefined) {
    await searchGapRecorderForTests(input)
    return
  }

  const evaluation = evaluateSearchGaps(input)
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      callPublicSourceMutation(recordSearchGapsMutation, {
        queryText: input.queryText,
        surface: input.surface,
        ...evaluation,
      }).catch(() => undefined),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 400)
      }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}

export type SearchGapFactCount = Readonly<{ fact: SearchGapFact; searches: number }>

export type OwnerSearchGapReadback =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{
      kind: 'available'
      slug: string
      totalSearches: number
      byFact: readonly SearchGapFactCount[]
      truncated: boolean
    }>

export type SearchGapOutreachReadback =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{
      kind: 'available'
      businesses: readonly Readonly<{
        slug: string
        searches: number
        distinctDays: number
        factCounts: readonly SearchGapFactCount[]
        lastQueryText: string
      }>[]
      unanswered: readonly Readonly<{
        queryText: string
        surface: SearchGapSurface
        searches: number
        lastSeenAt: number
      }>[]
      truncated: boolean
    }>

const readOwnerSearchGapsQuery = sourceQuery<
  { sinceDayBucket: string },
  OwnerSearchGapReadback
>('searchGap:readOwnerSearchGaps')

const readSearchGapOutreachQuery = sourceQuery<
  { sinceDayBucket: string },
  SearchGapOutreachReadback
>('searchGap:readSearchGapOutreach')

/**
 * Both readbacks use the authenticated transport. The Convex functions derive
 * the owner from identity and gate the operator list on admin authority, so a
 * server-function URL replayed without a session returns `denied`.
 */
export const readOwnerSearchGapsServer = createServerFn({ method: 'GET' })
  .handler(async (): Promise<OwnerSearchGapReadback> =>
    callSourceQuery(readOwnerSearchGapsQuery, { sinceDayBucket: dayBucketDaysAgo(30) }))

export const readSearchGapOutreachServer = createServerFn({ method: 'GET' })
  .handler(async (): Promise<SearchGapOutreachReadback> =>
    callSourceQuery(readSearchGapOutreachQuery, { sinceDayBucket: dayBucketDaysAgo(30) }))

function dayBucketDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10)
}

const optionalDemandNoteSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim().length === 0) {
      return undefined
    }
    return value
  },
  z.string().trim().max(280).optional(),
)

const optionalDemandQueryTextSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim().length === 0) {
      return undefined
    }
    return value
  },
  z.string().trim().max(120).optional(),
)

export const demandCaptureInputSchema = z.strictObject({
  service: z.string().trim().min(1).max(80),
  suburb: z.string().trim().min(1).max(80),
  note: optionalDemandNoteSchema,
  queryText: optionalDemandQueryTextSchema,
})

export type DemandCaptureInput = z.infer<typeof demandCaptureInputSchema>

export type DemandCaptureServerResult =
  | {
      kind: 'ok'
      code: 'demand_signal_captured'
      signalId: string
      createdAt: number
    }
  | DemandCaptureErrorResult

type DemandCaptureErrorResult = {
  kind: 'error'
  code: 'demand_capture_failed' | 'demand_capture_invalid_input' | 'missing_convex_url'
  retryable: boolean
  reason: string
  field?: 'service' | 'suburb' | 'note' | 'queryText'
}

type DemandCaptureMutationInput = DemandCaptureInput & {
  sourceSurface: 'registry'
}

const captureDemandSignalMutation = sourceMutation<DemandCaptureMutationInput, DemandCaptureServerResult>(
  'demand:captureDemandSignal'
)

export const captureDemandSignalServer = createServerFn({ method: 'POST' })
  .validator((data) => demandCaptureInputSchema.parse(data))
  .handler(async ({ data }) => captureDemandSignalThroughSource(data))

export async function captureDemandSignalThroughSource(
  data: DemandCaptureInput
): Promise<DemandCaptureServerResult> {
  try {
    return await callPublicSourceMutation(captureDemandSignalMutation, {
      service: data.service,
      suburb: data.suburb,
      sourceSurface: 'registry',
      ...(data.note === undefined ? {} : { note: data.note }),
      ...(data.queryText === undefined ? {} : { queryText: data.queryText }),
    })
  } catch (error) {
    return demandCaptureSourceError(error)
  }
}

function demandCaptureSourceError(error: unknown): DemandCaptureErrorResult {
  if (error instanceof ConvexSourceError && error.code === 'missing_convex_url') {
    return {
      kind: 'error',
      code: 'missing_convex_url',
      retryable: true,
      reason: error.message,
    }
  }

  return {
    kind: 'error',
    code: 'demand_capture_failed',
    retryable: true,
    reason: 'Demand signal could not be recorded right now.',
  }
}
