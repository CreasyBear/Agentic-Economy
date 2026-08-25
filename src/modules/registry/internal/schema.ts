import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import { RegistrySearchDocumentSourceVersion } from './schema-values'
import { TrustTierValues } from '@/modules/business/public'
import { businessContext } from '@/modules/business/public'
import { FirstRequestModeValues } from '@/modules/catalog/schema-values'

const currentRegistrySearchDocument = v.object({
  documentId: v.string(),
  schemaVersion: v.literal(RegistrySearchDocumentSourceVersion),
  businessSlug: v.string(),
  offeringRef: v.string(),
  businessName: v.string(),
  name: v.string(),
  category: v.string(),
  categoryKey: v.string(),
  businessContext,
  publicStatus: v.literal('published'),
  trustTier: literalUnion(TrustTierValues),
  firstRequestMode: literalUnion(FirstRequestModeValues),
  placeKeys: v.array(v.string()),
  keywords: v.array(v.string()),
  searchText: v.string(),
  serviceAreaSummary: v.string(),
  sourceHash: v.optional(v.string()),
  generatedHash: v.string(),
  updatedAt: v.number(),
})

export const registryTables = {
  registrySearchDocuments: defineTable(currentRegistrySearchDocument)
    .index('by_documentId', ['documentId'])
    .index('by_business', ['businessSlug'])
    .index('by_offering', ['businessSlug', 'offeringRef'])
    .index('by_publicStatus_updatedAt', ['publicStatus', 'updatedAt'])
    .searchIndex('search_searchText_by_publicStatus', {
      searchField: 'searchText',
      filterFields: ['publicStatus'],
    }),
} as const
