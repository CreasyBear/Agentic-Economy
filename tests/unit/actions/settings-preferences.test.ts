import { describe, expect, it } from 'vitest'

import { findAction, listAgentToolActions } from '@/modules/actions'
import type { OwnerId } from '@/modules/common/ids'
import {
  createEmptyOwnerSettingsSourceState,
  readOwnerNotificationPreferences,
  setOwnerNotificationPreferences,
} from '@/modules/settings/public'

describe('settings.updateNotificationPreferences action', () => {
  it('is registered for UI/HTTP surfaces but not agent tools', () => {
    const action = findAction('settings.updateNotificationPreferences')

    expect(action).toBeDefined()
    expect(action?.readOnly).toBe(false)
    expect(action?.surfaces).toEqual(['ui', 'http'])
    expect(action?.parameters.map((parameter) => parameter.name)).toEqual(['newInquiryEmailEnabled'])
    expect(listAgentToolActions().map((candidate) => candidate.id)).not.toContain('settings.updateNotificationPreferences')
  })

  it('defaults new-inquiry email on for an owner without preferences', () => {
    const ownerId = 'owner:settings-test' as OwnerId
    const preferences = readOwnerNotificationPreferences(createEmptyOwnerSettingsSourceState(), ownerId)

    expect(preferences).toEqual({ newInquiryEmailEnabled: true })
  })

  it('persists a toggle in the owner settings source state', () => {
    const ownerId = 'owner:settings-test' as OwnerId
    const initialState = createEmptyOwnerSettingsSourceState()

    const disabled = setOwnerNotificationPreferences(initialState, {
      ownerId,
      newInquiryEmailEnabled: false,
      now: 100,
    })
    const enabled = setOwnerNotificationPreferences(disabled.state, {
      ownerId,
      newInquiryEmailEnabled: true,
      now: 200,
    })

    expect(readOwnerNotificationPreferences(disabled.state, ownerId)).toEqual({
      newInquiryEmailEnabled: false,
      updatedAt: 100,
    })
    expect(readOwnerNotificationPreferences(enabled.state, ownerId)).toEqual({
      newInquiryEmailEnabled: true,
      updatedAt: 200,
    })
    expect(enabled.preferences.createdAt).toBe(100)
  })
})
