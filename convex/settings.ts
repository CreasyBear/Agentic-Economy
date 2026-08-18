import { v } from 'convex/values'

import { unlistedRetiredListedTables } from './retiredListedUnlisted'
import { env, mutation, query } from './_generated/server'

const releaseIdentityResult = v.union(
  v.object({
    kind: v.literal('ok'),
    sourceRevision: v.string(),
  }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.literal('source_revision_unconfigured'),
  }),
)

export const readReleaseIdentity = query({
  args: {},
  returns: releaseIdentityResult,
  handler: async () => {
    const sourceRevision = env.AE_RELEASE_SOURCE_REVISION?.trim()
    return sourceRevision !== undefined && /^[a-f0-9]{40}$/u.test(sourceRevision)
      ? { kind: 'ok' as const, sourceRevision }
      : { kind: 'unavailable' as const, reason: 'source_revision_unconfigured' as const }
  },
})

const ownerNotificationPreferences = v.object({
  newInquiryEmailEnabled: v.boolean(),
  updatedAt: v.optional(v.number()),
})

const ownerNotificationPreferencesReadResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.literal('owner_notification_preferences_read'),
    ownerId: v.string(),
    preferences: ownerNotificationPreferences,
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(v.literal('missing_auth'), v.literal('owner_not_found')),
    retryable: v.boolean(),
    reason: v.string(),
  }),
)

const ownerNotificationPreferencesMutationResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.literal('owner_notification_preferences_updated'),
    ownerId: v.string(),
    preferences: v.object({
      newInquiryEmailEnabled: v.boolean(),
      updatedAt: v.number(),
    }),
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(v.literal('missing_auth'), v.literal('owner_not_found')),
    retryable: v.boolean(),
    reason: v.string(),
  }),
)

export const readCurrentOwnerNotificationPreferences = query({
  args: {},
  returns: ownerNotificationPreferencesReadResult,
  handler: async () => unlistedRetiredListedTables(),
})

export const setCurrentOwnerNotificationPreferences = mutation({
  args: {
    newInquiryEmailEnabled: v.boolean(),
  },
  returns: ownerNotificationPreferencesMutationResult,
  handler: async () => unlistedRetiredListedTables(),
})


