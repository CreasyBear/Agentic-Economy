import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import {
  announceShareFailure,
  revokeAnswerThreadShare,
} from '@/components/ae/chat/copy-thread-link'
import { toast } from '@/lib/ui/toast'

describe('answer thread share client helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('maps a successful idempotent revoke response to already_revoked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      Response.json({ threadId: 'thread-1', revoked: false }),
    ))

    await expect(revokeAnswerThreadShare('thread-1')).resolves.toEqual({ kind: 'already_revoked' })
  })

  it('announces explicit sanitized copy for missing share configuration', () => {
    announceShareFailure({
      kind: 'problem',
      problem: { code: 'missing_share_secret' },
    }, 'copy')

    expect(toast.error).toHaveBeenCalledWith('Could not prepare the share link.', {
      description: 'Sharing is not configured on this deployment.',
    })
  })
})
