/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AeCustomerRequestWorkspace } from '@/components/ae/customer-request/AeCustomerRequestWorkspace'

describe('customer Request workspace', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('matchMedia', () => ({
      matches: false, media: '', onchange: null, addListener: () => undefined, removeListener: () => undefined,
      addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false,
    }))
  })
  afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })

  it('opens with a customer question instead of explaining the request mechanism', () => {
    render(<AeCustomerRequestWorkspace />)

    expect(screen.getByRole('heading', { level: 1, name: 'What can we help you find?' })).toBeTruthy()
    expect(screen.getByText('Enter a place, a type of business, or describe the situation. We’ll ask what matters and help you compare your options.')).toBeTruthy()
    expect(screen.queryByText('Start with whatever you know.')).toBeNull()
    expect(screen.queryByText(/work out the next decision/i)).toBeNull()
    expect(screen.queryByText('Lookup instruction')).toBeNull()
    expect(screen.queryByText('Your answer')).toBeNull()
  })

  it('starts the canonical Request journey from a prefilled public ask', () => {
    render(<AeCustomerRequestWorkspace initialNeed="A quiet place for dinner" />)

    expect((screen.getByLabelText('What are you looking for?') as HTMLTextAreaElement).value)
      .toBe('A quiet place for dinner')
    expect((screen.getByRole('button', { name: 'Explore' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('resumes the active browser Request after reload and forgets only its local pointer on restart', async () => {
    let sequence = 0
    vi.stubGlobal('crypto', { randomUUID: () => `resume-${++sequence}` })
    const projection = {
      kind: 'request', requestRef: 'request:resume-1', revision: 3, state: 'ready_to_compare',
      summary: 'Find lunch in Fremantle', nextAction: 'prepare_options', missingFields: [], options: [],
    } as const
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(projection))
      .mockResolvedValueOnce(Response.json(projection))
    vi.stubGlobal('fetch', fetchMock)

    const firstView = render(<AeCustomerRequestWorkspace />)
    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: 'Find lunch in Fremantle' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    expect(await screen.findByRole('button', { name: 'Show available options' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('ae.customer-request.active:v1') ?? '{}')).toEqual({
      requestRef: 'request:resume-1',
    })
    firstView.unmount()

    render(<AeCustomerRequestWorkspace />)
    expect(await screen.findByRole('button', { name: 'Show available options' })).toBeTruthy()
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/requests/request%3Aresume-1', expect.objectContaining({
      method: 'GET',
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Start a new Request' }))
    expect(localStorage.getItem('ae.customer-request.active:v1')).toBeNull()
  })

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
    expect(screen.queryByRole('heading', { name: 'Start with whatever you know.' })).toBeNull()
    expect(screen.queryByText('Your answer')).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: 'What are you looking for there?' }), {
      target: { value: 'Somewhere relaxed for lunch.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await screen.findByRole('button', { name: 'Show available options' })
    expect(screen.getByText('Somewhere relaxed for lunch.')).toBeTruthy()
    expect(screen.getByText(/Area:/)).toBeTruthy()
    expect(screen.getByText(/from your request/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Correct' })).toBeTruthy()
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/requests/request%3Auuid-1/messages', expect.objectContaining({ method: 'POST' }))
  })

  it('lets a customer answer an exact business question in their own words', async () => {
    let sequence = 0
    vi.stubGlobal('crypto', { randomUUID: () => `uuid-${++sequence}` })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        kind: 'request', requestRef: 'request:uuid-1', revision: 1, state: 'needs_information',
        summary: 'Find a suitable option', nextAction: 'provide_information', options: [],
        missingFields: [{
          field: 'requirement:area', label: 'Which area should the business cover?',
          explanation: 'This answer changes which registered options can be prepared now.',
        }],
        clarification: {
          kind: 'contract_fact', requirementKey: 'requirement:area',
          prompt: 'Which area should the business cover?', answerKind: 'typed_value',
        },
      }))
      .mockResolvedValueOnce(Response.json({
        kind: 'request', requestRef: 'request:uuid-1', revision: 2, state: 'ready_to_compare',
        summary: 'Find a suitable option near Fremantle', nextAction: 'prepare_options', options: [],
        missingFields: [], criteria: [{
          label: 'Area', value: 'Fremantle and nearby suburbs', basis: 'customer_provided',
          impact: 'eligibility_and_comparison',
        }],
      }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: 'Find a suitable option' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))

    await screen.findByRole('heading', { name: 'Which area should the business cover?' })
    expect(screen.getByPlaceholderText('Add a detail…')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Which area should the business cover?' }), {
      target: { value: 'Fremantle and nearby suburbs would work.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await screen.findByRole('button', { name: 'Show available options' })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/requests/request%3Auuid-1/facts',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body))).toMatchObject({
      expectedRevision: 1,
      requirementKey: 'requirement:area',
      value: 'Fremantle and nearby suburbs would work.',
    })
    expect(screen.getByText(/Area:/)).toBeTruthy()
    expect(screen.getByText(/You said this.*Used to decide which options fit and how they compare/)).toBeTruthy()
  })

  it('keeps a retired contract label out of the customer conversation', async () => {
    let sequence = 0
    vi.stubGlobal('crypto', { randomUUID: () => `legacy-${++sequence}` })
    localStorage.setItem('ae.customer-request.active:v1', JSON.stringify({ requestRef: 'request:legacy-label' }))
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({
      kind: 'request', requestRef: 'request:legacy-label', revision: 1, state: 'needs_information',
      summary: 'Fremantle', nextAction: 'provide_information', options: [],
      missingFields: [{
        field: 'lookup_instruction', label: 'Lookup instruction',
        explanation: 'This answer changes which options can be considered now.',
      }],
      clarification: {
        kind: 'contract_fact', requirementKey: 'lookup_instruction',
        prompt: 'Lookup instruction', answerKind: 'typed_value',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AeCustomerRequestWorkspace />)

    expect(await screen.findByRole('heading', { name: 'What else should AE know to find the right options?' })).toBeTruthy()
    expect(screen.queryByText('Lookup instruction')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'What else should AE know to find the right options?' })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/requests/request%3Alegacy-label', expect.objectContaining({
      method: 'GET',
    }))
  })

  it('shows a not-sent failure without attributing it to the business', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'not-sent' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({
      kind: 'request', requestRef: 'request:not-sent', revision: 1, state: 'failed',
      summary: 'AE could not safely contact the business. Nothing was sent.',
      nextAction: 'revise_request', missingFields: [], criteria: [], options: [],
      action: {
        state: 'failed', resolution: 'not_sent', automaticRetry: false,
        result: { reason: 'business_contact_not_started' }, observedAt: 10,
      },
    })))
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: 'Find an available option' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))

    expect(await screen.findByRole('heading', {
      name: 'AE could not safely contact the business. Nothing was sent.',
    })).toBeTruthy()
    expect(screen.getByText('No business action occurred. Review or revise your request before trying another option.')).toBeTruthy()
    expect(screen.queryByText('Business result')).toBeNull()
    expect(screen.queryByText(/business_contact_not_started/)).toBeNull()
  })

  it('explains how an unsupported Request was handled without claiming redaction or deletion', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'privacy-disposition' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({
      kind: 'request', requestRef: 'request:privacy-disposition', revision: 1, state: 'unsupported',
      summary: 'No business on AE can support this request right now.',
      nextAction: 'revise_request', missingFields: [], criteria: [], options: [],
      dataHandling: {
        requestStorage: 'saved_for_revision',
        businessSharing: 'not_shared',
        explanation: 'AE saved this Request so you can revise it. No information was sent to a business.',
      },
    })))
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: 'Find an option. My private medical context is included.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))

    expect(await screen.findByRole('heading', {
      name: 'No business on AE can support this request right now.',
    })).toBeTruthy()
    expect(screen.getByText(
      'AE saved this Request so you can revise it. No information was sent to a business.',
    )).toBeTruthy()
    expect(screen.queryByText(/redact|delete/iu)).toBeNull()
  })

  it('shows completed work when a later business result is still unknown', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'partial-unknown' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({
      kind: 'request', requestRef: 'request:partial-unknown', revision: 1, state: 'outcome_unknown',
      summary: 'The business may have acted, but AE does not yet have enough evidence to confirm the result. AE will not send it again.',
      nextAction: 'wait', missingFields: [], criteria: [], options: [],
      progress: { completed: 1, total: 2, current: { step: 2, state: 'needs_attention' } },
      action: {
        state: 'unknown', resolution: 'awaiting_evidence', automaticRetry: false, observedAt: 10,
      },
      activity: {
        actor: 'ae_for_customer', certainty: 'unknown', updatedAt: 10, nextCheckAt: 40,
        retry: 'blocked_until_reconciled', cancellation: 'too_late_or_unsupported',
        safeNextAction: 'wait_for_evidence',
      },
    })))
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: 'Resolve a service and prepare its quote' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))

    expect(await screen.findByText('1 of 2 business steps completed.')).toBeTruthy()
    expect(screen.getByText('AE will not repeat the step whose result is still being confirmed.')).toBeTruthy()
    expect(screen.getByText('Wait for confirmation before changing or starting this Request again.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit this Request' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start a new Request' })).toBeNull()
  })

  it('labels a preserved partial result as incomplete evidence rather than a business result', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'partial-result' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({
      kind: 'request', requestRef: 'request:partial-result', revision: 1, state: 'outcome_unknown',
      summary: 'A business returned a partial result. AE has preserved it as evidence and will not claim completion or send the request again.',
      nextAction: 'wait', missingFields: [], criteria: [], options: [],
      businesses: [
        { businessRef: 'business:resolver', name: 'Sandbox Route Resolver' },
        { businessRef: 'business:quoter', name: 'Sandbox Route Quoter' },
      ],
      progress: { completed: 1, total: 2, current: { step: 2, state: 'needs_attention' } },
      action: {
        state: 'unknown', resolution: 'awaiting_evidence', automaticRetry: false,
        result: {
          kind: 'partial_result',
          output: { quoteReference: 'sandbox-partial-quote:one' },
        },
        observedAt: 10,
      },
      activity: {
        actor: 'ae_for_customer', certainty: 'unknown', updatedAt: 10, nextCheckAt: 40,
        retry: 'blocked_until_reconciled', cancellation: 'too_late_or_unsupported',
        safeNextAction: 'wait_for_evidence',
      },
    })))
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: 'Resolve a service and prepare its quote, even if only a partial result is available.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))

    expect(await screen.findByText('Partial result received')).toBeTruthy()
    expect(screen.getByText(/sandbox-partial-quote:one/u)).toBeTruthy()
    expect(screen.getByText('This is preserved evidence, not a completed result.')).toBeTruthy()
    expect(screen.queryByText('Business result')).toBeNull()
  })

  it('shows the canonical activity record inline instead of sending the customer to raw JSON', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'completed-evidence' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        kind: 'request', requestRef: 'request:completed-evidence', revision: 1, state: 'completed',
        summary: 'Your result is ready.', nextAction: 'none', missingFields: [], criteria: [], options: [],
        progress: { completed: 2, total: 2, current: { step: 2, state: 'validating_result' } },
        action: {
          state: 'completed', resolution: 'provider_result',
          result: { quoteReference: 'sandbox-quote:usable' }, observedAt: 10,
        },
      }))
      .mockResolvedValueOnce(Response.json({
        kind: 'evidence', requestRef: 'request:completed-evidence', state: 'completed', generatedAt: 11,
        steps: [
          {
            step: 1, state: 'completed', observedAt: 8,
            evidence: [{ receiptRef: 'receipt:resolver', label: 'Service reference accepted' }],
          },
          {
            step: 2, state: 'completed', observedAt: 10,
            evidence: [{ receiptRef: 'receipt:quoter', label: 'Quote reference accepted' }],
          },
        ],
        result: { quoteReference: 'sandbox-quote:usable' },
      }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: 'Resolve a service and prepare its quote' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    fireEvent.click(await screen.findByRole('button', { name: 'View activity record' }))

    expect(await screen.findByRole('heading', { name: 'Activity record' })).toBeTruthy()
    expect(screen.getByText('Step 1 completed')).toBeTruthy()
    expect(screen.getByText('Service reference accepted')).toBeTruthy()
    expect(screen.getByText('Step 2 completed')).toBeTruthy()
    expect(screen.getByText('Quote reference accepted')).toBeTruthy()
    expect(screen.getAllByText('sandbox-quote:usable')).toHaveLength(2)
    expect(screen.queryByText(/receipt:resolver|receipt:quoter/u)).toBeNull()
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/requests/request%3Acompleted-evidence/evidence',
      { headers: { Accept: 'application/json' } },
    )
  })

  it('presents the full request as a customer fact instead of a provider question', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'request-label' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({
      kind: 'request', requestRef: 'request:label', revision: 1, state: 'ready_to_compare',
      summary: 'Find a labelled service and tell me what it costs.',
      nextAction: 'prepare_options', missingFields: [], options: [],
      criteria: [{
        label: 'What should the first business resolve?',
        value: 'Find a labelled service and tell me what it costs.', basis: 'extracted_from_request',
      }],
    })))
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: 'Find a labelled service and tell me what it costs.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))

    expect(await screen.findByText(/Request:/)).toBeTruthy()
    expect(screen.queryByText(/What should the first business resolve\?/)).toBeNull()
  })

  it('renders the shared RoutePlan decision as an outcome, not routing machinery', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-route' })
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      kind: 'request', requestRef: 'request:route', revision: 2,
      routeGenerationRef: 'generation:two', state: 'routes_ready',
      summary: 'Prepare a result using registered businesses.', nextAction: 'inspect_routes',
      missingFields: [], criteria: [], options: [],
      decision: {
        generationRef: 'generation:two', requestRevision: 2,
        outcome: { kind: 'routes_available', routeCount: 1, summary: 'One way forward is available.' },
        routes: [{
          routeRef: 'route:opaque',
          quoteDigest: 'quote:opaque',
          result: {
            resultRef: 'route:opaque', summary: 'Prepare a governed result.', deliverables: ['Result reference'],
          },
          availability: 'current', stepCount: 2,
          businesses: [
            { businessRef: 'business:one', name: 'North Star Services' },
            { businessRef: 'business:two', name: 'City Ledger' },
          ],
          maximumTotalCost: { kind: 'known', currency: 'AUD', amountMinor: 1_400 },
          dataUse: {
            recipientCount: 2,
            recipients: [
              { recipientRef: 'recipient:one', name: 'North Star Services', purposes: ['Find the service'], fields: [{ fieldRef: 'field:request', label: 'Request', classification: 'public' }] },
              { recipientRef: 'recipient:two', name: 'City Ledger', purposes: ['Prepare the result'], fields: [{ fieldRef: 'field:result', label: 'Result', classification: 'personal' }] },
            ],
            purposes: ['Find the service', 'Prepare the result'],
          },
          effects: [{ kind: 'information_shared', reversibility: 'irreversible' }],
          evidence: [{ label: 'Result reference', purpose: 'completion' }],
          recovery: [
            { step: 1, businessName: 'North Star Services', posture: 'retry_safe' },
            { step: 2, businessName: 'City Ledger', posture: 'reconcile_required' },
          ],
          cancellation: { kind: 'unavailable', summary: 'The businesses do not publish a cancellation path for this option.' },
          validUntil: Date.now() + 60_000,
          fallback: { available: false, alternatives: [] }, uncertainty: [],
          comparison: routeComparison('route:opaque', 'current', 1_400, 2, 1, 'reconcile_required'),
          steps: [
            { step: 1, business: { businessRef: 'business:one', name: 'North Star Services' }, after: [] },
            { step: 2, business: { businessRef: 'business:two', name: 'City Ledger' }, after: [1] },
          ],
        }],
        comparison: {
          kind: 'single',
          summary: 'One current way forward is available. This is not a comparison or recommendation.',
        },
        actions: {
          review: { kind: 'inspect_current_option', createsAuthority: false, startsWork: false, summary: 'Reviewing shows every important limit. It does not confirm or start anything.' },
          confirm: { kind: 'confirm_current_option', createsAuthority: true, startsWork: false, summary: 'Confirming creates permission for this exact choice. It does not contact a business or start work.' },
          start: { kind: 'start_confirmed_option', availableAfter: 'confirmation', startsWork: true, summary: 'Starting uses that confirmation to contact the listed businesses and begin the work.' },
          change: { kind: 'revise_request', createsAuthority: false, startsWork: false, preservesRequest: true, summary: 'Changing preserves the Request and returns to its details. The current choice remains unconfirmed.' },
          decline: { kind: 'leave_unconfirmed', createsAuthority: false, startsWork: false, preservesRequest: true, summary: 'Declining leaves this choice unconfirmed and starts nothing.' },
        },
        changes: {
          kind: 'changed', previousGenerationRef: 'generation:one',
          items: [
            {
              kind: 'maximum_cost',
              before: [{
                resultRef: 'route:opaque',
                cost: { kind: 'known', currency: 'AUD', amountMinor: 1_600 },
              }],
              after: [{
                resultRef: 'route:opaque',
                cost: { kind: 'known', currency: 'AUD', amountMinor: 1_400 },
              }],
            },
            {
              kind: 'businesses',
              before: [{
                resultRef: 'route:opaque',
                businesses: [{ businessRef: 'business:one', name: 'North Star Services' }],
              }],
              after: [{
                resultRef: 'route:opaque',
                businesses: [
                  { businessRef: 'business:one', name: 'North Star Services' },
                  { businessRef: 'business:two', name: 'City Ledger' },
                ],
              }],
            },
          ],
        },
        nextBoundary: { kind: 'confirmation', authorityCreated: false },
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: 'Prepare a result using registered businesses' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))

    expect(await screen.findByRole('heading', { name: 'One way forward is available.' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Prepare a governed result.' })).toBeTruthy()
    expect(screen.getByText('Through North Star Services and City Ledger')).toBeTruthy()
    expect(screen.getByText('Maximum $14.00')).toBeTruthy()
    expect(screen.queryByText(/Option fingerprint/i)).toBeNull()
    expect(screen.getByText('The maximum for Prepare a governed result changed from $16.00 to $14.00.')).toBeTruthy()
    expect(screen.getByText('Businesses changed. Before: Prepare a governed result: North Star Services. Now: Prepare a governed result: North Star Services and City Ledger.')).toBeTruthy()
    expect(screen.getByText('It covers the requested result and every constraint AE could check.')).toBeTruthy()
    expect(screen.getByText('2 information recipients')).toBeTruthy()
    expect(screen.getByText('1 irreversible effect')).toBeTruthy()
    expect(screen.getByText(/Fields: Request \(public\)/).closest('details')?.hasAttribute('open')).toBe(false)
    expect(screen.getByText('City Ledger will follow step 1.').closest('details')?.hasAttribute('open')).toBe(false)
    fireEvent.click(screen.getByText('Important details'))
    expect(screen.getByText(/Fields: Request \(public\)/)).toBeTruthy()
    expect(screen.getByText(/Information would be shared/)).toBeTruthy()
    expect(screen.getByText('No uncertainty is declared for this way forward.')).toBeTruthy()
    expect(screen.getByText('The businesses do not publish a cancellation path for this option.')).toBeTruthy()
    fireEvent.click(screen.getByText('How this would work'))
    expect(screen.getByText('City Ledger will follow step 1.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Review Prepare a governed result' })).toBeTruthy()
    expect(screen.getByText(/Nothing has been authorized or shared/)).toBeTruthy()
    expect(screen.queryByText(/capability|binding|transport|graph node/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Review Prepare a governed result' }))
    expect(await screen.findByRole('heading', { name: 'Review before you confirm' })).toBeTruthy()
    expect(screen.getByText('Prepare a governed result.')).toBeTruthy()
    expect(screen.getByText('Maximum $14.00')).toBeTruthy()
    expect(screen.getByText(/Fields: Request \(public\)/)).toBeTruthy()
    expect(screen.getByText(/cannot be reversed automatically/)).toBeTruthy()
    expect(screen.getByText('The businesses do not publish a cancellation path for this option.')).toBeTruthy()
    expect(screen.getByText('Choice code quote:opaque')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirm this choice' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(await screen.findByRole('button', { name: 'Review Prepare a governed result' })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('confirms the displayed choice, then starts and follows it without exposing kernel choreography', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-confirm' })
    const route = routeChoice('route:confirm', 'current')
    const preview = {
      kind: 'request' as const, requestRef: 'request:confirm', revision: 2,
      routeGenerationRef: 'generation:confirm', state: 'routes_ready' as const,
      summary: 'One way forward is available.', nextAction: 'inspect_routes' as const,
      missingFields: [], criteria: [], options: [],
      decision: {
        generationRef: 'generation:confirm', requestRevision: 2,
        outcome: { kind: 'routes_available' as const, routeCount: 1, summary: 'One way forward is available.' },
        routes: [route], changes: { kind: 'initial' as const },
        comparison: {
          kind: 'single' as const,
          summary: 'One current way forward is available. This is not a comparison or recommendation.',
        },
        actions: {
          review: { kind: 'inspect_current_option' as const, createsAuthority: false as const, startsWork: false as const, summary: 'Reviewing shows every important limit. It does not confirm or start anything.' },
          confirm: { kind: 'confirm_current_option' as const, createsAuthority: true as const, startsWork: false as const, summary: 'Confirming creates permission for this exact choice. It does not contact a business or start work.' },
          start: { kind: 'start_confirmed_option' as const, availableAfter: 'confirmation' as const, startsWork: true as const, summary: 'Starting uses that confirmation to contact the listed businesses and begin the work.' },
          change: { kind: 'revise_request' as const, createsAuthority: false as const, startsWork: false as const, preservesRequest: true as const, summary: 'Changing preserves the Request and returns to its details. The current choice remains unconfirmed.' },
          decline: { kind: 'leave_unconfirmed' as const, createsAuthority: false as const, startsWork: false as const, preservesRequest: true as const, summary: 'Declining leaves this choice unconfirmed and starts nothing.' },
        },
        nextBoundary: { kind: 'confirmation' as const, authorityCreated: false as const },
      },
    }
    const confirmed = {
      kind: 'request' as const, requestRef: 'request:confirm', revision: 2,
      routeGenerationRef: 'generation:confirm', state: 'route_confirmed' as const,
      summary: 'Your choice is confirmed. Nothing has started yet.', nextAction: 'inspect_confirmation' as const,
      missingFields: [], criteria: [], options: [],
      confirmation: {
        confirmationRef: 'confirmation:opaque', generationRef: 'generation:confirm', requestRevision: 2,
        confirmedAt: Date.now(), validUntil: route.validUntil, route,
      },
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(preview))
      .mockResolvedValueOnce(Response.json(confirmed))
      .mockResolvedValueOnce(Response.json({
        kind: 'request', requestRef: 'request:confirm', revision: 2,
        routeGenerationRef: 'generation:confirm', state: 'in_progress',
        summary: 'Your request is in progress.', nextAction: 'wait', missingFields: [], options: [],
        criteria: [{
          label: 'What should the first business resolve?', value: 'Prepare a result',
          basis: 'extracted_from_request',
        }],
        progress: {
          completed: 0, total: 1,
          current: { step: 1, state: 'contacting' },
        },
      }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), { target: { value: 'Prepare a result' } })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Review Result from route:confirm' }))

    expect(await screen.findByRole('heading', { name: 'Review before you confirm' })).toBeTruthy()
    expect(screen.getByText('Choice code quote:route:confirm')).toBeTruthy()
    expect(screen.getByText('No information would be shared.')).toBeTruthy()
    expect(screen.getByText('No cancellation path is published.')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm this choice' }))

    expect(await screen.findByText('Choice confirmed')).toBeTruthy()
    expect(screen.getByText(/Nothing has started yet/)).toBeTruthy()
    expect(screen.getByText('Confirmation code confirmation:opaque')).toBeTruthy()
    expect(screen.queryByText(/Option fingerprint/i)).toBeNull()
    expect(screen.getByText('No uncertainty is declared for this choice.')).toBeTruthy()
    expect(screen.getByText('No alternative way is currently declared.')).toBeTruthy()
    expect(screen.getByText(/Step 1, Business route:confirm: AE can safely retry/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start now' }))

    expect(await screen.findByRole('heading', { name: 'Your request is in progress.' })).toBeTruthy()
    expect(screen.getByText('Step 1 of 1')).toBeTruthy()
    expect(screen.getByText('Contacting the business')).toBeTruthy()
    expect(screen.getByText(/Request detail:/)).toBeTruthy()
    expect(screen.queryByText(/What should the first business resolve\?/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Check progress' })).toBeTruthy()
    expect(screen.queryByText(/capability|binding|transport|mandate|graph node/i)).toBeNull()
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/requests/request%3Aconfirm/confirmation', expect.objectContaining({
      method: 'POST',
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/requests/request%3Aconfirm/run', expect.objectContaining({
      method: 'POST',
    }))
    expect(JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit | undefined)?.body))).toEqual({
      idempotencyKey: 'run:request:confirm:confirmation:opaque',
    })
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
      .mockResolvedValueOnce(Response.json({ ...projection, requestRef: 'request:uuid-3' }))
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
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/requests/request%3Auuid-1/messages', expect.objectContaining({
      method: 'POST',
    }))
    expect(secondBody).toEqual({
      idempotencyKey: 'replace:request:uuid-1:1', expectedRevision: 1,
      message: 'Lunch in Fremantle', mode: 'replace',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start a new Request' }))
    await waitFor(() => expect((screen.getByLabelText('What are you looking for?') as HTMLTextAreaElement).value).toBe(''))
    fireEvent.change(screen.getByLabelText('What are you looking for?'), { target: { value: 'A separate request' } })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    await screen.findByRole('button', { name: 'Edit this Request' })
    const thirdBody = JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit | undefined)?.body))
    expect(thirdBody).toMatchObject({ requestRef: 'request:uuid-3', agentRef: 'web:uuid-4', request: 'A separate request' })
    expect(thirdBody).not.toHaveProperty('expectedRevision')
  })

  it('explains protected data sharing before any provider preparation', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-protected' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        kind: 'request', requestRef: 'request:protected', revision: 1, state: 'needs_authorization',
        summary: 'Send my parcel', nextAction: 'review_disclosure', missingFields: [], criteria: [], options: [],
        preparationRef: 'action-preparation:protected',
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
    expect(screen.getByText(/up to 2 matching businesses/)).toBeTruthy()
    expect(screen.getByText(/Nothing has been shared/)).toBeTruthy()
    expect(screen.queryByText('origin_postcode')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Allow this comparison' }))
    await screen.findByRole('button', { name: 'Show available options' })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/requests/request%3Aprotected/authorization', expect.objectContaining({ method: 'POST' }))
    const authorizationBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body))
    expect(authorizationBody).toMatchObject({ preparationRef: 'action-preparation:protected' })
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

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(screen.getByRole('heading', { name: 'Nothing available matched your request.' })).toBeTruthy()
    }, { timeout: 5_000 })
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

  it('shows the businesses that completed a resumed Request', async () => {
    localStorage.setItem('ae.customer-request.active:v1', JSON.stringify({
      requestRef: 'request:completed-businesses',
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      kind: 'request', requestRef: 'request:completed-businesses', revision: 1,
      state: 'completed', summary: 'The business confirmed the result.', nextAction: 'none',
      missingFields: [], criteria: [], options: [],
      businesses: [
        { businessRef: 'business:resolver', name: 'Sandbox Route Resolver' },
        { businessRef: 'business:quoter', name: 'Sandbox Route Quoter' },
      ],
      action: {
        state: 'completed', resolution: 'provider_result', automaticRetry: false,
        result: { quoteReference: 'sandbox-quote:one' }, observedAt: 10_000,
      },
      activity: {
        actor: 'ae_for_customer', certainty: 'confirmed', updatedAt: 10_000,
        retry: 'not_needed', cancellation: 'complete', safeNextAction: 'review_result',
      },
    })))

    render(<AeCustomerRequestWorkspace />)

    expect(await screen.findByText('Through Sandbox Route Resolver and Sandbox Route Quoter')).toBeTruthy()
  })

  it('does not present an expired route as a current choice in a mixed generation', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-mixed-expiry' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      kind: 'request', requestRef: 'request:mixed', revision: 2,
      routeGenerationRef: 'generation:mixed', state: 'routes_ready',
      summary: 'One current way forward and one expired.', nextAction: 'inspect_routes',
      missingFields: [], criteria: [], options: [],
      decision: {
        generationRef: 'generation:mixed', requestRevision: 2,
        outcome: {
          kind: 'routes_available', routeCount: 2, summary: 'One current way forward and one expired.',
        },
        routes: [routeChoice('route:current', 'current'), routeChoice('route:expired', 'expired')],
        comparison: {
          kind: 'unranked', reason: 'stale_evidence',
          summary: 'At least one way forward has expired, so AE has not ranked this set.',
        },
        changes: { kind: 'initial' },
        nextBoundary: { kind: 'confirmation', authorityCreated: false },
      },
    })))
    render(<AeCustomerRequestWorkspace />)
    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: 'Find a current way forward' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))

    expect(await screen.findByText('Current way forward 1')).toBeTruthy()
    expect(screen.getByText('Expired way forward')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check current options' })).toBeTruthy()
  })

  it('turns a decision conflict into an explicit resume action', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-conflict' })
    const requestView = {
      kind: 'request', requestRef: 'request:conflict', revision: 1, state: 'ready_to_compare',
      summary: 'Find a current option', nextAction: 'prepare_options', missingFields: [], options: [],
    } as const
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(requestView))
      .mockResolvedValueOnce(Response.json({
        kind: 'conflict', requestRef: requestView.requestRef, reason: 'options_changed',
      }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ ...requestView, revision: 2 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: 'Find a current option' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Show available options' }))

    expect(await screen.findByRole('heading', { name: 'This Request changed.' })).toBeTruthy()
    expect(screen.getByText(/No action was authorized/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load the current Request' }))
    expect(await screen.findByRole('button', { name: 'Show available options' })).toBeTruthy()
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/requests/request%3Aconflict')
  })
})

function routeChoice(routeRef: string, availability: 'current' | 'expired') {
  return {
    routeRef,
    quoteDigest: `quote:${routeRef}`,
    result: { resultRef: routeRef, summary: `Result from ${routeRef}`, deliverables: ['Result reference'] },
    availability,
    stepCount: 1,
    businesses: [{ businessRef: `business:${routeRef}`, name: `Business ${routeRef}` }],
    maximumTotalCost: { kind: 'known' as const, currency: 'AUD', amountMinor: 1_200 },
    dataUse: { recipientCount: 0, recipients: [], purposes: [] },
    effects: [], evidence: [{ label: 'Result reference', purpose: 'completion' as const }],
    recovery: [{ step: 1, businessName: `Business ${routeRef}`, posture: 'retry_safe' as const }],
    cancellation: { kind: 'unavailable' as const, summary: 'No cancellation path is published.' },
    validUntil: availability === 'current' ? Date.now() + 60_000 : Date.now() - 60_000,
    fallback: { available: false, alternatives: [] }, uncertainty: [],
    comparison: routeComparison(routeRef, availability, 1_200, 0, 0, 'retry_safe'),
    steps: [{
      step: 1, business: { businessRef: `business:${routeRef}`, name: `Business ${routeRef}` }, after: [],
    }],
  }
}

function routeComparison(
  outcomeRef: string,
  freshness: 'current' | 'expired',
  amountMinor: number,
  dataExposureCount: number,
  irreversibleEffectCount: number,
  recovery: 'retry_safe' | 'reconcile_required',
) {
  return {
    outcomeRef, outcomeFit: 'same_promised_result' as const,
    completeness: 'complete' as const, hardConstraints: 'satisfied' as const,
    maximumCost: { kind: 'known' as const, currency: 'AUD', amountMinor },
    dataExposureCount, irreversibleEffectCount, uncertaintyCount: 0,
    duration: 'not_declared' as const, recovery,
    trust: 'registered_current_option' as const, evidenceCount: 1,
    freshness: {
      state: freshness,
      validUntil: freshness === 'current' ? Date.now() + 60_000 : Date.now() - 60_000,
    },
    commercialInfluence: { status: 'none' as const, evidenceRefs: ['commercial:none'] },
  }
}
