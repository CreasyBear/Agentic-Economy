import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const settingsTables = {
  ownerNotificationPreferences: defineTable({
    ownerId: v.id('owners'),
    newInquiryEmailEnabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_ownerId', ['ownerId']),
} as const
