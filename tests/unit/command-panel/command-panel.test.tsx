// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import '../../setup/jsdom-dialog'

import { AeCommandPanel, CommandPanelProvider } from '@/components/ae/command-panel'
import {
  initialCommandPanelPages,
  popCommandPanelPage,
  pushCommandPanelPage,
  type CommandPanelStack,
} from '@/components/ae/command-panel/command-panel-state'
import {
  readRecentOperationRefs,
  rememberRecentOperationRef,
} from '@/components/ae/command-panel/recent-operations'
import {
  formatOperationAuthentication,
  formatOperationPrice,
  formatOperationReadiness,
} from '@/modules/market/operation-view-model'
import { operationDetailOutputSchema } from '@/modules/capability-supply/public'
import type {
  PublicOperationDescriptor,
} from '@/modules/capability-supply/public'
import type { PublicOperationDetailRouteResult } from '@/modules/registry/operation-detail-route.functions'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe('command panel page-stack machine', () => {
  it('keeps the search root, grows inspect layers, and pops with a close request', () => {
    expect(initialCommandPanelPages).toEqual([{ kind: 'operations-search' }])

    const stacked = pushCommandPanelPage(initialCommandPanelPages, {
      kind: 'operation-inspect',
      operationRef: 'operation:v1:abc',
    })
    expect(stacked).toHaveLength(2)

    const popped = popCommandPanelPage(stacked)
    expect(popped.closeRequested).toBe(false)
    expect(popped.pages).toEqual([{ kind: 'operations-search' }])

    const closedFromRoot = popCommandPanelPage([{ kind: 'operations-search' }])
    expect(closedFromRoot.closeRequested).toBe(true)
    expect(closedFromRoot.pages).toEqual([{ kind: 'operations-search' }])
  })

  it('stops growing the deck once the depth cap is reached', () => {
    let pages: CommandPanelStack = initialCommandPanelPages
    for (let index = 0; index < 12; index += 1) {
      pages = pushCommandPanelPage(pages, { kind: 'operations-search' })
    }
    expect(pages).toHaveLength(8)
  })
})

describe('recent public Operations', () => {
  it('keeps only the five newest distinct validated public references', () => {
    const operationRefs = Array.from(
      { length: 7 },
      (_, index) => `operation:v1:${index.toString(16).repeat(64)}`,
    )
    for (const operationRef of operationRefs) rememberRecentOperationRef(operationRef)
    rememberRecentOperationRef('not-a-public-operation-ref')

    expect(readRecentOperationRefs()).toEqual(operationRefs.slice(-5).reverse())
  })
})

describe('operator command panel', () => {
  it('opens with cmd+k or ctrl+k and closes again with truthful aria-expanded', async () => {
    renderPanel()

    const trigger = screen.getByRole('button', { name: 'Search' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    fireEvent.keyDown(window, { key: 'K', ctrlKey: true })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })
  })

  it('focuses the search input when slash is pressed while open', async () => {
    renderPanel()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog')

    fireEvent.keyDown(dialog, { key: '/' })
    await waitFor(() => {
      const active = document.activeElement
      expect(active instanceof HTMLInputElement && active.type === 'text').toBe(true)
      expect((active as HTMLInputElement).getAttribute('aria-label')).toBe('Search operations')
    })
  })

  it('provides touch-visible Close at the root and Back on inspection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))
    const readDetail = vi.fn(async (): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: detailFixture(),
    }))

    renderPanel({ openImmediately: true, readDetail })
    expect(screen.getByRole('button', { name: 'Close' }).className).toContain('min-h-touch')

    const input = screen.getByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })

    const back = await screen.findByRole('button', { name: 'Back' })
    expect(back.className).toContain('min-h-touch')
    fireEvent.click(back)
    const restoredInput = await screen.findByRole('combobox', { name: 'Search operations' })
    expect((restoredInput as HTMLInputElement).value).toBe('weather')
    expect(screen.getByRole('option', { name: /Weather forecast/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('renders mocked catalog results, roles them, and pushes inspect on Enter', async () => {
    const searchCalls: Array<{ url: string; body: unknown }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        searchCalls.push({
          url: String(url),
          body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
        })
        return jsonResponse(operationSearchPayload())
      }),
    )
    const readDetail = vi.fn(async (): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: detailFixture(),
    }))

    renderPanel({ readDetail })
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather forecast' } })

    await waitFor(() => {
      expect(searchCalls.length).toBeGreaterThan(0)
      const firstCall = searchCalls[0]
      if (firstCall === undefined) throw new Error('search_call_missing')
      expect(firstCall.url.endsWith('/api/v1/market-operations/search')).toBe(true)
      expect(firstCall.body).toMatchObject({ query: 'weather forecast', limit: 12 })
    })

    const option = await screen.findByRole('option', { name: /Weather forecast/ })
    expect(option.getAttribute('aria-selected')).toBe('true')
    expect(option.textContent).toContain('Price on request')
    expect(option.textContent).toContain('Ready now')
    expect(option.textContent).toContain('AE account invocation')
    const listbox = screen.getByRole('listbox', { name: 'Matching operations' })
    expect(input.getAttribute('aria-controls')).toBe(listbox.getAttribute('id'))
    expect(screen.getByText(/1 matched · showing 1/)).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(readDetail).toHaveBeenCalledWith(TEST_OPERATION_REF)

    // Inspect composes the same market formatters the catalog tiles use.
    const fixture = detailFixture()
    expect(await screen.findByText(formatOperationPrice(fixture.commercial.price))).toBeTruthy()
    expect(screen.getByText(formatOperationAuthentication(fixture.authentication))).toBeTruthy()
    expect(screen.getByText(formatOperationReadiness(fixture.availability.posture))).toBeTruthy()
    expect(screen.getByText('Charged per call.')).toBeTruthy()
    expect(screen.getByText(/Authentication is required/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Connect an agent' }).getAttribute('href')).toBe('/for-agents')
    expect(
      screen.getByRole('link', { name: /Open operation page/ }).getAttribute('href'),
    ).toBe(`/operations/${encodeURIComponent(TEST_OPERATION_REF)}`)
  })

  it('copies the public reference and ready-to-run inspect and call commands', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const readDetail = vi.fn(async (): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: detailFixture(),
    }))

    renderPanel({ openImmediately: true, readDetail })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })

    fireEvent.click(await screen.findByRole('button', { name: 'Copy Operation reference' }))
    expect(writeText).toHaveBeenLastCalledWith(TEST_OPERATION_REF)
    fireEvent.click(screen.getByRole('button', { name: 'Copy Inspect command' }))
    expect(writeText).toHaveBeenLastCalledWith(`ae inspect '${TEST_OPERATION_REF}'`)
    fireEvent.click(screen.getByRole('button', { name: 'Copy Call command' }))
    expect(writeText).toHaveBeenLastCalledWith(
      `ae call '${TEST_OPERATION_REF}' --input '{"from":"USD","to":"EUR","note":"today'\\''s rate"}' --wait`,
    )
  })

  it('shows up to five recently inspected public operation references before search', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))
    const readDetail = vi.fn(async (): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: detailFixture(),
    }))

    renderPanel({ openImmediately: true, readDetail })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather forecast' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })
    await screen.findByRole('button', { name: 'Copy Operation reference' })

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    fireEvent.change(await screen.findByRole('combobox', { name: 'Search operations' }), {
      target: { value: '' },
    })
    const recent = await screen.findByRole('option', { name: new RegExp(TEST_OPERATION_REF) })
    expect(recent.textContent).toContain(TEST_OPERATION_REF)
    const persisted = JSON.stringify(window.localStorage)
    expect(persisted).toContain(TEST_OPERATION_REF)
    expect(persisted).not.toContain('weather forecast')
  })

  it('does not offer a call command without a published input example and guides setup when uncallable', async () => {
    const fixture = detailFixture()
    const { inputExamples: _inputExamples, ...contractWithoutExamples } = fixture.contract
    const readDetail = vi.fn(async (): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: {
        ...fixture,
        contract: contractWithoutExamples,
        availability: { posture: 'unavailable', reason: 'setup_required' },
        navigation: [],
      },
    }))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))

    renderPanel({ openImmediately: true, readDetail })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })

    expect(await screen.findByText(/supplier must finish setup/iu)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Continue supplier setup' }).getAttribute('href')).toBe('/owner/supply')
    expect(screen.queryByRole('button', { name: 'Copy Call command' })).toBeNull()
  })

  it('pops one inspect layer per Escape before closing, then survives ⌘K flicker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(operationSearchPayload())),
    )
    let detailReads = 0
    const readDetail = vi.fn(async (): Promise<PublicOperationDetailRouteResult> => {
      detailReads += 1
      return { kind: 'found', schemaVersion: 'registry-operations:v1' as const, operation: detailFixture() }
    })

    renderPanel({ readDetail })
    const trigger = screen.getByRole('button', { name: 'Search' })
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })
    await screen.findByRole('option', { name: /Weather forecast/ })

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText(/Open operation page/)).toBeTruthy()
    expect(detailReads).toBe(1)

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByText(/Open operation page/)).toBeNull()
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    })

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await screen.findByRole('dialog')
    expect(detailReads).toBe(1)
  })

  it('surfaces honest failure copy when the catalog cannot answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    )

    renderPanel({ openImmediately: true })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })

    expect(await screen.findByText(/temporarily unavailable/)).toBeTruthy()
  })

  it('rejects the retired keyless authentication discriminator', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(operationSearchPayload({ kind: 'keyless' }))),
    )

    renderPanel({ openImmediately: true })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })

    expect(await screen.findByText(/catalog returned something unreadable/)).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Weather forecast/ })).toBeNull()
  })
})

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** Shared canonical-ref constant valid under the published operationRef regex. */
const TEST_OPERATION_REF = `operation:v1:${'a'.repeat(64)}`

function operationSearchPayload(authentication: unknown = { kind: 'ae_api_key' }) {
  return {
    kind: 'ok',
    schemaVersion: 'registry-operations:v1',
    query: 'weather forecast',
    items: [
      {
        operationRef: TEST_OPERATION_REF,
        capabilityId: 'get.open-meteo.forecast',
        title: 'Weather forecast',
        summary: 'Forecast by coordinates.',
        supplier: { name: 'Open-Meteo', slug: 'open-meteo' },
        price: { kind: 'on_request' },
        authentication,
        availability: { posture: 'routeable' },
        navigation: [],
      },
    ],
    matchedCount: 1,
    ranking: [],
    pagination: { limit: 12, hasMore: false },
    navigation: [],
  }
}

/** Runtime-validated through the published detail contract — no casts. */
export function detailFixture(): PublicOperationDescriptor {
  const parsed = operationDetailOutputSchema.parse({
    kind: 'found',
    schemaVersion: 'registry-operations:v1',
    operation: {
      operationRef: TEST_OPERATION_REF,
      operationId: 'op_test_a',
      callVia: '/api/v1/operations/call',
      paymentLane: 'brokered',
      contract: {
        capabilityId: 'fx.convert',
        version: 1,
        inputJsonSchema: {},
        outputJsonSchema: {},
        customerAnnotations: [],
        inputExamples: [{
          label: 'Currency pair',
          input: { from: 'USD', to: 'EUR', note: "today's rate" },
        }],
      },
      business: { businessId: 'b_acme', slug: 'acme-tools', name: 'Acme Tools' },
      offering: {
        offeringRef: 'offering:v1:x',
        revision: 2,
        label: 'Currency conversion',
        summary: 'Convert between currencies.',
      },
      summary: 'Convert USD to EUR at live rates.',
      commercial: {
        price: { kind: 'fixed', amount: { currency: 'USD', units: '25', exponent: 2 } },
        materialTerms: [{ label: 'Terms note', value: 'Charged per call.' }],
        relationship: { kind: 'direct', summary: 'Served by Acme.' },
      },
      dataUse: [],
      effects: [],
      evidence: [],
      cancellation: { kind: 'adapter_managed' },
      recovery: { idempotency: 'required', recovery: 'retry_safe' },
      authentication: { kind: 'x402' },
      transport: { method: 'POST', requestTimeoutMs: 30000 },
      provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
      availability: { posture: 'routeable' },
      navigation: [{
        relation: 'invoke',
        pathTemplate: '/api/v1/operations/call',
        method: 'POST',
        actionId: 'agentic-economy.operation-invoke',
        authentication: 'required',
        surfaces: ['http', 'cli', 'mcp', 'chat'],
      }],
    },
  })
  if (parsed.kind !== 'found') throw new Error('fixture_parse_wrong_branch')
  return parsed.operation
}

function PanelHarness(props: {
  initialOpen: boolean
  readDetail?: (operationRef: string) => Promise<PublicOperationDetailRouteResult>
}): ReactElement {
  const [open, setOpen] = useState(props.initialOpen)
  return (
    <CommandPanelProvider
      open={open}
      onOpenChange={setOpen}
      {...(props.readDetail === undefined ? {} : { readDetail: props.readDetail })}
    >
      <AeCommandPanel />
    </CommandPanelProvider>
  )
}

function renderPanel(options: {
  readDetail?: (operationRef: string) => Promise<PublicOperationDetailRouteResult>
  openImmediately?: boolean
} = {}): void {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/operations/$operationRef' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(
    <RouterContextProvider router={router}>
      <PanelHarness
        initialOpen={options.openImmediately === true}
        {...(options.readDetail === undefined ? {} : { readDetail: options.readDetail })}
      />
    </RouterContextProvider>,
  )
}
