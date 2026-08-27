import { describe, expect, it } from 'vitest'

import { chatSuggestions, chatEmpty } from '@/lib/public/chat-ia'
import {
  CHAT_TOOL_IDS,
  clearAnonymousChatHandoff,
  projectTranscriptTurns,
  readAnonymousChatHandoff,
  rememberAnonymousChatHandoff,
} from '@/components/ae/operation-chat/presentation'
import { providerSafeActionToolName } from '@/modules/actions/tool-contract'

const operationRef = `operation:v1:${'a'.repeat(64)}`

describe('chat IA', () => {
  it('keeps empty-path suggestions inside the five-tool market loop', () => {
    expect(chatEmpty.title).toContain('catalog')
    const serialized = JSON.stringify(chatSuggestions)
    expect(serialized).toMatch(/search|compare|inspect|call/i)
    expect(serialized).not.toMatch(/write a poem|plan my week|remember this/i)
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

  it('projects search rows from PublicOperationChoice fields and never surfaces execute output', () => {
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
              authentication: { kind: 'keyless' },
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
          type: `tool-${providerSafeActionToolName('operation.execute')}`,
          state: 'output-available',
          output: {
            kind: 'ok',
            operationRef: searchRef,
            name: 'Weather finder',
            output: { forecast: executeSecret, nested: { evidenceHash: executeSecret } },
            evidenceHash: executeSecret,
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
      access: 'No provider key',
    }])
    expect(search?.kind === 'choices' ? search.count : undefined).toBe(12)
    expect(inspectPlan?.kind === 'inspect' ? inspectPlan.facts : undefined).toEqual([
      { label: 'Maximum cost', value: 'USD 1.99' },
      { label: 'Effects', value: 'Data release, Financial exposure' },
      { label: 'Data use', value: 'Public' },
    ])
    expect(execute?.kind).toBe('execute')
    expect(execute?.kind === 'execute' ? execute.name : undefined).toBe('Weather finder')
    expect(JSON.stringify(turns)).not.toContain(executeSecret)
    expect(JSON.stringify(turns)).not.toContain('Look up forecasts')
    expect(JSON.stringify(turns)).not.toContain('sky-co')
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
              authentication: { kind: 'keyless' },
              availability: { posture: 'routeable' },
            },
            {
              operationRef: rainRef,
              offering: { label: 'Rain lookup' },
              business: { name: 'Nimbus' },
              commercial: { price: { kind: 'fixed', amount: { currency: 'USD', units: '75', exponent: 2 } } },
              authentication: { kind: 'x402' },
              availability: { posture: 'integrated' },
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
                { operationRef: rainRef, value: { posture: 'integrated' }, source: 'readiness' },
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
      { label: 'Readiness', value: 'Weather finder: Ready now; Rain lookup: Integration available' },
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
            authentication: { kind: 'keyless' },
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
      access: 'No provider key',
    }])
    expect(JSON.stringify(stored)).not.toContain('HANDOFF_RAW_SECRET')
    clearAnonymousChatHandoff('handoff-thread')
  })
})
