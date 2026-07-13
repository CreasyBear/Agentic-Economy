/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AeCustomerRequestWorkspace } from '@/components/ae/customer-request/AeCustomerRequestWorkspace'

describe('customer Request workspace', () => {
  beforeEach(() => vi.stubGlobal('matchMedia', () => ({
    matches: false, media: '', onchange: null, addListener: () => undefined, removeListener: () => undefined,
    addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false,
  })))
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('uses the same Request and options projections as the machine API', async () => {
    let sequence = 0
    vi.stubGlobal('crypto', { randomUUID: () => `uuid-${++sequence}` })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        kind: 'request', requestRef: 'request:uuid-1', revision: 1, state: 'ready_to_compare',
        summary: 'Compare suitable options', nextAction: 'prepare_options', missingFields: [], options: [],
      }))
      .mockResolvedValueOnce(Response.json({
        kind: 'request', requestRef: 'request:uuid-1', revision: 1, state: 'options_ready',
        summary: 'Compare suitable options', nextAction: 'inspect_options', missingFields: [], options: [{
          optionRef: 'option_1', business: { name: 'Sandbox Option Two' },
          expectedCost: { currency: 'AUD', amountMinor: 900 }, maximumCost: { currency: 'AUD', amountMinor: 900 }, expectedLatencyMs: 180,
          priceComponents: [{ label: 'Sandbox amount', amountMinor: 900 }], comparableOutputs: [{ label: 'Option', value: 'Sandbox verification only' }],
          materialTerms: ['Verification only; no real service or fulfilment.'], cancellation: { kind: 'unsupported', summary: 'No effect.' },
          expiresAt: 10_000, inspectionRef: 'evidence_1',
        }],
      }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), { target: { value: 'Compare available sandbox options' } })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    await screen.findByRole('button', { name: 'Show available options' })
    fireEvent.click(screen.getByRole('button', { name: 'Show available options' }))

    await screen.findByRole('heading', { name: 'Sandbox Option Two' })
    expect(screen.getByText('$9.00')).toBeTruthy()
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/requests', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/requests/request%3Auuid-1/options', expect.objectContaining({ method: 'POST' }))
  })

  it('keeps contextual clarification inside the Request conversation', async () => {
    let sequence = 0
    vi.stubGlobal('crypto', { randomUUID: () => `uuid-${++sequence}` })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        kind: 'request', requestRef: 'request:uuid-1', revision: 1, state: 'needs_information',
        summary: 'Fremantle', nextAction: 'provide_information', missingFields: [], options: [],
        clarification: { kind: 'intent_direction', prompt: 'What are you looking for there?', answerKind: 'natural_language' },
      }))
      .mockResolvedValueOnce(Response.json({
        kind: 'request', requestRef: 'request:uuid-1', revision: 2, state: 'ready_to_compare',
        summary: 'Fremantle for lunch', nextAction: 'prepare_options', missingFields: [], options: [],
      }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), { target: { value: 'Fremantle' } })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    await screen.findByRole('heading', { name: 'What are you looking for there?' })
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Somewhere relaxed for lunch.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await screen.findByRole('button', { name: 'Show available options' })
    expect(screen.getByText('Somewhere relaxed for lunch.')).toBeTruthy()
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/requests/request%3Auuid-1/messages', expect.objectContaining({ method: 'POST' }))
  })

  it('shows authentication as a customer action rather than a protocol error', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'missing_auth' }, { status: 401 })))
    render(<AeCustomerRequestWorkspace />)
    fireEvent.change(screen.getByLabelText('What are you looking for?'), { target: { value: 'Find an option' } })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    await waitFor(() => expect(screen.getByRole('link', { name: 'Sign in to continue' })).toBeTruthy())
    expect(screen.queryByText('missing_auth')).toBeNull()
  })
})
