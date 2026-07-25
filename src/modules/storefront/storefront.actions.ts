import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'
import type {
  BusinessEnrichmentInput,
  BusinessEnrichmentResult,
  StorefrontImportInput,
  StorefrontImportResult,
} from '@/modules/storefront/public'

const storefrontImportDraftInputSchema = z.object({
  websiteUrl: z.string().trim().url().max(500).describe('Business website URL to import into an owner-reviewed draft'),
  abn: z.string().trim().max(40).optional().describe('Optional ABN supplied by the owner for review'),
}) as z.ZodType<StorefrontImportInput>

const importedFactOutputSchema = z.object({
  field: z.string(),
  label: z.string(),
  value: z.string(),
  sourceLabel: z.literal('imported-from-website'),
  confirmation: z.literal('unconfirmed'),
  evidenceRef: z.string(),
})

const ownerClaimDraftProfileSchema = z.object({
  businessName: z.string(),
  category: z.string(),
  suburb: z.string(),
  stateTerritory: z.string(),
  requestedSlug: z.string(),
  ownerMessage: z.string(),
  sourceLabel: z.string(),
  serviceName: z.string(),
  serviceCategory: z.string(),
  serviceSummary: z.string(),
  serviceArea: z.string(),
  hoursOrUnknown: z.string(),
  photoUrl: z.string(),
  responseTimeMinutes: z.string(),
  firstRequestMode: z.enum(['inquiry_available', 'quote_request_available', 'not_available_yet']),
  publicDisclosure: z.string(),
  noContactReason: z.string(),
})

const storefrontImportDraftOutputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ok'),
    draft: z.object({
      kind: z.literal('draft'),
      schemaVersion: z.literal('storefront-import-draft:v1'),
      status: z.literal('draft_unconfirmed'),
      profile: ownerClaimDraftProfileSchema,
      facts: z.array(importedFactOutputSchema),
      source: z.object({
        kind: z.literal('website'),
        url: z.string(),
        label: z.literal('imported-from-website'),
        confirmation: z.literal('unconfirmed'),
      }),
      boundaryStatement: z.string(),
    }),
  }),
  z.object({
    kind: z.literal('error'),
    code: z.enum(['storefront_import_invalid_url', 'storefront_import_fetch_failed', 'storefront_import_no_facts']),
    retryable: z.boolean(),
    reason: z.string(),
  }),
]) as z.ZodType<StorefrontImportResult>

const importDraftParameters: readonly ActionParameter[] = [
  {
    name: 'websiteUrl',
    type: 'string',
    description: 'Business website URL to read into an owner-reviewed draft.',
    required: true,
  },
  {
    name: 'abn',
    type: 'string',
    description: 'Optional ABN supplied by the owner for review. It is not published by the import action.',
    required: false,
  },
]

export const storefrontImportDraftAction = defineAction({
  id: 'storefront.importDraft',
  name: 'Import a service page draft',
  summary:
    'Read a business website into an owner-reviewed draft service page. The draft is not published until the owner confirms and submits it through the claim flow.',
  boundaries: [
    'Creates a draft only; it does not publish a service page.',
    'Every imported fact is labeled imported-from-website and unconfirmed until the owner reviews it.',
    'Does not book, charge, dispatch, or auto-fulfil. The inquiry affordance remains owner-reviewed first contact only.',
    'Owner authentication is required by the UI and HTTP surfaces that invoke this action.',
  ],
  schema: storefrontImportDraftInputSchema,
  outputSchema: storefrontImportDraftOutputSchema,
  parameters: importDraftParameters,
  readOnly: false,
  surfaces: ['ui', 'http'],
  run: async ({ data }) => {
    const { importStorefrontDraftFromWebsite } = await import('@/modules/storefront/public')
    return importStorefrontDraftFromWebsite(data)
  },
})

const storefrontEnrichInputSchema = z.object({
  businessName: z.string().trim().min(1).max(120).describe('Business name to gather public details for'),
  suburb: z.string().trim().max(80).optional().describe('Optional suburb that narrows the search'),
}) as z.ZodType<BusinessEnrichmentInput>

const enrichedFactOutputSchema = z.object({
  field: z.string(),
  label: z.string(),
  value: z.string(),
  sourceLabel: z.literal('gathered-from-web-search'),
  confirmation: z.literal('unconfirmed'),
  evidenceRef: z.string(),
})

const storefrontEnrichOutputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('draft'),
    draft: z.object({
      kind: z.literal('draft'),
      schemaVersion: z.literal('storefront-import-draft:v1'),
      status: z.literal('draft_unconfirmed'),
      profile: ownerClaimDraftProfileSchema,
      facts: z.array(enrichedFactOutputSchema),
      source: z.object({
        kind: z.literal('web_search'),
        url: z.string(),
        label: z.literal('gathered-from-web-search'),
        confirmation: z.literal('unconfirmed'),
      }),
      boundaryStatement: z.string(),
    }),
  }),
  z.object({ kind: z.literal('unavailable'), reason: z.literal('llm_not_configured') }),
  z.object({
    kind: z.literal('error'),
    code: z.enum(['enrichment_failed', 'enrichment_no_facts']),
    retryable: z.boolean(),
    reason: z.string(),
  }),
]) as z.ZodType<BusinessEnrichmentResult>

const enrichParameters: readonly ActionParameter[] = [
  {
    name: 'businessName',
    type: 'string',
    description: 'Business name to gather public details for.',
    required: true,
  },
  {
    name: 'suburb',
    type: 'string',
    description: 'Optional suburb that narrows the search.',
    required: false,
  },
]

export const storefrontEnrichDraftAction = defineAction({
  id: 'storefront.enrichDraft',
  name: 'Gather a service page draft from a web search',
  summary:
    'Run one web search backed model call to draft owner-reviewed public facts for a named business. The draft is not published until the owner confirms and submits it through the claim flow.',
  boundaries: [
    'Creates a draft only; it does not publish a service page.',
    'Every gathered fact is labeled gathered-from-web-search and unconfirmed until the owner reviews it.',
    'Gathered facts carry the search result URL they came from; a missing citation stays empty rather than invented.',
    'Does not read the business website, book, charge, dispatch, or auto-fulfil.',
    'Owner authentication is required by the UI and HTTP surfaces that invoke this action.',
  ],
  schema: storefrontEnrichInputSchema,
  outputSchema: storefrontEnrichOutputSchema,
  parameters: enrichParameters,
  readOnly: false,
  surfaces: ['ui', 'http'],
  run: async ({ data }) => {
    const [{ enrichBusinessFromWebSearch }, { readAnswerLlmConfig }] = await Promise.all([
      import('@/modules/storefront/public'),
      import('@/modules/answer/internal/llm-config'),
    ])
    return enrichBusinessFromWebSearch(data, readAnswerLlmConfig())
  },
})
