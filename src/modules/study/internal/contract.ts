import { z } from 'zod'
import type { OfferingPrice } from '@/modules/catalog/public'

import type { TopsisResult } from './topsis'

export const studyStatusSchema = z.enum(['scanning', 'qualifying', 'quoting', 'scored', 'completed', 'failed'])
export type StudyStatus = z.infer<typeof studyStatusSchema>

export const studyEvidenceClassSchema = z.enum([
  'ae_sandbox_provider',
  'published_price',
  'business_quote',
  'web_discovery',
])
export type StudyEvidenceClass = z.infer<typeof studyEvidenceClassSchema>

export const studyLearningSchema = z.strictObject({
  insight: z.string().min(1),
  sourceUrl: z.url(),
  quoteOrLocator: z.string().min(1).optional(),
  qualityScore: z.number().min(0).max(1),
  observedAt: z.number().int(),
  expiresAt: z.number().int(),
  revision: z.number().int().min(1),
  evidenceClass: studyEvidenceClassSchema,
  environment: z.literal('MOCK/DEVELOPMENT ONLY').optional(),
})
export type StudyLearning = z.infer<typeof studyLearningSchema>

export const studyQuoteSchema = z.strictObject({
  quoteRef: z.string().min(1),
  providerSlug: z.string().min(1),
  providerName: z.string().min(1),
  category: z.string().min(1),
  service: z.string().min(1),
  price: z.strictObject({
    currency: z.string().length(3),
    amountMinor: z.number().int().nonnegative(),
  }),
  nextAvailable: z.iso.datetime(),
  quotedAt: z.iso.datetime(),
  validUntil: z.iso.datetime(),
  quoteOrLocator: z.string().min(1),
  qualityScore: z.number().min(0).max(1),
  observedAt: z.number().int(),
  expiresAt: z.number().int(),
  revision: z.number().int().min(1),
  evidenceClass: z.literal('ae_sandbox_provider'),
  environment: z.literal('MOCK/DEVELOPMENT ONLY').optional(),
  metrics: z.record(z.string(), z.number().finite()).optional(),
})
export type StudyQuote = z.infer<typeof studyQuoteSchema>

export const studyRecommendationSchema = z.strictObject({
  alternativeId: z.string().min(1),
  rationale: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).max(32),
  evidenceClass: studyEvidenceClassSchema.optional(),
  environment: z.literal('MOCK/DEVELOPMENT ONLY').optional(),
})
export type StudyRecommendation = z.infer<typeof studyRecommendationSchema>

export const studyArtifactSchema = z.strictObject({
  format: z.literal('ae.study:v1'),
  studyId: z.string().min(1),
  projectId: z.string().min(1),
  treeId: z.string().min(1).optional(),
  nodeId: z.string().min(1),
  status: studyStatusSchema,
  learnings: z.array(studyLearningSchema).max(64),
  citations: z.array(z.url()).max(128),
  followUpQuestions: z.array(z.string().min(1)).max(32),
  quoteOrLocator: z.string().min(1).optional(),
  qualityScore: z.number().min(0).max(1),
  observedAt: z.number().int(),
  expiresAt: z.number().int(),
  revision: z.number().int().min(1),
  evidenceClass: studyEvidenceClassSchema,
  environment: z.literal('MOCK/DEVELOPMENT ONLY').optional(),
  quotes: z.array(studyQuoteSchema).max(32),
  topsis: z.unknown(),
  recommendation: studyRecommendationSchema.optional(),
  excludedQuotes: z.array(z.strictObject({
    quoteRef: z.string().min(1),
    reason: z.enum(['expired_quote', 'unknown_evidence', 'mock_as_real', 'provider_refused']),
    expiresAt: z.number().int().optional(),
    evidenceClass: studyEvidenceClassSchema.optional(),
  })).max(32),
  rfxState: z.enum(['enquiry', 'tender', 'qualification', 'award']),
})
export type StudyArtifact = z.infer<typeof studyArtifactSchema>

export type StudyArtifactWithTopsis = Omit<StudyArtifact, 'topsis'> & { topsis: TopsisResult }

export const studyCriterionSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  weight: z.number().finite().nonnegative(),
  sense: z.enum(['benefit', 'cost']),
  valueKey: z.enum(['priceMinor', 'qualityScore', 'availabilityEpochMs', 'categoryMatch']),
})
export type StudyCriterion = z.infer<typeof studyCriterionSchema>

export const studyHardNeedSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('category'), values: z.array(z.string().min(1)).min(1).max(16) }),
  z.strictObject({ kind: z.literal('location'), value: z.string().min(1) }),
  z.strictObject({ kind: z.literal('fixed_price') }),
  z.strictObject({ kind: z.literal('open_quote') }),
  z.strictObject({ kind: z.literal('price_ceiling'), maxMinor: z.number().int().nonnegative() }),
])
export type StudyHardNeed = z.infer<typeof studyHardNeedSchema>

export const studyCharterSchema = z.strictObject({
  wants: z.array(studyCriterionSchema).min(1).max(16),
  hardNeeds: z.array(studyHardNeedSchema).max(16),
})
export type StudyCharter = z.infer<typeof studyCharterSchema>

export type StudyRegistryEndpoint = Readonly<{
  url: string
  method?: string
  access: 'open' | 'external'
  provenance?: 'business_declared' | 'publicly_observed'
  name?: string
  summary?: string
}>

export type StudyRegistryService = Readonly<{
  id: string
  revision: number
  business: Readonly<{
    slug: string
    name: string
    suburb?: string
    stateTerritory?: string
  }>
  name: string
  category: string
  summary: string
  price?: Readonly<{
    kind: 'fixed' | 'from' | 'range' | 'quote_only'
    currency: string
    amountMinor?: number
    unit?: OfferingPrice['unit']
    taxTreatment?: OfferingPrice['taxTreatment']
  }>
  endpoints: readonly StudyRegistryEndpoint[]
  observedAt?: number
  links?: Readonly<{ business: string; manifest: string }>
}>

export type StudyWebClaim = Readonly<{
  businessName: string
  suburb: string
  sourceUrl: string
  phone?: string
  websiteUrl?: string
  serviceSummary?: string
}>

export type StudyScan = Readonly<{
  providers: readonly StudyRegistryService[]
  webClaims: readonly StudyWebClaim[]
  webEvidenceRefs: readonly string[]
}>

export type StudyQualificationExclusion = Readonly<{
  providerRef: string
  reasons: readonly ('category' | 'location' | 'fixed_price' | 'open_quote' | 'price_ceiling')[]
}>

export type StudyQualification = Readonly<{
  eligibleProviders: readonly StudyRegistryService[]
  excluded: readonly StudyQualificationExclusion[]
  allowedSlugs: readonly string[]
}>

export type StudyQuoteExclusion = Readonly<{
  quoteRef: string
  reason: 'expired_quote' | 'unknown_evidence' | 'mock_as_real' | 'provider_refused'
  expiresAt?: number
  evidenceClass?: StudyEvidenceClass
}>
