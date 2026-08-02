import { getTime, min, parseISO } from 'date-fns'
/** date-fns v4 parseISO/getTime/min declarations: parseISO.d.ts:11-30, getTime.d.ts:7-19, min.d.ts:8-38. */

import { type PublicServicesApiPage } from '@/modules/registry/public'
import { stableUnique } from '@/modules/common/stable-unique'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import {
  resolveCategoryQuote,
  type CategoryQuote,
  type CategoryQuoteCategory,
} from '@/modules/sandbox-supply/public'

import {
  studyArtifactSchema,
  studyCharterSchema,
  studyQuoteSchema,
  type StudyArtifactWithTopsis,
  type StudyCharter,
  type StudyHardNeed,
  type StudyQualification,
  type StudyQuote,
  type StudyQuoteExclusion,
  type StudyRegistryService,
  type StudyScan,
  type StudyWebClaim,
} from './contract'
import {
  replayStudyJournal,
  studyJournalEventSchema,
  type RfxEvent,
  type StudyJournalEvent,
} from './rfx-machine'
import { scoreTopsis, type TopsisResult } from './topsis'
/** Registry services are the only candidates that can become providers or
 * receive quotes. Web discovery is retained as cited learning evidence only;
 * its businesses never enter `providers` or `allowedSlugs`.
 */
export function scanStudySupply(input: Readonly<{
  registryServices: readonly StudyRegistryService[]
  webClaims?: readonly StudyWebClaim[]
}>): StudyScan {
  const seen = new Set<string>()
  const providers = input.registryServices.filter((service) => {
    if (seen.has(service.id)) return false
    seen.add(service.id)
    return true
  })
  const webClaims = input.webClaims ?? []
  return {
    providers,
    webClaims,
    webEvidenceRefs: stableUnique(webClaims.map((claim) => claim.sourceUrl)),
  }
}

/** Reuse the existing `/api/v1/services` projection rather than inventing a second registry shape. */
export function scanStudyFromPublicServicesPage(
  page: PublicServicesApiPage,
  webClaims: readonly StudyWebClaim[] = [],
): StudyScan {
  return scanStudySupply({ registryServices: page.services.map(toStudyRegistryService), webClaims })
}

export function qualifyStudyProviders(
  scan: StudyScan,
  charterInput: StudyCharter,
): StudyQualification {
  const charter = studyCharterSchema.parse(charterInput)
  const eligibleProviders: StudyRegistryService[] = []
  const excluded: StudyQualification['excluded'][number][] = []
  for (const provider of scan.providers) {
    const reasons = charter.hardNeeds.flatMap((need) => hardNeedFailure(provider, need))
    if (reasons.length > 0) {
      excluded.push({ providerRef: provider.id, reasons: stableUnique(reasons) })
      continue
    }
    eligibleProviders.push(provider)
  }
  return {
    eligibleProviders,
    excluded,
    allowedSlugs: eligibleProviders.map((provider) => provider.business.slug),
  }
}

export type StudyQuoteRefusal = Readonly<{
  providerRef: string
  reason: 'unknown_category' | 'unpriced_provider' | 'provider_refused' | 'provider_unknown'
}>

export type StudyQuoteProvider = (input: Readonly<{
  provider: StudyRegistryService
  requestedAt: number
}>) => StudyQuote | Readonly<{ kind: 'refused'; reason: StudyQuoteRefusal['reason'] }> | undefined

export type StudyQuoteBatch = Readonly<{
  quotes: readonly StudyQuote[]
  rejectedProviderRefs: readonly string[]
  refusals: readonly StudyQuoteRefusal[]
}>

export function quoteQualifiedProviders(input: Readonly<{
  qualification: StudyQualification
  requestedAt: number
  quoteProvider?: StudyQuoteProvider
}>): StudyQuoteBatch {
  const quotes: StudyQuote[] = []
  const rejectedProviderRefs: string[] = []
  const refusals: StudyQuoteRefusal[] = []
  for (const provider of input.qualification.eligibleProviders) {
    if (input.quoteProvider !== undefined) {
      const supplied = input.quoteProvider({ provider, requestedAt: input.requestedAt })
      if (supplied === undefined) {
        rejectedProviderRefs.push(provider.id)
        refusals.push({ providerRef: provider.id, reason: 'provider_unknown' })
      } else if ('kind' in supplied) {
        rejectedProviderRefs.push(provider.id)
        refusals.push({ providerRef: provider.id, reason: supplied.reason })
      } else {
        quotes.push(studyQuoteSchema.parse(supplied))
      }
      continue
    }
    const category = categoryForProvider(provider.category)
    if (category === undefined) {
      rejectedProviderRefs.push(provider.id)
      refusals.push({ providerRef: provider.id, reason: 'unknown_category' })
      continue
    }
    if (provider.price?.kind !== 'fixed' || provider.price.amountMinor === undefined) {
      rejectedProviderRefs.push(provider.id)
      refusals.push({ providerRef: provider.id, reason: 'unpriced_provider' })
      continue
    }
    const result = resolveCategoryQuote({
      category,
      slug: provider.business.slug,
      requestedAt: input.requestedAt,
      offerings: [{
        name: provider.name,
        price: {
          kind: 'fixed',
          currency: provider.price.currency,
          amountMinor: provider.price.amountMinor,
          ...(provider.price.unit === undefined ? {} : { unit: provider.price.unit }),
          taxTreatment: provider.price.taxTreatment ?? 'unstated',
        },
        accessPaths: provider.endpoints.map((endpoint) => ({
          kind: 'external_operation',
          url: endpoint.url,
          ...(endpoint.method === undefined ? {} : { method: endpoint.method }),
        })),
      }],
    })
    if (result.kind !== 'ok') {
      rejectedProviderRefs.push(provider.id)
      refusals.push({ providerRef: provider.id, reason: 'provider_refused' })
      continue
    }
    quotes.push(toStudyQuote(result.quote, provider))
  }
  return { quotes, rejectedProviderRefs, refusals }
}

export type StudyQuoteScoring = Readonly<{
  score: TopsisResult
  currentQuotes: readonly StudyQuote[]
  excludedQuotes: readonly StudyQuoteExclusion[]
}>

export type StudyQuoteScoringResult =
  | { kind: 'scored'; value: StudyQuoteScoring }
  | { kind: 'error'; code: 'no_fresh_quotes'; excludedQuotes: readonly StudyQuoteExclusion[] }

export function scoreFreshStudyQuotes(input: Readonly<{
  quotes: readonly StudyQuote[]
  charter: StudyCharter
  now: number
}>): StudyQuoteScoringResult {
  const charter = studyCharterSchema.parse(input.charter)
  const currentQuotes: StudyQuote[] = []
  const excludedQuotes: StudyQuoteExclusion[] = []
  for (const rawQuote of input.quotes) {
    const parsed = studyQuoteSchema.safeParse(rawQuote)
    if (!parsed.success) {
      const quoteRef = isRecord(rawQuote) && 'quoteRef' in rawQuote
        && typeof rawQuote.quoteRef === 'string'
        ? rawQuote.quoteRef
        : 'unknown_quote'
      excludedQuotes.push({ quoteRef, reason: 'unknown_evidence' })
      continue
    }
    const quote = parsed.data
    if (quote.evidenceClass === 'ae_sandbox_provider' && quote.environment !== 'MOCK/DEVELOPMENT ONLY') {
      excludedQuotes.push({ quoteRef: quote.quoteRef, reason: 'mock_as_real', evidenceClass: quote.evidenceClass })
    } else if (quote.expiresAt <= input.now) {
      excludedQuotes.push({ quoteRef: quote.quoteRef, reason: 'expired_quote', expiresAt: quote.expiresAt })
    } else {
      currentQuotes.push(quote)
    }
  }
  if (currentQuotes.length === 0) return { kind: 'error', code: 'no_fresh_quotes', excludedQuotes }
  const score = scoreTopsis({
    criteria: charter.wants.map(({ id, label, weight, sense }) => ({
      id,
      label,
      weight,
      sense,
    })),
    alternatives: currentQuotes.map((quote) => ({
      alternativeId: quote.providerSlug,
      label: quote.providerName,
      values: charter.wants.map((criterion) => valueForCriterion(quote, criterion.id, criterion.valueKey)),
    })),
  })
  return { kind: 'scored', value: { score, currentQuotes, excludedQuotes } }
}

export type StudyRunInput = Readonly<{
  studyId: string
  projectId: string
  treeId?: string
  nodeId: string
  charter: StudyCharter
  registryServices: readonly StudyRegistryService[]
  webClaims?: readonly StudyWebClaim[]
  requestedAt: number
  rfxEvents?: readonly RfxEvent[]
  revision?: number
  generation?: number
  treeRevision?: number
  quoteProvider?: StudyQuoteProvider
}>

export type StudyRunResult =
  | {
      kind: 'completed'
      artifact: StudyArtifactWithTopsis
      qualification: StudyQualification
      quoteBatch: StudyQuoteBatch
      events: readonly StudyJournalEvent[]
    }
  | {
      kind: 'failed'
      code: 'no_qualified_providers' | 'no_fresh_quotes'
      qualification: StudyQualification
      quoteBatch: StudyQuoteBatch
      excludedQuotes: readonly StudyQuoteExclusion[]
      events: readonly StudyJournalEvent[]
    }

export function runStudy(input: StudyRunInput): StudyRunResult {
  const charter = studyCharterSchema.parse(input.charter)
  const scan = scanStudySupply({
    registryServices: input.registryServices,
    ...(input.webClaims === undefined ? {} : { webClaims: input.webClaims }),
  })
  const qualification = qualifyStudyProviders(scan, charter)
  const quoteBatch = quoteQualifiedProviders({
    qualification,
    requestedAt: input.requestedAt,
    ...(input.quoteProvider === undefined ? {} : { quoteProvider: input.quoteProvider }),
  })
  const existingJournal = (input.rfxEvents ?? []).filter((event): event is StudyJournalEvent => 'operationKey' in event)
  const generatedEvents = buildStudyJournalEvents({
    studyId: input.studyId,
    projectId: input.projectId,
    ...(input.treeId === undefined ? {} : { treeId: input.treeId }),
    nodeId: input.nodeId,
    generation: input.generation ?? 1,
    revision: input.revision ?? 1,
    ...(input.treeRevision === undefined ? {} : { treeRevision: input.treeRevision }),
    now: input.requestedAt,
    scan,
    qualification,
    quoteBatch,
    includeScanStarted: existingJournal.length === 0,
  })
  const existingKeys = new Set(existingJournal.map((event) => event.operationKey))
  const events = [
    ...existingJournal,
    ...generatedEvents.filter((event) => !existingKeys.has(event.operationKey)),
  ]
  if (qualification.eligibleProviders.length === 0) {
    const refusalEvents = events.some((event) => event.type === 'refused')
      ? events
      : [
          ...events,
          makeJournalEvent({
            type: 'refused',
            operationKey: `${input.studyId}:refused:no_qualified_providers`,
            projectId: input.projectId,
            ...(input.treeId === undefined ? {} : { treeId: input.treeId }),
            nodeId: input.nodeId,
            generation: input.generation ?? 1,
            revision: input.revision ?? 1,
            ...(input.treeRevision === undefined ? {} : { treeRevision: input.treeRevision }),
            timestamp: input.requestedAt,
            evidenceClass: 'published_price',
            code: 'no_qualified_providers',
            reason: 'No registry provider satisfied every hard need.',
          }),
        ]
    return {
      kind: 'failed',
      code: 'no_qualified_providers',
      qualification,
      quoteBatch,
      excludedQuotes: [],
      events: refusalEvents,
    }
  }
  const scoring = scoreFreshStudyQuotes({ quotes: quoteBatch.quotes, charter, now: input.requestedAt })
  if (scoring.kind === 'error') {
    const refusalEvents = events.some((event) => event.type === 'refused')
      ? events
      : [
          ...events,
          makeJournalEvent({
            type: 'refused',
            operationKey: `${input.studyId}:refused:${scoring.code}`,
            projectId: input.projectId,
            ...(input.treeId === undefined ? {} : { treeId: input.treeId }),
            nodeId: input.nodeId,
            generation: input.generation ?? 1,
            revision: input.revision ?? 1,
            ...(input.treeRevision === undefined ? {} : { treeRevision: input.treeRevision }),
            timestamp: input.requestedAt,
            evidenceClass: 'ae_sandbox_provider',
            code: scoring.code,
            reason: 'No fresh, evidence-labelled quote was available for scoring.',
          }),
        ]
    return {
      kind: 'failed',
      code: scoring.code,
      qualification,
      quoteBatch,
      excludedQuotes: scoring.excludedQuotes,
      events: refusalEvents,
    }
  }

  const winner = scoring.value.score.alternatives.find((alternative) => alternative.alternativeId === scoring.value.score.winnerId)
  const winningQuote = scoring.value.currentQuotes.find((quote) => quote.providerSlug === scoring.value.score.winnerId)
  if (winner === undefined || winningQuote === undefined) throw new Error('study_winner_missing')
  const recommendation = {
    alternativeId: winner.alternativeId,
    rationale: `${winningQuote.providerName} has the highest TOPSIS closeness (${winner.closeness.toFixed(3)}).`,
    evidenceRefs: [winningQuote.quoteRef, winningQuote.quoteOrLocator, ...scan.webEvidenceRefs].slice(0, 32),
    evidenceClass: winningQuote.evidenceClass,
    ...(winningQuote.environment === undefined ? {} : { environment: winningQuote.environment }),
  }
  const completedEvents = events.some((event) => event.type === 'recommended')
    ? events
    : [
        ...events,
        makeJournalEvent({
          type: 'scoring_completed',
          operationKey: `${input.studyId}:scoring_completed`,
          projectId: input.projectId,
          ...(input.treeId === undefined ? {} : { treeId: input.treeId }),
          nodeId: input.nodeId,
          generation: input.generation ?? 1,
          revision: input.revision ?? 1,
          ...(input.treeRevision === undefined ? {} : { treeRevision: input.treeRevision }),
          timestamp: input.requestedAt,
          evidenceClass: 'ae_sandbox_provider',
          score: scoring.value.score,
        }),
        makeJournalEvent({
          type: 'recommended',
          operationKey: `${input.studyId}:recommended:${winner.alternativeId}`,
          projectId: input.projectId,
          ...(input.treeId === undefined ? {} : { treeId: input.treeId }),
          nodeId: input.nodeId,
          generation: input.generation ?? 1,
          revision: input.revision ?? 1,
          ...(input.treeRevision === undefined ? {} : { treeRevision: input.treeRevision }),
          timestamp: input.requestedAt,
          evidenceClass: winningQuote.evidenceClass,
          recommendation,
        }),
      ]
  const journalReplay = replayStudyJournal(completedEvents)
  const citations = scan.webEvidenceRefs
  const artifact = studyArtifactSchema.parse({
    format: 'ae.study:v1',
    studyId: input.studyId,
    projectId: input.projectId,
    ...(input.treeId === undefined ? {} : { treeId: input.treeId }),
    nodeId: input.nodeId,
    status: 'completed',
    learnings: scan.webClaims.map((claim) => ({
      insight: `${claim.businessName} was found in cited web discovery; it is not a registry provider.`,
      sourceUrl: claim.sourceUrl,
      quoteOrLocator: claim.websiteUrl ?? claim.sourceUrl,
      qualityScore: 0.5,
      observedAt: input.requestedAt,
      expiresAt: input.requestedAt,
      revision: input.revision ?? 1,
      evidenceClass: 'web_discovery',
    })),
    citations,
    followUpQuestions: [],
    quoteOrLocator: winningQuote.quoteOrLocator,
    qualityScore: winner.closeness,
    observedAt: input.requestedAt,
    expiresAt: getTime(min(scoring.value.currentQuotes.map((quote) => quote.expiresAt))),
    revision: input.revision ?? 1,
    evidenceClass: winningQuote.evidenceClass,
    environment: 'MOCK/DEVELOPMENT ONLY',
    quotes: scoring.value.currentQuotes,
    topsis: scoring.value.score,
    recommendation,
    excludedQuotes: scoring.value.excludedQuotes,
    rfxState: journalReplay.state,
  }) as StudyArtifactWithTopsis
  return {
    kind: 'completed',
    artifact,
    qualification,
    quoteBatch,
    events: completedEvents,
  }
}

type WithoutDigest<Event> = Event extends unknown ? Omit<Event, 'digest'> : never
type UnsignedStudyJournalEvent = WithoutDigest<StudyJournalEvent>
export function buildStudyJournalEvents(input: Readonly<{
  studyId: string
  projectId: string
  treeId?: string
  nodeId: string
  generation: number
  revision: number
  treeRevision?: number
  now: number
  scan: StudyScan
  qualification: StudyQualification
  quoteBatch: StudyQuoteBatch
  includeScanStarted?: boolean
}>): readonly StudyJournalEvent[] {
  const events: StudyJournalEvent[] = []
  const base = {
    projectId: input.projectId,
    ...(input.treeId === undefined ? {} : { treeId: input.treeId }),
    nodeId: input.nodeId,
    generation: input.generation,
    revision: input.revision,
    ...(input.treeRevision === undefined ? {} : { treeRevision: input.treeRevision }),
    timestamp: input.now,
  }
  if (input.includeScanStarted !== false) {
    events.push(makeJournalEvent({
      type: 'scan_started',
      ...base,
      operationKey: `${input.studyId}:scan_started`,
      evidenceClass: 'published_price',
    }))
  }
  for (const provider of input.scan.providers) {
    events.push(makeJournalEvent({
      type: 'candidate_observed',
      ...base,
      operationKey: `${input.studyId}:candidate_observed:${provider.id}`,
      evidenceClass: 'published_price',
      candidateRef: provider.id,
      providerSlug: provider.business.slug,
      details: { category: provider.category, revision: provider.revision },
    }))
  }
  for (const excluded of input.qualification.excluded) {
    events.push(makeJournalEvent({
      type: 'candidate_quarantined',
      ...base,
      operationKey: `${input.studyId}:candidate_quarantined:${excluded.providerRef}`,
      evidenceClass: 'published_price',
      candidateRef: excluded.providerRef,
      reasons: [...excluded.reasons],
    }))
  }
  for (const claim of input.scan.webClaims) {
    events.push(makeJournalEvent({
      type: 'candidate_quarantined',
      ...base,
      operationKey: `${input.studyId}:candidate_quarantined:web:${claim.sourceUrl}`,
      evidenceClass: 'web_discovery',
      candidateRef: `web:${claim.sourceUrl}`,
      reasons: ['web_discovery_only'],
    }))
  }
  const quoteByProvider = new Map(input.quoteBatch.quotes.map((quote) => [quote.providerSlug, quote]))
  for (const provider of input.qualification.eligibleProviders) {
    events.push(makeJournalEvent({
      type: 'quote_requested',
      ...base,
      operationKey: `${input.studyId}:quote_requested:${provider.id}`,
      evidenceClass: 'ae_sandbox_provider',
      quoteRef: quoteByProvider.get(provider.business.slug)?.quoteRef ?? `quote:${provider.id}`,
      providerRef: provider.id,
    }))
  }
  for (const quote of input.quoteBatch.quotes) {
    events.push(makeJournalEvent({
      type: 'quote_received',
      ...base,
      operationKey: `${input.studyId}:quote_received:${quote.quoteRef}`,
      evidenceClass: quote.evidenceClass,
      quoteRef: quote.quoteRef,
      quote,
    }))
  }
  for (const refusal of input.quoteBatch.refusals) {
    if (refusal.reason === 'provider_unknown') {
      events.push(makeJournalEvent({
        type: 'quote_unknown',
        ...base,
        operationKey: `${input.studyId}:quote_unknown:${refusal.providerRef}`,
        evidenceClass: 'ae_sandbox_provider',
        quoteRef: `quote:${refusal.providerRef}`,
        providerRef: refusal.providerRef,
        reason: refusal.reason,
      }))
      continue
    }
    events.push(makeJournalEvent({
      type: 'quote_refused',
      ...base,
      operationKey: `${input.studyId}:quote_refused:${refusal.providerRef}`,
      evidenceClass: 'ae_sandbox_provider',
      quoteRef: `quote:${refusal.providerRef}`,
      providerRef: refusal.providerRef,
      reason: refusal.reason,
    }))
  }
  const expiredQuotes = input.quoteBatch.quotes.filter((quote) => quote.expiresAt <= input.now)
  for (const quote of expiredQuotes) {
    events.push(makeJournalEvent({
      type: 'quote_expired',
      ...base,
      operationKey: `${input.studyId}:quote_expired:${quote.quoteRef}`,
      evidenceClass: quote.evidenceClass,
      quoteRef: quote.quoteRef,
      expiresAt: quote.expiresAt,
    }))
  }
  return events
}

export function makeJournalEvent(input: UnsignedStudyJournalEvent): StudyJournalEvent {
  const digest = canonicalDigest(input)
  return studyJournalEventSchema.parse({ ...input, digest })
}

function hardNeedFailure(
  provider: StudyRegistryService,
  need: StudyHardNeed,
): StudyQualification['excluded'][number]['reasons'] {
  switch (need.kind) {
    case 'category':
      return need.values.some((value) => provider.category.toLowerCase() === value.toLowerCase()) ? [] : ['category']
    case 'location': {
      const target = need.value.toLowerCase()
      const location = `${provider.business.suburb ?? ''} ${provider.business.stateTerritory ?? ''}`.toLowerCase()
      return location.includes(target) ? [] : ['location']
    }
    case 'fixed_price':
      return provider.price?.kind === 'fixed' && provider.price.amountMinor !== undefined ? [] : ['fixed_price']
    case 'open_quote':
      return provider.endpoints.some((endpoint) => endpoint.access === 'open') ? [] : ['open_quote']
    case 'price_ceiling':
      return provider.price?.kind === 'fixed' && provider.price.amountMinor !== undefined && provider.price.amountMinor <= need.maxMinor
        ? []
        : ['price_ceiling']
  }
}

function valueForCriterion(
  quote: StudyQuote,
  criterionId: string,
  valueKey: StudyCharter['wants'][number]['valueKey'],
): number {
  switch (valueKey) {
    case 'priceMinor':
      return quote.price.amountMinor
    case 'qualityScore':
      return quote.qualityScore
    case 'availabilityEpochMs': {
      const value = getTime(parseISO(quote.nextAvailable))
      if (!Number.isFinite(value)) throw new Error(`study_availability_invalid:${criterionId}`)
      return value
    }
    case 'categoryMatch':
      return quote.metrics?.[criterionId] ?? 1
  }
}

function categoryForProvider(category: string): CategoryQuoteCategory | undefined {
  const normalized = category.trim().toLowerCase()
  if (normalized.includes('photograph')) return 'photographer'
  if (normalized.includes('funeral')) return 'funeral'
  if (normalized.includes('dent')) return 'dentist'
  return undefined
}

function toStudyQuote(quote: CategoryQuote, provider: StudyRegistryService): StudyQuote {
  return {
    quoteRef: `${quote.category}:${quote.slug}:${quote.quotedAt}`,
    providerSlug: provider.business.slug,
    providerName: provider.business.name,
    category: quote.category,
    service: quote.service,
    price: {
      currency: quote.price.currency,
      amountMinor: quote.price.amountMinor,
    },
    nextAvailable: quote.nextAvailable,
    quotedAt: quote.quotedAt,
    validUntil: quote.validUntil,
    quoteOrLocator: `/api/sandbox/${quote.category}/${quote.slug}/quote`,
    qualityScore: 1,
    observedAt: getTime(parseISO(quote.quotedAt)),
    expiresAt: getTime(parseISO(quote.validUntil)),
    revision: provider.revision,
    evidenceClass: 'ae_sandbox_provider',
    environment: 'MOCK/DEVELOPMENT ONLY',
  }
}

function toStudyRegistryService(service: PublicServicesApiPage['services'][number]): StudyRegistryService {
  return {
    id: service.id,
    revision: service.revision,
    business: service.business,
    name: service.name,
    category: service.category,
    summary: service.summary,
    ...(service.price === undefined ? {} : { price: service.price }),
    endpoints: service.endpoints.map((endpoint) => ({
      url: endpoint.url,

      access: endpoint.access,
      provenance: endpoint.provenance,
      name: endpoint.name,
      summary: endpoint.summary,
    })),
    ...(service.observedAt === undefined ? {} : { observedAt: service.observedAt }),
    links: service.links,
  }
}
