/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeSiteFooter } from '@/components/ae/website/AeSiteFooter'
import { AE_SITE_FOOTER, FOOTER_NAVIGATION } from '@/components/ae/website/AeSiteFooter.contracts'
import { AECON_MARKETING_URL } from '@/content/brand-assets'
import { FOOTER } from '@/content/brand-copy'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function renderFooter(hideCloser = false) {
  const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: ['/'] }) })
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(undefined)
  const view = render(<RouterContextProvider router={router}><AeSiteFooter hideCloser={hideCloser} /></RouterContextProvider>)
  return { ...view, navigate, router }
}

describe('actual Arc site footer', () => {
  it('keeps every supplied navigation group, brand, copyright and external destination', () => {
    renderFooter(true)
    const footer = screen.getByRole('contentinfo')
    const nav = within(footer).getByRole('navigation', { name: 'Footer' })
    for (const column of FOOTER_NAVIGATION) {
      expect(within(nav).getByRole('heading', { level: 2, name: column.title }).id).toBe(column.id)
      for (const link of column.links) expect(within(nav).getByRole('link', { name: link.label }).getAttribute('href')).toBe(link.to)
    }
    expect(within(footer).getByRole('link', { name: 'About AECON' }).getAttribute('href')).toBe(AECON_MARKETING_URL)
    expect(within(footer).getByText(FOOTER.tagline)).toBeTruthy()
    expect(within(footer).getByText(FOOTER.copyright(new Date().getFullYear()))).toBeTruthy()
    for (const profile of AE_SITE_FOOTER.socialLinks) {
      const link = within(footer).getByRole('link', { name: profile.label })
      expect(link.getAttribute('href')).toBe(profile.href)
      expect(link.getAttribute('target')).toBeNull()
    }
    const abn = within(footer).getByRole('link', { name: AE_SITE_FOOTER.abn.label })
    expect(abn.getAttribute('href')).toBe(AE_SITE_FOOTER.abn.href)
    expect(abn.getAttribute('target')).toBeNull()
    expect(within(footer).queryByRole('textbox')).toBeNull()
    expect(within(footer).queryByRole('button')).toBeNull()
    expect(within(footer).queryByText('All systems normal')).toBeNull()
    expect(within(footer).queryByText('Get the monthly release notes')).toBeNull()
  })

  it('uses router navigation for pages and preserves full-document machine link behavior', () => {
    const { navigate } = renderFooter(true)
    const nav = screen.getByRole('navigation', { name: 'Footer' })
    for (const column of FOOTER_NAVIGATION) {
      for (const link of column.links) {
        let preventedByRouter: boolean | undefined
        const observe = (event: MouseEvent) => {
          preventedByRouter = event.defaultPrevented
          event.preventDefault()
        }
        document.addEventListener('click', observe, { once: true })
        navigate.mockClear()
        fireEvent.click(within(nav).getByRole('link', { name: link.label }), { button: 0 })
        expect(preventedByRouter).toBe(true)
        expect(navigate).toHaveBeenCalledOnce()
        expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ to: link.to, reloadDocument: link.reloadDocument }))
      }
    }
  })

  it('keeps the existing closer and removes it when the caller hides it', () => {
    const { rerender, router } = renderFooter()
    expect(screen.getByRole('region', { name: AE_SITE_FOOTER.closer.heading })).toBeTruthy()
    expect(screen.getByRole('link', { name: AE_SITE_FOOTER.closer.primaryAction }).getAttribute('href')).toBe('/market')
    expect(screen.getByRole('link', { name: AE_SITE_FOOTER.closer.secondaryAction }).getAttribute('href')).toBe('/status')
    const image = document.querySelector(`img[src="${AE_SITE_FOOTER.images.closer.src}"]`)
    expect(image?.getAttribute('alt')).toBe('')
    expect(image?.getAttribute('srcset')).toBe(AE_SITE_FOOTER.images.closer.srcSet)
    rerender(<RouterContextProvider router={router}><AeSiteFooter hideCloser /></RouterContextProvider>)
    expect(screen.queryByRole('region', { name: AE_SITE_FOOTER.closer.heading })).toBeNull()
    expect(document.querySelector(`img[src="${AE_SITE_FOOTER.images.closer.src}"]`)).toBeNull()
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1)
    expect(screen.getByRole('navigation', { name: 'Footer' })).toBeTruthy()
  })
})
