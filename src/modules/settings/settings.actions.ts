import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'
import {
  ownerNotificationPreferencesInputSchema,
  updateOwnerNotificationPreferencesThroughSource,
  type OwnerNotificationPreferencesMutationResult,
} from '@/modules/settings/settings.functions'

const ownerNotificationPreferencesOutputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('ok'),
    code: z.literal('owner_notification_preferences_updated'),
    ownerId: z.string(),
    preferences: z.strictObject({
      newInquiryEmailEnabled: z.boolean(),
      updatedAt: z.number(),
    }),
  }),
  z.strictObject({
    kind: z.literal('error'),
    code: z.enum(['missing_auth', 'owner_not_found', 'missing_convex_url', 'owner_settings_unavailable']),
    retryable: z.boolean(),
    reason: z.string(),
  }),
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
  effect: {
    class: 'external_state_change',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'approve_each',
  },
  surfaces: ['ui', 'http'],
  invocationContract: {
    version: 'settings.updateNotificationPreferences:v1',
    consequenceClass: 'external_effect',
    materialInputPaths: ['newInquiryEmailEnabled'],
    authorityRequirement: 'owner',
    retryClass: 'reconcile_before_retry',
    expectedEvidence: ['owner notification preference update result'],
    safeContinuations: ['inspect the returned owner preference state'],
    invalidationConditions: [
      'notification preference value changes',
      'owner identity or authority changes',
      'action contract version changes',
    ],
    developmentAttemptTimeoutMs: 30_000,
  },
  run: async ({ data }) => updateOwnerNotificationPreferencesThroughSource(data),
})
