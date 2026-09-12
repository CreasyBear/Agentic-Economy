import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { convexUrl } from './server-seams-harness'

const adapterMocks = vi.hoisted(() => ({
  auth: vi.fn(),
}))

vi.mock('@clerk/tanstack-react-start/server', () => ({
  auth: adapterMocks.auth,
}))

const previousConvexUrl = process.env.CONVEX_URL

beforeEach(() => {
  // `tests/setup/http-rate-limit.ts` already imports `@/lib/server/convex-source`
  // (through `@/lib/server/rate-limit`) before this file's `vi.mock` above runs,
  // so that module graph is cached with the real Clerk `auth`. `resetModules`
  // forces a fresh import below to pick up the mock instead.
  vi.resetModules()
  adapterMocks.auth.mockReset()
  adapterMocks.auth.mockResolvedValue({ isAuthenticated: true, getToken: async () => 'owner.jwt' })
  process.env.CONVEX_URL = convexUrl
})

afterEach(() => {
  if (previousConvexUrl === undefined) delete process.env.CONVEX_URL
  else process.env.CONVEX_URL = previousConvexUrl
  vi.unstubAllGlobals()
})

/**
 * `createConvexMoneyQueryPort()` takes no options, so it always resolves its
 * Convex client through the real `auth()` import and `fetch` global. This
 * mocks Clerk the way `agent-access-auth.test.ts` does, and replays the same
 * two-call wire protocol `convex-source-seam.test.ts` uses (materialize, then
 * the real call) to drive `moneyLedger:read*` responses.
 */
function stubMoneyLedgerFetch(
  path: 'moneyLedger:readCreditAccount' | 'moneyLedger:listCreditActivity' | 'moneyLedger:readKeyUsage',
  value: unknown,
): void {
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { path: string }
    if (body.path === 'interactiveAuthority:materializeCurrentInteractiveAuthority') {
      return new Response(JSON.stringify({ status: 'success', value: true }))
    }
    if (body.path === path) {
      return new Response(JSON.stringify({ status: 'success', value }))
    }
    throw new Error(`unexpected_convex_call:${body.path}`)
  }))
}

async function loadMoneyQueryModule() {
  return await import('@/lib/server/money-query')
}

describe('createConvexMoneyQueryPort', () => {
  it('reshapes an ok credit-account read into CreditAccountView', async () => {
    const { createConvexMoneyQueryPort } = await loadMoneyQueryModule()
    stubMoneyLedgerFetch('moneyLedger:readCreditAccount', {
      kind: 'ok',
      principalId: 'acc_one',
      accountId: 'acc_one',
      balance: { currency: 'AUD', units: '5000000', exponent: 6 },
      autoRecharge: {
        enabled: false,
        threshold: { currency: 'AUD', units: '0', exponent: 6 },
        rechargeAmount: { currency: 'AUD', units: '0', exponent: 6 },
      },
      evidence: 'source',
    })

    const port = createConvexMoneyQueryPort()
    await expect(port.readCreditAccount({ principalId: 'acc_one', currency: 'AUD' })).resolves.toEqual({
      principalId: 'acc_one',
      accountId: 'acc_one',
      balance: { currency: 'AUD', units: '5000000', exponent: 6 },
      autoRecharge: {
        enabled: false,
        threshold: { currency: 'AUD', units: '0', exponent: 6 },
        rechargeAmount: { currency: 'AUD', units: '0', exponent: 6 },
      },
      evidence: 'source',
    })
  })

  it('throws MoneyQueryError with the source code on a refused credit-account read', async () => {
    const { createConvexMoneyQueryPort, MoneyQueryError } = await loadMoneyQueryModule()
    stubMoneyLedgerFetch('moneyLedger:readCreditAccount', { kind: 'refused', code: 'source_unavailable' })

    const port = createConvexMoneyQueryPort()
    await expect(port.readCreditAccount({ principalId: 'acc_one', currency: 'AUD' }))
      .rejects.toEqual(new MoneyQueryError('source_unavailable'))
  })

  it('reshapes an ok credit-activity page and throws on refusal', async () => {
    const { createConvexMoneyQueryPort, MoneyQueryError } = await loadMoneyQueryModule()
    const item = {
      activityRef: 'activity:one', credentialId: 'credential:one', serviceRef: 'service:one',
      offeringRef: 'offering:one', businessId: 'business:one', operationKey: 'op:one',
      callRef: 'call:one', attemptRef: 'attempt:one',
      grossAmount: { currency: 'AUD', units: '100', exponent: 6 },
      chargeState: 'paid', priceDigest: `sha256:${'a'.repeat(64)}`, observedAt: 1_000,
    }
    stubMoneyLedgerFetch('moneyLedger:listCreditActivity', {
      kind: 'ok', page: [item], isDone: true, continueCursor: '',
    })
    const port = createConvexMoneyQueryPort()
    await expect(port.listCreditActivity({
      principalId: 'acc_one', credentialId: 'credential:one', currency: 'AUD',
      paginationOpts: { numItems: 10, cursor: null },
    })).resolves.toEqual({ page: [item], isDone: true, continueCursor: '' })

    stubMoneyLedgerFetch('moneyLedger:listCreditActivity', {
      kind: 'refused', code: 'credential_activity_unavailable', items: [],
    })
    await expect(port.listCreditActivity({
      principalId: 'acc_one', credentialId: 'credential:one', currency: 'AUD',
      paginationOpts: { numItems: 10, cursor: null },
    })).rejects.toEqual(new MoneyQueryError('credential_activity_unavailable'))
  })

  it('reshapes an ok key-usage read and throws on refusal', async () => {
    const { createConvexMoneyQueryPort, MoneyQueryError } = await loadMoneyQueryModule()
    stubMoneyLedgerFetch('moneyLedger:readKeyUsage', {
      kind: 'ok', credentialId: 'credential:one', callCount: 3, paidCallCount: 2, freeCallCount: 1,
      grossSpend: { currency: 'AUD', units: '200', exponent: 6 }, states: ['paid', 'paid', 'free_tier'],
    })
    const port = createConvexMoneyQueryPort()
    await expect(port.readKeyUsage({ principalId: 'acc_one', credentialId: 'credential:one', currency: 'AUD' }))
      .resolves.toEqual({
        credentialId: 'credential:one', callCount: 3, paidCallCount: 2, freeCallCount: 1,
        grossSpend: { currency: 'AUD', units: '200', exponent: 6 }, states: ['paid', 'paid', 'free_tier'],
      })

    stubMoneyLedgerFetch('moneyLedger:readKeyUsage', { kind: 'refused', code: 'credential_usage_unavailable', items: [] })
    await expect(port.readKeyUsage({ principalId: 'acc_one', credentialId: 'credential:one', currency: 'AUD' }))
      .rejects.toEqual(new MoneyQueryError('credential_usage_unavailable'))
  })
})
