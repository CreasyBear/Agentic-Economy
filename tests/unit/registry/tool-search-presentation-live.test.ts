import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { presentToolSearch, type ToolSearchUse } from '@/modules/registry/tool-reranker'
import type { ToolSearchResult } from '@/modules/capability-supply/public'
import {
  ERC20_QUERY,
  misorderedSearchResult,
  mockSearchTool,
} from '../../helpers/tool-search-rerank-fixtures'

function localKey(name: 'OPENROUTER_API_KEY' | 'TYPESAFE_API_KEY'): string {
  const text = readFileSync('.env.local', 'utf8')
  const line = text.split('\n').find((entry) => entry.startsWith(`${name}=`))
  if (line === undefined) return ''
  return line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '')
}

const live = process.env.AE_JEV_PRESENTATION_LIVE === '1'
const page = misorderedSearchResult(ERC20_QUERY)

function widePage() {
  const labels = [
    ['erc20', 'ERC-20 transfer lookup', 'Query ERC-20 token transfers and transaction receipts on Base.'],
    ['weather', 'City weather', 'Current weather for a city.'],
    ['fx', 'FX rates', 'Live foreign-exchange rates for AUD, USD, and EUR.'],
    ['timezone', 'Timezone conversion', 'Convert a local time between IANA timezones.'],
    ['dns', 'DNS lookup', 'Resolve a hostname to DNS records.'],
    ['whois', 'Domain registration', 'Look up the registrar and creation date of a domain.'],
    ['abn', 'ABN lookup', 'Look up an Australian Business Number.'],
    ['maps', 'Geocode an address', 'Turn a street address into coordinates.'],
  ] as const
  return {
    ...page,
    items: labels.map(([id, label, summary]) => mockSearchTool(`operation:v1:${id}`, id, label, summary)),
  }
}

async function runCase(result: ToolSearchResult, query: string) {
  const openrouterApiKey = localKey('OPENROUTER_API_KEY')
  const typesafeApiKey = localKey('TYPESAFE_API_KEY')
  const startedAt = Date.now()
  const presented = await presentToolSearch(result, query, {
    timeoutMs: 1500,
    ...(openrouterApiKey.length > 0 ? { openrouterApiKey } : { typesafeApiKey }),
  })
  const durationMs = Date.now() - startedAt
  expect(durationMs).toBeLessThan(4000)
  if (presented.use !== null && presented.result.kind === 'ok' && result.kind === 'ok') {
    const allowed = new Set(result.items.map((item) => item.toolRef))
    expect(presented.result.items.every((item) => allowed.has(item.toolRef))).toBe(true)
    expect(presented.result.ranking.every((entry) => entry.score >= 0 && entry.score <= 1)).toBe(true)
  }
  return presented.use
}

describe.skipIf(!live)('Jev search presentation live', () => {
  it('chooses and fills tools for specific, comparative, vague, and wide pages', async () => {
    const uses: Array<ToolSearchUse | null> = []
    uses.push(await runCase(page, ERC20_QUERY))
    uses.push(await runCase(page, 'compare converting London time to Sydney with live AUD FX rates'))
    uses.push(await runCase(page, 'help me get something done'))
    uses.push(await runCase(widePage(), 'look up an ERC-20 transfer on Base'))
    const parallel = await Promise.all([0, 1, 2, 3, 4].map(() => runCase(page, ERC20_QUERY)))
    uses.push(...parallel)
    expect(uses.length).toBe(9)
    expect(uses.some((use) => use !== null)).toBe(true)
  }, 30_000)
})
