/** @vitest-environment jsdom */
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const mocks = vi.hoisted(() => ({
  review: vi.fn(),
  search: {
    publicationRef: 'publication:openapi',
    expectedRevision: 3,
    expectedSourceDigest: `sha256:${'a'.repeat(64)}`,
    operationRef: `operation:v1:${'b'.repeat(64)}`,
    sourceKind: 'openapi' as const,
    sourceUrl: 'https://provider.example/openapi.json',
  },
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useLoaderData: () => ({ readback: { kind: 'allowed', rows: [] } }),
    useSearch: () => mocks.search,
  }),
}))
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: () => Symbol('admin-readback-server') }),
  useServerFn: () => mocks.review,
}))
vi.mock('@/components/ae/layout/AeOperatorShell', () => ({
  AeOperatorShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))
vi.mock('@/components/ae/readback/AeAdminReadbackPanel', () => ({
  AeAdminReadbackPanel: () => <section>Catalog readback</section>,
}))
vi.mock('@/lib/operator/route-options', () => ({ operatorRouteOptions: {} }))
vi.mock('@/modules/capability-supply/source-authority-review.functions', () => ({
  reviewSourceAuthorityServer: Symbol('review-source-authority'),
}))

import { Route as AdminIndexHealthRoute } from '@/routes/_operator/admin.index-health'

afterEach(() => {
  cleanup()
  mocks.review.mockReset()
})

describe('admin source authority review', () => {
  it('confirms one exact publication and tells the operator to resume the same release run', async () => {
    mocks.review.mockResolvedValue({
      kind: 'verified',
      publicationRef: mocks.search.publicationRef,
      revision: mocks.search.expectedRevision,
      operationRef: mocks.search.operationRef,
      sourceAuthorityState: 'verified',
    })
    const Component = AdminIndexHealthRoute.options.component
    if (Component === undefined) throw new Error('admin_index_health_component_missing')
    render(<Component />)

    expect(screen.getByRole('heading', { name: 'Review source authority' })).toBeTruthy()
    expect(screen.getByText('Tool reference')).toBeTruthy()
    expect(screen.getByText(/Provider controls the source/u)).toBeTruthy()
    expect(document.body.textContent).toContain(mocks.search.sourceUrl)
    expect(document.body.textContent).toContain(mocks.search.expectedSourceDigest)
    fireEvent.change(screen.getByLabelText('Authority evidence reference'), {
      target: { value: 'review:source-control:ticket-123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm source authority' }))

    await waitFor(() => expect(mocks.review).toHaveBeenCalledWith({
      data: {
        publicationRef: mocks.search.publicationRef,
        expectedRevision: mocks.search.expectedRevision,
        expectedSourceDigest: mocks.search.expectedSourceDigest,
        evidenceRef: 'review:source-control:ticket-123',
      },
    }))
    expect((await screen.findByRole('status')).textContent).toContain('Source authority confirmed')
    expect(screen.getByRole('status').textContent).toContain('rerun the same Package 5 release task')
  })

  it('does not claim approval when the canonical review is refused', async () => {
    mocks.review.mockResolvedValue({ kind: 'refused', reason: 'authorization_denied' })
    const Component = AdminIndexHealthRoute.options.component
    if (Component === undefined) throw new Error('admin_index_health_component_missing')
    render(<Component />)

    fireEvent.change(screen.getByLabelText('Authority evidence reference'), {
      target: { value: 'review:source-control:ticket-123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm source authority' }))

    expect((await screen.findByRole('alert')).textContent).toContain('No source authority changed')
    expect(screen.getByRole('alert').textContent).toContain('Ask an active AE reviewer to open this link')
  })
})
