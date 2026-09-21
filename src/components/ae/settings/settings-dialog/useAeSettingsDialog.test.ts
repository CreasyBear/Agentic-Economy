import { describe, expect, it } from 'vitest'

import { isOnOwnerSettingsPath } from '@/components/ae/settings/settings-dialog/useAeSettingsDialog'

describe('isOnOwnerSettingsPath', () => {
  it('matches owner settings routes', () => {
    expect(isOnOwnerSettingsPath('/owner/settings')).toBe(true)
    expect(isOnOwnerSettingsPath('/owner/settings/connections')).toBe(true)
    expect(isOnOwnerSettingsPath('/owner/team')).toBe(true)
    expect(isOnOwnerSettingsPath('/owner/workspace')).toBe(true)
  })

  it('does not match task routes', () => {
    expect(isOnOwnerSettingsPath('/market')).toBe(false)
    expect(isOnOwnerSettingsPath('/t/new')).toBe(false)
  })
})
