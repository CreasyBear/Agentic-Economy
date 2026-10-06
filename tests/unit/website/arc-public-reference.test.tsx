/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeAboutPage } from '@/components/ae/about/AeAboutPage'
import { DevelopersApiPage } from '@/components/ae/developers/api-reference/DevelopersApiPage'
import { DEVELOPERS_API_COPY, type DevelopersApiViewModel } from '@/components/ae/developers/api-reference/developers-api.contracts'
import { AeDeveloperDiscoveryPage } from '@/components/ae/developers/discovery/AeDeveloperDiscoveryPage'
import { DEVELOPER_DISCOVERY_UI_COPY, type DeveloperDiscoveryViewModel } from '@/components/ae/developers/discovery/discovery.contracts'
import { AeSiteCtaBand } from '@/components/ae/website/AeSiteCtaBand'
import { ABOUT } from '@/content/brand-copy'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => <a href={to} className={className}>{children}</a>,
  useRouter: () => ({ navigate: vi.fn(), preloadRoute: vi.fn().mockResolvedValue(undefined) }),
}))

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const discovery: DeveloperDiscoveryViewModel = {
  copy: { eyebrow: 'Developers', title: 'Discovery status', description: 'Observed public artifacts.', readOnlyNotice: 'Read-only facts do not authorize a Call.' },
  summaryFacts: [{ label: 'Freshness', value: 'Stale' }, { label: 'Published catalogs', value: '2' }, { label: 'Schema version', value: 'developer-discovery:v1' }],
  artifacts: [
    { kind: 'public_catalog_schema', label: 'Public catalog schema', actionLabel: 'Open schema', href: 'https://ae.example/api/discovery/schema', origin: 'https://ae.example', statusLabel: 'Stale', statusVariant: 'warning', checkedLabel: 'Checked 2 hours ago', code: 'never expose private or demo code' },
    { kind: 'public_catalog_examples', label: 'Public catalog examples', actionLabel: 'Open examples', href: 'https://ae.example/api/discovery/examples', origin: 'https://ae.example', statusLabel: 'Unavailable', statusVariant: 'destructive', checkedLabel: 'Checked just now', code: 'never expose private or demo code' },
  ],
  publicFacts: [{ id: 'example', label: 'Published business', state: 'Public', description: 'Source supplied business context' }],
  routeHealth: [{ id: '/api/businesses', label: 'Business index', state: 'Unavailable', description: '/api/businesses' }],
}

const api: DevelopersApiViewModel = {
  authDescription: 'Use a current scoped Agent access key.', documentVersion: 'v1', versionPolicy: 'Current contract v1.',
  operationGroups: [{ tag: 'Tool market', operations: [
    { operationId: 'listTools', method: 'GET', path: '/api/v1/tools', summary: 'Read published Tools', curl: "curl --request GET 'https://ae.example/api/v1/tools'" },
    { operationId: 'requestQuote', method: 'POST', path: '/api/v1/tools/quote', summary: 'Request an authorized Quote', template: '{\n  "requestAuthorization": "<required value>"\n}', authority: 'Requires supported Request authorization.' },
  ] }],
  problems: [{ kind: 'UNKNOWN', type: 'https://ae.example/problems/unknown', title: 'Unknown outcome', nextStep: 'Do not retry blindly. Inspect the request reference.' }],
  priceExample: { shape: 'ExactAmount', json: '{"currency":"AUD","units":"1250000","exponent":6}', formatted: 'A$1.25' },
}

function checkContents(name: string, expectedIds: readonly string[]) {
  const toggle = screen.getByRole('button', { name })
  const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
  expect(panel).toBeTruthy()
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(toggle)
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  const links = within(panel!).getAllByRole('link')
  expect(links.map((link) => link.getAttribute('href'))).toEqual(expectedIds.map((id) => `#${id}`))
  for (const id of expectedIds) expect(document.getElementById(id)?.tagName).toBe('H2')
  fireEvent.click(links[0]!)
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  for (const id of expectedIds) expect(document.getElementById(id)).toBeTruthy()
}

describe('Arc public document compositions', () => {
  it('keeps each discovery origin, observation and native destination together', () => {
    render(<AeDeveloperDiscoveryPage model={discovery} />)
    for (const artifact of discovery.artifacts) {
      const region = within(screen.getByRole('region', { name: artifact.label }))
      expect(region.getByText(artifact.origin)).toBeTruthy()
      expect(region.getByText(artifact.statusLabel)).toBeTruthy()
      expect(region.getByText(artifact.checkedLabel)).toBeTruthy()
      expect(region.getByRole('link', { name: `${artifact.actionLabel}, ${artifact.label}` }).getAttribute('href')).toBe(artifact.href)
    }
    expect(screen.getByText(discovery.copy.readOnlyNotice)).toBeTruthy()
    for (const row of [...discovery.publicFacts, ...discovery.routeHealth]) {
      const record = screen.getByText(row.label).closest('li')!
      expect(record.textContent).toContain(row.state)
      expect(record.textContent).toContain(row.description)
    }
    for (const fact of discovery.summaryFacts) expect(screen.getByText(fact.label).closest('div')?.textContent).toContain(fact.value)
    expect(screen.queryByText('never expose private or demo code')).toBeNull()
    checkContents('Discovery contents', ['schema', 'facts', 'discovery-source', 'discovery-read-paths'])
  })

  it('shows absent public facts and read paths without stale rows or invented success', () => {
    const view = render(<AeDeveloperDiscoveryPage model={discovery} />)
    view.rerender(<AeDeveloperDiscoveryPage model={{ ...discovery, publicFacts: [], routeHealth: [] }} />)
    expect(screen.getByText(DEVELOPER_DISCOVERY_UI_COPY.emptyFactsHeading)).toBeTruthy()
    expect(screen.getByText(DEVELOPER_DISCOVERY_UI_COPY.emptyFactsDescription)).toBeTruthy()
    expect(screen.getByText(DEVELOPER_DISCOVERY_UI_COPY.emptyRowsHeading)).toBeTruthy()
    expect(screen.getByText(DEVELOPER_DISCOVERY_UI_COPY.emptyRowsDescription)).toBeTruthy()
    expect(screen.queryByText('Published business')).toBeNull()
    expect(screen.queryByText('Business index')).toBeNull()
    expect(screen.getByRole('region', { name: 'Public catalog examples' }).textContent).toContain('Unavailable')
  })

  it('copies only supplied runnable requests and preserves template authority, exact price and retry advice', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<DevelopersApiPage page={api} />)
    const requests = within(screen.getByRole('region', { name: DEVELOPERS_API_COPY.operationsHeading }))
    expect(requests.getByRole('heading', { level: 3, name: 'Tool market' })).toBeTruthy()
    const template = requests.getByRole('heading', { level: 4, name: 'Request an authorized Quote' }).closest('article')!
    expect(template.textContent).toContain('Request template · not runnable')
    expect(template.textContent).toContain('Requires supported Request authorization.')
    expect(template.querySelector('pre')?.textContent).toBe('{\n  "requestAuthorization": "<required value>"\n}')
    expect(within(template).queryByRole('button')).toBeNull()
    fireEvent.click(requests.getByRole('button', { name: 'Copy GET /api/v1/tools cURL' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("curl --request GET 'https://ae.example/api/v1/tools'"))
    const setup = within(screen.getByRole('region', { name: DEVELOPERS_API_COPY.setupHeading }))
    expect(setup.getByText(api.priceExample.json)).toBeTruthy()
    expect(setup.getByText(`Example price: ${api.priceExample.formatted}`)).toBeTruthy()
    expect(setup.getByText(api.authDescription)).toBeTruthy()
    expect(setup.getByRole('link', { name: DEVELOPERS_API_COPY.openApiLink }).getAttribute('href')).toBe('/openapi.json')
    const errors = within(screen.getByRole('region', { name: DEVELOPERS_API_COPY.errorsHeading }))
    expect(errors.getByText(api.problems[0]!.type)).toBeTruthy()
    expect(errors.getByText(/Do not retry blindly/)).toBeTruthy()
    checkContents('API reference contents', ['api-requests-heading', 'api-setup-heading', 'api-errors-heading'])
  })

  it('preserves every published About fact, founder paragraph and destination', () => {
    render(<AeAboutPage />)
    expect(screen.getByRole('heading', { level: 1, name: ABOUT.heading }).id).toBe('about-hero')
    expect(screen.getByText(ABOUT.subhead)).toBeTruthy()
    const image = document.querySelector('img')!
    expect(image.getAttribute('src')).toBe(ABOUT.heroImage)
    expect(image.getAttribute('alt')).toBe('')
    for (const paragraph of ABOUT.editorialParagraphs) expect(screen.getByText(paragraph)).toBeTruthy()
    for (const link of ABOUT.editorialLinks) expect(screen.getByRole('link', { name: link.label }).getAttribute('href')).toBe(link.href)
    for (const feature of ABOUT.features) {
      expect(screen.getByRole('heading', { level: 3, name: feature.title })).toBeTruthy()
      expect(screen.getByText(feature.description)).toBeTruthy()
    }
    expect(screen.getByText(ABOUT.ctaDescription)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'ABN 98 700 838 115 (opens in a new tab)' }).getAttribute('target')).toBe('_blank')
    expect(screen.getByRole('link', { name: 'support@aecon.ai' }).getAttribute('href')).toBe('mailto:support@aecon.ai')
    expect(screen.getByRole('link', { name: ABOUT.ctaPrimary }).getAttribute('href')).toBe('/market')
  })

  it('preserves optional secondary CTA and ReactNode description without simulated confirmation', () => {
    const view = render(<AeSiteCtaBand title="Current project" description={<><span>Known status</span><a href="mailto:owner@example.test">Contact owner</a></>} primary={{ label: 'Setup', to: '/for-agents' }} secondary={{ label: 'Publish', to: '/for-providers' }} />)
    expect(screen.getByRole('link', { name: 'Setup' }).getAttribute('href')).toBe('/for-agents')
    expect(screen.getByRole('link', { name: 'Publish' }).getAttribute('href')).toBe('/for-providers')
    expect(screen.getByRole('link', { name: 'Contact owner' }).getAttribute('href')).toBe('mailto:owner@example.test')
    view.rerender(<AeSiteCtaBand title="Current project" description="Known status" primary={{ label: 'Browse', to: '/market' }} />)
    expect(screen.queryByRole('link', { name: 'Publish' })).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
