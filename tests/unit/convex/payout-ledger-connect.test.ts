import { describe, expect, it, vi } from 'vitest'

import {
  MemoryDb,
  bindConnect,
  connect,
  finalizeConnect,
  identity,
  reserveConnect,
  sourceArgs,
} from './payout-ledger-test-harness'

vi.mock('../../../convex/sourceWriteAdmission', () => ({
  sourceWriteArgs: {},
  requireSourceWrite: vi.fn(async () => ({ kind: 'accepted' as const })),
}))

describe('Convex payout persistence — connect', () => {
  it('finalizes a successful Connect account atomically with its payout binding', async () => {
    const db = new MemoryDb()
    const args = {
      businessId: 'business-1',
      currency: 'USD',
      exponent: 2,
      commandRef: 'connect-command-success',
      inputDigest: 'sha256:connect-input-success',
      providerRequestDigest: 'sha256:connect-request-success',
      recoveryLeaseOwner: 'lease-success',
      idempotencyKey: 'connect-idempotency-success',
      ...sourceArgs,
    }
    await reserveConnect({ db, auth: identity }, args)
    const outcome = {
      state: 'succeeded' as const,
      stripeAccountId: 'acct_success',
      providerEvidenceRef: 'evidence:success',
    }
    await expect(
      finalizeConnect(
        { db, auth: identity },
        { ...args, recoveryLeaseGeneration: 1, outcome },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      command: {
        state: 'succeeded',
        stripeAccountId: 'acct_success',
        providerEvidenceRef: 'evidence:success',
      },
    })
    expect(db.rows('moneyPayoutAccounts')).toEqual([
      expect.objectContaining({
        businessId: 'business-1',
        currency: 'USD',
        stripeAccountId: 'acct_success',
        state: 'onboarding_started',
      }),
    ])
    await expect(
      finalizeConnect(
        { db, auth: identity },
        { ...args, recoveryLeaseGeneration: 1, outcome },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      command: { state: 'succeeded' },
    })
  })

  it('reacquires an expired Connect lease before the deadline and fences stale finalizers', async () => {
    const db = new MemoryDb()
    const args = {
      businessId: 'business-1',
      currency: 'USD',
      exponent: 2,
      commandRef: 'connect-command-1',
      inputDigest: 'sha256:connect-input-1',
      providerRequestDigest: 'sha256:connect-request-1',
      recoveryLeaseOwner: 'lease-1',
      idempotencyKey: 'connect-idempotency-1',
      ...sourceArgs,
    }
    await expect(
      reserveConnect({ db, auth: identity }, args),
    ).resolves.toMatchObject({
      kind: 'accepted',
      execute: true,
      command: {
        state: 'pending',
        commandRef: args.commandRef,
        recoveryLeaseGeneration: 1,
      },
    })
    await expect(
      reserveConnect({ db, auth: identity }, args),
    ).resolves.toMatchObject({
      kind: 'accepted',
      execute: false,
      command: {
        state: 'pending',
        recoveryLeaseGeneration: 1,
        recoveryLeaseOwner: 'lease-1',
      },
    })
    await expect(
      reserveConnect(
        { db, auth: identity },
        {
          ...args,
          commandRef: 'connect-command-2',
          inputDigest: 'sha256:connect-input-2',
          idempotencyKey: 'connect-idempotency-2',
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })

    const original = db.rows('moneyConnectAccountCommands')[0]
    if (original === undefined) throw new Error('missing_connect_command')
    await db.patch(original._id, { recoveryLeaseExpiresAt: 0 })
    const recoveredArgs = { ...args, recoveryLeaseOwner: 'lease-2' }
    await expect(
      reserveConnect({ db, auth: identity }, recoveredArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      execute: true,
      command: {
        state: 'pending',
        recoveryLeaseGeneration: 2,
        recoveryLeaseOwner: 'lease-2',
      },
    })

    await expect(
      finalizeConnect(
        { db, auth: identity },
        {
          ...args,
          recoveryLeaseGeneration: 1,
          outcome: {
            state: 'succeeded',
            stripeAccountId: 'acct_stale',
            providerEvidenceRef: 'evidence:stale',
          },
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'ledger_idempotency_conflict',
    })
    expect(db.rows('moneyConnectAccountCommands')[0]).toMatchObject({
      state: 'pending',
      recoveryLeaseGeneration: 2,
      recoveryLeaseOwner: 'lease-2',
    })
    expect(db.rows('moneyPayoutAccounts')).toHaveLength(0)
    await db.patch(original._id, {
      stripeAccountId: 'acct_retained',
      providerEvidenceRef: 'evidence:retained',
    })
    const unknownResult = await finalizeConnect(
      { db, auth: identity },
      {
        ...recoveredArgs,
        recoveryLeaseGeneration: 2,
        outcome: {
          state: 'outcome_unknown',
          failureCode: 'payout_outcome_unknown',
          failureRetryable: false,
        },
      },
    )
    expect(unknownResult).toEqual({
      kind: 'accepted',
      execute: false,
      command: expect.objectContaining({
        state: 'outcome_unknown',
        stripeAccountId: 'acct_retained',
        providerEvidenceRef: 'evidence:retained',
      }),
    })
    expect(db.rows('moneyConnectAccountCommands')[0]).toMatchObject({
      state: 'outcome_unknown',
      stripeAccountId: 'acct_retained',
    })
    expect(db.rows('moneyConnectAccountCommands')[0]).not.toHaveProperty(
      'recoveryLeaseOwner',
    )

    const nextRecoveryArgs = { ...args, recoveryLeaseOwner: 'lease-3' }
    await expect(
      reserveConnect({ db, auth: identity }, nextRecoveryArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      execute: true,
      command: {
        state: 'pending',
        recoveryLeaseGeneration: 3,
        recoveryLeaseOwner: 'lease-3',
        stripeAccountId: 'acct_retained',
      },
    })
    await expect(
      reserveConnect(
        { db, auth: identity },
        { ...args, recoveryLeaseOwner: 'lease-4' },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      execute: false,
      command: {
        state: 'pending',
        recoveryLeaseGeneration: 3,
        recoveryLeaseOwner: 'lease-3',
      },
    })

    const current = db.rows('moneyConnectAccountCommands')[0]
    if (current === undefined)
      throw new Error('missing_recovered_connect_command')
    await db.patch(current._id, { providerRecoveryDeadlineAt: 0 })
    await expect(
      reserveConnect({ db, auth: identity }, nextRecoveryArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      execute: false,
      command: {
        state: 'outcome_unknown',
        failureCode: 'payout_reconciliation_required',
        stripeAccountId: 'acct_retained',
      },
    })
    await expect(
      reserveConnect(
        { db, auth: identity },
        {
          ...args,
          commandRef: 'connect-command-3',
          inputDigest: 'sha256:connect-input-3',
          idempotencyKey: 'connect-idempotency-3',
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })

    const identityDb = new MemoryDb()
    const identityArgs = {
      businessId: 'business-identity',
      currency: 'USD',
      exponent: 2,
      commandRef: 'connect-command-identity',
      inputDigest: 'sha256:connect-input-identity',
      providerRequestDigest: 'sha256:connect-request-identity',
      recoveryLeaseOwner: 'lease-identity',
      idempotencyKey: 'connect-idempotency-identity',
      ...sourceArgs,
    }
    await reserveConnect({ db: identityDb, auth: identity }, identityArgs)
    identityDb.seed('moneyPayoutAccounts', {
      _id: 'moneyPayoutAccounts:identity',
      businessId: 'business-identity',
      currency: 'USD',
      exponent: 2,
      stripeAccountId: 'acct_existing',
      state: 'onboarding_started',
      detailsSubmitted: false,
      recipientCapabilityActive: false,
      requirementsDigest: 'sha256:req',
      createdAt: 1,
      updatedAt: 1,
    })
    await expect(
      finalizeConnect(
        { db: identityDb, auth: identity },
        {
          ...identityArgs,
          recoveryLeaseGeneration: 1,
          outcome: {
            state: 'succeeded',
            stripeAccountId: 'acct_conflict',
            providerEvidenceRef: 'evidence:conflict',
          },
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    await expect(
      reserveConnect({ db: identityDb, auth: identity }, identityArgs),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payment_binding_invalid',
    })
  })
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
