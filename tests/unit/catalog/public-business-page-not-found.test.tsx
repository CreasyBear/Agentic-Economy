/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { isNotFound } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PublicBusinessPageRouteReadbackResult } from '@/modules/catalog/public'

const readPublicBusinessPageMock = vi.hoisted(() =>
  vi.fn<(input: { data: { slug: string } }) => Promise<PublicBusinessPageRouteReadbackResult>>(),
)
const readOfferingDetailMock = vi.hoisted(() => vi.fn<(input: { slug: string }) => Promise<{ kind: 'not_found' }>>())

vi.mock('@/modules/catalog/owner-claim.functions', () => ({
  readPublicBusinessPageServer: readPublicBusinessPageMock,
}))
vi.mock('@/modules/registry/registry.functions', () => ({
  readPublicOfferingRegistryBusinessDetail: readOfferingDetailMock,
}))

import { PublicBusinessNotFound, Route } from '@/routes/$slug'

beforeEach(() => {
  // AePublicShell renders Astryx AppShell, which reads matchMedia and ResizeObserver on mount.
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  vi.stubGlobal('matchMedia', (): MediaQueryList => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }))
})

afterEach(() => {
  cleanup()
  readPublicBusinessPageMock.mockReset()
  readOfferingDetailMock.mockReset()
  vi.unstubAllGlobals()
})

async function loadSlug(slug: string): Promise<unknown> {
  const loader = Route.options.loader as (input: { params: { slug: string } }) => Promise<unknown>
  return loader({ params: { slug } }).then(
    (value) => value,
    (error: unknown) => error,
  )
}

describe('/$slug not-found reason', () => {
  it('raises a not-found for a slug with no business record, carrying no_such_business', async () => {
    readPublicBusinessPageMock.mockResolvedValue({ kind: 'not_found', reason: 'no_such_business' })

    const thrown = await loadSlug('definitely-not-a-business-xyz')

    expect(isNotFound(thrown)).toBe(true)
    expect(thrown).toMatchObject({ data: { reason: 'no_such_business' } })
    expect(readOfferingDetailMock).not.toHaveBeenCalled()
  })

  it('raises a not-found carrying not_public for a business record that is not published', async () => {
    readPublicBusinessPageMock.mockResolvedValue({ kind: 'not_found', reason: 'not_public' })

    const thrown = await loadSlug('unpublished-business')

    expect(isNotFound(thrown)).toBe(true)
    expect(thrown).toMatchObject({ data: { reason: 'not_public' } })
  })

  it('marks the not-found response noindex because there is no page to index', async () => {
    const head = await Route.options.head?.({ loaderData: undefined } as never)

    expect(head?.meta).toContainEqual({ name: 'robots', content: 'noindex' })
    expect(head?.meta).toContainEqual({ title: 'Page not found | Agentic Economy' })
  })
})

describe('PublicBusinessNotFound copy', () => {
  it('does not assert that a business exists when no record was found', () => {
    render(<PublicBusinessNotFound data={{ reason: 'no_such_business' }} isNotFound routeId="/$slug" />)

    expect(screen.getByText('No business page at this address')).toBeTruthy()
    expect(screen.queryByText(/may need to claim or review it/)).toBeNull()
    expect(screen.queryByRole('link', { name: 'Claim your business page' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Browse businesses' })).toBeTruthy()
  })

  it('keeps the claim framing only when a real business page is withheld from the public', () => {
    render(<PublicBusinessNotFound data={{ reason: 'not_public' }} isNotFound routeId="/$slug" />)

    expect(screen.getByText('Business page unavailable')).toBeTruthy()
    expect(
      screen.getByText('This page is not visible right now. The business may need to claim or review it.'),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Claim your business page' })).toBeTruthy()
  })

  it('falls back to the no-such-business copy when the boundary carries no reason', () => {
    render(<PublicBusinessNotFound isNotFound routeId="/$slug" />)

    expect(screen.getByText('No business page at this address')).toBeTruthy()
    expect(screen.queryByText(/may need to claim or review it/)).toBeNull()
  })
})
