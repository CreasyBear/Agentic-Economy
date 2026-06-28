import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

const unavailableResult = {
  kind: 'error' as const,
  code: 'discovery_manifest_unavailable' as const,
  retryable: false,
  reason: 'Convex discovery functions require generated deployment wiring before source-state access.',
}

const errorReturn = v.object({
  kind: v.literal('error'),
  code: v.literal('discovery_manifest_unavailable'),
  retryable: v.boolean(),
  reason: v.string(),
})

export const regenerateDiscoveryManifest = mutationGeneric({
  args: {
    businessId: v.optional(v.string()),
    slug: v.optional(v.string()),
  },
  returns: errorReturn,
  handler: async () => unavailableResult,
})

export const invalidateDiscoveryManifest = mutationGeneric({
  args: {
    businessId: v.string(),
    reasonCode: v.string(),
  },
  returns: errorReturn,
  handler: async () => unavailableResult,
})

export const readDiscoveryHealth = queryGeneric({
  args: {
    businessId: v.string(),
  },
  returns: errorReturn,
  handler: async () => unavailableResult,
})

export type {
  DiscoveryHealthReadback,
  DiscoveryManifestAttemptContract,
  DiscoveryManifestContract,
  DiscoveryPathKind,
  DiscoverySourceState,
  DiscoveryStatus,
  InvalidateDiscoveryManifestResult,
  RegenerateDiscoveryManifestResult,
} from '../src/modules/discovery/public'
