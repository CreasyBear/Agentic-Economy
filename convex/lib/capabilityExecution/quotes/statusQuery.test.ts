import { describe, expect, it, vi } from 'vitest'
import { readQuoteStatusQueryHandler } from './statusQuery'
import { requireSourceRead } from '../../../sourceWriteAdmission'
import { resolveCallAgentAuthorityHandler } from '../callLifecycle/authorityHandlers'

vi.mock('../../../sourceWriteAdmission', () => ({
  sourceWriteArgs: {}, requireSourceRead: vi.fn(async () => ({ kind: 'accepted' })),
}))
vi.mock('../callLifecycle/authorityHandlers', () => ({
  resolveCallAgentAuthorityHandler: vi.fn(async (_ctx, { principal }) => principal),
}))

const principal = {
  principalId: 'prn-1', ownerId: 'acc-1', credentialId: 'crd-1', applicationRef: 'app-1',
  environment: 'production' as const, scopes: ['market_tools:call'], authorityMode: 'spending_policy' as const,
}
const ref = `operation-commitment:v1:${'a'.repeat(64)}`
const row = {
  quoteRef: ref, principalId: principal.principalId, accountRef: principal.ownerId,
  applicationRef: principal.applicationRef, environment: principal.environment,
  toolRef: `operation:v1:${'b'.repeat(64)}`, state: 'issued', expiresAt: Date.now() + 60_000,
  maximumSpendPerCallUnits: '2000000', normalizedInputJson: '{"secret":"never expose"}',
  credentialId: 'crd-1', evidenceDigest: 'private-proof',
}
const unique = vi.fn(async (): Promise<typeof row & { consumedCallRef?: string }> => row)
const ctx = { db: { query: vi.fn(() => ({ withIndex: vi.fn(() => ({ unique })) })),
  insert: vi.fn(), patch: vi.fn(), delete: vi.fn() } }

function read(actor = principal) {
  return readQuoteStatusQueryHandler(ctx as never, {
    principal: actor, quoteRef: ref, operationKey: 'read-1', correlationId: 'correlation-1',
  })
}

describe('principal-bound Quote status query', () => {
  it('returns only commitment metadata, including expired/consumed state, without a mutation or nonce', async () => {
    const status = await read()
    expect(status).toEqual({ quoteRef: ref, principalRef: principal.principalId, toolRef: row.toolRef,
      state: 'committed', expiresAt: row.expiresAt,
      maxSpend: { currency: 'AUD', units: '2000000', exponent: 6 }, currency: 'AUD' })
    expect(requireSourceRead).toHaveBeenCalledOnce()
    expect(ctx.db.insert).not.toHaveBeenCalled()
    expect(ctx.db.patch).not.toHaveBeenCalled()
    expect(ctx.db.delete).not.toHaveBeenCalled()
    expect(JSON.stringify(status)).not.toContain('secret')
    expect(JSON.stringify(status)).not.toContain('private-proof')
    unique.mockResolvedValueOnce({ ...row, expiresAt: Date.now() - 1000 })
    expect(await read()).toMatchObject({ state: 'expired' })
    unique.mockResolvedValueOnce({ ...row, state: 'consumed', consumedCallRef: 'call-ref' })
    expect(await read()).toMatchObject({ state: 'consumed', consumedCallRef: 'call-ref' })
  })

  it('does not disclose another principal’s Quote', async () => {
    expect(await read({ ...principal, principalId: 'prn-2' })).toBeNull()
    expect(resolveCallAgentAuthorityHandler).toHaveBeenCalled()
  })

  it('refuses an invalid source-read proof before loading the Quote', async () => {
    vi.mocked(requireSourceRead).mockResolvedValueOnce({ kind: 'rejected', reason: 'source_write_unavailable' } as never)
    ctx.db.query.mockClear()
    await expect(read()).rejects.toThrow('quote_status_source_read_rejected')
    expect(ctx.db.query).not.toHaveBeenCalled()
  })
})
