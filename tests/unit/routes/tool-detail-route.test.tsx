/**
 * @vitest-environment jsdom
 */

import { toToolInspectorModel } from '@/components/ae/market/tool-detail/tool-inspector-model'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

const readDetailMock = vi.hoisted(() => vi.fn())
vi.mock('@/modules/market/tool-detail-route.functions', () => ({
  readPublicToolDetailRouteServer: readDetailMock,
}))

import { PublicToolDetail, Route } from '@/routes/tools.$toolRef'
import type { PublicToolDetailProps } from '@/components/ae/market/public-tool-detail/PublicToolDetail'

const sourceRecord = {
  operationId: 'operation:invoice.extract',
  publicationRef: 'publication:invoice.extract',
  publicationRevision: 4,
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
})

describe('/tools/$toolRef', () => {
  it('fills the track record from observed market evidence', () => {
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
  })

  it('shows unavailable evidence without claiming zero calls or timed samples', () => {
    renderInspectorWithRouter('full')
    const history = screen.getByRole('region', { name: '30-day track record' })
    expect(within(history).getByText(/Performance history is unavailable/)).toBeTruthy()
    expect(within(history).queryByText('0')).toBeNull()
    expect(within(history).queryByText('0/5 samples')).toBeNull()
  })

  it('keeps compact and full inspectors on the same decision, facts, and continuation', () => {
    renderInspectorWithRouter('compact')

    const compact = document.querySelector('[data-tool-inspector="compact"]')
    if (!(compact instanceof HTMLElement)) throw new Error('compact_inspector_missing')
    const compactView = within(compact)
    const compactDecision = compactView.getByRole('region', { name: 'Operational' })
    expect(within(compactDecision).getByRole('button', { name: 'Copy request for Agent' })).toBeTruthy()
    expect(compactView.queryByRole('region', { name: 'What you can do next' })).toBeNull()
    for (const fact of ['AUD estimate temporarily unavailable', 'API key connection', 'Ready now', 'Per accepted extraction']) {
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
    for (const fact of ['AUD estimate temporarily unavailable', 'API key connection', 'Ready now']) {
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
    expect(screen.getAllByText('AUD estimate temporarily unavailable').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Example' })).toBeTruthy()
    expect(screen.getByText(/No published output example/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Find an alternative' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Get a Quote' })).toBeNull()
    expect(screen.getByText(/Readiness stale/)).toBeTruthy()
  })

  it('does not link an unverified publisher to an unpublished Business page', () => {
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool })
    expect(screen.getByText('Ledger Labs')).toBeTruthy()
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

  it('has a recovery path without commercial claims if the Tool read is unavailable', () => {
    renderWithRouter({ kind: 'source_unavailable', toolRef: tool.toolRef })
    expect(screen.getByRole('link', { name: 'Check status' })).toBeTruthy()
    expect(screen.queryByText(/USD 1.25/)).toBeNull()
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
