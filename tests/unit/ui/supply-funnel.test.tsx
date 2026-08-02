// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeSupplyLanding } from '@/components/ae/supply/AeSupplyLanding'
import { AeSupplyFunnel, emptySupplyFunnelDraft, readSupplyFunnelDraft, writeSupplyFunnelDraft } from '@/components/ae/supply/AeSupplyFunnel'
import { AeSupplyEarningsCard } from '@/components/ae/supply/AeSupplyEarningsCard'
import type { SupplyFunnelStep, SupplyFunnelStepCompletion } from '@/modules/capability-supply/supply-funnel.functions'
import type { AgentToolDescriptor } from '@/modules/actions'
import type { ServiceDto } from '@/modules/registry/public'
import { emptyOwnerOfferingEditorValue } from '@/components/ae/offerings/AeOwnerOfferings'

const tool: AgentToolDescriptor = {
  id: 'registry.services_list', name: 'List published services', summary: 'Read published services.', boundaries: ['Read-only.'], readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'none', dataClasses: [], spendExposure: 'none', approval: 'none' },
  parameters: [], hasOutputSchema: true,
}
const service: ServiceDto = {
  id: 'offering:one', revision: 1, business: { slug: 'example', name: 'Example' }, name: 'Quote API', category: 'Data', summary: 'Returns a quote.', pricingSummary: 'AUD 0 per call', price: { kind: 'fixed', currency: 'AUD', amountMinor: 0, taxTreatment: 'inclusive' }, endpoints: [{ url: 'https://example.test/quote', name: 'Quote', summary: 'Quote', provenance: 'business_declared', access: 'external' }], links: { business: '/api/businesses/example', manifest: '/example/ucp' },
}

beforeEach(() => {
  window.sessionStorage.clear()
})
afterEach(() => { cleanup(); window.sessionStorage.clear() })

describe('supply landing', () => {
  it('leads with the business outcome and generated service rows', () => {
    renderWithRouter(<AeSupplyLanding tools={[tool]} services={[service]} />)
    expect(screen.getByRole('heading', { name: /AI assistants/i })).toBeDefined()
    expect(screen.getByRole('link', { name: /start publishing your service/i }).getAttribute('href')).toBe('/claim?source=supply')
    expect(screen.getByText(/agents bring you work/i)).toBeDefined()
    expect(screen.getByText('Quote API')).toBeDefined()
    expect(screen.queryByText(/\b[0-9]+ actions available/i)).toBeNull()
    expect(screen.queryByText(/publisher console|money rail|machine surfaces/i)).toBeNull()
  })

  it('renders the honest empty state', () => {
    renderWithRouter(<AeSupplyLanding tools={[]} services={[]} />)
    expect(screen.getByText('No services are listed yet.')).toBeDefined()
  })
})

describe('resumable supply draft', () => {
  it('round-trips the bounded six-step state', () => {
    const draft = emptySupplyFunnelDraft('business:one', 'offering:one')
    writeSupplyFunnelDraft(draft)
    expect(readSupplyFunnelDraft()?.version).toBe('supply-funnel:v1')
    expect(readSupplyFunnelDraft()?.states.publish).toBe('not_started')
  })

  it('renders only the describe frontier first', () => {
    render(<AeSupplyFunnel businessId="business:one" initialOffering={emptyOwnerOfferingEditorValue} callbacks={{ saveOffering: vi.fn(), advance: vi.fn(), runReadiness: vi.fn(), runTest: vi.fn(), publish: vi.fn() }} />)
    expect(screen.getByText('Service details')).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Check that it works' })).toBeNull()
  })
  it('moves through save, check, price, test, and publish effects', async () => {
    const savedValue = { ...emptyOwnerOfferingEditorValue, expectedRevision: 1, name: 'Weather data', category: 'Data', summary: 'Returns a current weather report.' }
    const saveOffering = vi.fn(async () => ({ kind: 'saved' as const, value: savedValue, message: 'Saved.' }))
    const advance = vi.fn(async (step: SupplyFunnelStep): Promise<SupplyFunnelStepCompletion> => ({ step, state: 'completed' }))
    const runReadiness = vi.fn(async (): Promise<SupplyFunnelStepCompletion> => ({ step: 'readiness', state: 'completed' }))
    const runTest = vi.fn(async (): Promise<SupplyFunnelStepCompletion> => ({ step: 'test', state: 'completed' }))
    const publish = vi.fn(async (): Promise<SupplyFunnelStepCompletion> => ({ step: 'publish', state: 'completed' }))
    render(<AeSupplyFunnel businessId="business:one" initialOffering={emptyOwnerOfferingEditorValue} callbacks={{ saveOffering, advance, runReadiness, runTest, publish }} />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Weather data' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Data' } })
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Returns a current weather report.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Tell AE where your service runs' })).toBeDefined())
    expect(saveOffering).toHaveBeenCalledOnce()

    fireEvent.change(screen.getByLabelText('Service or server URL'), { target: { value: 'https://example.test/quote' } })

    fireEvent.click(screen.getByRole('button', { name: 'Check and continue' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Check that it works' })).toBeDefined())
    expect(advance).toHaveBeenCalledWith('endpoint', expect.objectContaining({ sourceKind: 'openapi_http' }))

    fireEvent.click(screen.getByRole('button', { name: 'Check the service' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Choose a price per call' })).toBeDefined())
    expect(runReadiness).toHaveBeenCalledWith({ endpoint: expect.objectContaining({ endpointUrl: 'https://example.test/quote' }) })


    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '125' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save price' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Run a real test' })).toBeDefined())
    expect(advance).toHaveBeenCalledWith('pricing', expect.objectContaining({ paidAmountMinor: 125 }))

    fireEvent.click(screen.getByRole('button', { name: 'Review and confirm the test' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send the test' })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Send the test' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Go live' })).toBeDefined())
    expect(runTest).toHaveBeenCalledWith(expect.objectContaining({ endpoint: expect.objectContaining({ endpointUrl: 'https://example.test/quote' }), pricing: expect.objectContaining({ paidAmountMinor: 125 }) }))


    fireEvent.click(screen.getByRole('button', { name: 'Publish your service' }))
    await waitFor(() => expect(publish).toHaveBeenCalledWith(expect.objectContaining({ endpoint: expect.objectContaining({ endpointUrl: 'https://example.test/quote' }), pricing: expect.objectContaining({ paidAmountMinor: 125 }) })))
    expect(screen.getAllByText('Done').length).toBe(6)
  })
  it('marks downstream work fresh again and gives a refusal recovery action without fake earnings', async () => {
    const initial = emptySupplyFunnelDraft('business:one', 'offering:one')
    const states = { ...initial.states, describe: 'completed' as const, endpoint: 'in_progress' as const, readiness: 'completed' as const, pricing: 'completed' as const, test: 'completed' as const, publish: 'completed' as const }
    writeSupplyFunnelDraft({ ...initial, states, completedSteps: ['describe', 'readiness', 'pricing', 'test', 'publish'] })
    const advance = vi.fn(async (step: SupplyFunnelStep): Promise<SupplyFunnelStepCompletion> => ({ step, state: 'completed' }))
    let readinessAttempt = 0
    const runReadiness = vi.fn(async (): Promise<SupplyFunnelStepCompletion> => {
      readinessAttempt += 1
      return readinessAttempt === 1 ? { step: 'readiness', state: 'refused', refusal: 'source_unavailable' } : { step: 'readiness', state: 'completed' }
    })
    render(<AeSupplyFunnel businessId="business:one" initialOffering={emptyOwnerOfferingEditorValue} callbacks={{ saveOffering: vi.fn(), advance, runReadiness, runTest: vi.fn(), publish: vi.fn() }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Check and continue' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Check that it works' })).toBeDefined())
    expect(screen.getAllByText('Needs a fresh check').length).toBeGreaterThan(0)
    expect(screen.queryByText('stale')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Check the service' }))
    await waitFor(() => expect(screen.getByText(/could not reach this service/i)).toBeDefined())
    expect(screen.queryByText('source_unavailable')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Check the service' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Choose a price per call' })).toBeDefined())
    expect(runReadiness).toHaveBeenCalledTimes(2)

    render(<AeSupplyEarningsCard state="unavailable" />)
    expect(screen.getByText(/No earnings are recorded from setup or test calls/i)).toBeDefined()
  })
})

function renderWithRouter(ui: ReactElement) {
  const rootRoute = createRootRoute()
  const claimRoute = createRoute({ getParentRoute: () => rootRoute, path: '/claim' })
  const ownerSupplyRoute = createRoute({ getParentRoute: () => rootRoute, path: '/owner/supply' })
  const routeTree = rootRoute.addChildren([claimRoute, ownerSupplyRoute])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/claim'] }) })
  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}