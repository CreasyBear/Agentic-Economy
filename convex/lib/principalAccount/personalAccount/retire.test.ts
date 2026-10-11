import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../_generated/api', () => ({ internal: { personalAccount: { sendDeletionNotice: 'sendDeletionNotice' } } }))
const enqueueAccountNotice = vi.fn(async () => 'enqueued')
vi.mock('../notifications/enqueue', () => ({ enqueueAccountNotice }))

const { DELETION_GRACE_MS, DELETION_REMINDER_LEAD_MS, scheduleDeletionNotices, sendDeletionNoticeHandler } = await import('./retire')
const DAY = 24 * 60 * 60 * 1000
const input = { principalRef: 'p1', accountRef: 'a1' }

describe('deletion notices', () => {
  it('enqueues the request notice and schedules reminder at 11d and completion at 14d', async () => {
    const runAfter = vi.fn()
    await scheduleDeletionNotices({ scheduler: { runAfter } } as never, input, 0)
    expect(DELETION_GRACE_MS).toBe(14 * DAY)
    expect(DELETION_REMINDER_LEAD_MS).toBe(3 * DAY)
    expect(enqueueAccountNotice).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventKind: 'deletion_requested' }))
    expect(runAfter.mock.calls.map((c) => [c[0], c[2].notice])).toEqual([[11 * DAY, 'final_reminder'], [14 * DAY, 'completed']])
  })

  it.each([
    ['final_reminder', 'deletion_final_reminder'],
    ['completed', 'deletion_completed'],
  ])('%s notice sends %s', async (notice, eventKind) => {
    enqueueAccountNotice.mockClear()
    const ctx = { db: { query: () => ({ withIndex: () => ({ unique: async () => ({ lifecycle: 'retired' }) }) }) } }
    await sendDeletionNoticeHandler(ctx as never, { ...input, notice: notice as 'completed' })
    expect(enqueueAccountNotice).toHaveBeenCalledWith(ctx, expect.objectContaining({ eventKind }))
  })
})
