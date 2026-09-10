/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('@tanstack/react-router', async () => {
  const React = await import('react')
  return {
    Link: React.forwardRef(function MockLink({ children, to, hash, ...props }: { children: ReactNode; to: string; hash?: string }, ref: React.Ref<HTMLAnchorElement>) {
      return <a ref={ref} href={`${to}${hash === undefined ? '' : `#${hash}`}`} {...props}>{children}</a>
    }),
  }
})

import { AeWorkspaceGeneral } from '@/components/ae/settings/AeWorkspaceGeneral'
import { buildPublicOwnerStatusReadback } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

const catalog: PublicBusinessCatalogApiV2Dto = {
  schemaVersion: 'public-business-catalog-api:v2', businessId: 'biz_workspace_1', slug: 'quote-works', name: 'Quote Works', category: 'Quotes',
  businessContext: { kind: 'local_human', suburb: 'Perth', stateTerritory: 'WA' }, publicUrl: '/quote-works', trustTier: 'claimed', photos: [], observedAt: 0,
  disposition: 'current', offerings: [], accessSummary: { humanRequest: false, externalOperation: true, aeSupportedAction: true },
}

afterEach(cleanup)

describe('owner workspace settings surfaces', () => {
  it('shows provider identity without exposing its raw record identifier', () => {
    render(<AeWorkspaceGeneral result={{ kind: 'available', readback: buildPublicOwnerStatusReadback(catalog) }} />)
    expect(screen.getByRole('heading', { name: 'Provider identity' })).toBeTruthy()
    expect(screen.getByText('Quote Works')).toBeTruthy()
    expect(screen.getByText('/quote-works')).toBeTruthy()
    expect(document.body.textContent).not.toContain('biz_workspace_1')
    expect(screen.queryByRole('navigation', { name: 'Settings' })).toBeNull()
  })

  it('saves a changed public provider name explicitly and reports success', async () => {
    const onRename = vi.fn(async () => ({ kind: 'updated' as const, businessId: catalog.businessId, slug: catalog.slug, name: 'Quote Works API' }))
    render(<AeWorkspaceGeneral result={{ kind: 'available', readback: buildPublicOwnerStatusReadback(catalog) }} onRename={onRename} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Public provider name' }), { target: { value: 'Quote Works API' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save public name' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Public name saved'))
    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ businessId: catalog.businessId, name: 'Quote Works API' }))
  })

  it('owns an unexpected rename rejection without losing the entered name', async () => {
    const onRename = vi.fn(async () => { throw new Error('private upstream detail') })
    render(<AeWorkspaceGeneral result={{ kind: 'available', readback: buildPublicOwnerStatusReadback(catalog) }} onRename={onRename} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Public provider name' }), { target: { value: 'Name still here' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save public name' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('existing public name is unchanged'))
    expect(screen.getByDisplayValue('Name still here')).toBeTruthy()
    expect(document.body.textContent).not.toContain('private upstream detail')
  })

  it('reuses the rename request key until the user changes the command', async () => {
    const onRename = vi.fn()
      .mockResolvedValueOnce({ kind: 'refused', code: 'source_unavailable' })
      .mockResolvedValueOnce({ kind: 'refused', code: 'source_unavailable' })
      .mockResolvedValueOnce({ kind: 'updated', businessId: catalog.businessId, slug: catalog.slug, name: 'Quote Works Two' })
    render(<AeWorkspaceGeneral result={{ kind: 'available', readback: buildPublicOwnerStatusReadback(catalog) }} onRename={onRename} />)
    const input = screen.getByRole('textbox', { name: 'Public provider name' })
    fireEvent.change(input, { target: { value: 'Quote Works One' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save public name' }))
    await waitFor(() => expect(onRename).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Save public name' }))
    await waitFor(() => expect(onRename).toHaveBeenCalledTimes(2))
    expect(onRename.mock.calls[1]?.[0].requestKey).toBe(onRename.mock.calls[0]?.[0].requestKey)

    fireEvent.change(input, { target: { value: 'Quote Works Two' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save public name' }))
    await waitFor(() => expect(onRename).toHaveBeenCalledTimes(3))
    expect(onRename.mock.calls[2]?.[0].requestKey).not.toBe(onRename.mock.calls[1]?.[0].requestKey)
  })

  it('sends an unpublished workspace to provider setup', () => {
    render(<AeWorkspaceGeneral result={{ kind: 'not_found', reason: 'no_such_business' }} />)
    expect(screen.getByRole('link', { name: 'Review provider setup' }).getAttribute('href')).toBe('/for-providers')
  })

})
