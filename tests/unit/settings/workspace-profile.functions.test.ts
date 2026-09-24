import { describe, expect, it, vi } from 'vitest'

import { renameWorkspaceThroughClerk } from '@/lib/server/workspace-profile.functions'

const ownerBinding = {
  accountRef: 'account:one',
  displayName: 'Acme',
  accountRevision: 1,
  callerIsOwner: true,
  clerkOrgId: 'org_one',
  ownerDisplayName: 'Acme Owner',
  ownerClerkUserId: 'user_owner',
}

describe('workspace name writer', () => {
  it('updates the bound Clerk organisation exactly once, then waits for webhook confirmation', async () => {
    const update = vi.fn().mockResolvedValue({ name: 'New Acme' })
    const result = await renameWorkspaceThroughClerk('New Acme', 'org_one', async () => ownerBinding, update)
    expect(result).toEqual({ kind: 'accepted', name: 'New Acme' })
    expect(update).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledWith('org_one', 'New Acme')
  })

  it('refuses a non-owner or a different active organisation before any Clerk write', async () => {
    const update = vi.fn()
    expect(await renameWorkspaceThroughClerk('New Acme', 'org_one', async () => ({ ...ownerBinding, callerIsOwner: false }), update))
      .toEqual({ kind: 'refused', code: 'forbidden' })
    expect(await renameWorkspaceThroughClerk('New Acme', 'org_other', async () => ownerBinding, update))
      .toEqual({ kind: 'refused', code: 'forbidden' })
    expect(update).not.toHaveBeenCalled()
  })
})
