import { afterEach, describe, expect, it, vi } from 'vitest'

import { chatSuggestions, chatEmpty } from '@/lib/public/chat-ia'
import {
  CHAT_TOOL_IDS,
  clearAnonymousChatHandoff,
  fetchAnonymousChat,
  projectChatFailure,
  projectTranscriptTurns,
  readAnonymousChatHandoff,
  rememberAnonymousChatHandoff,
} from '@/components/ae/operation-chat/presentation'
import { providerSafeActionToolName } from '@/modules/actions/tool-contract'

const operationRef = `operation:v1:${'a'.repeat(64)}`

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chat IA', () => {
  it('keeps empty-path suggestions inside the five-tool market loop', () => {
    expect(chatEmpty.title).toContain('catalog')
    const serialized = JSON.stringify(chatSuggestions)
    expect(serialized).toMatch(/search|compare|inspect|call/i)
    expect(serialized).not.toMatch(/write a poem|plan my week|remember this/i)
  })
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

    expect(projectChatFailure(caught)).toEqual({
      message: 'Chat is unavailable right now. Your message was not added.',
      reference: 'chat-request-7',
      browseMarket: true,
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

    expect(projectChatFailure(caught)).toEqual({
      message: 'You’ve reached the chat limit. Try again later.',
      reference: 'chat-rate-2',
      browseMarket: true,
    })
  })
})

describe('transcript projector', () => {
  it('allowlists the five operation tools and drops reasoning, sources, and files', () => {
    const turns = projectTranscriptTurns([{
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Here are the operations.' },
        ...CHAT_TOOL_IDS.map((toolId) => ({
          type: `tool-${providerSafeActionToolName(toolId)}`,
          state: 'output-available',
          output: { kind: 'ok', operationRef, name: `${toolId} result` },
        })),
        { type: 'reasoning', text: 'PRIVATE_REASONING' },
        { type: 'source-url', url: 'https://private.example' },
        { type: 'file', url: 'https://private.example/file' },
      ],
    }])

    expect(turns).toHaveLength(1)
    expect(turns[0]?.text).toBe('Here are the operations.')
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
          type: `tool-${providerSafeActionToolName('registry.operations.search')}`,
          state: 'output-available',
          output: {
            kind: 'ok',
            matchedCount: 12,
            items: [{
              operationRef: searchRef,
              title: 'Weather finder',
              summary: 'Look up forecasts',
              supplier: { name: 'Sky Co', slug: 'sky-co' },
              price: { kind: 'fixed', amount: { currency: 'USD', units: '50', exponent: 2 } },
              authentication: { kind: 'ae_api_key' },
              availability: { posture: 'routeable' },
              navigation: [{ relation: 'execute', secret: executeSecret }],
            }],
          },
        },
        {
          type: `tool-${providerSafeActionToolName('registry.operations.inspectPlan')}`,
          state: 'output-available',
          output: {
            kind: 'ok',
            operationRefs: [searchRef],
            summary: {
              maximumCost: { kind: 'known', amount: { currency: 'USD', units: '199', exponent: 2 } },
              effects: [{ class: 'data_release' }, { class: 'financial_exposure' }],
              dataUse: [{ classification: 'public' }],
            },
          },
        },
        {
          type: `tool-${providerSafeActionToolName('operation.invoke')}`,
          state: 'output-available',
          output: {
            kind: 'completed',
            invocationRef: 'invocation:chat:weather:1',
            operationRef: searchRef,
            output: { forecast: executeSecret, nested: { evidenceHash: executeSecret } },
            evidenceHash: 'evidence:weather:1',
            usage: {
              usageRef: 'usage:weather:1',
              observedAt: 1,
              chargeState: 'paid',
              amount: { currency: 'USD', units: '25', exponent: 2 },
              priceDigest: 'price:weather:1',
              durationMs: 850,
            },
          },
        },
      ],
    }])

    const [search, inspectPlan, execute] = turns[0]?.tools ?? []
    expect(search?.kind).toBe('choices')
    expect(search?.kind === 'choices' ? search.choices : undefined).toEqual([{
      operationRef: searchRef,
      title: 'Weather finder',
      supplier: 'Sky Co',
      price: 'USD 0.50',
      readiness: 'Ready now',
      access: 'AE account invocation',
    }])
    expect(search?.kind === 'choices' ? search.count : undefined).toBe(12)
    expect(inspectPlan?.kind === 'inspect' ? inspectPlan.facts : undefined).toEqual([
      { label: 'Maximum cost', value: 'USD 1.99' },
      { label: 'Effects', value: 'Data release, Financial exposure' },
      { label: 'Data use', value: 'Public' },
    ])
    expect(execute?.kind).toBe('execute')
    expect(execute?.kind === 'execute' ? execute.state : undefined).toBe('completed')
    expect(execute?.kind === 'execute' ? execute.invocationRef : undefined).toBe('invocation:chat:weather:1')
    expect(execute?.kind === 'execute' ? execute.outputPreview : undefined).toContain(executeSecret)
    expect(execute?.kind === 'execute' ? execute.facts : undefined).toEqual([
      { label: 'Charge', value: 'USD 0.25 · Paid' },
      { label: 'Duration', value: '850 ms' },
    ])
    expect(execute?.kind === 'execute' ? execute.continuation : undefined).toMatchObject({
      label: 'View receipt',
      href: '/operations/invocations/invocation:chat:weather:1',
    })
    expect(JSON.stringify(turns)).not.toContain('Look up forecasts')
    expect(JSON.stringify(turns)).not.toContain('sky-co')
  })

  it('projects the actual JSON-wrapped tool-result shape and keeps unresolved states explicit', () => {
    const partType = `tool-${providerSafeActionToolName('operation.invoke')}`
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
            invocationRef: 'invocation:wire:1',
            operationRef,
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
      invocationRef: 'invocation:wire:1',
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
          invocationRef: 'invocation:wire:2',
          operationRef,
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
      invocationRef: 'invocation:wire:2',
      continuation: { kind: 'reconcile' },
    })
    expect(unresolved?.kind === 'execute' ? unresolved.summary : '').toMatch(/Do not retry/i)
  })

  it('preserves a completed handback through the stored-card projection boundary', () => {
    rememberAnonymousChatHandoff('handoff-call', [{
      id: 'assistant-call-handoff',
      role: 'assistant',
      parts: [{
        type: `tool-${providerSafeActionToolName('operation.invoke')}`,
        toolCallId: 'tool-call-stored-1',
        state: 'output-available',
        output: {
          type: 'json',
          value: {
            kind: 'completed',
            invocationRef: 'invocation:stored:1',
            operationRef,
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
      invocationRef: 'invocation:stored:1',
      outputPreview: '{\n  "usable": true\n}',
      continuation: { label: 'View receipt' },
    })
    clearAnonymousChatHandoff('handoff-call')
  })

  it('keeps every canonical interrupted or refused business state distinct from transport completion', () => {
    const partType = `tool-${providerSafeActionToolName('operation.invoke')}`
    const outputs = [
      {
        kind: 'pending',
        invocationRef: 'invocation:states:pending',
        operationRef,
        retryAfterMs: 1_000,
      },
      {
        kind: 'needs_authority',
        invocationRef: 'invocation:states:authority',
        operationRef,
        authorityRequest: {
          kind: 'approve_each',
          operationRef,
          consequence: 'external_effect',
          retryClass: 'reconcile_before_retry',
          maximumSpend: { currency: 'USD', units: '200', exponent: 2 },
          dataFields: ['recipient'],
        },
      },
      {
        kind: 'refused',
        operationRef,
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
    expect(cards[0]?.kind === 'execute' ? cards[0].continuation?.label : undefined).toBe('Check call status')
    expect(cards[1]?.kind === 'execute' ? cards[1].nextAction : undefined).toMatch(/pending approval/i)
    expect(cards[2]?.kind === 'execute' ? cards[2].nextAction : undefined).toMatch(/bounded mandate/i)
  })

  it('renders every JSON value shape and makes a truncated preview recoverable by invocation identity', () => {
    const partType = `tool-${providerSafeActionToolName('operation.invoke')}`
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
            invocationRef: `invocation:output:${index}`,
            operationRef,
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
          invocationRef: 'invocation:output:long',
          operationRef,
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
    expect(longCard?.kind === 'execute' ? longCard.continuation?.href : undefined)
      .toBe('/operations/invocations/invocation:output:long')
  })

  it('projects compare contrasts from comparison facts, not a second search list', () => {
    const skyRef = `operation:v1:${'d'.repeat(64)}`
    const rainRef = `operation:v1:${'e'.repeat(64)}`
    const turns = projectTranscriptTurns([{
      id: 'assistant-compare',
      role: 'assistant',
      parts: [{
        type: `tool-${providerSafeActionToolName('registry.operations.compare')}`,
        state: 'output-available',
        output: {
          kind: 'ok',
          operations: [
            {
              operationRef: skyRef,
              offering: { label: 'Weather finder' },
              business: { name: 'Sky Co' },
              commercial: { price: { kind: 'fixed', amount: { currency: 'USD', units: '50', exponent: 2 } } },
              authentication: { kind: 'ae_api_key' },
              availability: { posture: 'routeable' },
            },
            {
              operationRef: rainRef,
              offering: { label: 'Rain lookup' },
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
                { operationRef: skyRef, value: 'SECRET_SUMMARY', source: 'publication' },
                { operationRef: rainRef, value: 'OTHER_SUMMARY', source: 'publication' },
              ],
            },
            {
              field: 'price',
              values: [
                { operationRef: skyRef, value: { kind: 'fixed', amount: { currency: 'USD', units: '50', exponent: 2 } }, source: 'publication' },
                { operationRef: rainRef, value: { kind: 'fixed', amount: { currency: 'USD', units: '75', exponent: 2 } }, source: 'publication' },
              ],
            },
            {
              field: 'effects',
              values: [
                { operationRef: skyRef, value: [{ class: 'data_release' }], source: 'contract' },
                { operationRef: rainRef, value: [{ class: 'data_release' }, { class: 'financial_exposure' }], source: 'contract' },
              ],
            },
            {
              field: 'dataUse',
              values: [
                { operationRef: skyRef, value: [{ classification: 'public' }], source: 'contract' },
                { operationRef: rainRef, value: [{ classification: 'personal' }], source: 'contract' },
              ],
            },
            {
              field: 'availability',
              values: [
                { operationRef: skyRef, value: { posture: 'routeable' }, source: 'readiness' },
                { operationRef: rainRef, value: { posture: 'setup_required' }, source: 'readiness' },
              ],
            },
            {
              field: 'provenance',
              values: [
                { operationRef: skyRef, value: { publisher: 'provider_owned', sourceKind: 'openapi_http' }, source: 'publication' },
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
      { label: 'Price', value: 'Weather finder: USD 0.50; Rain lookup: USD 0.75' },
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
        type: `tool-${providerSafeActionToolName('registry.operations.search')}`,
        state: 'output-available',
        output: {
          kind: 'ok',
          items: [{
            operationRef: searchRef,
            title: 'Weather finder',
            supplier: { name: 'Sky Co', slug: 'sky-co' },
            price: { kind: 'fixed', amount: { currency: 'USD', units: '50', exponent: 2 } },
            authentication: { kind: 'ae_api_key' },
            availability: { posture: 'routeable' },
            raw: 'HANDOFF_RAW_SECRET',
          }],
        },
      }],
    }])

    const stored = readAnonymousChatHandoff('handoff-thread')
    const turns = projectTranscriptTurns(stored)
    expect(turns[0]?.tools[0]?.kind === 'choices' ? turns[0].tools[0].choices : undefined).toEqual([{
      operationRef: searchRef,
      title: 'Weather finder',
      supplier: 'Sky Co',
      price: 'USD 0.50',
      readiness: 'Ready now',
      access: 'AE account invocation',
    }])
    expect(JSON.stringify(stored)).not.toContain('HANDOFF_RAW_SECRET')
    clearAnonymousChatHandoff('handoff-thread')
  })
})
