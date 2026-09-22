/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const mocks = vi.hoisted(() => ({
  review: vi.fn(),
  request: {
    publicationRef: 'publication:openapi',
    expectedRevision: 3,
    expectedSourceDigest: `sha256:${'a'.repeat(64)}`,
    operationRef: `operation:v1:${'b'.repeat(64)}`,
    sourceKind: 'openapi' as const,
    sourceUrl: 'https://provider.example/openapi.json',
  },
}))

vi.mock('@tanstack/react-start', () => ({ useServerFn: () => mocks.review }))
vi.mock('@/modules/capability-supply/source-authority-review.functions', () => ({
  reviewSourceAuthorityServer: Symbol('review-source-authority'),
}))

import { SourceAuthorityReviewPanel } from '@/components/ae/admin/catalog-health/SourceAuthorityReviewPanel'

afterEach(() => {
  cleanup()
  mocks.review.mockReset()
})

describe('admin source authority review', () => {
  it('confirms one exact publication and tells the operator to resume the same release run', async () => {
    mocks.review.mockResolvedValue({
      kind: 'verified',
      publicationRef: mocks.request.publicationRef,
      revision: mocks.request.expectedRevision,
      operationRef: mocks.request.operationRef,
      sourceAuthorityState: 'verified',
    })
    render(<SourceAuthorityReviewPanel review={mocks.request} />)

    expect(screen.getByRole('heading', { name: 'Review source authority' })).toBeTruthy()
    expect(screen.getByText('Tool reference')).toBeTruthy()
    expect(screen.getByText(/Provider controls the source/u)).toBeTruthy()
    expect(document.body.textContent).toContain(mocks.request.sourceUrl)
    expect(document.body.textContent).toContain(mocks.request.expectedSourceDigest)
    fireEvent.change(screen.getByLabelText('Authority evidence reference'), {
      target: { value: 'review:source-control:ticket-123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm source authority' }))

    await waitFor(() => expect(mocks.review).toHaveBeenCalledWith({
      data: {
        publicationRef: mocks.request.publicationRef,
        expectedRevision: mocks.request.expectedRevision,
        expectedSourceDigest: mocks.request.expectedSourceDigest,
        evidenceRef: 'review:source-control:ticket-123',
      },
    }))
    expect((await screen.findByRole('status')).textContent).toContain('Source authority confirmed')
    expect(screen.getByRole('status').textContent).toContain('rerun the same Package 5 release task')
  })

  it('does not claim approval when the canonical review is refused', async () => {
    mocks.review.mockResolvedValue({ kind: 'refused', reason: 'authorization_denied' })
    render(<SourceAuthorityReviewPanel review={mocks.request} />)

    fireEvent.change(screen.getByLabelText('Authority evidence reference'), {
      target: { value: 'review:source-control:ticket-123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm source authority' }))

    expect((await screen.findByRole('alert')).textContent).toContain('No source authority changed')
    expect(screen.getByRole('alert').textContent).toContain('Ask an active AE reviewer to open this link')
  })
})
