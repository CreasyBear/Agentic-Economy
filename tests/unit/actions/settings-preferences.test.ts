import { describe, expect, it } from 'vitest'

import { findAction } from '@/modules/actions'

describe('settings.updateNotificationPreferences action', () => {
  it('is not registered after hosted inquiry retirement', () => {
    expect(findAction('settings.updateNotificationPreferences')).toBeUndefined()
  })
})
