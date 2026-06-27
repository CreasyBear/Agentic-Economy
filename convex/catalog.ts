import { mutationGeneric } from 'convex/server'
import { v } from 'convex/values'

export const publishBusinessCatalog = mutationGeneric({
  args: {
    claimId: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
    csrfToken: v.optional(v.string()),
    csrfCookie: v.optional(v.string()),
    origin: v.optional(v.string()),
    services: v.array(
      v.object({
        name: v.string(),
        category: v.string(),
        summary: v.string(),
        serviceArea: v.string(),
        hoursOrUnknown: v.string(),
        firstRequest: v.object({
          mode: v.union(v.literal('inquiry_available'), v.literal('quote_request_available'), v.literal('not_available_yet')),
          publicDisclosure: v.optional(v.string()),
          publicChannel: v.union(v.literal('public_business_contact'), v.literal('ae_status_only'), v.literal('not_available')),
          noContactReason: v.optional(v.string()),
        }),
      })
    ),
  },
  returns: v.object({
    kind: v.literal('error'),
    code: v.literal('catalog_publish_unauthenticated'),
    retryable: v.boolean(),
    reason: v.string(),
  }),
  handler: async () => ({
    kind: 'error' as const,
    code: 'catalog_publish_unauthenticated' as const,
    retryable: false,
    reason: 'Convex publish mutations require generated auth wiring in the deployment boundary.',
  }),
})

export type {
  PublicCatalogContract,
  PublicFirstRequestDisclosure,
  PublicServiceContract,
  ServiceCapabilityContract,
  PublishBusinessCatalogCommand,
  PublishBusinessCatalogResult,
} from '../src/modules/catalog/public'
