/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  sheet: vi.fn(),
}))

vi.mock('convex/react', () => ({ useQuery: () => mocks.access() }))
vi.mock('@/components/ae/admin/actions/AdminActionSheet', () => ({
  AdminActionSheet: (props: AdminActionSheetProps) => {
    mocks.sheet(props)
    return props.open ? (
      <section role="dialog" aria-label="Verify source authority">
        <button type="button" onClick={() => props.onOpenChange(false)}>Close</button>
      </section>
    ) : null
  },
}))

import type { AdminActionSheetProps } from '@/components/ae/admin/actions/actions.contracts'
import type { SourceAuthorityReviewRequest } from '@/components/ae/admin/provider-object/source-authority-review.contracts'

import { SourceAuthorityReviewPanel } from '@/components/ae/admin/provider-object/SourceAuthorityReviewPanel'

const review: SourceAuthorityReviewRequest = {
  publicationRef: 'publication:openapi',
  expectedRevision: 3,
  expectedSourceDigest: `sha256:${'a'.repeat(64)}`,
  operationRef: `operation:v1:${'b'.repeat(64)}`,
  sourceKind: 'openapi',
  sourceUrl: 'https://provider.example/openapi.json',
}

afterEach(() => {
  cleanup()
  mocks.access.mockReset()
  mocks.sheet.mockReset()
})

describe('admin source authority review', () => {
  it('shows the reviewed source and opens a sheet for that exact publication revision', () => {
    mocks.access.mockReturnValue({ kind: 'allowed', role: 'owner_admin' })
    render(<SourceAuthorityReviewPanel review={review} />)

    expect(screen.getByRole('heading', { name: 'Review source authority' })).toBeTruthy()
    expect(screen.getByText('Tool reference')).toBeTruthy()
    expect(screen.getByText(/Provider controls the source/u)).toBeTruthy()
    expect(document.body.textContent).toContain(review.sourceUrl)
    expect(document.body.textContent).toContain(review.expectedSourceDigest)
    expect(document.body.textContent).toContain(review.publicationRef)
    expect(document.body.textContent).toContain(String(review.expectedRevision))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Verify source authority' }))

    expect(screen.getByRole('dialog', { name: 'Verify source authority' })).toBeTruthy()
    expect(mocks.sheet).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'verify_capability_source_authority',
      input: {
        publicationRef: review.publicationRef,
        expectedRevision: review.expectedRevision,
        expectedSourceDigest: review.expectedSourceDigest,
      },
      targetRefs: [
        { label: 'Publication', value: review.publicationRef },
        { label: 'Tool reference', value: review.operationRef },
        { label: 'Source', value: review.sourceUrl },
        { label: 'Source digest', value: review.expectedSourceDigest },
      ],
      open: true,
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each(['support', 'reviewer'])('does not offer verification to %s', (role) => {
    mocks.access.mockReturnValue({ kind: 'allowed', role })
    render(<SourceAuthorityReviewPanel review={review} />)

    expect(screen.getByRole('heading', { name: 'Review source authority' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Verify source authority' })).toBeNull()
    expect(mocks.sheet).not.toHaveBeenCalled()
  })

  it('does not offer verification when admin access is refused', () => {
    mocks.access.mockReturnValue({ kind: 'refused', code: 'missing_membership' })
    render(<SourceAuthorityReviewPanel review={review} />)

    expect(screen.queryByRole('button', { name: 'Verify source authority' })).toBeNull()
    expect(mocks.sheet).not.toHaveBeenCalled()
  })

  it('keeps the reviewed facts visible but withholds verification while access is loading', () => {
    mocks.access.mockReturnValue(undefined)
    render(<SourceAuthorityReviewPanel review={review} />)
    expect(document.body.textContent).toContain(review.expectedSourceDigest)
    expect(document.body.textContent).toContain(review.publicationRef)
    expect(screen.queryByRole('button', { name: 'Verify source authority' })).toBeNull()
    expect(mocks.sheet).not.toHaveBeenCalled()
  })
})
