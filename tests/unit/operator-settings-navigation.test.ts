import { describe, expect, it } from 'vitest'

import { ownerSettingsChrome } from '@/lib/operator/settings-navigation'
import { ownerWorkspaceOwnerForPath } from '@/lib/operator/navigation'

describe('owner account settings', () => {
  it('keeps account-owned chrome free of supplier and money language', () => {
    expect(ownerSettingsChrome).toEqual({
      title: 'Account & security',
      description: 'Profile, authentication, sessions, recovery, and security.',
    })
  })

  it('does not claim supplier compatibility routes as account settings', () => {
    expect(ownerWorkspaceOwnerForPath('/owner/settings')).toBe('account')
    expect(ownerWorkspaceOwnerForPath('/owner/settings/connections')).toBe('operations')
    expect(ownerWorkspaceOwnerForPath('/owner/settings/payouts')).toBe('operations')
    expect(ownerWorkspaceOwnerForPath('/owner/settings/developers')).toBe('agent-setup')
    expect(ownerWorkspaceOwnerForPath('/owner/settings/unknown')).toBeUndefined()
  })
})
