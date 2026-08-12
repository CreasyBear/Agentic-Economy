import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  callSourceMutation,
  callSourceQuery,
  ConvexSourceError,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'

export const ownerNotificationPreferencesInputSchema = z.strictObject({
  newInquiryEmailEnabled: z.boolean(),
})

export type OwnerNotificationPreferencesInput = z.infer<typeof ownerNotificationPreferencesInputSchema>

export type OwnerNotificationPreferencesReadResult =
  | {
      kind: 'ok'
      code: 'owner_notification_preferences_read'
      ownerId: string
      preferences: {
        newInquiryEmailEnabled: boolean
        updatedAt?: number
      }
    }
  | OwnerNotificationPreferencesErrorResult

export type OwnerNotificationPreferencesMutationResult =
  | {
      kind: 'ok'
      code: 'owner_notification_preferences_updated'
      ownerId: string
      preferences: {
        newInquiryEmailEnabled: boolean
        updatedAt: number
      }
    }
  | OwnerNotificationPreferencesErrorResult

export type OwnerNotificationPreferencesErrorResult = {
  kind: 'error'
  code: 'missing_auth' | 'owner_not_found' | 'missing_convex_url' | 'owner_settings_unavailable'
  retryable: boolean
  reason: string
}

const readPreferencesQuery = sourceQuery<Record<string, never>, OwnerNotificationPreferencesReadResult>(
  'settings:readCurrentOwnerNotificationPreferences',
)

const updatePreferencesMutation = sourceMutation<OwnerNotificationPreferencesInput, OwnerNotificationPreferencesMutationResult>(
  'settings:setCurrentOwnerNotificationPreferences',
)


export const readOwnerNotificationPreferencesServer = createServerFn()
  .handler(() => readOwnerNotificationPreferencesThroughSource())

export const updateOwnerNotificationPreferencesServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerNotificationPreferencesInputSchema.parse(data))
  .handler(async ({ data }) => updateOwnerNotificationPreferencesThroughSource(data))

export async function readOwnerNotificationPreferencesThroughSource(): Promise<OwnerNotificationPreferencesReadResult> {

  try {
    return await callSourceQuery(readPreferencesQuery, {})
  } catch (error) {
    return ownerSettingsSourceError(error)
  }
}

export async function updateOwnerNotificationPreferencesThroughSource(
  input: OwnerNotificationPreferencesInput,
): Promise<OwnerNotificationPreferencesMutationResult> {

  try {
    return await callSourceMutation(updatePreferencesMutation, input)
  } catch (error) {
    return ownerSettingsSourceError(error)
  }
}

function ownerSettingsSourceError(error: unknown): OwnerNotificationPreferencesErrorResult {
  if (error instanceof ConvexSourceError) {
    return {
      kind: 'error',
      code: error.code,
      retryable: error.code === 'missing_convex_url',
      reason: error.message,
    }
  }

  return {
    kind: 'error',
    code: 'owner_settings_unavailable',
    retryable: true,
    reason: 'Owner settings could not be read right now.',
  }
}
