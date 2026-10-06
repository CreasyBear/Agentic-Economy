import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CHAT_TOOL_IDS,
  clearAnonymousChatHandoff,
  fetchAnonymousChat,
  projectChatFailure,
  projectGenerativeTurn,
  projectTranscriptTurns,
  readAnonymousChatHandoff,
  rememberAnonymousChatHandoff,
  textFromParts,
  projectAnonymousTranscript,
} from '@/components/ae/chat/presentation'
import { providerSafeActionToolName } from '@/modules/actions/tool-contract'
import { toTransportMessages } from '@/components/ae/chat/chat-session/anonymous-session'

const toolRef = `operation:v1:${'a'.repeat(64)}`
const quoteRef = `operation-commitment:v1:${'f'.repeat(64)}`

afterEach(() => {
  vi.unstubAllGlobals()
})


describe('anonymous chat recovery', () => {
  it('retains the HTTPS failure reference and offers a safe catalogue continuation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      type: 'about:blank',
      status: 503,
      code: 'chat_proxy_unavailable',
    }, {
      status: 503,
      headers: { 'x-ae-request-id': 'chat-request-7' },
    })))

    let caught: unknown
    try {
      await fetchAnonymousChat('/api/chat/anonymous', { method: 'POST' })
    } catch (error) {
      caught = error
    }

    expect(projectChatFailure(caught)).toMatchObject({
      reason: 'chat_unavailable',
      reference: 'chat-request-7',
      browseMarket: true,
    })
  })

  it('makes an empty upstream 404 a recoverable chat failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, {
      status: 404, headers: { 'x-ae-request-id': 'chat-empty-404' },
    })))
    const caught = await fetchAnonymousChat('/api/chat/anonymous').catch(error => error)
    expect(projectChatFailure(caught)).toMatchObject({
      reason: 'chat_unavailable', reference: 'chat-empty-404', browseMarket: true,
    })
  })

  it('keeps rate limiting distinct from service unavailability', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'rate_limited' }, {
      status: 429,
      headers: { 'x-ae-request-id': 'chat-rate-2' },
    })))

    let caught: unknown
    try {
      await fetchAnonymousChat('/api/chat/anonymous')
    } catch (error) {
      caught = error
    }

    expect(projectChatFailure(caught)).toMatchObject({
      reason: 'rate_limited',
      reference: 'chat-rate-2',
      browseMarket: true,
    })
  })
})

describe('transcript projector', () => {
  it('retains external listing identities as guest lookup hints without granting Call access', () => {
    const messages = [{ id: 'external-search', role: 'assistant' as const, parts: [{
      type: 'tool-registry_tools_search', state: 'output-available', output: {
        kind: 'scoped', results: [{ id: 'registry:keyword-gap', source: 'coinbase',
          access: 'external_listing', title: 'Keyword gap', readiness: 'unverified' }],
      },
    }] }]
    const [turn] = projectTranscriptTurns(messages)
    if (turn === undefined) throw new Error('Missing external listing turn')
    expect(projectGenerativeTurn(turn).options.options).toMatchObject([{ id: 'registry:keyword-gap' }])
    expect(projectGenerativeTurn(turn).options.options[0]).not.toHaveProperty('quoteable', true)
    expect(projectAnonymousTranscript(messages)).toEqual([])
    expect(toTransportMessages(messages)[0]?.parts).toEqual([{ type: 'text',
      text: `Tool cards shown (reference data): ${JSON.stringify([{ title: 'Keyword gap', toolRef: 'registry:keyword-gap' }])}` }])
  })

  it.each([
    { previous: 'unavailable', current: 'ready', quoteable: true },
    { previous: 'ready', current: 'unavailable', quoteable: false },
  ] as const)('uses later $current detail instead of $previous search evidence for the same Tool', ({ previous, current, quoteable }) => {
    const [turn] = projectTranscriptTurns([{ id: 'search-and-detail', role: 'assistant', parts: [
      { type: 'tool-registry_tools_search', state: 'output-available', output: {
        kind: 'match', results: [{ toolRef, title: 'Web Search', source: 'current',
          access: previous === 'ready' ? 'ae_callable' : 'setup_required', readiness: previous }],
      } },
      { type: 'tool-registry_tools_describe', state: 'output-available', output: {
        kind: 'found', tool: { toolRef, title: 'Web Search', readiness: current,
          summary: 'Current detail from the catalogue.' },
      } },
    ] }])
    if (turn === undefined) throw new Error('Missing search and detail turn')
    const { options } = projectGenerativeTurn(turn).options
    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ id: toolRef, readiness: current, outcome: 'Current detail from the catalogue.' })
    expect(options[0]?.quoteable === true).toBe(quoteable)
  })

  it('retains public card identities for follow-up requests without exposing them in saved prose', () => {
    const messages = [{ id: 'search', role: 'assistant' as const, parts: [
      { type: 'text', text: 'Review the inputs below.' },
      { type: 'tool-registry_tools_search', state: 'output-available', output: {
        kind: 'match', results: [{ toolRef, title: 'Receipt lookup', summary: 'Receipt facts' }],
      } },
      { type: 'reasoning', text: 'PRIVATE_REASONING' },
      { type: 'file', url: 'https://private.example/file' },
    ] }]
    expect(projectAnonymousTranscript(messages)).toEqual([
      { role: 'assistant', content: 'Review the inputs below.' },
    ])
    const transport = projectAnonymousTranscript(messages, true)
    expect(transport[0]?.content).toContain(JSON.stringify([{ title: 'Receipt lookup', toolRef }]))
    expect(JSON.stringify(transport)).not.toMatch(/PRIVATE_REASONING|private\.example|Receipt facts/)
    expect(toTransportMessages(messages)[0]?.parts).toEqual([
      { type: 'text', text: transport[0]?.content },
    ])
  })

  it('withholds streamed model control markup while retaining user text and real cards', () => {
    const text = '<｜DSML｜tool_calls><｜DSML｜invoke name="registry_tools_search">'
    const turns = projectTranscriptTurns([
      { id: 'user', role: 'user', parts: [{ type: 'text', text }] },
      { id: 'assistant', role: 'assistant', parts: [
        { type: 'text', text: text.slice(0, 5) }, { type: 'text', text: text.slice(5) },
        { type: 'tool-registry_tools_search', state: 'output-available', output: {
          kind: 'match', results: [{ toolRef, title: 'Receipt lookup' }],
        } },
      ] },
    ])
    expect(turns[0]?.text).toBe(text)
    expect(turns[1]?.text).toContain('This answer could not be finished')
    expect(JSON.stringify(turns[1])).not.toContain('DSML')
    expect(turns[1]?.tools).toMatchObject([{ kind: 'choices', choices: [{ toolRef, title: 'Receipt lookup' }] }])
  })
  it.each(['step-start', 'tool-registry_tools_search', 'tool-card'])('separates text across %s without splitting streamed chunks', (boundary) => {
    const parts = [
      { type: 'text', text: 'Found ' }, { type: 'text', text: 'three Tools.' },
      { type: boundary }, { type: 'reasoning', text: 'PRIVATE_REASONING' },
      { type: 'text', text: '' },
      { type: 'text', text: 'Compare ' }, { type: 'text', text: 'their inputs.' },
      { type: boundary },
    ]
    expect(textFromParts(parts)).toBe('Found three Tools.\n\nCompare their inputs.')
    expect(projectAnonymousTranscript([{ id: 'one', role: 'assistant', parts }]))
      .toEqual([{ role: 'assistant', content: 'Found three Tools.\n\nCompare their inputs.' }])
  })

  it('keeps streamed text chunks in one block', () => {
    const [turn] = projectTranscriptTurns([{
      id: 'assistant-stream',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Found ' },
        { type: 'text', text: 'three Tools.' },
      ],
    }])
    expect(turn?.blocks).toEqual([{ kind: 'text', text: 'Found three Tools.' }])
  })

  it('keeps prose on either side of a rendered tool and drops blank text', () => {
    const [turn] = projectTranscriptTurns([{
      id: 'assistant-order',
      role: 'assistant',
      parts: [
        { type: 'text', text: '   ' },
        { type: 'text', text: 'Before.' },
        {
          type: `tool-${providerSafeActionToolName('registry.tools.search')}`,
          state: 'input-available',
        },
        { type: 'text', text: 'After.' },
      ],
    }])
    expect(turn?.text).toBe('Before.\n\nAfter.')
    expect(turn?.blocks).toEqual([
      { kind: 'text', text: 'Before.' },
      { kind: 'tool', index: 0 },
      { kind: 'text', text: 'After.' },
    ])
  })

  it('keeps existing paragraph spacing and ignores non-text evidence', () => {
    expect(textFromParts([
      { type: 'text', text: 'Found Tools.\n\n' }, { type: 'step-start' },
      { type: 'source-url', url: 'https://private.example' },
      { type: 'text', text: 'Inspect the input.' },
    ])).toBe('Found Tools.\n\nInspect the input.')
  })
  it('keeps a clarifying question in the anonymous request when the assistant wrote no prose', () => {
    const question = 'Which region should the lookup cover?'
    expect(projectAnonymousTranscript([{
      id: 'assistant-clarify',
      role: 'assistant',
      parts: [{
        type: `tool-${providerSafeActionToolName('chat.clarify')}`,
        state: 'input-available',
        input: { question, choices: ['Australia', 'Singapore', 'Global'] },
      }],
    }])).toEqual([{ role: 'assistant', content: question }])
  })

  it('allowlists the market Tools and drops reasoning, sources, and files', () => {
    const turns = projectTranscriptTurns([{
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Here are the Tools.' },
        ...CHAT_TOOL_IDS.map((toolId) => ({
          type: `tool-${providerSafeActionToolName(toolId)}`,
          state: 'output-available',
          output: { kind: 'ok', toolRef, name: `${toolId} result` },
        })),
        { type: 'reasoning', text: 'PRIVATE_REASONING' },
        { type: 'source-url', url: 'https://private.example' },
        { type: 'file', url: 'https://private.example/file' },
      ],
    }])

    expect(turns).toHaveLength(1)
    expect(turns[0]?.text).toBe('Here are the Tools.')
    expect(turns[0]?.tools.map((tool) => tool.toolId)).toEqual([...CHAT_TOOL_IDS])
    expect(JSON.stringify(turns)).not.toContain('PRIVATE_REASONING')
    expect(JSON.stringify(turns)).not.toContain('private.example')
  })

  it('projects search rows and preserves a canonical completed call handback', () => {
    const executeSecret = 'EXECUTE_OUTPUT_SECRET'
    const searchRef = `operation:v1:${'b'.repeat(64)}`
    const turns = projectTranscriptTurns([{
      id: 'assistant-2',
      role: 'assistant',
      parts: [
        {
          type: `tool-${providerSafeActionToolName('registry.tools.search')}`,
          state: 'output-available',
          output: {
            kind: 'match',
            schemaVersion: 'registry-tools:v3',
            recommendation: { toolRef: searchRef, by: 'Jev (decision.example)' },
            query: 'weather',
            partialResults: true,
            assessed: { source: 'all', scope: 'page', examined: 1, coverage: 'partial' },
            results: [{
              id: searchRef,
              source: 'current',
              access: 'ae_callable',
              toolRef: searchRef,
              title: 'Weather finder',
              summary: 'Look up forecasts',
              provider: 'Sky Co',
              actionClass: 'retrieve',
              objectClass: 'data',
              readiness: 'ready',
              entitlement: 'public',
              price: { kind: 'indicative', label: 'USD 0.50' },
              displayPrice: {
                kind: 'indicative', amount: { currency: 'AUD', units: '500001', exponent: 6 },
                rateObservedAt: 1_000, validUntil: 2_000_000_000_000,
              },
              detailRef: searchRef,
              details: { capabilityId: 'weather.forecast', provider: { name: 'Sky Co', slug: 'sky-co' }, description: 'Look up forecasts', listingTier: 'listed' },
              next: [{ action: 'describe', args: { toolRef: searchRef }, authority: 'public' }],
            }],
            pagination: { limit: 10, hasMore: true, nextCursor: 'next' },
            next: [{ action: 'next-page', args: { query: 'weather', cursor: 'next' }, authority: 'public' }],
          },
        },
        {
          type: `tool-${providerSafeActionToolName('tool.quote')}`,
          state: 'output-available',
          output: {
            kind: 'committed',
            quoteRef,
            toolRef: searchRef,
            toolVersion: 1,
            expiresAt: 60_000,
            normalizedInput: { location: 'Perth' },
            price: { currency: 'AUD', units: '199', exponent: 2 },
            account: {
              accountRef: 'account:chat:1',
              available: { currency: 'AUD', units: '500', exponent: 2 },
            },
            budget: {
              principalRef: 'principal:chat:1',
              maximumPerCall: { currency: 'AUD', units: '1000', exponent: 2 },
            },
            policyRefs: ['policy:chat:1'],
            evidenceDigest: 'evidence:inspection:1',
            continuation: {
              action: 'tool.call',
              method: 'POST',
              path: '/api/v1/tools/call',
              input: { quoteRef, idempotencyKey: 'invoke-weather-1' },
            },
          },
        },
        {
          type: `tool-${providerSafeActionToolName('tool.call')}`,
          state: 'output-available',
          output: {
            kind: 'completed',
            callRef: 'invocation:chat:weather:1',
            toolRef: searchRef,
            output: { forecast: executeSecret, nested: { evidenceHash: executeSecret } },
            evidenceHash: 'evidence:weather:1',
            usage: {
              usageRef: 'usage:weather:1',
              observedAt: 1,
              chargeState: 'paid',
              amount: { currency: 'AUD', units: '25', exponent: 2 },
              priceDigest: 'price:weather:1',
              durationMs: 850,
            },
          },
        },
      ],
    }])

    const [search, inspection, execute] = turns[0]?.tools ?? []
    expect(search?.kind).toBe('choices')
    expect(search?.kind === 'choices' ? search.recommendation : undefined).toEqual({
      toolRef: searchRef, by: 'Jev (decision.example)',
    })
    expect(search?.kind === 'choices' ? search.choices : undefined).toEqual([{
      toolRef: searchRef,
      title: 'Weather finder',
      summary: 'Look up forecasts',
      provider: 'Sky Co',
      price: 'A$0.51',
      priceValidUntil: 2_000_000_000_000,
      readiness: 'ready',
      callable: true,
    }])
    expect(turns[0] === undefined ? undefined : projectGenerativeTurn(turns[0]).options).toMatchObject({
      recommendedId: searchRef,
      recommendedBy: 'Jev (decision.example)',
    })
    const transcript = turns[0]
    if (transcript === undefined) throw new Error('missing_transcript')
    const unquoteable = projectGenerativeTurn({
      ...transcript,
      tools: transcript.tools.map((card) => card.kind === 'choices' && card.toolId === 'registry.tools.search'
        ? { ...card, choices: card.choices.map((choice) => ({ ...choice, callable: false })) }
        : card),
    })
    expect(unquoteable.options).not.toHaveProperty('recommendedId')
    expect(search?.kind === 'choices' ? search.count : undefined).toBe(1)
    expect(inspection?.kind === 'inspect' ? inspection.facts : undefined).toEqual([
      { label: 'Decision price', value: 'A$1.99' },
      { label: 'Account available', value: 'A$5.00' },
      { label: 'Agent maximum', value: 'A$10.00' },
      { label: 'Expires', value: '1970-01-01T00:01:00.000Z' },
      { label: 'Quote', value: quoteRef },
    ])
    expect(execute?.kind).toBe('execute')
    expect(execute?.kind === 'execute' ? execute.state : undefined).toBe('completed')
    expect(execute?.kind === 'execute' ? execute.callRef : undefined).toBe('invocation:chat:weather:1')
    expect(execute?.kind === 'execute' ? execute.outputPreview : undefined).toContain(executeSecret)
    expect(execute?.kind === 'execute' ? execute.facts : undefined).toEqual([
      { label: 'Charge', value: 'A$0.25 · Paid' },
      { label: 'Exact charge', value: 'AUD 0.25' },
      { label: 'Duration', value: '850 ms' },
    ])
    expect(execute?.kind === 'execute' ? execute.suggestedNextAction : undefined).toMatchObject({
      label: 'View receipt',
      href: '/calls/invocation:chat:weather:1',
    })
    expect(JSON.stringify(turns)).toContain('Look up forecasts')
    expect(JSON.stringify(turns)).not.toContain('sky-co')
  })

  it('projects the actual JSON-wrapped tool-result shape and keeps unresolved states explicit', () => {
    const partType = `tool-${providerSafeActionToolName('tool.call')}`
    const completed = projectTranscriptTurns([{
      id: 'assistant-wire-shape',
      role: 'assistant',
      parts: [{
        type: partType,
        toolCallId: 'tool-call-1',
        state: 'output-available',
        output: {
          type: 'json',
          value: {
            kind: 'completed',
            callRef: 'invocation:wire:1',
            toolRef,
            output: { answer: 42 },
            evidenceHash: 'evidence:wire:1',
            usage: {
              usageRef: 'usage:wire:1',
              observedAt: 1,
              chargeState: 'free_tier',
              amount: { currency: 'USD', units: '0', exponent: 2 },
              priceDigest: 'price:wire:1',
            },
          },
        },
      }],
    }])[0]?.tools[0]

    expect(completed).toMatchObject({
      kind: 'execute',
      state: 'completed',
      callRef: 'invocation:wire:1',
      outputPreview: '{\n  "answer": 42\n}',
    })

    const unresolved = projectTranscriptTurns([{
      id: 'assistant-reconcile',
      role: 'assistant',
      parts: [{
        type: partType,
        toolCallId: 'tool-call-2',
        state: 'output-available',
        output: {
          kind: 'reconciliation_required',
          callRef: 'invocation:wire:2',
          toolRef,
          evidence: {
            attemptRef: 'attempt:wire:2',
            effectGeneration: 1,
            requiredAt: '2026-08-30T00:00:00.000Z',
            retry: 'reconcile_before_retry',
            evidenceSource: 'provider timeout after submit',
          },
        },
      }],
    }])[0]?.tools[0]

    expect(unresolved).toMatchObject({
      kind: 'execute',
      state: 'reconciliation_required',
      callRef: 'invocation:wire:2',
      suggestedNextAction: { kind: 'reconcile' },
    })
    expect(unresolved?.kind === 'execute' ? unresolved.summary : '').toMatch(/Do not retry/i)
  })

  it('preserves a completed handback through the stored-card projection boundary', () => {
    rememberAnonymousChatHandoff('handoff-call', [{
      id: 'assistant-call-handoff',
      role: 'assistant',
      parts: [{
        type: `tool-${providerSafeActionToolName('tool.call')}`,
        toolCallId: 'tool-call-stored-1',
        state: 'output-available',
        output: {
          type: 'json',
          value: {
            kind: 'completed',
            callRef: 'invocation:stored:1',
            toolRef,
            output: { usable: true },
            evidenceHash: 'evidence:stored:1',
            usage: {
              usageRef: 'usage:stored:1',
              observedAt: 1,
              chargeState: 'free_tier',
              amount: { currency: 'USD', units: '0', exponent: 2 },
              priceDigest: 'price:stored:1',
            },
          },
        },
      }],
    }])

    const stored = readAnonymousChatHandoff('handoff-call')
    const execute = projectTranscriptTurns(stored)[0]?.tools[0]
    expect(execute).toMatchObject({
      kind: 'execute',
      state: 'completed',
      callRef: 'invocation:stored:1',
      outputPreview: '{\n  "usable": true\n}',
      suggestedNextAction: { label: 'View receipt' },
    })
    clearAnonymousChatHandoff('handoff-call')
  })

  it('keeps every canonical interrupted or refused business state distinct from transport completion', () => {
    const partType = `tool-${providerSafeActionToolName('tool.call')}`
    const outputs = [
      {
        kind: 'pending',
        callRef: 'invocation:states:pending',
        toolRef,
        retryAfterMs: 1_000,
      },
      {
        kind: 'needs_authority',
        callRef: 'invocation:states:authority',
        toolRef,
        authorityRequest: {
          kind: 'approval_required',
          toolRef,
          consequence: 'external_effect',
          retryClass: 'reconcile_before_retry',
          maximumSpend: { currency: 'USD', units: '200', exponent: 2 },
          dataFields: ['recipient'],
        },
      },
      {
        kind: 'refused',
        toolRef,
        code: 'budget_exceeded',
        retryable: false,
        nextAction: 'Increase the bounded mandate before trying again.',
      },
    ] as const

    const cards = outputs.map((output, index) => projectTranscriptTurns([{
      id: `assistant-state-${index}`,
      role: 'assistant',
      parts: [{
        type: partType,
        toolCallId: `tool-call-state-${index}`,
        state: 'output-available',
        output,
      }],
    }])[0]?.tools[0])

    expect(cards.map((card) => card?.kind === 'execute' ? card.state : undefined))
      .toEqual(['pending', 'needs_authority', 'refused'])
    expect(cards[0]?.kind === 'execute' ? cards[0].suggestedNextAction?.label : undefined).toBe('Check call status')
    expect(cards[1]?.kind === 'execute' ? cards[1].nextAction : undefined).toMatch(/pending approval/i)
    expect(cards[2]?.kind === 'execute' ? cards[2].nextAction : undefined).toMatch(/bounded mandate/i)
  })

  it('renders every JSON value shape and makes a truncated preview recoverable by Call identity', () => {
    const partType = `tool-${providerSafeActionToolName('tool.call')}`
    const values = [null, 'literal', [1, true], { answer: 42 }] as const

    for (const [index, output] of values.entries()) {
      const card = projectTranscriptTurns([{
        id: `assistant-output-${index}`,
        role: 'assistant',
        parts: [{
          type: partType,
          state: 'output-available',
          output: {
            kind: 'completed',
            callRef: `invocation:output:${index}`,
            toolRef,
            output,
            evidenceHash: `evidence:output:${index}`,
            usage: {
              usageRef: `usage:output:${index}`,
              observedAt: 1,
              chargeState: 'free_tier',
              amount: { currency: 'USD', units: '0', exponent: 2 },
              priceDigest: `price:output:${index}`,
            },
          },
        }],
      }])[0]?.tools[0]
      expect(card?.kind === 'execute' ? card.outputPreview : undefined).toBe(JSON.stringify(output, null, 2))
    }

    const longCard = projectTranscriptTurns([{
      id: 'assistant-output-long',
      role: 'assistant',
      parts: [{
        type: partType,
        state: 'output-available',
        output: {
          kind: 'completed',
          callRef: 'invocation:output:long',
          toolRef,
          output: 'x'.repeat(9_000),
          evidenceHash: 'evidence:output:long',
          usage: {
            usageRef: 'usage:output:long',
            observedAt: 1,
            chargeState: 'free_tier',
            amount: { currency: 'USD', units: '0', exponent: 2 },
            priceDigest: 'price:output:long',
          },
        },
      }],
    }])[0]?.tools[0]

    expect(longCard?.kind === 'execute' ? longCard.outputTruncated : undefined).toBe(true)
    expect(longCard?.kind === 'execute' ? longCard.outputPreview?.length : undefined).toBe(8_000)
    expect(longCard?.kind === 'execute' ? longCard.suggestedNextAction?.href : undefined)
      .toBe('/calls/invocation:output:long')
  })

  it('projects compare contrasts from comparison facts, not a second search list', () => {
    const skyRef = `operation:v1:${'d'.repeat(64)}`
    const rainRef = `operation:v1:${'e'.repeat(64)}`
    const turns = projectTranscriptTurns([{
      id: 'assistant-compare',
      role: 'assistant',
      parts: [{
        type: `tool-${providerSafeActionToolName('registry.tools.compare')}`,
        state: 'output-available',
        output: {
          kind: 'ok',
          tools: [
            {
              toolRef: skyRef,
              listing: { label: 'Weather finder' },
              business: { name: 'Sky Co' },
              commercial: { price: { kind: 'fixed', amount: { currency: 'USD', units: '50', exponent: 2 } } },
              authentication: { kind: 'ae_api_key' },
              availability: { posture: 'routeable' },
            },
            {
              toolRef: rainRef,
              listing: { label: 'Rain lookup' },
              business: { name: 'Nimbus' },
              commercial: { price: { kind: 'fixed', amount: { currency: 'USD', units: '75', exponent: 2 } } },
              authentication: { kind: 'x402' },
              availability: { posture: 'setup_required' },
            },
          ],
          facts: [
            {
              field: 'summary',
              values: [
                { toolRef: skyRef, value: 'SECRET_SUMMARY', source: 'publication' },
                { toolRef: rainRef, value: 'OTHER_SUMMARY', source: 'publication' },
              ],
            },
            {
              field: 'price',
              values: [
                { toolRef: skyRef, value: { kind: 'fixed', amount: { currency: 'USD', units: '50', exponent: 2 } }, source: 'publication' },
                { toolRef: rainRef, value: { kind: 'fixed', amount: { currency: 'USD', units: '75', exponent: 2 } }, source: 'publication' },
              ],
            },
            {
              field: 'effects',
              values: [
                { toolRef: skyRef, value: [{ class: 'data_release' }], source: 'contract' },
                { toolRef: rainRef, value: [{ class: 'data_release' }, { class: 'financial_exposure' }], source: 'contract' },
              ],
            },
            {
              field: 'dataUse',
              values: [
                { toolRef: skyRef, value: [{ classification: 'public' }], source: 'contract' },
                { toolRef: rainRef, value: [{ classification: 'personal' }], source: 'contract' },
              ],
            },
            {
              field: 'availability',
              values: [
                { toolRef: skyRef, value: { posture: 'routeable' }, source: 'readiness' },
                { toolRef: rainRef, value: { posture: 'setup_required' }, source: 'readiness' },
              ],
            },
            {
              field: 'provenance',
              values: [
                { toolRef: skyRef, value: { publisher: 'provider_owned', sourceKind: 'openapi_http' }, source: 'publication' },
              ],
            },
          ],
        },
      }],
    }])

    const compare = turns[0]?.tools[0]
    expect(compare?.kind).toBe('choices')
    expect(compare?.kind === 'choices' ? compare.choices.map((choice) => choice.title) : undefined).toEqual([
      'Weather finder',
      'Rain lookup',
    ])
    expect(compare?.kind === 'choices' ? compare.contrasts : undefined).toEqual([
      { label: 'Price', value: 'Weather finder: US$0.5; Rain lookup: US$0.75' },
      { label: 'Effects', value: 'Weather finder: Data release; Rain lookup: Data release, Financial exposure' },
      { label: 'Data use', value: 'Weather finder: Public; Rain lookup: Personal' },
      { label: 'Readiness', value: 'Weather finder: Ready now; Rain lookup: Setup required' },
    ])
    expect(JSON.stringify(turns)).not.toContain('SECRET_SUMMARY')
    expect(JSON.stringify(turns)).not.toContain('provider_owned')
  })

  it('persists allowlisted choice rows across anonymous handoff', () => {
    const searchRef = `operation:v1:${'c'.repeat(64)}`
    rememberAnonymousChatHandoff('handoff-thread', [{
      id: 'assistant-3',
      role: 'assistant',
      parts: [{
        type: `tool-${providerSafeActionToolName('registry.tools.search')}`,
        state: 'output-available',
        output: {
          kind: 'match',
          schemaVersion: 'registry-tools:v3',
          query: 'weather',
          partialResults: true,
          assessed: { source: 'all', scope: 'page', examined: 1, coverage: 'partial' },
          results: [{
            id: searchRef,
            source: 'current',
            access: 'ae_callable',
            toolRef: searchRef,
            title: 'Weather finder',
            summary: 'Look up forecasts',
            provider: 'Sky Co',
            actionClass: 'retrieve',
            objectClass: 'data',
            readiness: 'unverified',
            entitlement: 'public',
            price: { kind: 'indicative', label: 'USD 0.50' },
            displayPrice: {
              kind: 'indicative', amount: { currency: 'AUD', units: '500001', exponent: 6 },
              rateObservedAt: 1_000, validUntil: 2_000_000_000_000,
            },
            detailRef: searchRef,
            details: { capabilityId: 'weather.forecast', provider: { name: 'Sky Co', slug: 'sky-co' }, description: 'Look up forecasts', listingTier: 'listed', raw: 'HANDOFF_RAW_SECRET' },
            next: [{ action: 'describe', args: { toolRef: searchRef }, authority: 'public' }],
            raw: 'HANDOFF_RAW_SECRET',
          }],
          pagination: { limit: 10, hasMore: false },
          next: [{ action: 'broaden', args: { query: 'weather' }, authority: 'public' }],
        },
      }],
    }])

    const stored = readAnonymousChatHandoff('handoff-thread')
    const turns = projectTranscriptTurns(stored)
    expect(turns[0]?.tools[0]?.kind === 'choices' ? turns[0].tools[0].choices : undefined).toEqual([{
      toolRef: searchRef,
      title: 'Weather finder',
      summary: 'Look up forecasts',
      provider: 'Sky Co',
      price: 'A$0.51',
      priceValidUntil: 2_000_000_000_000,
      readiness: 'unverified',
    }])
    expect(JSON.stringify(stored)).not.toContain('HANDOFF_RAW_SECRET')
    clearAnonymousChatHandoff('handoff-thread')
  })
})
