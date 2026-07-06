import type { OwnerId } from '@/modules/common/ids'

export type OwnerNotificationPreferences = {
  newInquiryEmailEnabled: boolean
  updatedAt?: number
}

export type OwnerNotificationPreferenceRecord = OwnerNotificationPreferences & {
  ownerId: OwnerId
  createdAt: number
  updatedAt: number
}

export type OwnerSettingsSourceState = {
  notificationPreferences: readonly OwnerNotificationPreferenceRecord[]
}

export type OwnerNotificationPreferenceCommand = {
  ownerId: OwnerId
  newInquiryEmailEnabled: boolean
  now: number
}

export type OwnerNotificationPreferenceResult = {
  state: OwnerSettingsSourceState
  preferences: OwnerNotificationPreferenceRecord
}

export const defaultOwnerNotificationPreferences: OwnerNotificationPreferences = {
  newInquiryEmailEnabled: true,
}

export function createEmptyOwnerSettingsSourceState(): OwnerSettingsSourceState {
  return { notificationPreferences: [] }
}

export function readOwnerNotificationPreferences(
  state: OwnerSettingsSourceState,
  ownerId: OwnerId,
): OwnerNotificationPreferences {
  const record = state.notificationPreferences.find((candidate) => candidate.ownerId === ownerId)
  return record === undefined
    ? defaultOwnerNotificationPreferences
    : {
        newInquiryEmailEnabled: record.newInquiryEmailEnabled,
        updatedAt: record.updatedAt,
      }
}

export function setOwnerNotificationPreferences(
  state: OwnerSettingsSourceState,
  command: OwnerNotificationPreferenceCommand,
): OwnerNotificationPreferenceResult {
  const existing = state.notificationPreferences.find((candidate) => candidate.ownerId === command.ownerId)
  const preferences: OwnerNotificationPreferenceRecord = {
    ownerId: command.ownerId,
    newInquiryEmailEnabled: command.newInquiryEmailEnabled,
    createdAt: existing?.createdAt ?? command.now,
    updatedAt: command.now,
  }

  return {
    state: {
      notificationPreferences: [
        ...state.notificationPreferences.filter((candidate) => candidate.ownerId !== command.ownerId),
        preferences,
      ],
    },
    preferences,
  }
}
