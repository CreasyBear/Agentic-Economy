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

  it.each(['unpublished', 'suppressed'] as const)(
    'shows only authoritative fallback facts for %s identities',
    (publicStatus) => {
      const identity = { businessId: 'biz_fallback_1', name: 'Fallback Provider', slug: 'fallback-provider', publicStatus }
      render(<AeWorkspaceGeneral
        result={{ kind: 'unavailable', reason: 'source_unavailable', retryable: true }}
        identity={identity}
      />)

      expect(screen.getByRole('heading', { name: 'Provider identity' })).toBeTruthy()
      expect(screen.getByText('The Provider identity that owns these Tools. Publication status is read separately.')).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'Name' })).toBeTruthy()
      expect(screen.getByText(identity.name)).toBeTruthy()
      expect(screen.getByText('/fallback-provider')).toBeTruthy()
      expect(screen.getByText(publicStatus)).toBeTruthy()
      expect(screen.queryByRole('heading', { name: 'Category' })).toBeNull()
      expect(screen.queryByRole('heading', { name: 'Disposition' })).toBeNull()
      expect(screen.queryByRole('heading', { name: 'Trust' })).toBeNull()
      expect(document.body.textContent).not.toContain(identity.businessId)
    },
  )

  it('uses the fallback identity for editing and reuses the request key on retry', async () => {
    const identity = {
      businessId: 'biz_fallback_edit_1', name: 'Fallback Provider', slug: 'fallback-provider', publicStatus: 'suppressed' as const,
    }
    const onRename = vi.fn(async (_input: Readonly<{ businessId: string; name: string; requestKey: string }>) => ({
      kind: 'refused' as const, code: 'source_unavailable' as const,
    }))
    render(<AeWorkspaceGeneral
      result={{ kind: 'unavailable', reason: 'source_unavailable', retryable: true }}
      identity={identity}
      onRename={onRename}
    />)

    const input = screen.getByRole('textbox', { name: 'Public Provider name' })
    expect(screen.getByDisplayValue(identity.name)).toBe(input)
    expect(screen.getByText('This name appears on the Provider listing and every current Tool. Its public path and Provider connection stay unchanged.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Name' })).toBeNull()
    expect(screen.queryByText(identity.name)).toBeNull()

    const requestedName = 'Fallback Provider Updated'
    fireEvent.change(input, { target: { value: requestedName } })
    const save = screen.getByRole('button', { name: 'Save public name' })
    fireEvent.click(save)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('existing public name is unchanged'))
    expect(onRename).toHaveBeenCalledTimes(1)
    const firstRequest = onRename.mock.calls[0]?.[0]
    expect(firstRequest).toEqual({ businessId: identity.businessId, name: requestedName, requestKey: expect.any(String) })

    fireEvent.click(save)
    await waitFor(() => expect(onRename).toHaveBeenCalledTimes(2))
    const retryRequest = onRename.mock.calls[1]?.[0]
    expect(retryRequest).toEqual({ businessId: identity.businessId, name: requestedName, requestKey: firstRequest?.requestKey })
    expect(document.body.textContent).not.toContain(identity.businessId)
  })

  it('saves a changed public provider name explicitly and reports success', async () => {
    const onRename = vi.fn(async () => ({ kind: 'updated' as const, businessId: catalog.businessId, slug: catalog.slug, name: 'Quote Works API' }))
    render(<AeWorkspaceGeneral result={{ kind: 'available', readback: buildPublicOwnerStatusReadback(catalog) }} onRename={onRename} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Public Provider name' }), { target: { value: 'Quote Works API' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save public name' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Public name saved'))
    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ businessId: catalog.businessId, name: 'Quote Works API' }))
  })

  it('owns an unexpected rename rejection without losing the entered name', async () => {
    const onRename = vi.fn(async () => { throw new Error('private upstream detail') })
    render(<AeWorkspaceGeneral result={{ kind: 'available', readback: buildPublicOwnerStatusReadback(catalog) }} onRename={onRename} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Public Provider name' }), { target: { value: 'Name still here' } })
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
    const input = screen.getByRole('textbox', { name: 'Public Provider name' })
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
    expect(screen.getByRole('link', { name: 'Review Provider setup' }).getAttribute('href')).toBe('/for-providers')
  })

  it('renders an unavailable Provider identity as an error alert', () => {
    render(<AeWorkspaceGeneral result={{ kind: 'unavailable', reason: 'source_unavailable', retryable: true }} />)
    const alert = screen.getByRole('alert')
    expect(alert.getAttribute('data-slot')).toBe('alert')
    expect(alert.textContent).toContain('Provider identity is unavailable')
    expect(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe(
      '/owner/operations#provider-identity',
    )
  })

})
