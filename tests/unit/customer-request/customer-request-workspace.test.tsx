/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AeCustomerRequestWorkspace } from '@/components/ae/customer-request/AeCustomerRequestWorkspace'
import { CUSTOMER_REQUEST_PUBLIC_COMPREHENSION } from '@/modules/customer-request/public-comprehension'

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

    expect(screen.getByRole('heading', { level: 1, name: 'What do you need to make happen?' })).toBeTruthy()
    expect(screen.getByText(CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.situation)).toBeTruthy()
    expect(screen.queryByText('Start with whatever you know.')).toBeNull()
    expect(screen.queryByText(/work out the next decision/i)).toBeNull()
    expect(screen.queryByText('Lookup instruction')).toBeNull()
    expect(screen.queryByText('Your answer')).toBeNull()
  })

  it('starts the canonical Request journey from a prefilled public ask', () => {
    render(<AeCustomerRequestWorkspace initialNeed="A quiet place for dinner" />)

    expect((screen.getByLabelText('What are you looking for?') as HTMLTextAreaElement).value)
      .toBe('A quiet place for dinner')
    expect((screen.getByRole('button', { name: 'Start my Request' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('resumes the active browser Request after reload and forgets only its local pointer on restart', async () => {
    let sequence = 0
    vi.stubGlobal('crypto', { randomUUID: () => `resume-${++sequence}` })
    const projection = {
      kind: 'request', requestRef: 'request:resume-1', revision: 3, state: 'ready_to_compare',
      summary: 'Find lunch in Fremantle', nextAction: 'prepare_options', missingFields: [], options: [],
    } as const
    const restoredProjection = {
      ...projection,
      recovery: {
        state: 'restored', reason: 'request_restored',
        restoredAt: 4_000, workRestarted: false,
      },
    } as const
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(projection))
      .mockResolvedValueOnce(Response.json(restoredProjection))
    vi.stubGlobal('fetch', fetchMock)

    const firstView = render(<AeCustomerRequestWorkspace />)
    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: 'Find lunch in Fremantle' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))
    expect(await screen.findByRole('button', { name: 'Show available options' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('ae.customer-request.active:v1') ?? '{}')).toEqual({
      requestRef: 'request:resume-1',
    })
    firstView.unmount()

    render(<AeCustomerRequestWorkspace />)
    expect(await screen.findByRole('button', { name: 'Show available options' })).toBeTruthy()
    expect(screen.getByText('AE restored the latest saved state for this Request. Checking it did not restart the work.')).toBeTruthy()
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
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))
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

  it('distinguishes fit constraints, unresolved uncertainty, and authority boundaries', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-material-criteria' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      kind: 'request', requestRef: 'request:material-criteria', revision: 1,
      state: 'ready_to_compare', summary: 'Plan an accessible trip', nextAction: 'prepare_options',
      missingFields: [], options: [], criteria: [
        { label: 'Must preserve', value: 'Accessible transport is mandatory.', basis: 'extracted_from_request', impact: 'eligibility_and_comparison' },
        { label: 'Known uncertainty', value: 'Passport details are unavailable.', basis: 'extracted_from_request', impact: 'uncertainty' },
        { label: 'Must not happen', value: 'Do not contact providers.', basis: 'extracted_from_request', impact: 'authority_boundary' },
      ],
    })))
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), { target: { value: 'Plan an accessible trip' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))

    expect(await screen.findByText(/Used to decide which options fit and how they compare\./u)).toBeTruthy()
    expect(screen.getByText(/AE will keep this uncertainty visible until evidence resolves it\./u)).toBeTruthy()
    expect(screen.getByText(/This Request does not grant permission to cross this boundary\./u)).toBeTruthy()
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
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))

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
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))

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
        explanation: 'AE saved this revision so you can change it. No information from this revision was sent to a business.',
      },
      unsupportedRecovery: {
        reason: 'no_current_business',
        preservedRequest: true,
        authorityCreatedForThisRevision: false,
        businessContactedForThisRevision: false,
        nextStep: {
          kind: 'change_request',
          summary: 'Change the location, timing, or outcome while keeping this Request and its history.',
        },
      },
    })))
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: 'Find an option. My private medical context is included.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))

    expect(await screen.findByRole('heading', {
      name: 'No business on AE can support this request right now.',
    })).toBeTruthy()
    expect(screen.getByText(
      'AE saved this revision so you can change it. No information from this revision was sent to a business.',
    )).toBeTruthy()
    expect(screen.getByText(
      'Change the location, timing, or outcome while keeping this Request and its history.',
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
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))

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
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))

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
        progress: { completed: 2, total: 2, current: { step: 2, state: 'completed' } },
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
        problems: [{
          reportRef: 'problem:opaque', version: 0, state: 'received',
          category: 'incorrect_result',
          summary: 'The quote is over the confirmed maximum.',
          claimSource: 'customer', causality: 'unknown',
          resolution: 'not_adjudicated', nextAction: 'await_status_update',
          nextActor: 'ae', nextUpdateDueAt: 86_400_010,
          decisionAuthority: 'not_assigned',
          visibility: 'customer_and_ae_only',
          evidence: [{ receiptRef: 'receipt:quoter', label: 'Quote reference accepted' }],
          reportedAt: 10,
          affected: { step: 2, attemptRef: 'attempt:opaque', business: 'Quote preparation service' },
          claims: [
            {
              claimSource: 'customer', causalityPosition: 'reported_problem',
              statement: 'The quote is over the confirmed maximum.',
              evidence: [{ receiptRef: 'receipt:quoter', label: 'Quote reference accepted' }],
              recordedAt: 10,
            },
            {
              claimSource: 'business', causalityPosition: 'uncertain',
              statement: 'Our receipt confirms the quote, but not the cause of the mismatch.',
              business: 'Quote preparation service',
              evidence: [{ receiptRef: 'receipt:quoter', label: 'Quote reference accepted' }],
              recordedAt: 12,
            },
          ],
          history: [{
            version: 0, state: 'received', source: 'customer',
            message: 'The quote is over the confirmed maximum.', recordedAt: 10,
          }],
        }],
        result: { quoteReference: 'sandbox-quote:usable' },
      }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: 'Resolve a service and prepare its quote' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))
    fireEvent.click(await screen.findByRole('button', { name: 'View activity record' }))

    expect(await screen.findByRole('heading', { name: 'Activity record' })).toBeTruthy()
    expect(screen.getByText('Step 1 completed')).toBeTruthy()
    expect(screen.getByText('Service reference accepted')).toBeTruthy()
    expect(screen.getByText(/AE owns the next status update/u)).toBeTruthy()
    expect(screen.getByText(/No reviewer or remedy authority has been assigned/u)).toBeTruthy()
    expect(screen.getByText('Step 2 completed')).toBeTruthy()
    expect(screen.getByText('Quote reference accepted')).toBeTruthy()
    expect(screen.getAllByText('sandbox-quote:usable')).toHaveLength(2)
    expect(screen.getByText('Reported problems')).toBeTruthy()
    expect(screen.getByText('Step 2: report received')).toBeTruthy()
    expect(screen.getByText('The quote is over the confirmed maximum.')).toBeTruthy()
    expect(screen.getByText(/AE has not decided what caused the problem/u)).toBeTruthy()
    expect(screen.getByText('Business statements')).toBeTruthy()
    expect(screen.getByText(/Our receipt confirms the quote, but not the cause of the mismatch/u)).toBeTruthy()
    expect(screen.getByText(/The business says the cause is still uncertain/u)).toBeTruthy()
    expect(screen.getByText(/These statements do not decide cause, responsibility, or remedy/u)).toBeTruthy()
    expect(screen.getByText('Visible only to you and AE.')).toBeTruthy()
    expect(screen.getByText('1 recorded evidence item attached.')).toBeTruthy()
    expect(screen.queryByText(/problem:opaque|attempt:opaque/u)).toBeNull()
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
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))

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
          fallback: { available: false, alternatives: [] },
          uncertainty: ['customer_fact_needs_evidence'],
          comparison: {
            ...routeComparison('route:opaque', 'current', 1_400, 2, 1, 'reconcile_required'),
            hardConstraints: 'not_evaluated' as const,
            uncertaintyCount: 1,
          },
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
              kind: 'request_criteria',
              before: [{ label: 'Meeting time', value: '15:00', basis: 'customer_provided' }],
              after: [{ label: 'Meeting time', value: '09:00', basis: 'customer_provided' }],
            },
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
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))

    expect(await screen.findByRole('heading', { name: 'One way forward is available.' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Prepare a governed result.' })).toBeTruthy()
    expect(screen.getByText('Through North Star Services and City Ledger')).toBeTruthy()
    expect(screen.getByText('Maximum $14.00')).toBeTruthy()
    expect(screen.queryByText(/Option fingerprint/i)).toBeNull()
    expect(screen.getByText('What matters changed. Before: Meeting time: 15:00. Now: Meeting time: 09:00.')).toBeTruthy()
    expect(screen.getByText('The maximum for Prepare a governed result changed from $16.00 to $14.00.')).toBeTruthy()
    expect(screen.getByText('Businesses changed. Before: Prepare a governed result: North Star Services. Now: Prepare a governed result: North Star Services and City Ledger.')).toBeTruthy()
    expect(screen.getByText('The registered steps can return the stated result. AE has not independently verified every detail in your Request.')).toBeTruthy()
    expect(screen.getByText('2 information recipients')).toBeTruthy()
    expect(screen.getByText('1 irreversible effect')).toBeTruthy()
    // Disclosure is one idiom now: an Astryx Collapsible whose trigger carries
    // the expanded state, rather than a native <details> beside chevron rows.
    for (const trigger of ['Important details', 'How this would work']) {
      expect(screen.getByRole('button', { name: trigger }).getAttribute('aria-expanded')).toBe('false')
    }
    fireEvent.click(screen.getByText('Important details'))
    expect(screen.getByText(/Fields: Request \(public\)/)).toBeTruthy()
    expect(screen.getByText(/Information would be shared/)).toBeTruthy()
    expect(screen.getByText('A fact you marked as uncertain still needs evidence')).toBeTruthy()
    expect(screen.getByText('The businesses do not publish a cancellation path for this option.')).toBeTruthy()
    fireEvent.click(screen.getByText('How this would work'))
    expect(screen.getByText('City Ledger will follow step 1.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Review this option' })).toBeTruthy()
    expect(screen.getByText(/Nothing has been authorized or shared/)).toBeTruthy()
    expect(screen.queryByText(/capability|binding|transport|graph node/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Review this option' }))
    expect(await screen.findByRole('heading', { name: 'Review before you confirm' })).toBeTruthy()
    expect(screen.getByText('Prepare a governed result.')).toBeTruthy()
    expect(screen.getByText('Maximum $14.00')).toBeTruthy()
    expect(screen.getByText(/Fields: Request \(public\)/)).toBeTruthy()
    expect(screen.getByText(/cannot be reversed automatically/)).toBeTruthy()
    expect(screen.getByText('The businesses do not publish a cancellation path for this option.')).toBeTruthy()
    expect(screen.getByText('Choice code quote:opaque')).toBeTruthy()
    // What confirming means now sits directly under the primary action instead
    // of behind its own heading, so the meaning travels with the decision.
    const confirmMeaning = screen.getByText(
      'Confirming gives AE permission for this exact choice and maximum cost. It does not start work or share information yet.',
    )
    expect(confirmMeaning).toBeTruthy()
    const confirmButton = screen.getByRole('button', { name: 'Confirm this choice' })
    expect(confirmButton).toBeTruthy()
    expect(confirmButton.parentElement?.contains(confirmMeaning)).toBe(true)
    expect(screen.getByRole('button', { name: 'Change this Request' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Decline this choice' })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Decline this choice' }))
    expect(await screen.findByRole('button', { name: 'Review this option' })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('lets a person report why one exact current option cannot work without knowing its reference', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-unavailable' })
    const route = routeChoice('route:unavailable', 'current')
    const preview = {
      kind: 'request' as const, requestRef: 'request:unavailable', revision: 2,
      routeGenerationRef: 'generation:unavailable', state: 'routes_ready' as const,
      summary: 'One way forward is available.', nextAction: 'inspect_routes' as const,
      missingFields: [], criteria: [], options: [],
      decision: {
        generationRef: 'generation:unavailable', requestRevision: 2,
        outcome: { kind: 'routes_available' as const, routeCount: 1, summary: 'One way forward is available.' },
        routes: [route], changes: { kind: 'initial' as const },
        comparison: {
          kind: 'single' as const,
          summary: 'One current way forward is available. This is not a comparison or recommendation.',
        },
        actions: routeDecisionActions(),
        nextBoundary: { kind: 'confirmation' as const, authorityCreated: false as const },
      },
    }
    const unsupported = {
      kind: 'request' as const, requestRef: 'request:unavailable', revision: 3,
      state: 'unsupported' as const, summary: 'Find an option before Friday.',
      nextAction: 'revise_request' as const, missingFields: [], criteria: [], options: [],
      dataHandling: {
        requestStorage: 'saved_for_revision' as const,
        businessSharing: 'not_shared' as const,
        explanation: 'AE saved this revision so you can change it. No information from this revision was sent to a business.',
      },
      unsupportedRecovery: {
        reason: 'reported_option_unavailable' as const,
        preservedRequest: true as const,
        authorityCreatedForThisRevision: false as const,
        businessContactedForThisRevision: false as const,
        nextStep: {
          kind: 'change_request' as const,
          summary: 'Change what matters, or wait for different registered options while keeping this Request and its history.',
        },
      },
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(preview))
      .mockResolvedValueOnce(Response.json(
        { kind: 'refused', reason: 'interpreter_unavailable' },
        { status: 503 },
      ))
      .mockResolvedValueOnce(Response.json(unsupported))
    vi.stubGlobal('fetch', fetchMock)
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: 'Find an option before Friday.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Review this option' }))
    expect(await screen.findByRole('heading', { name: 'Review before you confirm' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Why does this option not work?'), {
      target: { value: 'It cannot meet the Friday deadline.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find another option' }))

    expect(await screen.findByText('Not supported yet', undefined, { timeout: 4_000 })).toBeTruthy()
    const submitted = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body))
    expect(submitted).toEqual({
      idempotencyKey: 'report-option:request:unavailable:2:uuid-unavailable',
      expectedRevision: 2,
      message: 'It cannot meet the Friday deadline.',
      reportedRouteRef: 'route:unavailable',
    })
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit | undefined)?.body)
      .toBe((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body)
  })

  it('keeps disclosed commercial relationships visible without letting them explain the recommendation', async () => {
    const baseLower = routeChoice('route:lower', 'current')
    const lower = {
      ...baseLower,
      maximumTotalCost: { ...baseLower.maximumTotalCost, amountMinor: 900 },
      comparison: {
        ...baseLower.comparison,
        maximumCost: { ...baseLower.comparison.maximumCost, amountMinor: 900 },
        commercialInfluence: {
          status: 'disclosed' as const,
          summaries: ['AE may receive a fixed referral fee.'],
          evidenceRefs: ['commercial:referral'],
          affectsDecision: false,
        },
      },
    }
    const higher = routeChoice('route:higher', 'current')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({
      kind: 'request', requestRef: 'request:recommended', revision: 2,
      routeGenerationRef: 'generation:recommended', state: 'routes_ready',
      summary: 'Two ways forward are available.', nextAction: 'inspect_routes',
      missingFields: [], criteria: [], options: [],
      decision: {
        generationRef: 'generation:recommended', requestRevision: 2,
        outcome: { kind: 'routes_available', routeCount: 2, summary: 'Two ways forward are available.' },
        routes: [lower, higher],
        comparison: {
          kind: 'recommended', summary: 'One way forward best matches the price priority in this Request.',
          routeRef: 'route:lower', objective: 'lowest_maximum_price',
          evidenceRef: 'preference:lowest-price', commercialInfluence: 'disclosed',
          reasons: ['Lowest maximum cost: AUD 9.00.', 'AUD 3.00 below the next current way forward.'],
          tradeoffs: ['No other declared comparison dimension separates the two leading ways forward.'],
        },
        actions: routeDecisionActions(),
        changes: { kind: 'initial' },
        nextBoundary: { kind: 'confirmation', authorityCreated: false },
      },
    })))
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: 'Choose the lowest maximum cost' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))

    expect(await screen.findByText('AUD 3.00 below the next current way forward.')).toBeTruthy()
    expect(screen.getByText(
      'Commercial relationships did not change eligibility, inclusion, or order.',
    )).toBeTruthy()
    expect(screen.getAllByText('AE may receive a fixed referral fee.')).toHaveLength(2)
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
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Review this option' }))

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
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))
    await screen.findByRole('button', { name: 'Edit this Request' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit this Request' }))
    await screen.findByText('Editing revision 1 of this Request.')
    fireEvent.change(screen.getByLabelText('What are you looking for?'), { target: { value: 'Lunch in Fremantle' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))
    await screen.findByRole('button', { name: 'Show available options' })
    const secondBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/requests/request%3Auuid-1/messages', expect.objectContaining({
      method: 'POST',
    }))
    expect(secondBody).toEqual({
      idempotencyKey: 'replace:request:uuid-1:1:uuid-3', expectedRevision: 1,
      message: 'Lunch in Fremantle', mode: 'replace',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start a new Request' }))
    await waitFor(() => expect((screen.getByLabelText('What are you looking for?') as HTMLTextAreaElement).value).toBe(''))
    fireEvent.change(screen.getByLabelText('What are you looking for?'), { target: { value: 'A separate request' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))
    await screen.findByRole('button', { name: 'Edit this Request' })
    const thirdBody = JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit | undefined)?.body))
    expect(thirdBody).toMatchObject({ requestRef: 'request:uuid-4', agentRef: 'web:uuid-5', request: 'A separate request' })
    expect(thirdBody).not.toHaveProperty('expectedRevision')
  })

  it('reuses an exact replacement key but gives a changed edit a new operation key', async () => {
    let sequence = 0
    vi.stubGlobal('crypto', { randomUUID: () => `uuid-${++sequence}` })
    const projection = {
      kind: 'request', requestRef: 'request:uuid-1', revision: 1, state: 'unsupported',
      summary: 'Find an accessible itinerary', nextAction: 'revise_request', missingFields: [], options: [],
    } as const
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(projection))
      .mockResolvedValueOnce(Response.json(projection))
      .mockResolvedValueOnce(Response.json({
        ...projection, revision: 2, state: 'ready_to_compare', nextAction: 'prepare_options',
        summary: 'Find an accessible itinerary under AUD 11,000',
      }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AeCustomerRequestWorkspace />)

    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: projection.summary },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit this Request' }))
    await screen.findByText('Editing revision 1 of this Request.')
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))
    const editAgain = await screen.findByRole('button', { name: 'Edit this Request' })
    await waitFor(() => expect((editAgain as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(editAgain)
    await screen.findByText('Editing revision 1 of this Request.')
    fireEvent.change(screen.getByLabelText('What are you looking for?'), {
      target: { value: 'Find an accessible itinerary under AUD 11,000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))
    await screen.findByRole('button', { name: 'Show available options' })

    const exactRetry = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body))
    const changedEdit = JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit | undefined)?.body))
    expect(exactRetry.idempotencyKey).toBe('replace:request:uuid-1:1:uuid-3')
    expect(changedEdit.idempotencyKey).toBe('replace:request:uuid-1:1:uuid-4')
    expect(changedEdit.idempotencyKey).not.toBe(exactRetry.idempotencyKey)
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
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))

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
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))
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

  it('shows who must act next during progress and unknown-outcome recovery', async () => {
    localStorage.setItem('ae.customer-request.active:v1', JSON.stringify({
      requestRef: 'request:responsibility',
    }))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        kind: 'request', requestRef: 'request:responsibility', revision: 1,
        state: 'in_progress', summary: 'Your request is in progress.', nextAction: 'wait',
        missingFields: [], criteria: [], options: [],
        progress: { completed: 0, total: 2, current: { step: 1, state: 'awaiting_result' } },
        activity: {
          actor: 'business', certainty: 'pending', updatedAt: 10, nextCheckAt: 40,
          retry: 'not_needed', cancellation: 'too_late_or_unsupported', safeNextAction: 'check_progress',
        },
      }))
      .mockResolvedValueOnce(Response.json({
        kind: 'request', requestRef: 'request:responsibility', revision: 1,
        state: 'outcome_unknown',
        summary: 'The business may have acted, but AE does not yet have enough evidence to confirm the result. AE will not send it again.',
        nextAction: 'wait', missingFields: [], criteria: [], options: [],
        progress: { completed: 0, total: 2, current: { step: 1, state: 'needs_attention' } },
        action: {
          state: 'unknown', resolution: 'awaiting_evidence', automaticRetry: false, observedAt: 10,
        },
        activity: {
          actor: 'ae', certainty: 'unknown', updatedAt: 10, nextCheckAt: 40,
          retry: 'blocked_until_reconciled', cancellation: 'too_late_or_unsupported',
          safeNextAction: 'wait_for_evidence',
        },
      }))
    vi.stubGlobal('fetch', fetchMock)

    render(<AeCustomerRequestWorkspace />)

    expect(await screen.findByText('Waiting on the business')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check progress' }))
    expect(await screen.findByText('AE is checking for evidence')).toBeTruthy()
  })

  it('shows when a stop request was too late without implying that AE cancelled the business work', async () => {
    localStorage.setItem('ae.customer-request.active:v1', JSON.stringify({
      requestRef: 'request:too-late-to-stop',
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      kind: 'request', requestRef: 'request:too-late-to-stop', revision: 1,
      state: 'in_progress', summary: 'Your request is in progress.', nextAction: 'wait',
      missingFields: [], criteria: [], options: [],
      progress: { completed: 0, total: 1, current: { step: 1, state: 'contacting' } },
      activity: {
        actor: 'ae', certainty: 'pending', updatedAt: 20_100, nextCheckAt: 50_100,
        retry: 'not_needed',
        cancellation: {
          state: 'not_available', reason: 'business_step_released',
          changedAt: 20_100, requestedAt: 20_200,
        },
        safeNextAction: 'check_progress',
      },
    })))

    render(<AeCustomerRequestWorkspace />)

    expect(await screen.findByText('You asked AE to stop, but the business step had already started.')).toBeTruthy()
    expect(screen.getByText('The business step was released at 1970-01-01T00:00:20.100Z.')).toBeTruthy()
    expect(screen.getByText(/AE recorded your stop request at/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Stop before the next step' })).toBeNull()
  })

  it('shows a provider-rejected stop request without implying that work stopped', async () => {
    localStorage.setItem('ae.customer-request.active:v1', JSON.stringify({
      requestRef: 'request:rejected-stop',
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      kind: 'request', requestRef: 'request:rejected-stop', revision: 1,
      state: 'in_progress', summary: 'Your request is in progress.', nextAction: 'wait',
      missingFields: [], criteria: [], options: [],
      progress: { completed: 0, total: 2, current: { step: 1, state: 'awaiting_result' } },
      activity: {
        actor: 'business', certainty: 'confirmed', updatedAt: 30, nextCheckAt: 30_030,
        retry: 'not_needed',
        cancellation: {
          state: 'rejected', requestedAt: 20, observedAt: 30,
          reason: 'sandbox_provider_kept_current_work',
        },
        safeNextAction: 'check_progress',
      },
    })))

    render(<AeCustomerRequestWorkspace />)

    expect(await screen.findByText('The business declined the stop request. The current work may continue.')).toBeTruthy()
    expect(screen.getByText('AE sent the stop request at 1970-01-01T00:00:00.020Z.')).toBeTruthy()
    expect(screen.getByText(/The business response was recorded at 1970-01-01T00:00:00.030Z/)).toBeTruthy()
    expect(screen.getByText(/will not send the stop request twice/)).toBeTruthy()
    expect(screen.queryByText(/cancelled the business work/i)).toBeNull()
  })

  it('shows completed work and the unreleased stopped step after in-flight cancellation', async () => {
    localStorage.setItem('ae.customer-request.active:v1', JSON.stringify({
      requestRef: 'request:stopped-after-current',
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      kind: 'request', requestRef: 'request:stopped-after-current', revision: 1,
      state: 'cancelled',
      summary: 'Stopped after 1 of 2 business steps completed. No later step began.',
      nextAction: 'revise_request', missingFields: [], criteria: [], options: [],
      businesses: [
        { businessRef: 'business:one', name: 'First Business' },
        { businessRef: 'business:two', name: 'Second Business' },
      ],
      progress: {
        completed: 1, total: 2, current: { step: 2, state: 'cancelled' },
        dependencies: {
          completed: [{ step: 1, business: 'First Business' }],
          blocked: [],
        },
      },
      activity: {
        actor: 'none', certainty: 'cancelled', updatedAt: 40_200,
        retry: 'not_needed', cancellation: { state: 'stopped', stoppedAt: 40_200 },
        safeNextAction: 'revise_request',
      },
    })))

    render(<AeCustomerRequestWorkspace />)

    expect(await screen.findByRole('heading', {
      name: 'Stopped after 1 of 2 business steps completed. No later step began.',
    })).toBeTruthy()
    expect(screen.getByText('1 of 2 business steps completed.')).toBeTruthy()
    expect(screen.getByText(
      'Step 2 did not begin. Completed work remains recorded and will not be repeated automatically.',
    )).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Stop before the next step' })).toBeNull()
  })

  it('shows completed and waiting business work without route machinery', async () => {
    localStorage.setItem('ae.customer-request.active:v1', JSON.stringify({
      requestRef: 'request:dependencies',
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      kind: 'request', requestRef: 'request:dependencies', revision: 1,
      state: 'in_progress', summary: 'Your request is in progress.', nextAction: 'wait',
      missingFields: [], criteria: [], options: [],
      progress: {
        completed: 1, total: 3, current: { step: 2, state: 'awaiting_result' },
        dependencies: {
          completed: [{ step: 1, business: 'Route Resolver' }],
          blocked: [{
            step: 3, business: 'Result Notifier',
            waitingForStep: 2, waitingForBusiness: 'Route Quoter',
          }],
        },
      },
      activity: {
        actor: 'business', certainty: 'pending', updatedAt: 10, nextCheckAt: 40,
        retry: 'not_needed', cancellation: 'too_late_or_unsupported', safeNextAction: 'check_progress',
      },
    })))

    render(<AeCustomerRequestWorkspace />)

    expect(await screen.findByText('Completed: Route Resolver')).toBeTruthy()
    expect(screen.getByText('Waiting: Result Notifier, after Route Quoter')).toBeTruthy()
    expect(screen.queryByText(/RoutePlan|dependency graph|transport/i)).toBeNull()
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
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))

    expect(await screen.findByText('Current way forward 1')).toBeTruthy()
    expect(screen.getByText('Expired way forward')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check current options' })).toBeTruthy()
  })

  it('explains an expired choice after reload without implying authority or restarted work', async () => {
    localStorage.setItem('ae.customer-request.active:v1', JSON.stringify({ requestRef: 'request:expired' }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      kind: 'request', requestRef: 'request:expired', revision: 2,
      routeGenerationRef: 'generation:expired', state: 'needs_attention',
      summary: 'These ways forward have expired.', nextAction: 'retry',
      missingFields: [], criteria: [], options: [],
      recovery: {
        state: 'restored', reason: 'choice_expired',
        restoredAt: 4_000, workRestarted: false,
      },
      decision: {
        generationRef: 'generation:expired', requestRevision: 2,
        outcome: { kind: 'routes_expired', routeCount: 1, summary: 'These ways forward have expired.' },
        routes: [routeChoice('route:expired', 'expired')],
        comparison: {
          kind: 'unranked', reason: 'stale_evidence',
          summary: 'The earlier information is no longer current.',
        },
        changes: { kind: 'initial' },
        nextBoundary: { kind: 'confirmation', authorityCreated: false },
      },
    })))

    render(<AeCustomerRequestWorkspace />)

    expect(await screen.findByText(
      'AE restored this Request. The earlier choice expired, so no work was authorized or restarted.',
    )).toBeTruthy()
    expect(screen.getByText('Your Request is preserved. Check again to rebuild the available ways forward from current business information.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check current options' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirm this choice' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start now' })).toBeNull()
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
    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))
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

function routeDecisionActions() {
  return {
    review: {
      kind: 'inspect_current_option' as const, createsAuthority: false as const, startsWork: false as const,
      summary: 'Reviewing shows every important limit. It does not confirm or start anything.',
    },
    confirm: {
      kind: 'confirm_current_option' as const, createsAuthority: true as const, startsWork: false as const,
      summary: 'Confirming creates permission for this exact choice. It does not contact a business or start work.',
    },
    start: {
      kind: 'start_confirmed_option' as const, availableAfter: 'confirmation' as const, startsWork: true as const,
      summary: 'Starting uses that confirmation to contact the listed businesses and begin the work.',
    },
    change: {
      kind: 'revise_request' as const, createsAuthority: false as const, startsWork: false as const,
      preservesRequest: true as const,
      summary: 'Changing preserves the Request and returns to its details. The current choice remains unconfirmed.',
    },
    decline: {
      kind: 'leave_unconfirmed' as const, createsAuthority: false as const, startsWork: false as const,
      preservesRequest: true as const,
      summary: 'Declining leaves this choice unconfirmed and starts nothing.',
    },
  }
}
