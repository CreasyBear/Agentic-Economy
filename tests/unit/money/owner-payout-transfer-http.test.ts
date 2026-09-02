import { beforeEach, describe, expect, it, vi } from 'vitest'

const sourceMocks = vi.hoisted(() => ({
  callSourceQuery: vi.fn(),
}))

vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/server/convex-source')>(),
  callSourceQuery: sourceMocks.callSourceQuery,
}))

import {
  readOwnerPayoutTransferThroughSource,
  runOwnerPayoutTransferThroughSource,
} from '@/modules/money/internal/payout-transfer-http'

const owner = {
  kind: 'available' as const,
  businessId: 'business-1',
  accounts: [],
  accountsTruncated: false,
}

const input = {
  businessId: 'business-1',
  currency: 'USD',
  payoutRef: 'payout-1',
  amount: { currency: 'USD', exponent: 2, units: '1000' },
  expectedPayoutRevision: 1,
  expectedAccountVersion: 0,
  idempotencyKey: 'payout-idempotency-1',
} as const

describe('owner payout transfer boundary after the Formance cutover', () => {
  beforeEach(() => {
    sourceMocks.callSourceQuery.mockReset()
  })

  it('fails closed before provider or financial write work', async () => {
    sourceMocks.callSourceQuery.mockResolvedValue(owner)
    const provider = {
      createOrRecoverTransfer: vi.fn(),
      readTransfer: vi.fn(),
      readTransfersByIdentity: vi.fn(),
    }

    await expect(runOwnerPayoutTransferThroughSource(
      input,
      {},
      {},
      { provider } as never,
    )).resolves.toEqual({
      kind: 'refused',
      code: 'payout_not_ready',
      retryable: false,
    })
    expect(provider.createOrRecoverTransfer).not.toHaveBeenCalled()
    expect(provider.readTransfer).not.toHaveBeenCalled()
    expect(provider.readTransfersByIdentity).not.toHaveBeenCalled()
  })

  it('keeps readback fail-closed without calling retired Convex functions', async () => {
    sourceMocks.callSourceQuery.mockResolvedValue(owner)

    await expect(readOwnerPayoutTransferThroughSource({
      businessId: input.businessId,
      currency: input.currency,
      payoutRef: input.payoutRef,
      idempotencyKey: input.idempotencyKey,
    })).resolves.toEqual({
      kind: 'refused',
      code: 'payout_not_ready',
      retryable: false,
    })
    expect(sourceMocks.callSourceQuery).toHaveBeenCalledOnce()
  })

  it('preserves authentication refusal', async () => {
    sourceMocks.callSourceQuery.mockResolvedValue({
      kind: 'error',
      code: 'unauthenticated',
    })

    await expect(runOwnerPayoutTransferThroughSource(input)).resolves.toEqual({
      kind: 'refused',
      code: 'billing_identity_missing',
      retryable: false,
    })
  })
})
