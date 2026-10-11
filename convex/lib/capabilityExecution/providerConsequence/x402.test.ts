import { describe, expect, it } from 'vitest'
import type { MutationCtx } from '../../../_generated/server'
import { authorizeProviderConsequenceX402RpcHandler } from './x402'

const NOW = Date.now()
const row = {
  state: 'started', adapterId: 'x402-fetch:v2', paymentSecretRef: 'pay', journalTokenDigest: 'tok',
  expiresAt: NOW + 60_000, callRef: 'call', toolRef: 'tool', attemptRef: 'att', effectGeneration: 1,
  providerRef: 'prov', grantRef: 'g', grantGeneration: 1, actorPrincipalRef: 'p', operationKeyDigest: 'k',
}
const call = {
  toolRef: 'tool', grantRef: 'g', grantGeneration: 1, principalId: 'p', credentialId: 'c',
  environment: 'sandbox', inputDigest: 'd', quoteRef: 'quote',
}
const quote = {
  x402RequirementJson: JSON.stringify({
    endpoint: { url: 'https://seller.example/api', method: 'POST' },
    requirement: { payTo: '0xabc', amountUnits: '1000', asset: '0xUSDC', network: 'eip155:84532' },
  }),
}
const ctx = {
  db: {
    query: (table: string) => ({
      withIndex: () => ({
        unique: async () => (table === 'providerConsequenceJournal' ? row : table === 'capabilityCalls' ? call : quote),
      }),
    }),
  },
} as unknown as MutationCtx

const good = {
  payTo: '0xABC', amountUnits: '1000', asset: '0xusdc', network: 'eip155:84532',
  providerEndpoint: 'https://seller.example/api',
}
const run = (args: Record<string, unknown>) => authorizeProviderConsequenceX402RpcHandler(ctx, {
  ticketRef: 't', journalTokenDigest: 'tok', operation: 'prepare_authorization', args,
})

describe('x402 prepare_authorization binding', () => {
  it('authorizes the quoted payee, amount and endpoint', async () => {
    expect((await run(good)).kind).toBe('authorized')
  })
  it.each([
    ['payee', { payTo: '0xevil' }],
    ['amount', { amountUnits: '1001' }],
    ['endpoint', { providerEndpoint: 'https://evil.example/api' }],
    ['asset', { asset: '0xother' }],
    ['network', { network: 'eip155:8453' }],
  ])('refuses a different %s', async (_name, override) => {
    expect((await run({ ...good, ...override })).kind).toBe('unavailable')
  })
})
