import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  callSourceMutation,
  callSourceQuery,
  ConvexSourceError,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import {
  createEmptyOwnerSettingsSourceState,
  readOwnerNotificationPreferences,
  setOwnerNotificationPreferences,
  type OwnerSettingsSourceState,
} from '@/modules/settings/public'
import type { OwnerId } from '@/modules/common/ids'

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

let localOwnerSettingsState: OwnerSettingsSourceState = createEmptyOwnerSettingsSourceState()
const localOwnerId = 'owner:local-e2e-settings' as OwnerId

export const readOwnerNotificationPreferencesServer = createServerFn()
  .handler(() => readOwnerNotificationPreferencesThroughSource())

export const updateOwnerNotificationPreferencesServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerNotificationPreferencesInputSchema.parse(data))
  .handler(async ({ data }) => updateOwnerNotificationPreferencesThroughSource(data))

export async function readOwnerNotificationPreferencesThroughSource(): Promise<OwnerNotificationPreferencesReadResult> {
  if (isLocalE2EAuthBypassEnabled()) {
    return {
      kind: 'ok',
      code: 'owner_notification_preferences_read',
      ownerId: localOwnerId,
      preferences: readOwnerNotificationPreferences(localOwnerSettingsState, localOwnerId),
    }
  }

  try {
    return await callSourceQuery(readPreferencesQuery, {})
  } catch (error) {
    return ownerSettingsSourceError(error)
  }
}

export async function updateOwnerNotificationPreferencesThroughSource(
  input: OwnerNotificationPreferencesInput,
): Promise<OwnerNotificationPreferencesMutationResult> {
  if (isLocalE2EAuthBypassEnabled()) {
    const result = setOwnerNotificationPreferences(localOwnerSettingsState, {
      ownerId: localOwnerId,
      newInquiryEmailEnabled: input.newInquiryEmailEnabled,
      now: Date.now(),
    })
    localOwnerSettingsState = result.state
    return {
      kind: 'ok',
      code: 'owner_notification_preferences_updated',
      ownerId: localOwnerId,
      preferences: {
        newInquiryEmailEnabled: result.preferences.newInquiryEmailEnabled,
        updatedAt: result.preferences.updatedAt,
      },
    }
  }

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
