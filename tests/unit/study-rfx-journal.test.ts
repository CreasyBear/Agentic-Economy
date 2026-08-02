import { describe, expect, it } from 'vitest'

import {
  replayStudyJournal,
  runStudy,
  type StudyCharter,
  type StudyQuote,
  type StudyRegistryService,
} from '@/modules/study/public'

const DEVELOPMENT_LABEL = 'MOCK/DEVELOPMENT ONLY'
const now = Date.parse('2026-08-01T10:00:00.000Z')

const charter: StudyCharter = {
  wants: [
    { id: 'price', label: 'Price', weight: 0.6, sense: 'cost', valueKey: 'priceMinor' },
    { id: 'quality', label: 'Quality', weight: 0.4, sense: 'benefit', valueKey: 'qualityScore' },
  ],
  hardNeeds: [{ kind: 'fixed_price' }, { kind: 'open_quote' }],
}

function provider(slug: string, amountMinor: number): StudyRegistryService {
  return {
    id: `fixture:service:${slug}`,
    revision: 1,
    business: {
      slug,
      name: `${DEVELOPMENT_LABEL} ${slug}`,
      suburb: 'Melbourne',
      stateTerritory: 'VIC',
    },
    name: `${DEVELOPMENT_LABEL} service ${slug}`,
    category: 'generic service',
    summary: `${DEVELOPMENT_LABEL} fixture provider`,
    price: { kind: 'fixed', currency: 'AUD', amountMinor },
    endpoints: [{
      url: `/fixtures/${slug}/quote`,
      method: 'POST',
      access: 'open',
      provenance: 'business_declared',
    }],
  }
}

function quote(input: {
  providerSlug: string
  providerName: string
  amountMinor: number
  quotedAt?: number
  expiresAt?: number
}): StudyQuote {
  const quotedAt = input.quotedAt ?? now
  const expiresAt = input.expiresAt ?? now + 60 * 60_000
  return {
    quoteRef: `fixture:quote:${input.providerSlug}:${quotedAt}`,
    providerSlug: input.providerSlug,
    providerName: input.providerName,
    category: 'generic service',
    service: `${DEVELOPMENT_LABEL} quote`,
    price: { currency: 'AUD', amountMinor: input.amountMinor },
    nextAvailable: '2026-08-03T10:00:00.000Z',
    quotedAt: new Date(quotedAt).toISOString(),
    validUntil: new Date(expiresAt).toISOString(),
    quoteOrLocator: `/fixtures/${input.providerSlug}/quote`,
    qualityScore: 0.8,
    observedAt: quotedAt,
    expiresAt,
    revision: 1,
    evidenceClass: 'ae_sandbox_provider',
    environment: DEVELOPMENT_LABEL,
  }
}

const baseInput = {
  studyId: 'study:fixture:one',
  projectId: 'project:fixture',
  treeId: 'tree:fixture',
  nodeId: 'study-node:fixture',
  charter,
  registryServices: [
    provider('alpha', 12_000),
    provider('beta', 10_000),
    provider('gamma', 15_000),
  ],
  requestedAt: now,
  generation: 2,
  revision: 1,
  treeRevision: 4,
} as const

describe('durable Study RFx journal', () => {
  it('records scan, three labelled candidates, qualification, fresh scoring, and a recommendation', () => {
    const result = runStudy({
      ...baseInput,
      quoteProvider: ({ provider: candidate, requestedAt }) => quote({
        providerSlug: candidate.business.slug,
        providerName: candidate.business.name,
        amountMinor: candidate.price?.amountMinor ?? 0,
        quotedAt: requestedAt,
      }),
    })

    expect(result.kind).toBe('completed')
    if (result.kind !== 'completed') return

    expect(result.events.map((event) => event.type)).toEqual([
      'scan_started',
      'candidate_observed',
      'candidate_observed',
      'candidate_observed',
      'quote_requested',
      'quote_requested',
      'quote_requested',
      'quote_received',
      'quote_received',
      'quote_received',
      'scoring_completed',
      'recommended',
    ])
    expect(result.events.every((event) => event.evidenceClass.length > 0)).toBe(true)
    expect(result.events.filter((event) => event.type === 'candidate_observed')).toHaveLength(3)
    expect(result.qualification.eligibleProviders.map((candidate) => candidate.business.slug)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ])
    expect(result.artifact.topsis.alternatives).toHaveLength(3)
    expect(result.artifact.topsis.alternatives.every((alternative) => alternative.criteria.length === 2)).toBe(true)
    expect(result.artifact.topsis.alternatives.every((alternative) => alternative.criteria.every((criterion) => (
      Number.isFinite(criterion.raw)
      && Number.isFinite(criterion.normalized)
      && Number.isFinite(criterion.weighted)
      && Number.isFinite(criterion.pisSquaredDistanceContribution)
      && Number.isFinite(criterion.nisSquaredDistanceContribution)
    )))).toBe(true)
    expect(result.artifact.recommendation).toMatchObject({
      alternativeId: 'beta',
      evidenceClass: 'ae_sandbox_provider',
      environment: DEVELOPMENT_LABEL,
    })

    const replay = replayStudyJournal(result.events)
    expect(replay).toMatchObject({
      state: 'award',
      candidates: [
        { candidateRef: 'fixture:service:alpha', status: 'observed' },
        { candidateRef: 'fixture:service:beta', status: 'observed' },
        { candidateRef: 'fixture:service:gamma', status: 'observed' },
      ],
      recommendation: result.artifact.recommendation,
    })
    expect(replay.score?.alternatives.every((alternative) => alternative.criteria.length === 2)).toBe(true)
    expect(replay.chronology).toEqual(result.events)
  })

  it('refuses an expired quote and never projects a recommendation', () => {
    const result = runStudy({
      ...baseInput,
      quoteProvider: ({ provider: candidate, requestedAt }) => quote({
        providerSlug: candidate.business.slug,
        providerName: candidate.business.name,
        amountMinor: candidate.price?.amountMinor ?? 0,
        quotedAt: requestedAt - 60_000,
        expiresAt: requestedAt - 1,
      }),
    })

    expect(result.kind).toBe('failed')
    if (result.kind !== 'failed') return
    expect(result.code).toBe('no_fresh_quotes')
    expect('artifact' in result).toBe(false)
    expect(result.events.at(-1)).toMatchObject({ type: 'refused', code: 'no_fresh_quotes' })
    expect(result.events.some((event) => event.type === 'quote_expired')).toBe(true)
    expect(result.events.some((event) => event.type === 'recommended')).toBe(false)
    expect(result.excludedQuotes).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'expired_quote' }),
    ]))
  })

  it('records provider refusal and timeout/unknown outcomes explicitly', () => {
    const refused = runStudy({
      ...baseInput,
      quoteProvider: ({ provider: candidate }) => ({
        kind: 'refused' as const,
        reason: candidate.business.slug === 'alpha' ? 'provider_refused' as const : 'provider_unknown' as const,
      }),
    })
    expect(refused.kind).toBe('failed')
    if (refused.kind === 'failed') {
      expect(refused.quoteBatch.refusals).toEqual(expect.arrayContaining([
        { providerRef: 'fixture:service:alpha', reason: 'provider_refused' },
        { providerRef: 'fixture:service:beta', reason: 'provider_unknown' },
      ]))
      expect(refused.events.filter((event) => event.type === 'quote_refused')).toHaveLength(1)
      expect(refused.events.filter((event) => event.type === 'quote_unknown')).toHaveLength(2)
      expect(refused.events.some((event) => event.type === 'recommended')).toBe(false)
    }

    const unknown = runStudy({
      ...baseInput,
      quoteProvider: () => undefined,
    })
    expect(unknown.kind).toBe('failed')
    if (unknown.kind === 'failed') {
      expect(unknown.quoteBatch.refusals.every((refusal) => refusal.reason === 'provider_unknown')).toBe(true)
      expect(unknown.events.every((event) => event.type !== 'recommended')).toBe(true)
    }
  })

  it('reuses the same journal and public result on an identical retry', () => {
    const first = runStudy({
      ...baseInput,
      quoteProvider: ({ provider: candidate, requestedAt }) => quote({
        providerSlug: candidate.business.slug,
        providerName: candidate.business.name,
        amountMinor: candidate.price?.amountMinor ?? 0,
        quotedAt: requestedAt,
      }),
    })
    expect(first.kind).toBe('completed')
    if (first.kind !== 'completed') return

    const retry = runStudy({
      ...baseInput,
      rfxEvents: first.events,
      quoteProvider: ({ provider: candidate, requestedAt }) => quote({
        providerSlug: candidate.business.slug,
        providerName: candidate.business.name,
        amountMinor: candidate.price?.amountMinor ?? 0,
        quotedAt: requestedAt,
      }),
    })
    expect(retry).toEqual(first)
    expect(replayStudyJournal(retry.events)).toEqual(replayStudyJournal(first.events))
  })
})
