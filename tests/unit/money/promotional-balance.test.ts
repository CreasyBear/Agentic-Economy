import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FormanceContext } from '@/modules/money/formance'
import { readFormanceAccountCreditBalance } from '@/modules/money/formance-workflows'

type AccountResponse = { v2AccountResponse: { data: { address: string; volumes: Record<string, { input: bigint; output: bigint; balance: bigint }> } } }

function account(address: string, balance: bigint): AccountResponse {
  return { v2AccountResponse: { data: { address, volumes: { 'AUD/6': { input: balance, output: 0n, balance } } } } }
}

function contextWith(getAccount: (request: { address: string; expand: string; ledger: string }) => Promise<unknown>): FormanceContext {
  return {
    configuration: { ledger: 'test-ledger' },
    sdk: { ledger: { v2: { getAccount } } },
  } as unknown as FormanceContext
}

function grant(grantRef: string, availableUnits: string, expiresAt: number) {
  return { grantRef, availableUnits, expiresAt }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('promotional account balance from official Formance account reads', () => {
  it('combines purchased credit with only the lesser of each eligible grant counter and ledger balance', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const getAccount = vi.fn(async ({ address, expand, ledger }: { address: string; expand: string; ledger: string }) => {
      expect(expand).toBe('volumes')
      expect(ledger).toBe('test-ledger')
      if (address.endsWith(':available') && !address.includes(':promo:')) return account(address, 700n)
      if (address.includes(':promo:')) return account(address, 900n)
      throw new Error('unexpected account')
    })
    const result = await readFormanceAccountCreditBalance(contextWith(getAccount), {
      accountRef: 'account:one', grants: [grant('grant:one', '400', 2_000)],
    })
    expect(result).toEqual({
      kind: 'available', currency: 'AUD', exponent: 6, units: '1100',
      purchasedUnits: '700', promotionalUnits: '400', nextPromotionalExpiryAt: 2_000, observedAt: 1_000,
    })
    expect(getAccount).toHaveBeenCalledTimes(2)
  })

  it('caps a grant at its live ledger balance when the counter is higher', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const getAccount = vi.fn(async ({ address }: { address: string }) => account(address, address.includes(':promo:') ? 250n : 100n))
    const result = await readFormanceAccountCreditBalance(contextWith(getAccount), {
      accountRef: 'account:one', grants: [grant('grant:one', '400', 2_000)],
    })
    expect(result).toMatchObject({ kind: 'available', units: '350', purchasedUnits: '100', promotionalUnits: '250' })
  })

  it('excludes credit that expires while Formance reads are pending', async () => {
    let finishGrantRead: ((response: AccountResponse) => void) | undefined
    const pendingGrantRead = new Promise<AccountResponse>(resolve => { finishGrantRead = resolve })
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const getAccount = vi.fn(async ({ address }: { address: string }) =>
      address.includes(':promo:') ? pendingGrantRead : account(address, 100n))
    const reading = readFormanceAccountCreditBalance(contextWith(getAccount), {
      accountRef: 'account:one', grants: [grant('grant:one', '400', 1_500)],
    })
    await vi.waitFor(() => expect(getAccount).toHaveBeenCalledTimes(2))
    now.mockReturnValue(1_500)
    const grantAddress = getAccount.mock.calls.find(([request]) => request.address.includes(':promo:'))?.[0].address
    if (!grantAddress || !finishGrantRead) throw new Error('grant read was not started')
    finishGrantRead(account(grantAddress, 400n))
    await expect(reading).resolves.toMatchObject({
      kind: 'available', units: '100', purchasedUnits: '100', promotionalUnits: '0', nextPromotionalExpiryAt: null,
    })
  })

  it('fails closed when an unexpired grant account is unavailable', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const getAccount = vi.fn(async ({ address }: { address: string }) => {
      if (address.includes(':promo:')) throw new Error('Formance unavailable')
      return account(address, 100n)
    })
    await expect(readFormanceAccountCreditBalance(contextWith(getAccount), {
      accountRef: 'account:one', grants: [grant('grant:one', '400', 2_000)],
    })).resolves.toEqual({ kind: 'unavailable', code: 'formance_read_unavailable' })
  })

  it('uses the earliest expiry among grants with live spendable balances', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const getAccount = vi.fn(async ({ address }: { address: string }) => {
      if (!address.includes(':promo:')) return account(address, 50n)
      return account(address, 200n)
    })
    const result = await readFormanceAccountCreditBalance(contextWith(getAccount), {
      accountRef: 'account:one', grants: [grant('grant:later', '100', 4_000), grant('grant:earlier', '80', 2_000)],
    })
    expect(result).toMatchObject({
      kind: 'available', units: '230', purchasedUnits: '50', promotionalUnits: '180', nextPromotionalExpiryAt: 2_000,
    })
  })

  it('reports all zero when the purchased account is missing and grants have no eligible balance', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const getAccount = vi.fn(async () => ({ v2AccountResponse: {} }))
    const result = await readFormanceAccountCreditBalance(contextWith(getAccount), {
      accountRef: 'account:one', grants: [grant('grant:expired', '400', 1_000), grant('grant:empty', '0', 2_000)],
    })
    expect(result).toEqual({
      kind: 'available', currency: 'AUD', exponent: 6, units: '0', purchasedUnits: '0',
      promotionalUnits: '0', nextPromotionalExpiryAt: null, observedAt: 1_000,
    })
    expect(getAccount).toHaveBeenCalledTimes(1)
  })
})
