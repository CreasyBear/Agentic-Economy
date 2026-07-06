import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { resolveBusinessActor } from './authz'
import { runtimeDb, type RuntimeAuth, type RuntimeDb, type RuntimeDocument } from './source_state'

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

type RuntimeCtx = {
  db: object
  auth: RuntimeAuth
}

type CurrentOwnerResult =
  | { kind: 'allowed'; ownerId: string }
  | { kind: 'denied'; reason: 'missing_auth' | 'owner_not_found' }

export const readCurrentOwnerNotificationPreferences = queryGeneric({
  args: {},
  returns: ownerNotificationPreferencesReadResult,
  handler: async (ctx) => {
    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return ownerSettingsError(owner.reason)
    }

    const preferences = await readPreferencesDocument(runtimeDb(ctx.db), owner.ownerId)
    return {
      kind: 'ok' as const,
      code: 'owner_notification_preferences_read' as const,
      ownerId: owner.ownerId,
      preferences: preferences === null
        ? { newInquiryEmailEnabled: true }
        : {
            newInquiryEmailEnabled: booleanField(preferences, 'newInquiryEmailEnabled'),
            updatedAt: numberField(preferences, 'updatedAt'),
          },
    }
  },
})

export const setCurrentOwnerNotificationPreferences = mutationGeneric({
  args: {
    newInquiryEmailEnabled: v.boolean(),
  },
  returns: ownerNotificationPreferencesMutationResult,
  handler: async (ctx, args) => {
    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return ownerSettingsError(owner.reason)
    }

    const db = runtimeDb(ctx.db)
    const now = Date.now()
    const existing = await readPreferencesDocument(db, owner.ownerId)
    if (existing === null) {
      await db.insert('ownerNotificationPreferences', {
        ownerId: owner.ownerId,
        newInquiryEmailEnabled: args.newInquiryEmailEnabled,
        createdAt: now,
        updatedAt: now,
      })
    } else {
      await db.patch(existing._id, {
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


async function readCurrentOwner(ctx: RuntimeCtx): Promise<CurrentOwnerResult> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'denied', reason: 'missing_auth' }
  }

  const owner = await runtimeDb(ctx.db)
    .query('owners')
    .withIndex('by_clerkUserId', (query) => query.eq('clerkUserId', actor.clerkUserId))
    .unique()

  return owner === null ? { kind: 'denied', reason: 'owner_not_found' } : { kind: 'allowed', ownerId: owner._id }
}

async function readPreferencesDocument(db: RuntimeDb, ownerId: string): Promise<RuntimeDocument | null> {
  return db
    .query('ownerNotificationPreferences')
    .withIndex('by_ownerId', (query) => query.eq('ownerId', ownerId))
    .unique()
}


function ownerSettingsError(reason: 'missing_auth' | 'owner_not_found') {
  return {
    kind: 'error' as const,
    code: reason,
    retryable: false,
    reason,
  }
}

function booleanField(document: RuntimeDocument, field: string): boolean {
  return document[field] === true
}

function numberField(document: RuntimeDocument, field: string): number {
  const value = document[field]
  return typeof value === 'number' ? value : 0
}

