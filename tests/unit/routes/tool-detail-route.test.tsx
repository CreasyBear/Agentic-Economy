/**
 * @vitest-environment jsdom
 */

import { nextActionCode, toToolInspectorModel } from '@/components/ae/market/tool-detail/tool-inspector-model'
import { alternativeToolSearchHref, projectToolObject } from '@/components/ae/shared/listing-family.view-model'
import { projectAdmittedListing, projectDirectoryListing } from '@/modules/registry/public'
import { REFERENCE_RATE_MAX_AGE_MS } from '@/modules/money/public'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { CURRENT_TOOL_PROJECTION_NAVIGATION } from '@/modules/actions/contract'
import { AeToolInspector } from '@/components/ae/market/tool-detail'
import {
  PublicToolRegistrySchemaVersion,
  projectCapabilityTool as projectCapabilityToolWithNavigation,
  type CapabilityToolSourceRecord,
} from '@/modules/capability-supply/public'
import { defineCapabilityContract } from '@/modules/capability-contract/public'
import {
  projectMarketListingEvidence,
  type MarketListingEvidenceProjection,
} from '@/modules/market/listing-evidence'
import {
  callableAlternativesHref,
  nextActionForToolFacts,
} from '@/modules/market/suggested-next-action'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const readDetailMock = vi.hoisted(() => vi.fn())
const readDirectoryDetailMock = vi.hoisted(() => vi.fn())
vi.mock('@/modules/market/tool-detail-route.functions', () => ({
  readPublicToolDetailRouteServer: readDetailMock,
  readDirectoryToolDetailRouteServer: readDirectoryDetailMock,
}))

import { PublicToolDetail, Route } from '@/routes/tools.$toolRef'
import type { PublicToolDetailProps } from '@/components/ae/market/public-tool-detail/PublicToolDetail'
import { DirectoryToolPage } from '@/components/ae/market/public-tool-detail/DirectoryToolPage'
import { Route as DirectoryRoute } from '@/routes/tools.$providerHost.$slug'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

const sourceRecord = {
  operationId: 'operation:invoice.extract',
  publicationRef: 'publication:invoice.extract',
  publicationRevision: 4,
  runtimeEnvironment: 'production',
  networkId: 'ae:public',
  contract: defineCapabilityContract({
    contractFormat: 'ae.capability-contract:v2',
    capabilityId: 'invoice.extract',
    version: 2,
    name: 'Invoice line-item extraction',
    description: 'Extract structured line items from one supplier invoice.',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        documentUrl: { type: 'string', description: 'Public invoice URL' },
        includeTax: { type: 'boolean', description: 'Return tax columns' },
      },
      required: ['documentUrl'],
      additionalProperties: false,
    },
    inputExamples: [{
      label: 'Public invoice',
      input: { documentUrl: 'https://docs.example/invoice.pdf', includeTax: true },
    }],
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { lineItems: { type: 'array' } },
      required: ['lineItems'],
      additionalProperties: false,
    },
    customerAnnotations: [
      { annotationId: 'invoice-url', document: 'input', pointer: '/documentUrl', label: 'Invoice URL', role: 'request' },
      { annotationId: 'line-items', document: 'output', pointer: '/lineItems', label: 'Line items', role: 'completion_evidence' },
    ],
    dataUse: [
      {
        effectId: 'release:invoice',
        inputPointer: '/documentUrl',
        classification: 'public',
        phase: 'execution',
        recipient: { kind: 'selected_binding' },
        purposes: ['invoice extraction'],
      },
      {
        effectId: 'release:settings',
        inputPointer: '/includeTax',
        classification: 'public',
        phase: 'execution',
        recipient: { kind: 'selected_binding' },
        purposes: ['invoice extraction settings'],
      },
    ],
    effects: [
      {
        effectId: 'release:invoice',
        class: 'data_release',
        authority: 'explicit',
        reversibility: 'irreversible',
      },
      {
        effectId: 'release:settings',
        class: 'data_release',
        authority: 'explicit',
        reversibility: 'irreversible',
      },
    ],
    evidence: [{ evidenceId: 'evidence:line-items', outputPointer: '/lineItems', purpose: 'completion' }],
    lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
  }),
  business: { businessId: 'business:ledger-labs', slug: 'ledger-labs', name: 'Ledger Labs' },
  listing: {
    listingRef: 'listing:invoice-extraction',
    revision: 3,
    label: 'Invoice line-item extraction',
    summary: 'Structured invoice data.',
  },
  price: { kind: 'fixed', amount: { currency: 'USD', units: '125', exponent: 2 } },
  priceBreakdown: {
    providerQuotedAmount: { currency: 'USD', units: '100', exponent: 2 },
    agenticEconomyFee: { currency: 'USD', units: '25', exponent: 2 },
    totalBuyerAuthorization: { currency: 'USD', units: '125', exponent: 2 },
    network: 'eip155:8453',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  priceEvidence: {
    sourceRef: 'pricing:invoice@4',
    priceDigest: 'digest:current-price',
    evidenceRefs: ['evidence:pricing'],
    observedAt: 1_000,
    validUntil: 10_000,
  },
  materialTerms: [{ label: 'Billing unit', value: 'Per accepted extraction' }],
  commercialRelationship: { kind: 'direct', summary: 'Provider sets this price.' },
  cancellation: { kind: 'unsupported' },
  authentication: { kind: 'platform_credential', scheme: 'api_key', in: 'header', name: 'X-Provider-Key' },
  transport: { method: 'POST', pathTemplate: '/extract', requestTimeoutMs: 5_000 },
  parameterMappings: [],
  provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
  integrated: false,
  routeable: true,
  readiness: { observedAt: 1_000, validUntil: 10_000 },
  searchTerms: ['invoice', 'extract'],
  snapshotKey: 'snapshot:invoice:4',
} as CapabilityToolSourceRecord

const projectCapabilityTool = (
  record: CapabilityToolSourceRecord,
  now: number,
) => projectCapabilityToolWithNavigation(
  record,
  now,
  CURRENT_TOOL_PROJECTION_NAVIGATION,
)

const tool = projectCapabilityTool(sourceRecord, 2_000)

function renderWithRouter(
  result: PublicToolDetailProps['result'],
  _hasBuyerCredential = false,
) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/market' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/tools/$toolRef' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/$slug' }),
  ])
  // A single history entry: `useMarketBackNavigation` always falls back to a
  // plain `<Link to="/market">` here (no prior entry to go back to), the
  // same as a fresh visit in the real app.
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(
    <RouterContextProvider router={router}>
      <PublicToolDetail result={result} />
    </RouterContextProvider>,
  )
}

function renderInspectorWithRouter(
  variant: 'compact' | 'full',
  evidence?: MarketListingEvidenceProjection,
  inspectedTool = tool,
) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/tools/$toolRef' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(
    <RouterContextProvider router={router}>
        <AeToolInspector
          tool={inspectedTool}
        {...(evidence === undefined ? {} : { evidence })}
        variant={variant}
      />
    </RouterContextProvider>,
  )
}

function expectRenderedHrefToMatchProducer(renderedHref: string | null, producerHref: string): void {
  expect(renderedHref).not.toBeNull()
  const rendered = new URL(renderedHref ?? '', 'https://market.example')
  const produced = new URL(producerHref, 'https://market.example')
  expect(rendered.pathname).toBe(produced.pathname)
  expect([...rendered.searchParams.entries()]).toEqual([...produced.searchParams.entries()])
}

afterEach(() => {
  cleanup()
  readDetailMock.mockReset()
  readDirectoryDetailMock.mockReset()
  if (originalClipboard === undefined) Reflect.deleteProperty(navigator, 'clipboard')
  else Object.defineProperty(navigator, 'clipboard', originalClipboard)
})

describe('/tools/$toolRef', () => {
  it('shows the existing time-to-result chart on the public Tool page with its observation meaning', async () => {
    const evidence = projectMarketListingEvidence({
      toolRef: tool.toolRef, ratingCount: 0, ratingSum: 0, completedCalls: 5,
      latencySamplesMs: [38_000, 39_000, 40_000, 41_000, 42_000],
    }, tool.contract.capabilityId)
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool, evidence })
    fireEvent.click(screen.getByRole('button', { name: 'Time to result · last 30 days' }))
    const performance = screen.getByRole('region', { name: 'Time to result · last 30 days' })
    expect(within(performance).getByText('Median 40 s, p95 42 s across 5 completed Calls.')).toBeTruthy()
    expect(within(performance).getByText(/not network time to first byte/)).toBeTruthy()
    expect(within(performance).getByRole('region', { name: 'Time to result' })).toBeTruthy()
    await waitFor(() => expect(performance.querySelector('[data-slot="chart"]')).not.toBeNull())
  })

  it('does not label unavailable public-page performance as zero timed Calls', () => {
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool })
    fireEvent.click(screen.getByRole('button', { name: 'Time to result · last 30 days' }))
    const performance = screen.getByRole('region', { name: 'Time to result · last 30 days' })
    expect(within(performance).getByText('Performance history is unavailable right now.')).toBeTruthy()
    expect(within(performance).queryByRole('region', { name: 'Time to result' })).toBeNull()
    expect(within(performance).queryByText(/0 completed Calls/)).toBeNull()
  })

  it('fills the track record from observed market evidence', async () => {
    const evidence = projectMarketListingEvidence({
      toolRef: tool.toolRef,
      ratingCount: 2,
      ratingSum: 9,
      completedCalls: 8,
      latencySamplesMs: [100, 110, 120, 130, 140],
    }, tool.contract.capabilityId)

    renderInspectorWithRouter('full', evidence)

    const trackRecord = screen.getByRole('region', { name: '30-day track record' })
    expect(within(trackRecord).getByText('8')).toBeTruthy()
    expect(within(trackRecord).getByText('4.5')).toBeTruthy()
    expect(within(trackRecord).getByText('120 ms')).toBeTruthy()
    expect(within(trackRecord).getByText('140 ms')).toBeTruthy()
    const latencyChart = within(trackRecord).getByRole('region', { name: 'Time to result' })
    expect(latencyChart).toBeTruthy()
    expect(within(latencyChart).getByText('5 timed calls')).toBeTruthy()
    expect(within(trackRecord).queryByText(/No completed AE calls/)).toBeNull()
    await waitFor(() => {
      expect(latencyChart.querySelector('[data-slot="chart"]')).not.toBeNull()
    })
  })

  it('shows unavailable evidence without claiming zero calls or timed samples', () => {
    renderInspectorWithRouter('full')
    const history = screen.getByRole('region', { name: '30-day track record' })
    expect(within(history).getByText(/Performance history is unavailable/)).toBeTruthy()
    expect(within(history).queryByText('0')).toBeNull()
    expect(within(history).queryByText('0/5 samples')).toBeNull()
  })

  it('copies the exact Agent request and confirms only after clipboard completion', async () => {
    let complete: (() => void) | undefined
    const pending = new Promise<void>(resolve => { complete = resolve })
    const writeText = vi.fn(() => pending)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    renderInspectorWithRouter('compact')
    const decision = screen.getByRole('region', { name: 'Operational' })
    const copy = within(decision).getByRole('button', { name: 'Copy request for Agent' })
    fireEvent.click(copy)
    expect(writeText).toHaveBeenCalledExactlyOnceWith(nextActionCode(toToolInspectorModel(tool)))
    expect(within(decision).getByRole('status').textContent).toBe('')
    complete?.()
    await waitFor(() => expect(within(decision).getByRole('status').textContent).toBe('Copy request for Agent: Copied'))
    expect(screen.getByRole('link', { name: /Open full Tool details/ }).getAttribute('href')).toBe(`/tools/${encodeURIComponent(tool.toolRef)}`)
  })

  it('announces a clipboard refusal and retains the factual inspector and full detail exit', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('clipboard refused')) } })
    renderInspectorWithRouter('compact')
    const decision = screen.getByRole('region', { name: 'Operational' })
    fireEvent.click(within(decision).getByRole('button', { name: 'Copy request for Agent' }))
    await waitFor(() => expect(within(decision).getByRole('status').textContent).toBe('Copy request for Agent: Could not copy'))
    expect(within(decision).getAllByText('US$1.25').length).toBeGreaterThan(0)
    expect(within(decision).getByRole('button', { name: 'Copy request for Agent' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Open full Tool details/ })).toBeTruthy()
  })

  it('opens named exact technical details and returns keyboard focus when the Arc drawer closes', async () => {
    const { parameters: _parameters, ...withoutFlatParameters } = tool
    renderInspectorWithRouter('full', undefined, withoutFlatParameters)
    const trigger = screen.getByRole('button', { name: 'Open schemas and references' })
    trigger.focus()
    fireEvent.click(trigger)
    const drawer = await screen.findByRole('dialog', { name: 'Schemas and references' })
    expect(drawer.getAttribute('aria-describedby')).toBeTruthy()
    expect(drawer.textContent).toContain(JSON.stringify(tool.contract.inputJsonSchema, null, 2))
    expect(drawer.textContent).toContain(tool.toolRef)
    fireEvent.keyDown(drawer, { key: 'Escape', code: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Schemas and references' })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole('button', { name: 'Close schemas and references' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Schemas and references' })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    fireEvent.click(screen.getByRole('tab', { name: 'Contract' }))
    const inlineTrigger = screen.getByRole('button', { name: 'Read the input JSON Schema' })
    inlineTrigger.focus()
    fireEvent.click(inlineTrigger)
    fireEvent.keyDown(await screen.findByRole('dialog', { name: 'Schemas and references' }), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Schemas and references' })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(inlineTrigger))
  })

  it('keeps compact and full inspectors on the same decision, facts, and continuation', () => {
    renderInspectorWithRouter('compact')

    const compact = document.querySelector('[data-tool-inspector="compact"]')
    if (!(compact instanceof HTMLElement)) throw new Error('compact_inspector_missing')
    const compactView = within(compact)
    const compactDecision = compactView.getByRole('region', { name: 'Operational' })
    expect(within(compactDecision).getByRole('button', { name: 'Copy request for Agent' })).toBeTruthy()
    expect(compactView.queryByRole('region', { name: 'What you can do next' })).toBeNull()
    for (const fact of ['US$1.25', 'API key connection', 'Ready now', 'Per accepted extraction']) {
      expect(compactView.getAllByText(fact).length).toBeGreaterThan(0)
    }

    fireEvent.click(compactView.getByRole('button', {
      name: 'Inputs, terms, risks, and evidence',
    }))
    expect(compactView.getAllByText('documentUrl').length).toBeGreaterThan(0)
    expect(compactView.getByText('reconcile required')).toBeTruthy()
    expect(compactView.getByText(/evidence:line-items/)).toBeTruthy()
    expect(compactView.getAllByText(/release:invoice/).length).toBeGreaterThan(0)
    expect(compactView.getByText(/complete schemas, provenance, transport/)).toBeTruthy()
    expect(compactView.getByRole('button', { name: 'Actions' }).getAttribute('aria-expanded'))
      .toBe('false')
    expect(compactView.queryByRole('button', { name: 'Copy Inspect command' })).toBeNull()
    expect(compactView.getByRole('link', { name: /Open full Tool details/ })).toBeTruthy()

    cleanup()
    renderInspectorWithRouter('full')

    const full = document.querySelector('[data-tool-inspector="full"]')
    if (!(full instanceof HTMLElement)) throw new Error('full_inspector_missing')
    const fullView = within(full)
    expect(fullView.getByRole('region', { name: 'Operational' })).toBeTruthy()
    expect(fullView.getByRole('complementary', { name: 'What you can do next' })).toBeTruthy()
    expect(fullView.getByRole('region', { name: '30-day track record' })).toBeTruthy()
    expect(fullView.getByText(/Performance history is unavailable/)).toBeTruthy()
    expect(fullView.getByRole('button', { name: 'Copy Continue with your Agent' })).toBeTruthy()
    for (const fact of ['US$1.25', 'API key connection', 'Ready now']) {
      expect(fullView.getAllByText(fact).length).toBeGreaterThan(0)
    }
    const contractTab = fullView.getByRole('tab', { name: 'Contract' })
    fireEvent.mouseDown(contractTab, { button: 0, ctrlKey: false })
    fireEvent.click(contractTab)
    expect(fullView.getByText('Per accepted extraction')).toBeTruthy()
    expect(fullView.getAllByText('documentUrl').length).toBeGreaterThan(0)
    expect(fullView.getByText('reconcile required')).toBeTruthy()
    expect(fullView.getByText(/evidence:line-items/)).toBeTruthy()
  })

  it('uses the shared bounded callable alternatives href in both inspector forms', () => {
    const summary = `Find provider's invoice & tax/line-item lookup 100% current status ${'with evidence '.repeat(30)}`
    const unavailableTool = {
      ...tool,
      summary,
      availability: {
        ...tool.availability,
        posture: 'setup_required' as const,
        reason: 'setup_required' as const,
      },
    }
    const expectedHref = callableAlternativesHref(summary)
    const sharedAction = nextActionForToolFacts({
      toolRef: unavailableTool.toolRef,
      searchQuery: summary,
      availabilityPosture: 'setup_required',
      requiresBuyerCredential: false,
      hasBuyerCredential: false,
    })
    expect(sharedAction.href).toBe(expectedHref)
    const expectedUrl = new URL(expectedHref, 'https://market.example')
    expect(expectedUrl.searchParams.get('query')?.length).toBe(200)
    expect(expectedHref).toContain('query=Find+provider%27s')
    expect(expectedHref).toContain('%26')
    expect(expectedHref).toContain('%2F')
    expect(expectedHref).toContain('%25')

    renderInspectorWithRouter('compact', undefined, unavailableTool)
    expectRenderedHrefToMatchProducer(
      screen.getByRole('link', { name: 'Find Tool alternatives' }).getAttribute('href'),
      expectedHref,
    )

    cleanup()
    renderInspectorWithRouter('full', undefined, unavailableTool)
    expectRenderedHrefToMatchProducer(
      screen.getByRole('link', { name: 'Find Tool alternatives' }).getAttribute('href'),
      expectedHref,
    )
  })

  it('keeps one CSS-responsive continuation beside switchable research views and focuses each full record', () => {
    const rendered = renderInspectorWithRouter('full')
    const inspector = screen.getByRole('article', {
      name: 'Invoice line-item extraction Tool details',
    })
    expect(inspector.querySelectorAll('[data-tool-layout="responsive"]')).toHaveLength(1)
    expect(within(inspector).getAllByRole('complementary', {
      name: 'What you can do next',
    })).toHaveLength(1)
    expect(within(inspector).getByRole('tabpanel', { name: 'Overview' })).toBeTruthy()
    const contractTab = within(inspector).getByRole('tab', { name: 'Contract' })
    fireEvent.mouseDown(contractTab, { button: 0, ctrlKey: false })
    fireEvent.click(contractTab)
    expect(within(inspector).getByRole('heading', { name: 'Parameters' })).toBeTruthy()
    expect(document.activeElement).toBe(inspector)

    const secondTool = {
      ...tool,
      toolRef: `operation:v1:${'c'.repeat(64)}` as typeof tool.toolRef,
    }
    const outsideButton = document.createElement('button')
    document.body.append(outsideButton)
    outsideButton.focus()
    rendered.rerender(
      <AeToolInspector
      tool={secondTool}
        variant="full"
      />,
    )
    expect(document.activeElement).toBe(screen.getByRole('article', {
      name: 'Invoice line-item extraction Tool details',
    }))
  })

  it('keeps one Tool identity with price, reciprocal Provider link and a single Start action', () => {
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool, verifiedBusinessSlug: tool.business.slug })
    expect(screen.getByRole('heading', { level: 1, name: 'Invoice line-item extraction' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ledger Labs' }).getAttribute('href')).toBe('/ledger-labs')
    expect(screen.getAllByText('US$1.25 per Call').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Example' })).toBeTruthy()
    expect(screen.getByText(/No published output example/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Search callable alternatives' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Get a Quote' })).toBeNull()
    expect(screen.getByText(/Readiness stale/)).toBeTruthy()
  })

  it('keeps published inputs in the gallery and exact schemas only under Technical', () => {
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool })
    const gallery = screen.getByRole('region', { name: 'Invoice line-item extraction published examples' })
    const inputExample = JSON.stringify({ documentUrl: 'https://docs.example/invoice.pdf', includeTax: true }, null, 2)
    expect(gallery.querySelector('code')?.textContent).toBe(inputExample)
    for (const schema of [tool.contract.inputJsonSchema, tool.contract.outputJsonSchema]) {
      const exact = JSON.stringify(schema, null, 2)
      expect([...gallery.querySelectorAll('code')].some(node => node.textContent === exact)).toBe(false)
      expect([...document.querySelectorAll('code')].filter(node => node.textContent === exact)).toHaveLength(1)
    }
    expect(screen.queryByRole('button', { name: 'Next example' })).toBeNull()
    const technicalTrigger = screen.getByRole('button', { name: /Technical · operation IDs/ })
    fireEvent.click(technicalTrigger)
    const technical = screen.getByRole('region', { name: /Technical · operation IDs/ })
    const technicalCodes = [...technical.querySelectorAll('code')].map(node => node.textContent)
    expect(technicalCodes).toContain(JSON.stringify(tool.contract.outputJsonSchema, null, 2))
    expect(technicalCodes).toContain(JSON.stringify(tool.contract.inputJsonSchema, null, 2))
  })

  it('does not use a schema as an example when no admitted input example is published', () => {
    const noExamples = { ...tool, contract: { ...tool.contract, inputExamples: [] } }
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool: noExamples })
    const gallery = screen.getByRole('region', { name: 'Invoice line-item extraction published examples' })
    expect(within(gallery).getByText('No example input is published for this Tool.')).toBeTruthy()
    expect(gallery.querySelector('code')).toBeNull()
    expect(screen.getByText('No published output example. The output contract is under Technical.')).toBeTruthy()
  })

  it('searches for another eligible Tool by capability and exact current identity, not its title', () => {
    const admitted = projectAdmittedListing(tool)
    const href = alternativeToolSearchHref(admitted, `${tool.contract.capabilityId} ${tool.summary}`)
    const url = new URL(href, 'https://market.example')
    expect(url.pathname).toBe('/market')
    expect(url.searchParams.get('view')).toBe('tools')
    expect(url.searchParams.get('query')).toBe(`${tool.contract.capabilityId} ${tool.summary}`)
    expect(url.searchParams.get('alternativeTo')).toBe(tool.toolRef)

    const directory = projectDirectoryListing({
      resource: 'https://example.test/x402/extract?kind=invoice',
      title: 'Unrelated directory title',
      description: 'Extract invoice line items',
      provider: 'example.test',
      prices: [],
    })
    const sourceRouteRef = `source-route:v1:${'a'.repeat(64)}`
    const external = new URL(alternativeToolSearchHref(directory, 'Extract invoice line items', sourceRouteRef), 'https://market.example')
    expect(external.searchParams.get('query')).toBe('Extract invoice line items')
    expect(external.searchParams.get('alternativeTo')).toBe(sourceRouteRef)
    const unindexed = new URL(alternativeToolSearchHref(directory, 'Extract invoice line items'), 'https://market.example')
    expect(unindexed.searchParams.get('query')).toBe('Extract invoice line items')
    expect(unindexed.searchParams.has('alternativeTo')).toBe(false)
  })

  it('shows source USDC only as a secondary fact after a fresh AUD estimate', () => {
    const listing = projectDirectoryListing({
      resource: 'https://example.test/x402/extract',
      title: 'Extract invoice',
      description: 'Extract invoice line items',
      provider: 'example.test',
      prices: [{ scheme: 'exact', decimalAmount: '0.000001', symbol: 'USDC' }],
    })
    const rate = { source: 'coinbase' as const, base: 'USDC' as const, quote: 'AUD' as const, rate: '1.5', fetchedAt: 1_000 }
    expect(projectToolObject(listing, undefined, 2_000, rate).price?.label).toBe('A$0.01 per Call')
    expect(projectToolObject(listing, undefined, 2_000, rate).price?.source).toContain('directory reported')
    expect(projectToolObject(listing, undefined, rate.fetchedAt + REFERENCE_RATE_MAX_AGE_MS, rate).price?.label)
      .toBe('US$0.000001 per Call')
    expect(projectToolObject(listing, undefined, 2_000).price?.label).toBe('US$0.000001 per Call')
  })

  it('uses a fresh admitted AUD indication ahead of non-AUD source price without rounding the source record', () => {
    const source = projectAdmittedListing(tool)
    const displayed = { kind: 'indicative' as const, amount: { currency: 'AUD', units: '1239000', exponent: 6 }, rateObservedAt: 1_000, validUntil: 300_000 }
    expect(projectToolObject(source, undefined, 2_000, undefined, displayed).price?.label).toBe('A$1.24 per Call')
    expect(projectToolObject(source, undefined, 300_001, undefined, displayed).price?.label).toBe('US$1.25 per Call')
    expect(source.facts.price.kind === 'present' && source.facts.price.value.kind === 'fixed' ? source.facts.price.value.amount : undefined).toBe('1.25')
  })

  it('discloses provider and release classes before the admitted Tool chat action', () => {
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool, verifiedBusinessSlug: tool.business.slug })
    const disclosure = screen.getByRole('region', { name: 'Input and recipient before Quote' })
    expect(within(disclosure).getByText('Your input and its recipient')).toBeTruthy()
    expect(within(disclosure).getByText('Ledger Labs')).toBeTruthy()
    const release = within(disclosure).getByText('/documentUrl').closest('li')
    expect(release?.textContent).toContain('public input')
    expect(release?.textContent).toContain('invoice extraction')
    expect(release?.textContent).toContain('execution, after Quote approval')
    expect(release?.textContent).toContain('Ledger Labs (selected Provider)')
    expect(disclosure.compareDocumentPosition(screen.getByRole('link', { name: /Try in chat/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(disclosure.compareDocumentPosition(screen.getByRole('region', { name: 'Start' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(disclosure).queryByText(/named recipient/i)).toBeNull()
  })

  it('retains explicit input guidance when no transfer classes are published', () => {
    const noTransferClasses = { ...tool, dataUse: [] }
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool: noTransferClasses })
    const disclosure = screen.getByRole('region', { name: 'Input and recipient before Quote' })
    expect(within(disclosure).getByText('No input transfer classes are declared for this Tool. Inspect its input schema before requesting a Quote.')).toBeTruthy()
  })

  it('does not offer a Quote or chat input path when a named recipient has no published identity', () => {
    const unnamedRecipient = {
      ...tool,
      dataUse: tool.dataUse.map(effect => ({ ...effect, recipient: 'named_recipient' as const })),
      availability: { ...tool.availability, posture: 'routeable' as const, observedAt: Date.now(), validUntil: Date.now() + 60_000 },
    }
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool: unnamedRecipient })
    expect(within(screen.getByRole('region', { name: 'Input and recipient before Quote' })).getByText('/documentUrl').closest('li')?.textContent).toContain('recipient identity not published; do not send this input')
    expect(screen.queryByRole('link', { name: /Try in chat/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Search callable alternatives' })).toBeTruthy()
    expect(screen.getByText('Input recipient not identified')).toBeTruthy()
    expect(screen.queryByText(/^Routeable · observed/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Set up to get a Quote' })).toBeNull()
  })

  it('does not link an unverified publisher to an unpublished Business page', () => {
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool })
    expect(screen.getAllByText('Ledger Labs').length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Ledger Labs' })).toBeNull()
  })

  it('makes technical operation IDs a disclosure, not the heading', () => {
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool })
    expect(screen.getByText(/Technical · operation IDs/)).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toContain('operation:v1:')
    expect(screen.getByRole('link', { name: /Try in chat/ }).getAttribute('href')).toContain('/t/new?q=')
  })

  it('keeps the ToolRef route canonical even if a directory URL exists', async () => {
    readDetailMock.mockResolvedValue({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool })
    const loader = Route.options.loader as (input: { params: { toolRef: string } }) => Promise<unknown>
    await expect(loader({ params: { toolRef: tool.toolRef } })).resolves.toMatchObject({ result: { kind: 'found' } })
    expect(readDetailMock).toHaveBeenCalledWith({ data: { toolRef: tool.toolRef } })
  })

  it('rejects malformed references before reading the catalog', async () => {
    const loader = Route.options.loader as (input: { params: { toolRef: string } }) => Promise<unknown>
    await expect(loader({ params: { toolRef: 'not-an-tool' } })).resolves.toEqual({
      result: { kind: 'invalid_ref', toolRef: 'not-an-tool' }, evidence: undefined,
    })
    expect(readDetailMock).not.toHaveBeenCalled()
  })

  it('retries the same Tool when the read is unavailable and shows no commercial claims', () => {
    renderWithRouter({ kind: 'source_unavailable', toolRef: tool.toolRef })
    expect(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')).toContain(encodeURIComponent(tool.toolRef))
    expect(screen.getByRole('link', { name: 'Browse Market' }).getAttribute('href')).toBe('/market')
    expect(screen.queryByRole('link', { name: 'Check status' })).toBeNull()
    expect(screen.queryByText(/USD 1.25/)).toBeNull()
  })

})

describe('/tools/$providerHost/$slug', () => {
  const entry: X402DirectoryEntry = {
    resource: 'https://example.test/x402/invoices',
    title: 'Invoice extraction',
    description: 'Extract line items from invoices',
    protocol: 'x402',
    provider: 'example.test',
    prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0.000001 USDC', decimalAmount: '0.000001', symbol: 'USDC' }],
    metadataJson: '{}',
  }

  it('retains both published directory examples while exposing its input schema once in Technical', () => {
    const input = '{"documentUrl":"https://docs.example/invoice.pdf"}'
    const output = '{"lineItems":[{"amount":"12.34"}]}'
    const schema = '{"type":"object","required":["documentUrl"]}'
    const publishedEntry = { ...entry, input: { fields: [], exampleJson: input, schemaJson: schema }, output: { fields: [], exampleJson: output } }
    const root = createRootRoute()
    const router = createRouter({ routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/' }), createRoute({ getParentRoute: () => root, path: '/market' })]), history: createMemoryHistory({ initialEntries: ['/'] }) })
    render(<RouterContextProvider router={router}><DirectoryToolPage metadata={{ kind: 'found_upstream', item: { entry: publishedEntry } }} providerHost="example.test" slug="invoices" /></RouterContextProvider>)
    const gallery = screen.getByRole('region', { name: 'Invoice extraction published examples' })
    expect(within(gallery).getByText(input)).toBeTruthy()
    expect(within(gallery).queryByText(schema)).toBeNull()
    expect([...document.querySelectorAll('code')].filter(node => node.textContent === schema)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Next example' }))
    expect(within(gallery).getByRole('group', { name: 'Output example, 2 of 2' }).textContent).toContain(output)
    expect(screen.queryByRole('button', { name: 'Show Input contract' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Technical · endpoint and source' }))
    expect(within(screen.getByRole('region', { name: 'Technical · endpoint and source' })).getByText(schema)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Try in chat/ })).toBeNull()
  })

  it('resolves an external compact identity to human detail and rejects a mismatched Host', async () => {
    const id = `registry:${'b'.repeat(64)}`
    const metadata = { kind: 'found_upstream' as const, item: { entry } }
    const referenceRate = { source: 'coinbase' as const, base: 'USDC' as const, quote: 'AUD' as const, rate: '1.5', fetchedAt: Date.now() }
    readDirectoryDetailMock.mockResolvedValue({ metadata, referenceRate })
    const loader = DirectoryRoute.options.loader
    if (typeof loader !== 'function') throw new Error('directory_loader_missing')
    await expect(loader({ params: { providerHost: 'example.test', slug: id }, location: { state: {} } } as never)).resolves.toEqual({ metadata, referenceRate })
    expect(readDirectoryDetailMock).toHaveBeenCalledWith({ data: { id } })
    expect(readDirectoryDetailMock).toHaveBeenCalledTimes(1)
    await expect(loader({ params: { providerHost: 'other.test', slug: id }, location: { state: {} } } as never)).resolves.toEqual({ metadata: { kind: 'unavailable', reason: 'query_invalid' } })
  })

  it('passes fresh source rate to a directory-only detail and never claims an AE input recipient', async () => {
    const metadata = { kind: 'found_upstream' as const, item: { entry } }
    const referenceRate = { source: 'coinbase' as const, base: 'USDC' as const, quote: 'AUD' as const, rate: '1.5', fetchedAt: Date.now() }
    readDirectoryDetailMock.mockResolvedValue({ metadata, referenceRate })
    const loader = DirectoryRoute.options.loader as (input: { params: { providerHost: string; slug: string } }) => Promise<unknown>
    await expect(loader({ params: { providerHost: 'example.test', slug: 'invoices' } })).resolves.toMatchObject({ metadata, referenceRate })
    expect(readDirectoryDetailMock).toHaveBeenCalledWith({ data: { providerKey: 'example.test', slug: 'invoices' } })

    const root = createRootRoute()
    const routeTree = root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/' }),
      createRoute({ getParentRoute: () => root, path: '/market' }),
    ])
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
    render(<RouterContextProvider router={router}><DirectoryToolPage metadata={metadata} providerHost="example.test" slug="invoices" referenceRate={referenceRate} /></RouterContextProvider>)
    expect(screen.getByText('A$0.01 per Call')).toBeTruthy()
    expect(screen.getByText(/Provider-listed source price: 0.000001 USDC/)).toBeTruthy()
    expect(screen.getByText(/No admitted AE Tool or verified execution Provider/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Search for a similar Tool' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Try in chat/ })).toBeNull()

    cleanup()
    render(<RouterContextProvider router={router}><DirectoryToolPage metadata={{
      kind: 'found',
      coverage: {
        source: 'coinbase', generation: 'active', indexedTotal: 1, reportedTotal: 1,
        reportedTotalAtStart: 1, sourceChangedDuringScan: false,
        duplicateObservations: 0, pagesFetched: 1, startedAt: 1_000,
        completedAt: 2_000, completeness: 'completed_observed_scan',
      },
      item: {
        entry, category: 'documents', categorySource: 'provider_declared',
        observedAt: 2_000, sourceDigest: 'digest', sourceRouteRef: `source-route:v1:${'b'.repeat(64)}`,
      },
    }} providerHost="example.test" slug="invoices" referenceRate={referenceRate} /></RouterContextProvider>)
    expect(screen.getByRole('button', { name: 'Search callable alternatives' })).toBeTruthy()
  })
})


describe('selected-request inspection presentation', () => {
  it('keeps an admitted unobserved Tool usable without claiming it is healthy', () => {
    if (tool === undefined) throw new Error('Tool fixture missing')
    const model = toToolInspectorModel({
      ...tool,
      availability: { posture: 'setup_required', reason: 'inspection_required' },
    })
    expect(model.readinessLabel).toBe('Checked when quoting')
    expect(model.availabilityPosture).toBe('setup_required')
    expect(model.nextAction.command).toContain(tool.toolRef)
    expect(model.nextAction.command).toContain('get a fresh Quote')
    expect(model.nextAction.command).toContain('resume that Call instead of creating another purchase')
    expect(model.nextAction.warning).toBeUndefined()
  })
})
