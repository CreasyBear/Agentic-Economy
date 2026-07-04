import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'
import {
  importStorefrontDraftFromWebsite,
  type StorefrontImportInput,
  type StorefrontImportResult,
} from '@/modules/storefront/public'

export const storefrontImportDraftInputSchema = z.object({
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

export const storefrontImportDraftOutputSchema = z.discriminatedUnion('kind', [
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
  readOnly: true,
  surfaces: ['ui', 'http'],
  run: async ({ data }) => importStorefrontDraftFromWebsite(data),
})
