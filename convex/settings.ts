import type { Auth } from 'convex/server'
import { v } from 'convex/values'

import { resolveBusinessActor } from './authz'
import type { Doc, Id } from './_generated/dataModel'
import { env, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'

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

type SettingsCtx = {
  db: QueryCtx['db'] | MutationCtx['db']
  auth: Auth
}

type CurrentOwnerResult =
  | { kind: 'allowed'; ownerId: Id<'owners'> }
  | { kind: 'denied'; reason: 'missing_auth' | 'owner_not_found' }

export const readCurrentOwnerNotificationPreferences = query({
  args: {},
  returns: ownerNotificationPreferencesReadResult,
  handler: async (ctx) => {
    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return ownerSettingsError(owner.reason)
    }

    const preferences: Doc<'ownerNotificationPreferences'> | null = await ctx.db
      .query('ownerNotificationPreferences')
      .withIndex('by_ownerId', (query) => query.eq('ownerId', owner.ownerId))
      .unique()
    return {
      kind: 'ok' as const,
      code: 'owner_notification_preferences_read' as const,
      ownerId: owner.ownerId,
      preferences: preferences === null
        ? { newInquiryEmailEnabled: true }
        : {
            newInquiryEmailEnabled: preferences.newInquiryEmailEnabled,
            updatedAt: preferences.updatedAt,
          },
    }
  },
})

export const setCurrentOwnerNotificationPreferences = mutation({
  args: {
    newInquiryEmailEnabled: v.boolean(),
  },
  returns: ownerNotificationPreferencesMutationResult,
  handler: async (ctx, args) => {
    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return ownerSettingsError(owner.reason)
    }

    const now = Date.now()
    const existing: Doc<'ownerNotificationPreferences'> | null = await ctx.db
      .query('ownerNotificationPreferences')
      .withIndex('by_ownerId', (query) => query.eq('ownerId', owner.ownerId))
      .unique()
    if (existing === null) {
      await ctx.db.insert('ownerNotificationPreferences', {
        ownerId: owner.ownerId,
        newInquiryEmailEnabled: args.newInquiryEmailEnabled,
        createdAt: now,
        updatedAt: now,
      })
    } else {
      await ctx.db.patch(existing._id, {
        newInquiryEmailEnabled: args.newInquiryEmailEnabled,
        updatedAt: now,
      })
    }

    return {
      kind: 'ok' as const,
      code: 'owner_notification_preferences_updated' as const,
      ownerId: owner.ownerId,
      preferences: {
        newInquiryEmailEnabled: args.newInquiryEmailEnabled,
        updatedAt: now,
      },
    }
  },
})


async function readCurrentOwner(ctx: SettingsCtx): Promise<CurrentOwnerResult> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'denied', reason: 'missing_auth' }
  }

  const owner = await ctx.db
    .query('owners')
    .withIndex('by_clerkUserId', (query) => query.eq('clerkUserId', actor.clerkUserId))
    .unique()

  return owner === null ? { kind: 'denied', reason: 'owner_not_found' } : { kind: 'allowed', ownerId: owner._id }
}



function ownerSettingsError(reason: 'missing_auth' | 'owner_not_found') {
  return {
    kind: 'error' as const,
    code: reason,
    retryable: false,
    reason,
  }
}


