import { useCallback } from 'react'
import { useMutation, useQuery } from 'convex/react'

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferencePatch,
} from '@/modules/principal-account/notification-preferences.view-model'
import { api } from '../../../../convex/_generated/api'

import type { UseOwnerNotificationPreferencesResult } from './owner-settings.contracts'

export function useOwnerNotificationPreferences(): UseOwnerNotificationPreferencesResult {
  const persisted = useQuery(api.notifications.readPreferences)
  const updatePreferences = useMutation(api.notifications.updatePreferences)

  const update = useCallback(async (patch: NotificationPreferencePatch) => {
    const commandRef = crypto.randomUUID()
    await updatePreferences({
      ...patch,
      correlationRef: `ui:notification-preferences:${commandRef}`,
      idempotencyRef: `idem:notification-preferences:${commandRef}`,
    })
  }, [updatePreferences])

  return {
    preferences: persisted ?? DEFAULT_NOTIFICATION_PREFERENCES,
    loading: persisted === undefined,
    update,
  }
}
