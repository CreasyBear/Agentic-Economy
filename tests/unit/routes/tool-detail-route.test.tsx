/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { CURRENT_TOOL_PROJECTION_NAVIGATION } from '@/modules/actions/contract'
import { AeToolInspector } from '@/components/ae/market/tool-detail'
import {
  buildMarketReturnContext,
  type MarketReturnContext,
} from '@/components/ae/market/market-return-context'
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

const readDetailMock = vi.hoisted(() => vi.fn())

vi.mock('@/modules/registry/tool-detail-route.functions', () => ({
  readPublicToolDetailRouteServer: readDetailMock,
}))

import {
  PublicToolDetail,
  Route,
  validateToolDetailSearch,
  type ToolDetailPresentationResult,
} from '@/routes/tools.$toolRef'

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
  offering: {
    offeringRef: 'offering:invoice-extraction',
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
  result: ToolDetailPresentationResult,
  _hasBuyerCredential = false,
  returnTo?: MarketReturnContext,
) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/$slug' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(
    <RouterContextProvider router={router}>
      <PublicToolDetail
        result={result}
        {...(returnTo === undefined ? {} : { returnTo })}
      />
    </RouterContextProvider>,
  )
}

function renderInspectorWithRouter(
  variant: 'compact' | 'full',
  evidence?: MarketListingEvidenceProjection,
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
          tool={tool}
        {...(evidence === undefined ? {} : { evidence })}
        variant={variant}
      />
    </RouterContextProvider>,
  )
}

afterEach(() => {
  cleanup()
  readDetailMock.mockReset()
})

describe('/tools/$toolRef', () => {
  it('accepts only bounded local market return contexts', () => {
    const returnTo = buildMarketReturnContext({
      window: '7d',
      query: 'invoice',
      availability: 'routeable',
    }, 'tools')

    expect(validateToolDetailSearch({ from: returnTo })).toEqual({ from: returnTo })
    expect(validateToolDetailSearch({ from: 'https://evil.example/market?window=7d' })).toEqual({})
    expect(validateToolDetailSearch({ from: '/market?window=7d&next=/admin' })).toEqual({})
  })

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
    const latencyChart = within(trackRecord).getByRole('region', { name: 'Latency by completed call' })
    expect(latencyChart).toBeTruthy()
    expect(within(latencyChart).getByText('5 timed calls')).toBeTruthy()
    expect(within(trackRecord).queryByText(/No completed AE calls/)).toBeNull()
  })

  it('keeps compact and full inspectors on the same decision, facts, and continuation', () => {
    renderInspectorWithRouter('compact')

    const compact = document.querySelector('[data-tool-inspector="compact"]')
    if (!(compact instanceof HTMLElement)) throw new Error('compact_inspector_missing')
    const compactView = within(compact)
    const compactDecision = compactView.getByRole('region', { name: 'Operational' })
    expect(within(compactDecision).getByRole('button', { name: 'Copy Tool reference' })).toBeTruthy()
    expect(compactView.queryByRole('region', { name: 'What you can do next' })).toBeNull()
    for (const fact of ['USD 1.25', 'API key connection', 'Ready now', 'Per accepted extraction']) {
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
    expect(fullView.getByText('Waiting for timed calls')).toBeTruthy()
    expect(fullView.getByText('Up to 48 timed calls')).toBeTruthy()
    expect(fullView.getByRole('button', { name: 'Copy Tool reference' })).toBeTruthy()
    for (const fact of ['USD 1.25', 'API key connection', 'Ready now']) {
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

  it('keeps one safe continuation beside switchable research views and focuses each full record', () => {
    const rendered = renderInspectorWithRouter('full')
    const inspector = screen.getByRole('article', {
      name: 'Invoice line-item extraction Tool details',
    })
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

  it('preserves an exact comparison origin in the explicit return action', () => {
    const second = `operation:v1:${'d'.repeat(64)}` as typeof tool.toolRef
    const returnTo = buildMarketReturnContext({
      window: '7d',
      query: 'invoice',
      compare: `${tool.toolRef},${second}`,
    })

    renderWithRouter(
      { kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool },
      false,
      returnTo,
    )

    expect(screen.getByRole('link', { name: 'Back to comparison' }).getAttribute('href'))
      .toBe(returnTo)
  })

  it('projects canonical public facts and hands the exact reference to the existing agent client', () => {
    renderWithRouter(
      { kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool },
      true,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Invoice line-item extraction' })).toBeTruthy()
    expect(screen.getAllByText('Ledger Labs').length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Ledger Labs' })).toBeNull()
    expect(screen.getAllByText('USD 1.25').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { level: 3, name: 'Price breakdown' })).toBeTruthy()
    expect(screen.getByText('USD 1.00')).toBeTruthy()
    expect(screen.getByText('USD 0.25')).toBeTruthy()
    expect(screen.getByText('eip155:8453', { exact: false })).toBeTruthy()

    const contractTab = screen.getByRole('tab', { name: 'Contract' })
    fireEvent.mouseDown(contractTab, { button: 0, ctrlKey: false })
    fireEvent.click(contractTab)
    expect(screen.getByRole('heading', { level: 2, name: 'Example input' })).toBeTruthy()
    expect(screen.getAllByText(/https:\/\/docs\.example\/invoice\.pdf/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { level: 3, name: 'Example output' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open schemas and references' })).toBeTruthy()

    const execution = screen.getByRole('complementary', { name: 'What you can do next' })
    expect(within(execution).getByText(/Paste this reference into your existing agent client/i)).toBeTruthy()
    expect(within(execution).getByRole('button', { name: 'Copy Tool reference' })).toBeTruthy()
    expect(within(execution).queryByText(/ae connect/)).toBeNull()
    expect(within(execution).queryByText(/ae call/)).toBeNull()
    expect(within(execution).queryByText(/https:\/\/docs\.example\/invoice\.pdf/)).toBeNull()
    expect(within(execution).queryByText(/ae status <invocation-ref>/)).toBeNull()
    expect(within(execution).queryByText(/idempotencyKey=/)).toBeNull()
    expect(within(execution).queryByText(/Save it securely/i)).toBeNull()
    expect(within(execution).queryByText(/ae_operation_invoke/)).toBeNull()
    expect(within(execution).queryByText(/npm run -s ae -- recover/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open schemas and references' }))
    expect(screen.getByRole('dialog', { name: 'Schemas and references' })).toBeTruthy()
    expect(screen.getByText('digest:current-price')).toBeTruthy()
    expect(screen.getByText('Per accepted extraction')).toBeTruthy()
    expect(screen.getAllByText('documentUrl').length).toBeGreaterThan(0)
    expect(screen.getAllByText('includeTax').length).toBeGreaterThan(0)
    expect(screen.getAllByText('data release')).toHaveLength(2)
    expect(screen.getByText('completion')).toBeTruthy()
    expect(screen.getByText('provider owned')).toBeTruthy()
    expect(screen.getAllByText(/release:invoice/)).toHaveLength(2)
    expect(screen.getByText(/evidence:line-items/)).toBeTruthy()
    expect(screen.getByText('pricing:invoice@4')).toBeTruthy()
    expect(screen.getByText('evidence:pricing')).toBeTruthy()

  })

  it('keeps x402 details public without advertising browser execution', () => {
const x402Tool = projectCapabilityTool({
      ...sourceRecord,
      authentication: { kind: 'x402' },
      provenance: { ...sourceRecord.provenance, sourceKind: 'x402' },
    }, 2_000)

    renderWithRouter({
      kind: 'found',
      schemaVersion: PublicToolRegistrySchemaVersion,
      tool: x402Tool,
    }, true)

    const execution = screen.getByRole('complementary', { name: 'What you can do next' })
    expect(within(execution).getByRole('button', { name: 'Copy Tool reference' })).toBeTruthy()
    expect(within(execution).queryByText(/ae call/)).toBeNull()
    expect(within(execution).queryByText(/idempotencyKey=/)).toBeNull()
    expect(within(execution).queryByText(/npm run -s ae -- recover/)).toBeNull()
  })

  it('does not infer caller readiness from browser credentials', () => {
    renderWithRouter({
      kind: 'found',
      schemaVersion: PublicToolRegistrySchemaVersion,
      tool,
    })

    const continuation = screen.getByRole('complementary', { name: 'What you can do next' })
    expect(within(continuation).getByRole('button', { name: 'Copy Tool reference' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Operational' })).toBeTruthy()
    expect(screen.queryByText(/connected/i)).toBeNull()
  })

  it('keeps a setup-required descriptor inspectable without implying it can be invoked', () => {
    const setupRequiredTool = {
      ...tool,
      availability: {
        ...tool.availability,
        posture: 'setup_required' as const,
        reason: 'setup_required' as const,
      },
    }

    renderWithRouter({ kind: 'found', schemaVersion: PublicToolRegistrySchemaVersion, tool: setupRequiredTool })

    expect(screen.getAllByText('USD 1.25').length).toBeGreaterThan(0)
    const access = screen.getByRole('complementary', { name: 'What you can do next' })
    expect(within(access).getByText(/not operational/i)).toBeTruthy()
    expect(within(access).getByRole('link', { name: 'Find Tool alternatives' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open schemas and references' }))
    expect(screen.getByText('digest:current-price')).toBeTruthy()
    expect(screen.getByText('provider owned')).toBeTruthy()
    expect(screen.queryByText(/npm run -s ae -- invoke/)).toBeNull()
    expect(screen.queryByText(/npm run -s ae -- recover/)).toBeNull()
  })

  it('preserves unavailable as unavailable instead of collapsing it into inspect-only', () => {
    const unavailableTool = {
      ...tool,
      availability: {
        ...tool.availability,
        posture: 'unavailable' as const,
        reason: 'temporarily_unavailable' as const,
      },
    }

    renderWithRouter({
      kind: 'found',
      schemaVersion: PublicToolRegistrySchemaVersion,
      tool: unavailableTool,
    })

    const continuation = screen.getByRole('complementary', { name: 'What you can do next' })
    expect(within(continuation).getByRole('link', { name: 'Find Tool alternatives' })).toBeTruthy()
    expect(within(continuation).getByText(/not operational/i)).toBeTruthy()
  })

  it('fails closed when a stale source sends a non-canonical availability posture', () => {
    const staleTool = {
      ...tool,
      availability: {
        ...tool.availability,
        posture: 'integrated',
      },
    } as unknown as typeof tool

    renderWithRouter({
      kind: 'found',
      schemaVersion: PublicToolRegistrySchemaVersion,
      tool: staleTool,
    })

    const continuation = screen.getByRole('complementary', { name: 'What you can do next' })
    expect(within(continuation).getByRole('heading', { name: 'Find an operational alternative' })).toBeTruthy()
    expect(within(continuation).getByRole('link', { name: 'Find Tool alternatives' })).toBeTruthy()
    expect(within(continuation).queryByRole('button', { name: 'Copy Tool reference' })).toBeNull()
  })

  it.each([
    {
      kind: 'not_found' as const,
      schemaVersion: PublicToolRegistrySchemaVersion,
      toolRef: tool.toolRef,
      navigation: [],
      expectedTitle: /unknown or no longer current/i,
    },
    {
      kind: 'unavailable' as const,
      schemaVersion: PublicToolRegistrySchemaVersion,
      toolRef: tool.toolRef,
      reason: 'temporarily_unavailable' as const,
      navigation: [],
      expectedTitle: /not currently available/i,
    },
    {
      kind: 'source_unavailable' as const,
      toolRef: tool.toolRef,
      expectedTitle: /details are unavailable/i,
    },
  ])('keeps the truth ceiling for $kind', ({ expectedTitle, ...result }) => {
    renderWithRouter(result)

    expect(screen.getByRole('heading', { level: 1, name: expectedTitle })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse current Tools' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Back to market' })).toBeNull()
    expect(screen.queryByText('USD 1.25')).toBeNull()
    expect(screen.queryByText('digest:current-price')).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Use this capability' })).toBeNull()
    expect(screen.queryByText(/npm run -s ae -- invoke/)).toBeNull()
    expect(screen.queryByText(/npm run -s ae -- recover/)).toBeNull()
  })

  it('renders malformed references distinctly and preserves a known result origin', () => {
    const returnTo = buildMarketReturnContext({
      window: '30d',
      query: 'invoice',
      capability: 'invoice.extract',
    }, 'tools')

    renderWithRouter({ kind: 'invalid_ref', toolRef: 'not-an-tool' }, false, returnTo)

    expect(screen.getByRole('heading', { name: /reference is invalid/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to results' }).getAttribute('href')).toBe(returnTo)
    expect(screen.queryByText('USD 1.25')).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'What you can do next' })).toBeNull()
  })

  it('rejects malformed references before reading the catalog', async () => {
    const loader = Route.options.loader as (input: { params: { toolRef: string } }) => Promise<unknown>

    await expect(loader({ params: { toolRef: 'not-an-tool' } })).resolves.toEqual({
      result: { kind: 'invalid_ref', toolRef: 'not-an-tool' },
      evidence: undefined,
    })
    expect(readDetailMock).not.toHaveBeenCalled()
  })

  it('re-reads the browser parameter through the server seam and fails closed on a thrown read', async () => {
    readDetailMock.mockRejectedValue(new Error('offline'))
    const loader = Route.options.loader as (input: { params: { toolRef: string } }) => Promise<unknown>

    await expect(loader({ params: { toolRef: tool.toolRef } })).resolves.toEqual({
      result: {
        kind: 'source_unavailable',
        toolRef: tool.toolRef,
      },
      evidence: undefined,
    })
    expect(readDetailMock).toHaveBeenCalledWith({ data: { toolRef: tool.toolRef } })
  })

})
