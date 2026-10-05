import { describe, expect, it } from 'vitest'
import { explanationUsable } from '../../../convex/lib/chat/tools/immediate'
import { formatRunRequest, parseRunRequest } from '@/modules/chat/run-request'
import type { JsonValue } from '@/modules/common/bounded-json'
import { callableFirst, suitableListing } from '../../../convex/lib/chat/tools/suitability'
import type { ToolChoiceSearchOutput } from '@/modules/registry/tool-choice-contracts'

const page = {
  kind: 'match',
  results: [{ toolRef: `operation:v1:${'a'.repeat(64)}`, title: 'Timezone Converter' }],
} as ToolChoiceSearchOutput

describe('immediate catalogue suitability', () => {
  it('keeps a weather listing for a sentence and drops an unrelated listing', () => {
    expect(suitableListing(
      'Forecast weather for Sydney tomorrow morning',
      'Global weather forecast',
      'Forecast periods for a latitude and longitude',
    )).toBe(true)
    expect(suitableListing(
      'Forecast weather for Sydney tomorrow morning',
      'ISBN book lookup',
      'Find a book by its ISBN',
    )).toBe(false)
    expect(suitableListing(
      'Search the web for recent battery storage research',
      'Chain Storage',
      'Read on-chain storage for a contract',
    )).toBe(false)
    expect(suitableListing(
      'Look up ERC20 token transfers for an Ethereum address',
      'Chain Nft Owner',
      'Look up the current owner of an ERC721 NFT by token_id',
    )).toBe(false)
    expect(suitableListing(
      'Extract text from a scanned supplier invoice using OCR',
      'Apify',
      'A marketplace of tools for web scraping and data extraction',
    )).toBe(false)
  })

  it('orders callable admitted Tools before Bazaar listings', () => {
    expect(callableFirst([
      { access: 'external_listing', title: 'Bazaar weather' },
      { access: 'ae_callable', title: 'Admitted weather' },
      { access: 'setup_required', title: 'Setup weather' },
    ]).map(row => row.title)).toEqual(['Admitted weather', 'Setup weather', 'Bazaar weather'])
  })

  it('rejects an explanation that invents an operation id or fails', () => {
    expect(explanationUsable('**Timezone Converter** can convert New York time to Tokyo time. Next: Open its card.', page)).toBe(true)
    expect(explanationUsable(`Use operation:v1:${'b'.repeat(64)} for this conversion today.`, page)).toBe(false)
    expect(explanationUsable("I couldn't finish the answer. Edit your question to try again.", page)).toBe(false)
    expect(explanationUsable('**Timezone Converter** fits this request. Next: use Next page to see more.', page)).toBe(false)
  })

  it('accepts only canonical, bounded Run sentences and preserves their JSON bytes', () => {
    const toolRef = `operation:v1:${'c'.repeat(64)}`
    const input = { city: 'Sydney', negativeZero: -0, large: 1e100, unicode: '\u2028\u2029😀' }
    const request = formatRunRequest(toolRef, input)
    const parsed = parseRunRequest(request)
    expect(parsed).toEqual({ toolRef, input })
    expect(parsed === null ? undefined : Object.is(parsed.input.negativeZero, -0)).toBe(true)
    expect(parsed === null ? null : formatRunRequest(parsed.toolRef, parsed.input as Readonly<Record<string, JsonValue>>)).toBe(request)
    expect(parseRunRequest(`${request}\n  `)).toEqual(parsed)
    expect(parseRunRequest(`Run Tool operation:v1:${'C'.repeat(64)} with this exact JSON input: {"city":"Sydney"}.`)).toBeNull()
    expect(parseRunRequest(`Run Tool ${toolRef} with this exact JSON input: ["Sydney"].`)).toBeNull()
    expect(parseRunRequest(`${request} Extra text.`)).toBeNull()
    expect(parseRunRequest(`Header\n${request}`)).toBeNull()
    expect(parseRunRequest(`Run Tool ${toolRef} with this exact JSON input: {"x":1,"x":2}.`)).toBeNull()
    expect(parseRunRequest(`Run Tool ${toolRef} with this exact JSON input: { "x" : 1 }.`)).toBeNull()
    expect(parseRunRequest(`Run Tool ${toolRef} with this exact JSON input: {"x":"${'a'.repeat(1493)}"}.`)).toBeNull()
    const nested = `${'{"x":'.repeat(65)}0${'}'.repeat(65)}`
    expect(parseRunRequest(`Run Tool ${toolRef} with this exact JSON input: ${nested}.`)).toBeNull()
  })
})
