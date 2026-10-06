/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { AeSiteFooter } from '@/components/ae/website/AeSiteFooter'
import { AE_SITE_FOOTER, FOOTER_NAVIGATION } from '@/components/ae/website/AeSiteFooter.contracts'
import { RouterLinkBoundary } from '@/components/ae/shared/router-link-boundary/RouterLinkBoundary'
import { AECON_MARKETING_URL } from '@/content/brand-assets'
import { FOOTER } from '@/content/brand-copy'

afterEach(() => cleanup())

function renderFooter(hideCloser = false) {
  const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: ['/'] }) })
  const view = render(<RouterContextProvider router={router}><AeSiteFooter hideCloser={hideCloser} /></RouterContextProvider>)
  return { ...view, router }
}

describe('actual Arc site footer', () => {
  it('keeps every supplied navigation group, brand, copyright and external destination', () => {
    renderFooter(true)
    const footer = screen.getByRole('contentinfo')
    const nav = within(footer).getByRole('navigation', { name: 'Footer' })
    for (const column of FOOTER_NAVIGATION) {
      expect(within(nav).getByRole('heading', { level: 2, name: column.title })).toBeTruthy()
      for (const link of column.links) expect(within(nav).getByRole('link', { name: link.label }).getAttribute('href')).toBe(link.to)
    }
    expect(within(footer).getByRole('link', { name: 'AECON' }).getAttribute('href')).toBe(AECON_MARKETING_URL)
    expect(within(footer).getByText(FOOTER.tagline)).toBeTruthy()
    expect(within(footer).getByText(`© ${new Date().getUTCFullYear()} AECON`)).toBeTruthy()
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

  it('uses SPA navigation for app links and keeps machine links on full-document navigation', async () => {
    const { router } = renderFooter(true)
    const nav = screen.getByRole('navigation', { name: 'Footer' })
    let previousPath = router.state.location.pathname
    for (const column of FOOTER_NAVIGATION) {
      for (const link of column.links) {
        let preventedByRouter: boolean | undefined
        const observe = (event: MouseEvent) => {
          preventedByRouter = event.defaultPrevented
          event.preventDefault()
        }
        document.addEventListener('click', observe, { once: true })
        fireEvent.click(within(nav).getByRole('link', { name: link.label }), { button: 0 })
        if (link.reloadDocument) {
          expect(preventedByRouter).toBe(false)
          expect(router.state.location.pathname).toBe(previousPath)
          continue
        }
        expect(preventedByRouter).toBe(true)
        await waitFor(() => expect(router.state.location.pathname).toBe(link.to))
        previousPath = link.to
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

describe('router link boundary', () => {
  function createBoundaryRouter(loads: string[] = []) {
    const rootRoute = createRootRoute()
    const marketRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/market',
      loader: () => { loads.push('market') },
    })
    return createRouter({
      routeTree: rootRoute.addChildren([marketRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
  }

  it('preloads on focus and navigates eligible links with query and hash intact', async () => {
    const loads: string[] = []
    const router = createBoundaryRouter(loads)
    render(
      <RouterContextProvider router={router}>
        <RouterLinkBoundary>
          <a href="/market?query=tools#results">Market</a>
        </RouterLinkBoundary>
      </RouterContextProvider>,
    )

    const link = screen.getByRole('link', { name: 'Market' })
    fireEvent.focus(link)
    await waitFor(() => expect(loads).toHaveLength(1))
    expect(router.state.location.pathname).toBe('/')

    fireEvent.click(link, { button: 0 })
    await waitFor(() => expect(router.state.location.pathname).toBe('/market'))
    expect(router.state.location.search).toEqual({ query: 'tools' })
    expect(router.state.location.hash).toBe('results')
  })

  it('leaves modified, targeted, downloaded, prevented, and cross-origin links to the browser', () => {
    const router = createBoundaryRouter()
    render(
      <RouterContextProvider router={router}>
        <RouterLinkBoundary>
          <div>
            <a href="/market?query=modified">Modified</a>
            <a href="/market" target="_blank">New tab</a>
            <a href="/market" download>Download</a>
            <a href="/market?query=prevented" onClick={event => event.preventDefault()}>Prevented</a>
            <a href="https://example.com">External</a>
          </div>
        </RouterLinkBoundary>
      </RouterContextProvider>,
    )

    for (const name of ['Modified', 'New tab', 'Download', 'Prevented', 'External']) {
      const link = screen.getByRole('link', { name })
      let preventedByBoundary: boolean | undefined
      document.addEventListener('click', event => {
        preventedByBoundary = event.defaultPrevented
        event.preventDefault()
      }, { once: true })
      fireEvent.click(link, { button: 0, ...(name === 'Modified' ? { ctrlKey: true } : {}) })
      expect(preventedByBoundary).toBe(name === 'Prevented')
    }
    expect(router.state.location.pathname).toBe('/')
  })

  it('leaves opted-in document links to the browser', () => {
    const router = createBoundaryRouter()
    render(
      <RouterContextProvider router={router}>
        <RouterLinkBoundary shouldReloadDocument={url => url.pathname === '/SKILL.md'}>
          <a href="/SKILL.md">Machine-readable guide</a>
        </RouterLinkBoundary>
      </RouterContextProvider>,
    )
    const link = screen.getByRole('link', { name: 'Machine-readable guide' })
    let preventedByBoundary: boolean | undefined
    document.addEventListener('click', event => {
      preventedByBoundary = event.defaultPrevented
      event.preventDefault()
    }, { once: true })
    fireEvent.click(link, { button: 0 })
    expect(preventedByBoundary).toBe(false)
    expect(router.state.location.pathname).toBe('/')
  })
})
