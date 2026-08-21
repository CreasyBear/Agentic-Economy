import { describe, expect, it, vi } from 'vitest'

import {
  MemoryDb,
  bindConnect,
  connect,
  identity,
  sourceArgs,
} from './payout-ledger-test-harness'

vi.mock('../../../convex/sourceWriteAdmission', () => ({
  sourceWriteArgs: {},
  requireSourceWrite: vi.fn(async () => ({ kind: 'accepted' as const })),
}))

describe('Convex payout persistence — connect', () => {
  it('admits a verified account event once and refuses replay conflicts and stale downgrade', async () => {
    const db = new MemoryDb()
    db.seed('moneyPayoutAccounts', {
      _id: 'moneyPayoutAccounts:1',
      businessId: 'business-1',
      currency: 'USD',
      exponent: 2,
      stripeAccountId: 'acct_1',
      state: 'onboarding_started',
      detailsSubmitted: false,
      recipientCapabilityActive: false,
      requirementsDigest: 'sha256:req',
      version: 0,
      createdAt: 1,
      updatedAt: 1,
    })
    const base = {
      businessId: 'business-1',
      currency: 'USD',
      exponent: 2,
      event: {
        kind: 'account',
        stripeEventId: 'evt_1',
        eventType: 'account.updated',
        externalRef: 'acct_1',
        stripeAccountId: 'acct_1',
        providerObjectDigest: 'sha256:v1-object-1',
        payloadDigest: 'sha256:event-1',
        observedAt: 10,
      },
      readback: {
        detailsSubmitted: true,
        recipientCapabilityActive: true,
        restricted: false,
        requirementsDigest: 'sha256:req-2',
        providerObjectDigest: 'sha256:v2-object-1',
        observedAt: 10,
      },
      expectedVersion: 0,
      operationKey: 'money:connect',
      correlationId: 'money:connect:1',
      sourceWriteRequest: {
        method: 'POST',
        initiatorOrigin: 'https://example.test',
        targetOrigin: 'https://example.test',
        targetPath: '/stripe',
        targetQuery: '',
        bodyDigest: 'sha256:body',
      },
    }
    await expect(connect({ db, auth: identity }, base)).resolves.toMatchObject({
      kind: 'accepted',
      account: { state: 'ready', lastStripeEventId: 'evt_1', version: 1 },
    })
    await expect(connect({ db, auth: identity }, base)).resolves.toMatchObject({
      kind: 'accepted',
      account: { state: 'ready', version: 1 },
    })

    await expect(
      connect(
        { db, auth: identity },
        {
          ...base,
          event: { ...base.event, payloadDigest: 'sha256:event-other' },
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'ledger_idempotency_conflict',
    })
    await expect(
      connect(
        { db, auth: identity },
        {
          ...base,
          expectedVersion: 1,
          event: {
            ...base.event,
            stripeEventId: 'evt_0',
            payloadDigest: 'sha256:event-0',
            providerObjectDigest: 'sha256:object-0',
            observedAt: 9,
          },
          readback: {
            ...base.readback,
            providerObjectDigest: 'sha256:object-0',
          },
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
  })

  it('refuses to bind one Stripe account to two owner payout accounts', async () => {
    const db = new MemoryDb()
    db.seed('moneyPayoutAccounts', {
      _id: 'moneyPayoutAccounts:other',
      businessId: 'business-other',
      currency: 'USD',
      exponent: 2,
      stripeAccountId: 'acct_shared',
      state: 'onboarding_started',
      detailsSubmitted: false,
      recipientCapabilityActive: false,
      requirementsDigest: 'sha256:req',
      version: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await expect(
      bindConnect(
        { db, auth: identity },
        {
          businessId: 'business-1',
          currency: 'USD',
          exponent: 2,
          stripeAccountId: 'acct_shared',
          observedAt: 10,
          ...sourceArgs,
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payment_binding_invalid',
    })
  })
})
