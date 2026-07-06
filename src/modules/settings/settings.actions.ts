import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'
import {
  ownerNotificationPreferencesInputSchema,
  updateOwnerNotificationPreferencesThroughSource,
  type OwnerNotificationPreferencesMutationResult,
} from '@/modules/settings/settings.functions'

const ownerNotificationPreferencesOutputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ok'),
    code: z.literal('owner_notification_preferences_updated'),
    ownerId: z.string(),
    preferences: z.object({
      newInquiryEmailEnabled: z.boolean(),
      updatedAt: z.number(),
    }).strict(),
  }).strict(),
  z.object({
    kind: z.literal('error'),
    code: z.enum(['missing_auth', 'owner_not_found', 'missing_convex_url', 'owner_settings_unavailable']),
    retryable: z.boolean(),
    reason: z.string(),
  }).strict(),
]) as z.ZodType<OwnerNotificationPreferencesMutationResult>

const ownerNotificationPreferencesParameters: readonly ActionParameter[] = [
  {
    name: 'newInquiryEmailEnabled',
    type: 'boolean',
    description: 'Whether AE should email the owner when a new written inquiry is recorded.',
    required: true,
  },
]

export const updateOwnerNotificationPreferencesAction = defineAction({
  id: 'settings.updateNotificationPreferences',
  name: 'Update owner notification preferences',
  summary: 'Save the signed-in owner preference for new-inquiry email notifications.',
  boundaries: [
    'Only updates the signed-in owner preference record.',
    'Does not change account identity, business page facts, billing, customer messages, or provider configuration.',
    'Does not promise a notification, owner response, quote, availability, or job acceptance.',
  ],
  schema: ownerNotificationPreferencesInputSchema,
  outputSchema: ownerNotificationPreferencesOutputSchema,
  parameters: ownerNotificationPreferencesParameters,
  readOnly: false,
  surfaces: ['ui', 'http'],
  run: async ({ data }) => updateOwnerNotificationPreferencesThroughSource(data),
})
