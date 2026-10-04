/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import type { CallContentReview as ReviewResult } from '@/lib/operator/admin-console/call-content-review'
import type { CallFeedbackView } from '@/modules/capability-execution/call-feedback'

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), review: vi.fn(), access: vi.fn() }))
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('convex/react', () => ({ useQuery: () => mocks.access() }))
vi.mock('@/modules/capability-execution/call-feedback.functions', () => ({
  readOwnerCallFeedbackServer: mocks.read, writeOwnerCallFeedbackServer: mocks.write,
}))
vi.mock('@/components/ae/admin/call-object/call-content-review.functions', () => ({ reviewCallContentServer: mocks.review }))
vi.mock('@/lib/client/useTypedReverification', () => ({ useTypedReverification: (fn: unknown) => fn }))

import { CallFeedbackControl } from '@/components/ae/call-receipt/CallFeedbackControl'
import { CallContentReview } from '@/components/ae/admin/call-object/CallContentReview'

const emptyFeedback: CallFeedbackView = { kind: 'ready', callRef: 'call:one', feedback: null, expiresAt: null }
const content = (callRef = 'call:one'): ReviewResult => ({ kind: 'content', callRef, expiresAt: Date.now() + 600_000,
  inputJson: '<img src=x onerror=steal()>', outputJson: '{"private":"result"}',
  receipt: { kind: 'completed', action: 'review_call_content', code: 'call_content_reviewed', effectRefs: [callRef], auditEventRef: 'audit:one', correlationId: 'review:one' },
})
beforeEach(() => {
  mocks.access.mockReturnValue({ kind: 'allowed', role: 'owner_admin' })
  mocks.read.mockResolvedValue(emptyFeedback)
})
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.useRealTimers() })

describe('Call feedback control', () => {
  it('saves a choice and bounded optional reason without requesting a refund', async () => {
    mocks.write.mockImplementation(async ({ data }) => ({ kind: 'ready', ...data, expiresAt: Date.now() + 1000 }))
    render(<CallFeedbackControl callRef="call:one" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Not useful' }))
    const reason = await screen.findByRole('combobox', { name: 'Reason (optional)' })
    fireEvent.change(reason, { target: { value: 'incomplete' } })
    await waitFor(() => expect(mocks.write).toHaveBeenLastCalledWith({ data: { callRef: 'call:one', feedback: { choice: 'not_useful', reason: 'incomplete' } } }))
    expect(screen.getByRole('button', { name: 'Not useful' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/Use “Report this answer” for a credit return/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('does not claim success after a lost response and isolates a new selected Call from an old response', async () => {
    mocks.write.mockRejectedValueOnce(new Error('network'))
    const view = render(<CallFeedbackControl callRef="call:one" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Useful' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Feedback was not confirmed')
    expect(screen.getByRole('button', { name: 'Useful' })).toHaveAttribute('aria-pressed', 'false')
    const pending = Promise.withResolvers<CallFeedbackView>()
    mocks.write.mockReturnValueOnce(pending.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Useful' }))
    mocks.read.mockResolvedValueOnce({ ...emptyFeedback, callRef: 'call:two' })
    view.rerender(<CallFeedbackControl callRef="call:two" />)
    await screen.findByRole('button', { name: 'Useful' })
    await act(async () => pending.resolve({ ...emptyFeedback, feedback: { choice: 'useful' } }))
    expect(screen.getByRole('button', { name: 'Useful' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('founder content review control', () => {
  it('reads only after an explicit action, escapes output and clears content on selection and role changes', async () => {
    mocks.review.mockResolvedValue(content())
    const view = render(<CallContentReview callRef="call:one" />)
    expect(mocks.review).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('combobox', { name: 'Review reason' }), { target: { value: 'failure_investigation' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review Call content' }))
    await screen.findByText('{"private":"result"}')
    expect(mocks.review).toHaveBeenCalledWith({ data: expect.objectContaining({ input: { callRef: 'call:one' }, reasonCode: 'failure_investigation' }) })
    expect(view.container.querySelector('img')).toBeNull()
    expect(view.container.querySelector('details')).not.toHaveAttribute('open')
    view.rerender(<CallContentReview callRef="call:two" />)
    expect(screen.queryByText('{"private":"result"}')).toBeNull()
    mocks.review.mockResolvedValue(content('call:two'))
    fireEvent.click(screen.getByRole('button', { name: 'Review Call content' }))
    await screen.findByText('{"private":"result"}')
    mocks.access.mockReturnValue({ kind: 'allowed', role: 'support' })
    view.rerender(<CallContentReview callRef="call:two" />)
    expect(view.container).toBeEmptyDOMElement()
    mocks.access.mockReturnValue({ kind: 'allowed', role: 'owner_admin' })
    view.rerender(<CallContentReview callRef="call:two" />)
    expect(screen.queryByText('{"private":"result"}')).toBeNull()
  })

  it('retries a lost response with the original command and removes content at the review deadline', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    const now = Date.now()
    mocks.review.mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(content())
    render(<CallContentReview callRef="call:one" />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Review Call content' })))
    expect(screen.getByRole('alert')).toHaveTextContent('Retry to check the same review')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Review Call content' })))
    expect(mocks.review.mock.calls[1]).toEqual(mocks.review.mock.calls[0])
    await act(async () => vi.advanceTimersByTimeAsync(599_999))
    expect(screen.getByText('{"private":"result"}')).toBeInTheDocument()
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(Date.now()).toBe(now + 600_000)
    expect(screen.queryByText('{"private":"result"}')).toBeNull()
    expect(screen.getByRole('button', { name: 'Review Call content' })).toBeInTheDocument()
  })
})
