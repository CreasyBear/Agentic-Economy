import { describe, expect, it } from 'vitest'

import {
  ownerBuyerOperatorSurfaceForPath,
  ownerWorkspaceOwnerForPath,
  shouldMountOperatorSidebar,
} from '@/lib/operator/roles'

describe('ownerBuyerOperatorSurfaceForPath (DS-37)', () => {
  it('treats activity, call receipts, agent access, and owner workspace as buyer header surfaces', () => {
    expect(ownerBuyerOperatorSurfaceForPath('/activity')).toBe(true)
    expect(ownerBuyerOperatorSurfaceForPath('/activity/')).toBe(true)
    expect(ownerBuyerOperatorSurfaceForPath('/calls')).toBe(true)
    expect(ownerBuyerOperatorSurfaceForPath('/calls/')).toBe(true)
    expect(ownerBuyerOperatorSurfaceForPath('/calls/call_test_123')).toBe(true)
    expect(ownerBuyerOperatorSurfaceForPath('/agent-access')).toBe(true)
    expect(ownerBuyerOperatorSurfaceForPath('/owner')).toBe(true)
    expect(ownerBuyerOperatorSurfaceForPath('/owner/credit')).toBe(true)
  })

  it('does not treat admin or developer routes as buyer surfaces', () => {
    expect(ownerBuyerOperatorSurfaceForPath('/admin')).toBe(false)
    expect(ownerBuyerOperatorSurfaceForPath('/developers/discovery')).toBe(false)
  })

  it('keeps call receipts off the owner workspace sidebar', () => {
    expect(shouldMountOperatorSidebar('owner', '/calls/call_test_123')).toBe(false)
    expect(shouldMountOperatorSidebar('owner', '/owner/operations')).toBe(false)
    expect(shouldMountOperatorSidebar('admin', '/admin')).toBe(true)
  })
})

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
