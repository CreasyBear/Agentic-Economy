/**
 * @vitest-environment jsdom
 */

import { nextActionCode, toToolInspectorModel } from '@/components/ae/market/tool-detail/tool-inspector-model'
import { alternativeToolSearchHref, projectToolObject } from '@/components/ae/shared/listing-family.view-model'
import { projectAdmittedListing, projectDirectoryListing } from '@/modules/registry/public'
import { REFERENCE_RATE_MAX_AGE_MS } from '@/modules/money/public'
import { parseRunRequest } from '@/modules/chat/run-request'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter, isRedirect } from '@tanstack/react-router'
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

const canonicalUrlMock = vi.hoisted(() => vi.fn(async () => 'https://aecon.test'))
vi.mock('@/lib/server/canonical-url.functions', () => ({ readCanonicalBaseUrlServer: canonicalUrlMock }))
const authState = vi.hoisted(() => ({ isSignedIn: false }))
vi.mock('@clerk/tanstack-react-start', () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn }) }))

import { PublicToolDetail, Route } from '@/routes/tools.$toolRef'
import type { PublicToolDetailProps } from '@/components/ae/market/public-tool-detail/PublicToolDetail'
import { DirectoryToolPage } from '@/components/ae/market/public-tool-detail/DirectoryToolPage'
import { Route as DirectoryRoute } from '@/routes/tools.$providerHost.$slug'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { projectX402DirectoryEntry } from '@/modules/market/x402-directory-projection'
import { REASON_COPY_FALLBACK } from '@/content/reason-copy'

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
// Fresh routeable availability: the page only offers to run a Tool whose readiness is current.
const callableTool = { ...tool, availability: { ...tool.availability, posture: 'routeable' as const, observedAt: Date.now(), validUntil: Date.now() + 60_000 } }

function renderWithRouter(
  result: PublicToolDetailProps['result'],
  _hasBuyerCredential = false,
  /** `null` renders without a canonical URL; a default parameter would swallow `undefined`. */
  baseUrl: string | null = 'https://aecon.test',
  search?: PublicToolDetailProps['search'],
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
      <PublicToolDetail result={result} baseUrl={baseUrl ?? undefined} {...(search === undefined ? {} : { search })} />
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
  authState.isSignedIn = false
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
    const record = screen.getByRole('region', { name: 'Track record' })
    expect(within(record).getByText('Median 40 s, p95 42 s across 5 completed calls in the last 30 days.')).toBeTruthy()
    expect(within(record).getByRole('region', { name: 'Time to result' })).toBeTruthy()
    await waitFor(() => expect(record.querySelector('[data-slot="chart"]')).not.toBeNull(), { timeout: 5000 })
    expect(within(record).getByText(/not network time to first byte/)).toBeTruthy()
  })

  it('does not label unavailable public-page performance as zero timed Calls', () => {
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool })
    const record = screen.getByRole('region', { name: 'Track record' })
    expect(within(record).getByText('Timing history is unavailable')).toBeTruthy()
    expect(within(record).getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(within(record).queryByRole('region', { name: 'Time to result' })).toBeNull()
    expect(within(record).queryByText(/0 completed calls/)).toBeNull()
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
    expect(within(trackRecord).getByText('140ms')).toBeTruthy()
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
    expect(within(decision).getAllByText('1.25 USD').length).toBeGreaterThan(0)
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
    for (const fact of ['1.25 USD', 'API key connection', 'Ready now', 'Per accepted extraction']) {
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
    for (const fact of ['1.25 USD', 'API key connection', 'Ready now']) {
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

  it('keeps one Tool identity with price, reciprocal Provider link and one Start destination', () => {
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool, verifiedBusinessSlug: tool.business.slug })
    expect(screen.getByRole('heading', { level: 1, name: 'Invoice line-item extraction' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ledger Labs' }).getAttribute('href')).toBe('/ledger-labs')
    expect(document.body.textContent).toContain('1.25 USD per call')
    expect(screen.getByText('No sample output yet')).toBeTruthy()
    expect(screen.getByText('Unavailable')).toBeTruthy()
    // The card and the phone bar share one action; a stale Tool offers alternatives, never a Quote.
    const start = screen.getAllByRole('link', { name: 'See similar tools' })
    expect(new Set(start.map(link => link.getAttribute('href'))).size).toBe(1)
    expect(screen.queryByRole('link', { name: 'Sign in to run it' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Get a Quote' })).toBeNull()
  })

  it('keeps the published input example in Try it and the exact schemas only under Schema', () => {
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool: callableTool })
    expect(screen.getByRole('textbox', { name: /Document url/ }).getAttribute('value')).toBe('https://docs.example/invoice.pdf')
    expect(screen.getByRole('checkbox', { name: 'Include tax' }).getAttribute('aria-checked')).toBe('true')
    const schemaTab = screen.getByRole('tab', { name: 'Schema' })
    fireEvent.mouseDown(schemaTab, { button: 0, ctrlKey: false })
    fireEvent.click(schemaTab)
    const panel = screen.getByRole('tabpanel', { name: 'Schema' })
    expect(within(panel).getByRole('heading', { name: 'Input' })).toBeTruthy()
    expect(within(panel).getByRole('heading', { name: 'Output' })).toBeTruthy()
    expect(within(panel).getByRole('tree', { name: 'Input schema' }).textContent).toContain('documentUrl')
    expect(within(panel).getByRole('tree', { name: 'Output schema' }).textContent).toContain('lineItems')
  })

  it('does not show a validation error on the untouched sample until the JSON is edited', () => {
    const invalidSample = { ...callableTool, contract: { ...callableTool.contract, inputExamples: [{ label: 'Missing URL', input: { includeTax: true } }] } }
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool: invalidSample })
    fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
    const editor = screen.getByRole('textbox', { name: 'Request JSON' })
    expect(editor.getAttribute('aria-invalid')).not.toBe('true')
    fireEvent.change(editor, { target: { value: '{"includeTax": true' } })
    expect(screen.getByRole('textbox', { name: 'Request JSON' }).getAttribute('aria-invalid')).toBe('true')
  })

  it('does not use a schema as an example when no admitted input example is published', () => {
    const noExamples = { ...callableTool, contract: { ...callableTool.contract, inputExamples: [] } }
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool: noExamples })
    expect(screen.getByRole('textbox', { name: /Document url/ }).getAttribute('value')).toBe('')
    expect(document.body.textContent).not.toContain('https://docs.example/invoice.pdf')
    expect(screen.getByText(/The provider hasn't published a sample response/)).toBeTruthy()
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
    expect(projectToolObject(listing, undefined, 2_000, rate).price?.label).toBe('A$0.000002 per Call')
    expect(projectToolObject(listing, undefined, 2_000, rate).price?.source).toContain('directory reported')
    expect(projectToolObject(listing, undefined, rate.fetchedAt + REFERENCE_RATE_MAX_AGE_MS, rate).price?.label)
      .toBe('0.000001 USDC per Call')
    expect(projectToolObject(listing, undefined, 2_000).price?.label).toBe('0.000001 USDC per Call')
  })

  it('uses a fresh admitted AUD indication ahead of non-AUD source price without rounding the source record', () => {
    const source = projectAdmittedListing(tool)
    const displayed = { kind: 'indicative' as const, amount: { currency: 'AUD', units: '1239000', exponent: 6 }, rateObservedAt: 1_000, validUntil: 300_000 }
    expect(projectToolObject(source, undefined, 2_000, undefined, displayed).price?.label).toBe('A$1.24 per Call')
    expect(projectToolObject(source, undefined, 300_001, undefined, displayed).price?.label).toBe('1.25 USD per Call')
    expect(source.facts.price.kind === 'present' && source.facts.price.value.kind === 'fixed' ? source.facts.price.value.amount : undefined).toBe('1.25')
  })

  it('discloses the Provider and the fields sent before the admitted Tool run action', () => {
    authState.isSignedIn = true
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool: callableTool, verifiedBusinessSlug: tool.business.slug })
    const disclosure = screen.getByText('Your input goes to Ledger Labs').closest('[role="status"], [role="alert"], div')
    if (!(disclosure instanceof HTMLElement)) throw new Error('disclosure_missing')
    expect(within(disclosure).getByText('/documentUrl')).toBeTruthy()
    expect(within(disclosure).getByText('/includeTax')).toBeTruthy()
    expect(disclosure.textContent).toContain('Nothing runs until you approve the price.')
    const run = screen.getAllByRole('link', { name: 'Run this call' })[0]
    if (run === undefined) throw new Error('run_missing')
    const prompt = new URL(run.getAttribute('href') ?? '', 'https://aecon.test').searchParams.get('q')
    expect(parseRunRequest(prompt ?? '')).toEqual({ toolRef: callableTool.toolRef, input: callableTool.contract.inputExamples?.[0]?.input })
    expect(disclosure.compareDocumentPosition(run) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText(/named recipient/i)).toBeNull()
  })


  it('does not offer a run or chat input path when a named recipient has no published identity', () => {
    authState.isSignedIn = true
    const unnamedRecipient = {
      ...callableTool,
      dataUse: tool.dataUse.map(effect => ({ ...effect, recipient: 'named_recipient' as const })),
    }
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool: unnamedRecipient })
    expect(screen.getByText('Needs attention')).toBeTruthy()
    expect(screen.queryByText('Ready now')).toBeNull()
    expect(screen.getAllByText('The provider hasn’t said who receives your input, so aecon won’t run it.').length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: /Run this call/ })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Try it' })).toBeNull()
    expect(screen.queryByText(/Your input goes to/)).toBeNull()
    expect(screen.getAllByRole('link', { name: 'See similar tools' }).length).toBeGreaterThan(0)
  })

  it('does not link an unverified publisher to an unpublished Business page', () => {
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool })
    expect(screen.getAllByText('Ledger Labs').length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Ledger Labs' })).toBeNull()
  })

  it('keeps the Tool ref a copyable fact, not the heading, and runs through chat once signed in', () => {
    authState.isSignedIn = true
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool: callableTool })
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toContain('operation:v1:')
    expect(screen.getByText('Tool ID').parentElement?.querySelector('code')?.textContent).toBe(tool.toolRef)
    expect(screen.getByRole('button', { name: 'Copy tool id' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Run this call' })[0]?.getAttribute('href')).toContain('/t/new?q=')
  })

  it('says so when a callable Tool declares no input fields sent to its Provider', () => {
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool: { ...callableTool, dataUse: [] } })
    expect(screen.getByText('Ledger Labs hasn’t declared which input fields it receives')).toBeTruthy()
    expect(screen.queryByText(/Your input goes to/)).toBeNull()
  })

  it('asks a signed-out visitor to sign in instead of running the Tool', () => {
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool: callableTool })
    expect(screen.getAllByRole('link', { name: 'Sign in to run it' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Run this call' })).toBeNull()
  })

  it('keeps the ToolRef route canonical even if a directory URL exists', async () => {
    readDetailMock.mockResolvedValue({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool })
    const loader = Route.options.loader as (input: { params: { toolRef: string } }) => Promise<unknown>
    await expect(loader({ params: { toolRef: tool.toolRef } })).resolves.toMatchObject({ result: { kind: 'found' } })
    expect(readDetailMock).toHaveBeenCalledWith({ data: { toolRef: tool.toolRef } })
  })

  it('rejects malformed references before reading the catalog', async () => {
    const loader = Route.options.loader as (input: { params: { toolRef: string } }) => Promise<unknown>
    await expect(loader({ params: { toolRef: 'not-an-tool' } })).rejects.toMatchObject({
      isNotFound: true, data: { kind: 'invalid_ref', toolRef: 'not-an-tool' },
    })
    expect(readDetailMock).not.toHaveBeenCalled()
  })

  it('still renders the Tool when the canonical URL cannot be resolved, hiding only the connect block', async () => {
    readDetailMock.mockResolvedValue({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool: callableTool })
    canonicalUrlMock.mockRejectedValueOnce(new Error('canonical_base_url_configuration_required'))
    const loader = Route.options.loader as (input: { params: { toolRef: string } }) => Promise<unknown>
    await expect(loader({ params: { toolRef: tool.toolRef } })).resolves.toMatchObject({ result: { kind: 'found' }, baseUrl: undefined })
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool: callableTool }, false, null)
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Connect your agent' })).toBeTruthy()
    expect(screen.queryByText(/\/mcp$/u)).toBeNull()
  })

  it('puts Connect your agent above the track record and says where the curl key comes from', () => {
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool: callableTool })
    const connect = screen.getByRole('heading', { name: 'Connect your agent' })
    const record = screen.getByRole('heading', { name: 'Track record' })
    expect(connect.compareDocumentPosition(record) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const curlTab = screen.getByRole('tab', { name: 'curl' })
    fireEvent.mouseDown(curlTab, { button: 0, ctrlKey: false })
    fireEvent.click(curlTab)
    expect(screen.getByRole('link', { name: 'Create an agent key' }).getAttribute('href')).toBe('/owner/settings/agent-keys')
    expect(screen.getByText(/AE_API_KEY/u, { selector: 'p' })).toBeTruthy()
  })

  it('names the scrollable code region it makes focusable', () => {
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool: callableTool })
    const code = screen.getAllByRole('region', { name: 'Selectable source code' })[0]
    expect(code?.tagName).toBe('PRE')
    expect(code?.getAttribute('tabindex')).toBe('0')
  })

  it('states the chat size limit and offers the agent path when the input is too long to run here', () => {
    authState.isSignedIn = true
    const longInput = { documentUrl: `https://docs.example/${'a'.repeat(1_900)}` }
    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool: callableTool }, false, 'https://aecon.test', { tab: 'try', input: longInput })
    expect(screen.queryByRole('link', { name: 'Run this call' })).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Run it from your agent' })[0]?.getAttribute('href')).toBe('#connect')
    expect(screen.getByText(/up to 1,500 bytes of JSON/u)).toBeTruthy()
  })

  it('gives a tool that is not found a top-level heading', () => {
    renderWithRouter({ kind: 'not_found', toolRef: tool.toolRef } as unknown as PublicToolDetailProps['result'])
    expect(screen.getByRole('heading', { level: 1, name: 'This tool is unknown or no longer current' })).toBeTruthy()
  })

  it('retries the same Tool when the read is unavailable and shows no commercial claims', () => {
    renderWithRouter({ kind: 'source_unavailable', toolRef: tool.toolRef })
    expect(screen.getByRole('heading', { name: 'Tool details are unavailable' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse tools' }).getAttribute('href')).toBe('/market')
    expect(screen.queryByRole('link', { name: 'Check status' })).toBeNull()
    expect(screen.queryByText(/1\.25 USD|US\$1\.25|USD 1\.25/)).toBeNull()
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

  it('hands chat the admitted request body instead of the Provider HTTP envelope', () => {
    authState.isSignedIn = true
    const values = { url: 'https://example.com', max_chars: 8000 }
    const source = { resource: entry.resource, extensions: { bazaar: {
      info: { input: { type: 'http', method: 'POST', bodyType: 'json', body: values }, output: { type: 'json' } },
      schema: { properties: { input: { properties: { body: { properties: { url: { type: 'string' }, max_chars: { type: 'integer' } }, required: ['url'] } } } } },
    } } }
    const root = createRootRoute()
    const router = createRouter({ routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/' })]), history: createMemoryHistory({ initialEntries: ['/'] }) })
    render(<RouterContextProvider router={router}><DirectoryToolPage baseUrl="https://aecon.test" metadata={{
      kind: 'found', coverage: {
        source: 'coinbase', generation: 'active', indexedTotal: 1, reportedTotal: 1, reportedTotalAtStart: 1,
        sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 1, startedAt: 1_000,
        completedAt: 2_000, completeness: 'completed_observed_scan',
      }, item: { entry: projectX402DirectoryEntry(source), category: 'documents', categorySource: 'provider_declared', observedAt: 2_000, sourceDigest: 'digest',
        choice: { access: 'ae_callable', toolRef: `registry:${'c'.repeat(64)}` } },
    }} providerHost="example.test" slug="invoices" /></RouterContextProvider>)
    const href = screen.getAllByRole('link', { name: 'Run this call' })[0]?.getAttribute('href')
    if (href == null) throw new Error('run_link_missing')
    const prompt = new URL(href, 'https://aecon.test').searchParams.get('q')
    expect(parseRunRequest(prompt ?? '')).toEqual({ toolRef: `registry:${'c'.repeat(64)}`, input: values })
    expect(prompt).not.toContain('bodyType')
  })

  it('retains both published directory examples while exposing its input schema once under Schema', () => {
    const input = '{"documentUrl":"https://docs.example/invoice.pdf"}'
    const output = '{"lineItems":[{"amount":"12.34"}]}'
    const schema = '{"type":"object","required":["documentUrl"]}'
    const publishedEntry = { ...entry, input: { fields: [], exampleJson: input, schemaJson: schema }, output: { fields: [], exampleJson: output } }
    const root = createRootRoute()
    const router = createRouter({ routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/' }), createRoute({ getParentRoute: () => root, path: '/market' })]), history: createMemoryHistory({ initialEntries: ['/'] }) })
    render(<RouterContextProvider router={router}><DirectoryToolPage baseUrl="https://aecon.test" metadata={{ kind: 'found_upstream', item: { entry: publishedEntry } }} providerHost="example.test" slug="invoices" /></RouterContextProvider>)
    expect(screen.queryByRole('tab', { name: 'Try it' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Run this call|Sign in to run it/ })).toBeNull()
    expect(screen.getByRole('tree', { name: 'Sample response' }).textContent).toContain('lineItems')
    const schemaTab = screen.getByRole('tab', { name: 'Schema' })
    fireEvent.mouseDown(schemaTab, { button: 0, ctrlKey: false })
    fireEvent.click(schemaTab)
    const panel = screen.getByRole('tabpanel', { name: 'Schema' })
    expect(within(panel).getByRole('tree', { name: 'Input schema' }).textContent).toContain('documentUrl')
    expect(within(panel).getByText('Request')).toBeTruthy()
    expect(within(panel).getByText('https://example.test/x402/invoices')).toBeTruthy()
    // The published input example is part of this listing; a preview page must still show it.
    expect(screen.getByRole('tree', { name: 'Sample input' }).textContent).toContain('https://docs.example/invoice.pdf')
  })

  it('resolves an external compact identity to human detail and rejects a mismatched Host', async () => {
    const id = `registry:${'b'.repeat(64)}`
    const metadata = { kind: 'found_upstream' as const, item: { entry } }
    const referenceRate = { source: 'coinbase' as const, base: 'USDC' as const, quote: 'AUD' as const, rate: '1.5', fetchedAt: Date.now() }
    readDirectoryDetailMock.mockResolvedValue({ metadata, referenceRate })
    const loader = DirectoryRoute.options.loader
    if (typeof loader !== 'function') throw new Error('directory_loader_missing')
    await expect(loader({ params: { providerHost: 'example.test', slug: id }, location: { state: {} } } as never)).resolves.toEqual({ metadata, referenceRate, baseUrl: 'https://aecon.test' })
    expect(readDirectoryDetailMock).toHaveBeenCalledWith({ data: { id } })
    expect(readDirectoryDetailMock).toHaveBeenCalledTimes(1)
    await expect(loader({ params: { providerHost: 'other.test', slug: id }, location: { state: {} } } as never)).resolves.toEqual({ metadata: { kind: 'unavailable', reason: 'query_invalid' }, baseUrl: 'https://aecon.test' })
    canonicalUrlMock.mockRejectedValueOnce(new Error('canonical_base_url_configuration_required'))
    await expect(loader({ params: { providerHost: 'example.test', slug: id }, location: { state: {} } } as never)).resolves.toEqual({ metadata, referenceRate, baseUrl: undefined })
  })

  it('redirects to the admitted Tool only when its detail read is found, else keeps the directory listing', async () => {
    const toolRef = `operation:v1:${'c'.repeat(64)}`
    const metadata = { kind: 'found' as const, item: { entry, toolRef } }
    readDirectoryDetailMock.mockResolvedValue({ metadata })
    const loader = DirectoryRoute.options.loader as (input: unknown) => Promise<unknown>
    const input = { params: { providerHost: 'example.test', slug: 'invoices' }, location: { state: {} } }

    readDetailMock.mockResolvedValueOnce({ kind: 'not_found', toolRef })
    await expect(loader(input)).resolves.toMatchObject({ metadata })
    expect(readDetailMock).toHaveBeenLastCalledWith({ data: { toolRef } })

    readDetailMock.mockResolvedValueOnce({ kind: 'found', tool: { toolRef } })
    const thrown = await loader(input).then(() => undefined, (cause: unknown) => cause)
    expect(isRedirect(thrown)).toBe(true)
    expect((thrown as { options: { params: unknown } }).options.params).toEqual({ toolRef })
  })

  it('passes fresh source rate to a directory-only detail and never claims an AE input recipient', async () => {
    const registryRef = `registry:${'c'.repeat(64)}`
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
    render(<RouterContextProvider router={router}><DirectoryToolPage baseUrl="https://aecon.test" metadata={metadata} providerHost="example.test" slug="invoices" referenceRate={referenceRate} /></RouterContextProvider>)
    expect(screen.getAllByText('A$0.000002 per call').length).toBeGreaterThan(0)
    expect(screen.getByText('Unavailable')).toBeTruthy()
    expect(screen.getAllByText(`aecon can’t run this listing. ${REASON_COPY_FALLBACK}`).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'See similar tools' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: /Run this call|Sign in to run it/ })).toBeNull()
    expect(screen.queryByText(/Your input goes to/)).toBeNull()

    cleanup()
    render(<RouterContextProvider router={router}><DirectoryToolPage baseUrl="https://aecon.test" metadata={{
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
        choice: { access: 'ae_callable', toolRef: registryRef },
      },
    }} providerHost="example.test" slug="invoices" referenceRate={referenceRate} /></RouterContextProvider>)
    expect(screen.getByText('Ready now')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'See similar tools' })).toBeNull()

    cleanup()
    render(<RouterContextProvider router={router}><DirectoryToolPage baseUrl="https://aecon.test" metadata={metadata} providerHost="example.test" slug="invoices" referenceRate={referenceRate} /></RouterContextProvider>)
    // The source USDC price is a secondary fact beside the AUD estimate.
    expect(screen.getByText(/0.000001 USDC/)).toBeTruthy()
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
