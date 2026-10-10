import { describe, expect, it } from 'vitest'

import { appendWorkspaceSuffix, unboundWorkspaceDefaultName } from '@/lib/workspace-label'

describe('workspace label', () => {
  it('does not append a second suffix to a stored workspace name', () => {
    expect(appendWorkspaceSuffix("R10 Smoke Owner's workspace")).toBe("R10 Smoke Owner's workspace")
    expect(appendWorkspaceSuffix('Ada’s workspace')).toBe('Ada’s workspace')
  })

  it('suffixes a person name once', () => {
    expect(appendWorkspaceSuffix('Ada Lovelace')).toBe('Ada Lovelace’s account')
    expect(unboundWorkspaceDefaultName({
      clerkOrgId: null,
      displayName: 'user_r10',
      ownerDisplayName: 'Ada Lovelace',
      clerkPersonName: null,
    })).toBe("Ada Lovelace's account")
  })

  it('keeps an already suffixed owner label when the stored account name is still a user id', () => {
    expect(unboundWorkspaceDefaultName({
      clerkOrgId: null,
      displayName: 'user_r10',
      ownerDisplayName: "R10 Smoke Owner's workspace",
      clerkPersonName: null,
    })).toBe("R10 Smoke Owner's workspace")
  })

  it('does not invent a workspace name for a bound organisation or a named account', () => {
    expect(unboundWorkspaceDefaultName({
      clerkOrgId: 'org_1',
      displayName: 'user_r10',
      ownerDisplayName: 'Ada',
      clerkPersonName: null,
    })).toBeNull()
    expect(unboundWorkspaceDefaultName({
      clerkOrgId: null,
      displayName: 'Acme',
      ownerDisplayName: 'Ada',
      clerkPersonName: null,
    })).toBeNull()
  })
})
