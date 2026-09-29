import { describe, expect, it } from 'vitest'
import { explanationUsable } from '../../../convex/lib/chat/tools/immediate'
import { parseOwnerQuoteRequest } from '../../../convex/lib/chat/tools/quoteRequest'
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
  })

  it('accepts only the card quote sentence and its JSON object', () => {
    const toolRef = `operation:v1:${'c'.repeat(64)}`
    expect(parseOwnerQuoteRequest(
      `Get a fresh Quote for Tool ${toolRef} with this exact JSON input: {"city":"Sydney"}. Use tool.quote and show the terms for my approval. Do not Call the Tool.`,
    )).toEqual({ toolRef, input: { city: 'Sydney' } })
    expect(parseOwnerQuoteRequest(`Get a fresh Quote for Tool ${toolRef} with this exact JSON input: ["Sydney"]. Use tool.quote and show the terms for my approval. Do not Call the Tool.`)).toBeNull()
    expect(parseOwnerQuoteRequest('Convert 3:30pm in New York to Tokyo time')).toBeNull()
  })
})
