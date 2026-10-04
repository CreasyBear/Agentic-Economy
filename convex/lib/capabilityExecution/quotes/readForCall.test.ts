import { describe, expect, it } from 'vitest'
import { readForCallHandler } from './readForCall'

const principal = {
  principalId: 'principal', ownerId: 'account', credentialId: 'credential', applicationRef: 'app',
  environment: 'production' as const, scopes: ['market_tools:call'], authorityMode: 'spending_policy' as const,
}
const quote = {
  quoteRef: 'quote', toolRef: 'tool', principalId: principal.principalId, accountRef: principal.ownerId,
  credentialId: principal.credentialId, applicationRef: principal.applicationRef,
  environment: principal.environment, state: 'consumed', consumedCallRef: 'call',
  expiresAt: 1, normalizedInputJson: undefined,
}
const call = { quoteRef: quote.quoteRef, credentialId: principal.credentialId, idempotencyKey: 'original-key' }

function read(overrides: Partial<typeof quote> = {}, callOverrides: Partial<typeof call> = {}, actor = principal) {
  const rows: Record<string, unknown> = { capabilityQuotes: { ...quote, ...overrides }, capabilityCalls: { ...call, ...callOverrides } }
  const ctx = { db: { query: (table: string) => ({ withIndex: () => ({ unique: async () => rows[table] }) }) } }
  return readForCallHandler(ctx as never, { principal: actor, quoteRef: quote.quoteRef, idempotencyKey: 'original-key', now: 100 })
}

describe('consumed Quote replay after content expiry', () => {
  it('returns only the original references without requiring deleted input or an unexpired Quote', async () => {
    expect(await read()).toEqual({ consumedCallRef: 'call', toolRef: 'tool', quoteRef: 'quote' })
  })

  it('retains Account and credential isolation after content expiry', async () => {
    expect(await read({}, {}, { ...principal, ownerId: 'another-account' })).toBeNull()
    expect(await read({}, {}, { ...principal, credentialId: 'another-credential' })).toBeNull()
  })

  it('cannot use a consumed Quote to change the purchase key or Call binding', async () => {
    expect(await read({}, { idempotencyKey: 'new-key' })).toBeNull()
    expect(await read({}, { quoteRef: 'different-quote' })).toBeNull()
  })
})
