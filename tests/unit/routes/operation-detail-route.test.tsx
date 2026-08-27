/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { CURRENT_OPERATION_PROJECTION_NAVIGATION } from '@/modules/actions/contract'
import {
  PublicOperationRegistrySchemaVersion,
  projectCapabilityOperation as projectCapabilityOperationWithNavigation,
  type CapabilityOperationSourceRecord,
} from '@/modules/capability-supply/public'
import { defineCapabilityContract } from '@/modules/capability-contract/public'
import type { PublicOperationDetailRouteResult } from '@/modules/registry/operation-detail-route.functions'

const readDetailMock = vi.hoisted(() => vi.fn())

vi.mock('@/modules/registry/operation-detail-route.functions', () => ({
  readPublicOperationDetailRouteServer: readDetailMock,
}))

import { PublicOperationDetail, Route } from '@/routes/operations.$operationRef'

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
  commercialRelationship: { kind: 'direct', summary: 'Supplier sets this price.' },
  cancellation: { kind: 'unsupported' },
  authentication: { kind: 'platform_credential', scheme: 'api_key', in: 'header', name: 'X-Supplier-Key' },
  transport: { method: 'POST', pathTemplate: '/extract', requestTimeoutMs: 5_000 },
  parameterMappings: [],
  provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
  integrated: false,
  routeable: true,
  readiness: { observedAt: 1_000, validUntil: 10_000 },
  searchTerms: ['invoice', 'extract'],
  snapshotKey: 'snapshot:invoice:4',
} as CapabilityOperationSourceRecord

const projectCapabilityOperation = (
  record: CapabilityOperationSourceRecord,
  now: number,
) => projectCapabilityOperationWithNavigation(
  record,
  now,
  CURRENT_OPERATION_PROJECTION_NAVIGATION,
)

const operation = projectCapabilityOperation(sourceRecord, 2_000)

function renderWithRouter(result: PublicOperationDetailRouteResult) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/$slug' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(<RouterContextProvider router={router}><PublicOperationDetail result={result} /></RouterContextProvider>)
}

afterEach(() => {
  cleanup()
  readDetailMock.mockReset()
})

describe('/operations/$operationRef', () => {
  it('projects canonical keyed facts and carries the exact reference through authenticated invoke', () => {
    renderWithRouter({ kind: 'found', schemaVersion: PublicOperationRegistrySchemaVersion, operation })

    expect(screen.getByRole('heading', { level: 1, name: 'Invoice line-item extraction' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Ledger Labs' })[0]?.getAttribute('href')).toBe('/ledger-labs')
    expect(screen.getAllByText('USD 1.25').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { level: 3, name: 'Example input' })).toBeTruthy()
    expect(screen.getAllByText(/https:\/\/docs\.example\/invoice\.pdf/).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { level: 3, name: 'Example output' })).toBeTruthy()
    expect(screen.getByText(/No example output is published/)).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Exact price breakdown' })).toBeTruthy()
    expect(screen.getByText('USD 1.00')).toBeTruthy()
    expect(screen.getByText('USD 0.25')).toBeTruthy()
    expect(screen.getByText('eip155:8453', { exact: false })).toBeTruthy()
    fireEvent.click(screen.getByText('Technical contract, schemas, digests, and references'))
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

    const execution = screen.getByRole('complementary', { name: 'Use this capability' })
    expect(within(execution).getByRole('heading', { level: 3, name: '2. Connect once' })).toBeTruthy()
    expect(within(execution).getByRole('heading', { level: 3, name: '3. Call capability' })).toBeTruthy()
    expect(within(execution).getByRole('heading', { level: 3, name: '4. Open the receipt' })).toBeTruthy()
    expect(within(execution).getByText(/ae inspect/)).toBeTruthy()
    expect(within(execution).getAllByText(/ae connect/).length).toBeGreaterThan(0)
    expect(within(execution).getAllByText(/ae call/).length).toBeGreaterThan(0)
    expect(within(execution).getByText(/https:\/\/docs\.example\/invoice\.pdf/)).toBeTruthy()
    expect(within(execution).queryByText(/AE_INPUT_JSON/)).toBeNull()
    expect(within(execution).getByText(/ae status <invocation-ref>/)).toBeTruthy()
    expect(within(execution).getByText(/stores and validates one origin-bound agent key/i)).toBeTruthy()
    expect(within(execution).getByText(/generates a durable retry identity/i)).toBeTruthy()
    expect(within(execution).queryByText(/idempotencyKey=/)).toBeNull()
    expect(within(execution).queryByText(/Save it securely/i)).toBeNull()
    expect(within(execution).queryByText(/ae_operation_invoke/)).toBeNull()
    expect(within(execution).queryByText(/npm run -s ae -- recover/)).toBeNull()
  })

  it('keeps x402 on the authenticated invoke lane and never advertises anonymous execute', () => {
    const x402Operation = projectCapabilityOperation({
      ...sourceRecord,
      authentication: { kind: 'x402' },
      provenance: { ...sourceRecord.provenance, sourceKind: 'x402' },
    }, 2_000)

    renderWithRouter({
      kind: 'found',
      schemaVersion: PublicOperationRegistrySchemaVersion,
      operation: x402Operation,
    })

    const execution = screen.getByRole('complementary', { name: 'Use this capability' })
    expect(within(execution).getByRole('heading', { level: 3, name: '2. Connect once' })).toBeTruthy()
    expect(within(execution).getByRole('heading', { level: 3, name: '3. Call capability' })).toBeTruthy()
    expect(within(execution).getByRole('heading', { level: 3, name: '4. Open the receipt' })).toBeTruthy()
    expect(within(execution).getAllByText(/ae call/).length).toBeGreaterThan(0)
    expect(within(execution).queryByText(/idempotencyKey=/)).toBeNull()
    expect(within(execution).queryByText(/npm run -s ae -- recover/)).toBeNull()
  })

  it('keeps an integrated setup-required descriptor inspectable without implying it can be invoked', () => {
    const integratedOperation = {
      ...operation,
      availability: {
        ...operation.availability,
        posture: 'integrated' as const,
        reason: 'setup_required' as const,
      },
    }

    renderWithRouter({ kind: 'found', schemaVersion: PublicOperationRegistrySchemaVersion, operation: integratedOperation })

    expect(screen.getAllByText('USD 1.25').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('Technical contract, schemas, digests, and references'))
    expect(screen.getByText('digest:current-price')).toBeTruthy()
    expect(screen.getByText('provider owned')).toBeTruthy()
    const access = screen.getByRole('complementary', { name: 'Use this capability' })
    expect(within(access).getByText(/Setup is required before invocation/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse current Operations' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to market' })).toBeTruthy()
    expect(screen.queryByText(/npm run -s ae -- invoke/)).toBeNull()
    expect(screen.queryByText(/npm run -s ae -- recover/)).toBeNull()
  })

  it.each([
    {
      kind: 'not_found' as const,
      schemaVersion: PublicOperationRegistrySchemaVersion,
      operationRef: operation.operationRef,
      navigation: [],
      expectedTitle: /unknown or no longer current/i,
    },
    {
      kind: 'unavailable' as const,
      schemaVersion: PublicOperationRegistrySchemaVersion,
      operationRef: operation.operationRef,
      reason: 'temporarily_unavailable' as const,
      navigation: [],
      expectedTitle: /not currently available/i,
    },
    {
      kind: 'source_unavailable' as const,
      operationRef: operation.operationRef,
      expectedTitle: /details are unavailable/i,
    },
  ])('keeps the truth ceiling for $kind', ({ expectedTitle, ...result }) => {
    renderWithRouter(result)

    expect(screen.getByRole('heading', { level: 1, name: expectedTitle })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse current Operations' })).toBeTruthy()
    expect(screen.queryByText('USD 1.25')).toBeNull()
    expect(screen.queryByText('digest:current-price')).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Use this capability' })).toBeNull()
    expect(screen.queryByText(/npm run -s ae -- invoke/)).toBeNull()
    expect(screen.queryByText(/npm run -s ae -- recover/)).toBeNull()
  })

  it('re-reads the browser parameter through the server seam and fails closed on a thrown read', async () => {
    readDetailMock.mockRejectedValue(new Error('offline'))
    const loader = Route.options.loader as (input: { params: { operationRef: string } }) => Promise<unknown>

    await expect(loader({ params: { operationRef: operation.operationRef } })).resolves.toEqual({
      kind: 'source_unavailable',
      operationRef: operation.operationRef,
    })
    expect(readDetailMock).toHaveBeenCalledWith({ data: { operationRef: operation.operationRef } })
  })
})
