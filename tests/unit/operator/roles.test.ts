import { describe, expect, it } from 'vitest'

import { ownerWorkspaceOwnerForPath } from '@/lib/operator/roles'

describe('ownerWorkspaceOwnerForPath (W-12)', () => {
  it('R1: /owner/workspace resolves to workspace', () => {
    expect(ownerWorkspaceOwnerForPath('/owner/workspace')).toBe('workspace')
  })

  it('R2: /owner/workspace/general resolves to workspace', () => {
    expect(ownerWorkspaceOwnerForPath('/owner/workspace/general')).toBe('workspace')
  })

  it('R2b: /owner/team resolves to team', () => {
    expect(ownerWorkspaceOwnerForPath('/owner/team')).toBe('team')
  })

  it('R2c: /owner/team/ resolves to team', () => {
    expect(ownerWorkspaceOwnerForPath('/owner/team/')).toBe('team')
  })

  it('R3: /owner/settings resolves to account', () => {
    expect(ownerWorkspaceOwnerForPath('/owner/settings')).toBe('account')
  })

  it('R4: /owner/operations resolves to operations', () => {
    expect(ownerWorkspaceOwnerForPath('/owner/operations')).toBe('operations')
  })

  it('R5: /owner/supply resolves to operations', () => {
    expect(ownerWorkspaceOwnerForPath('/owner/supply')).toBe('operations')
  })

  it('R6: /owner/credit is undefined', () => {
    expect(ownerWorkspaceOwnerForPath('/owner/credit')).toBeUndefined()
  })
})
