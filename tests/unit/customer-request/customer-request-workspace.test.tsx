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
          commercialInfluence: {
            status: 'disclosed', relationship: 'commission', summary: 'AE may receive a fixed referral fee.',
            payerName: 'Sandbox Option Two', beneficiaryName: 'Agentic Economy', compensationBasis: 'Fixed referral fee',
            influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
          },
          expiresAt: 10_000, inspectionRef: 'evidence_1',
        }], optionSet: {
          cardinality: 'single', optionCount: 1,
          ordering: { kind: 'not_applicable', commercialInfluence: 'unknown' },
          coverage: {
            evaluated: 2, optionsReceived: 1, unavailable: 1, pending: 0, uncertain: 0,
            businesses: [
              { name: 'Sandbox Option Two', status: 'option_received', explanation: 'This business returned an option.' },
              { name: 'Sandbox Option One', status: 'unavailable', explanation: 'This business did not return an option.' },
            ],
          },
          options: [],
        },
      }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), { target: { value: 'Compare available sandbox options' } })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    await screen.findByRole('button', { name: 'Show available options' })
    fireEvent.click(screen.getByRole('button', { name: 'Show available options' }))

    await screen.findByRole('heading', { name: 'Sandbox Option Two' })
    expect(screen.getByRole('heading', { name: 'One registered option matched.' })).toBeTruthy()
    expect(screen.getByText('This is not a comparison or recommendation. Nothing has been selected, booked, or purchased.')).toBeTruthy()
    expect(screen.getByText(/AE evaluated 2 connected businesses/)).toBeTruthy()
    expect(screen.getByText('Provider-reported option')).toBeTruthy()
    expect(screen.getByText('Commercial relationship disclosed')).toBeTruthy()
    expect(screen.getByText('Sandbox Option Two pays Agentic Economy: Fixed referral fee.')).toBeTruthy()
    expect(screen.getByText('Registered as not influencing eligibility, inclusion, or ordering.')).toBeTruthy()
    expect(screen.getByText('$9.00')).toBeTruthy()
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/requests', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/requests/request%3Auuid-1/options', expect.objectContaining({ method: 'POST' }))
  })

  it('explains an evidence-bound price recommendation without implying commitment', async () => {
    let sequence = 0
    vi.stubGlobal('crypto', { randomUUID: () => `uuid-${++sequence}` })
    const option = (key: string, name: string, amountMinor: number) => ({
      optionRef: `option_${key}`, business: { name },
      expectedCost: { currency: 'AUD', amountMinor }, maximumCost: { currency: 'AUD', amountMinor }, expectedLatencyMs: 180,
      priceComponents: [{ label: 'Provider amount', amountMinor }], comparableOutputs: [{ label: 'Service', value: 'Registered service' }],
      materialTerms: ['Provider term'], cancellation: { kind: 'unsupported', summary: 'No cancellation.' },
      commercialInfluence: { status: 'none', summary: 'No registered commercial relationship.' },
      expiresAt: 10_000, provenance: { kind: 'provider_assertion', observedAt: 1_000, validUntil: 10_000 },
    })
    const options = [option('one', 'Option One', 1_200), option('two', 'Option Two', 900)]
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({
        kind: 'request', requestRef: 'request:uuid-1', revision: 1, state: 'ready_to_compare',
        summary: 'Find the cheapest option', nextAction: 'prepare_options', missingFields: [], options: [],
      }))
      .mockResolvedValueOnce(Response.json({
        kind: 'request', requestRef: 'request:uuid-1', revision: 1, state: 'options_ready',
        summary: 'Find the cheapest option', nextAction: 'inspect_options', missingFields: [], options,
        optionSet: {
          cardinality: 'multiple', optionCount: 2,
          ordering: {
            kind: 'recommended', commercialInfluence: 'none', objective: 'lowest_maximum_price',
            optionRef: 'option_two', evidenceRef: 'inference:price',
            reasons: ['Lowest provider maximum at AUD 9.00.', 'AUD 3.00 below the next-lowest provider maximum.'],
            tradeoffs: ['No differing registered comparison outputs were reported.'],
          },
          coverage: { evaluated: 2, optionsReceived: 2, unavailable: 0, pending: 0, uncertain: 0, businesses: [] },
          options,
        },
      })))
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), { target: { value: 'Find the cheapest option' } })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Show available options' }))

    expect(await screen.findByRole('heading', { name: 'AE recommends Option Two.' })).toBeTruthy()
    expect(screen.getByText('Recommended for your price priority')).toBeTruthy()
    expect(screen.getByText('AUD 3.00 below the next-lowest provider maximum.')).toBeTruthy()
    expect(screen.getByText(/Nothing has been selected, booked, or purchased/)).toBeTruthy()
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
        criteria: [{ label: 'Area', value: 'Fremantle', basis: 'extracted_from_request' }],
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
    expect(screen.getByText(/Area:/)).toBeTruthy()
    expect(screen.getByText(/from your request/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Correct' })).toBeTruthy()
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/requests/request%3Auuid-1/messages', expect.objectContaining({ method: 'POST' }))
  })

  it('distinguishes revising the same Request from starting a new one', async () => {
    let sequence = 0
    vi.stubGlobal('crypto', { randomUUID: () => `uuid-${++sequence}` })
    const projection = {
      kind: 'request', requestRef: 'request:uuid-1', revision: 1, state: 'unsupported',
      summary: 'No registered capability', nextAction: 'revise_request', missingFields: [], options: [],
    } as const
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(projection))
      .mockResolvedValueOnce(Response.json({ ...projection, revision: 2, state: 'ready_to_compare', nextAction: 'prepare_options' }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AeCustomerRequestWorkspace />)
    fireEvent.change(screen.getByLabelText('What are you looking for?'), { target: { value: 'Fremantle' } })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    await screen.findByRole('button', { name: 'Edit this Request' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit this Request' }))
    await screen.findByText('Editing revision 1 of this Request.')
    fireEvent.change(screen.getByLabelText('What are you looking for?'), { target: { value: 'Lunch in Fremantle' } })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    await screen.findByRole('button', { name: 'Show available options' })
    const secondBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body))
    expect(secondBody).toMatchObject({ requestRef: 'request:uuid-1', expectedRevision: 1, request: 'Lunch in Fremantle' })

    fireEvent.click(screen.getByRole('button', { name: 'Start a new Request' }))
    await waitFor(() => expect((screen.getByLabelText('What are you looking for?') as HTMLTextAreaElement).value).toBe(''))
  })

  it('explains protected data sharing before any provider preparation', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-protected' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        kind: 'request', requestRef: 'request:protected', revision: 1, state: 'needs_authorization',
        summary: 'Send my parcel', nextAction: 'review_disclosure', missingFields: [], criteria: [], options: [],
        disclosureReview: {
          purpose: 'Compare parcel services', maximumRecipients: 2,
          categories: [{ label: 'Origin postcode', classification: 'personal' }],
        },
      }))
      .mockResolvedValueOnce(Response.json({
        kind: 'request', requestRef: 'request:protected', revision: 1, state: 'ready_to_compare',
        summary: 'Send my parcel', nextAction: 'prepare_options', missingFields: [], criteria: [], options: [],
      }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AeCustomerRequestWorkspace />)
    fireEvent.change(screen.getByLabelText('What are you looking for?'), { target: { value: 'Send my parcel' } })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))

    await screen.findByRole('heading', { name: 'Review what would be shared' })
    expect(screen.getByText(/up to 2 eligible registered businesses/)).toBeTruthy()
    expect(screen.getByText(/Nothing has been shared/)).toBeTruthy()
    expect(screen.queryByText('origin_postcode')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Allow this comparison' }))
    await screen.findByRole('button', { name: 'Show available options' })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/requests/request%3Aprotected/authorization', expect.objectContaining({ method: 'POST' }))
  })

  it('keeps the Request recoverable while finding options and when no connected option returns', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-no-options' })
    const base = {
      kind: 'request', requestRef: 'request:no-options', revision: 1,
      summary: 'Find a suitable option', missingFields: [], criteria: [], options: [],
    } as const
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ ...base, state: 'ready_to_compare', nextAction: 'prepare_options' }))
      .mockResolvedValueOnce(Response.json({ ...base, state: 'preparing_options', nextAction: 'wait' }, { status: 202 }))
      .mockResolvedValueOnce(Response.json({ ...base, state: 'no_options', nextAction: 'revise_request' }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), { target: { value: 'Find a suitable option' } })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Show available options' }))

    expect(await screen.findByText('Checking connected businesses')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))

    expect(await screen.findByRole('heading', { name: 'Nothing eligible returned an option.' })).toBeTruthy()
    expect(screen.getByText(/AE will not invent availability/)).toBeTruthy()
    expect(screen.getByText('Request revision 1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit this Request' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start a new Request' })).toBeTruthy()
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
