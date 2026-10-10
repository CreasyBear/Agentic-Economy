/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { ProviderIdentity } from '@/components/ae/shared/ProviderIdentity'
import { HostGrouping } from '@/components/ae/shared/HostGrouping'
import { ProviderPortfolio } from '@/components/ae/shared/ProviderPortfolio'
import { ToolListingCard } from '@/components/ae/shared/ToolListingCard'
import { projectToolObject } from '@/components/ae/shared/listing-family.view-model'
import { ProviderListingError, ProviderListingPending } from '@/components/ae/listing/public-business/AePublicBusiness'
import { projectAdmittedListing, projectDirectoryListing } from '@/modules/registry/public'
import { TOOL_TIMEZONE } from '../../helpers/tool-search-rerank-fixtures'

const host = { kind: 'present', value: 'weather.example', sourceRef: 'directory:weather', provenance: 'directory_reported', scope: 'directory_resource' } as const
const business = { kind: 'present', value: 'Weather Co', sourceRef: 'business:weather', provenance: 'business_published', scope: 'business' } as const
const directory = projectToolObject(projectDirectoryListing({ resource: 'https://weather.example/api', title: 'Current weather', description: 'Weather by city', provider: 'weather.example', slug: 'current-weather', prices: [{ scheme: 'exact', decimalAmount: '0.02', symbol: 'USDC' }] }), '/tools/weather.example/current-weather')

afterEach(cleanup)

it('keeps Business and Host identities scoped, with exact native source disclosures', () => {
  const view = render(<ProviderIdentity name={host} />)
  expect(screen.queryByRole('heading')).toBeNull()
  view.rerender(<ProviderIdentity name={business} summary={{ ...business, value: 'Weather for your next move.' }} href="https://weather.example/docs" />)
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Weather Co')
  expect(screen.getByText('Business source: business published')).toBeTruthy()
  expect(screen.getByText('Technical source reference').tagName).toBe('SUMMARY')
  expect(screen.getByText('business:weather')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Provider site' }).getAttribute('href')).toBe('https://weather.example/docs')
  view.rerender(<HostGrouping hostname={business} listings={[]} />)
  expect(screen.queryByRole('heading')).toBeNull()
  view.rerender(<HostGrouping hostname={host} listings={[]} verifiedProvider={{ name: business.value, href: '/weather-co' }} />)
  expect(screen.getByText('Grouped by provider host, not an accountable Provider identity.')).toBeTruthy()
  expect(screen.getByText('No sourced listings are available.')).toBeTruthy()
  expect(screen.getByText(host.sourceRef)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Verified Provider: Weather Co' }).getAttribute('href')).toBe('/weather-co')
})

it('preserves separate optional actions, source price, unknown readiness and native Tool navigation', () => {
  const save = vi.fn()
  const compare = vi.fn()
  const view = renderWithRouter(<ToolListingCard view={directory} onSave={save} saved onCompare={compare} comparing compareDisabled />)
  expect(screen.getByRole('link', { name: 'Current weather' }).getAttribute('href')).toBe('/tools/weather.example/current-weather')
  expect(screen.getByText('0.02 USDC per Call')).toBeTruthy()
  expect(screen.getByText('Readiness unknown')).toBeTruthy()
  expect(screen.getByText('Source: directory reported')).toBeTruthy()
  expect(screen.getByText('Directory Host: weather.example')).toBeTruthy()
  const saved = screen.getByRole('button', { name: 'Saved' })
  expect(saved.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(saved)
  expect(save).toHaveBeenCalledOnce()
  const disabled = screen.getByRole('button', { name: 'Remove Current weather from comparison' })
  expect(disabled.hasAttribute('disabled')).toBe(true)
  fireEvent.click(disabled)
  expect(compare).not.toHaveBeenCalled()
  view.rerender(wrap(<ToolListingCard view={directory} onCompare={compare} />))
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Add Current weather to comparison' }))
  expect(compare).toHaveBeenCalledOnce()
  view.rerender(wrap(<ToolListingCard view={projectToolObject(directory.listing)} />))
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
})

it('retains admission and human-request distinctions, order and exact empty states', () => {
  const admitted = projectToolObject(projectAdmittedListing(TOOL_TIMEZONE), `/tools/${encodeURIComponent(TOOL_TIMEZONE.toolRef)}`)
  const view = renderWithRouter(<ProviderPortfolio offerings={[admitted, directory]} otherOfferings={[{ name: 'Weather consultation', summary: 'A published human service.', href: 'https://weather.example/consult' }]} />)
  expect(screen.getByText('Admitted Tool')).toBeTruthy()
  expect(screen.getByText('Catalogue-only offering')).toBeTruthy()
  expect(screen.getByText('Human-request offering · not an admitted Tool')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'View offering' }).getAttribute('href')).toBe('https://weather.example/consult')
  expect(screen.getAllByRole('heading', { level: 3 }).map(node => node.textContent)).toEqual([admitted.title, directory.title, 'Weather consultation'])
  view.rerender(wrap(<ProviderPortfolio offerings={[]} />))
  expect(screen.getByText('No sourced offerings are available.')).toBeTruthy()
  expect(screen.queryByRole('link')).toBeNull()
})

it('keeps loading shapes hidden and recovery a native retry of the current pathname', () => {
  const view = renderWithRouter(<ProviderListingPending />)
  const pending = screen.getByRole('article', { name: 'Loading provider' })
  expect(pending.getAttribute('aria-busy')).toBe('true')
  expect(screen.getByRole('status', { name: 'Loading provider' })).toBeTruthy()
  expect(pending.querySelector('[aria-hidden="true"]')).toBeTruthy()
  expect(pending.querySelectorAll('button, a').length).toBe(0)
  view.rerender(wrap(<ProviderListingError />))
  expect(screen.queryByRole('status', { name: 'Loading provider' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe('/weather-co')
  expect(screen.getByRole('link', { name: 'Browse Tools' }).getAttribute('href')).toBe('/market')
  expect(screen.getByText('This provider didn’t load')).toBeTruthy()
})

function wrap(ui: ReactElement) {
  const root = createRootRoute()
  const router = createRouter({ routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/$slug' }), createRoute({ getParentRoute: () => root, path: '/market' })]), history: createMemoryHistory({ initialEntries: ['/weather-co'] }) })
  return <RouterContextProvider router={router}>{ui}</RouterContextProvider>
}
function renderWithRouter(ui: ReactElement) { return render(wrap(ui)) }
