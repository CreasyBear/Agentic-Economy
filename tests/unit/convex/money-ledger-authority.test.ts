import { api } from '../../../convex/_generated/api'
import { accountRefForOwner } from '../../../src/modules/money/public'
import {
  convexModules,
  publishedBusinessOwner,
} from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'
import schema from '../../../convex/schema'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

describe('money ledger canonical authority', () => {
  it('preserves a valid top-up reservation for the current canonical account owner', async () => {
    const backend = convexTest(schema, convexModules)
    const fixture = await publishedBusinessOwner(
      backend,
      'money-canonical-topup-owner',
    )
    const agentPrincipalRef = `prn_${'a'.repeat(32)}`
    const credentialRef = `crd_${'b'.repeat(32)}`
    const accountRef = accountRefForOwner(fixture.canonicalAccountRef, 'USD')
    await backend.run(async (ctx) => {
      await ctx.db.insert('principals', {
        principalRef: agentPrincipalRef,
        kind: 'agent',
        displayName: 'Canonical money agent',
        lifecycle: 'active',
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('agentAccessPrincipals', {
        principalId: agentPrincipalRef,
        ownerId: fixture.canonicalAccountRef,
        credentialId: credentialRef,
        applicationRef: 'agentic-economy',
        environment: 'sandbox',
        scopes: ['market_operations:invoke'],
        authorityMode: 'approve_each',
        grantGeneration: 1,
        policyDigest: 'sha256:money-canonical-policy',
        lifecycle: 'active',
        expiresAt: 8_000_000_000_000,
        recordedAt: 1,
        lastSeenAt: 1,
      })
      await ctx.db.insert('moneyAccounts', {
        accountRef,
        accountKind: 'operator_credit',
        accountId: fixture.canonicalAccountRef,
        currency: 'USD',
        exponent: 2,
        balanceUnits: '0',
        heldUnits: '0',
        recoveryDueUnits: '0',
        version: 0,
        state: 'active',
        createdAt: 1,
        updatedAt: 1,
      })
    })
    const command = {
      principalId: agentPrincipalRef,
      accountRef,
      amount: { currency: 'USD', units: '1000', exponent: 2 },
      commandRef: 'money-command:canonical-owner',
      idempotencyKey: 'money-idempotency:canonical-owner',
      inputDigest: 'sha256:money-canonical-owner-input',
      successReturnRef: 'https://ae.example/account/credits',
      operationKey: 'moneyLedger:reserveCreditTopup',
      correlationId: 'money-command:canonical-owner',
    } as const
    const args = await withSourceWrite('billing', command)

    const reserved = await fixture.owner.mutation(
      api.moneyLedger.reserveCreditTopup,
      args,
    )
    expect(reserved).toMatchObject({
      kind: 'accepted',
      command: {
        principalId: agentPrincipalRef,
        accountRef,
        amountUnits: '1000',
        processingFeeUnits: '50',
        chargeAmountUnits: '1050',
        state: 'pending',
      },
    })
    if (reserved.kind !== 'accepted') throw new Error('expected accepted top-up')
    const replayArgs = await withSourceWrite('billing', command)
    await expect(
      fixture.owner.mutation(api.moneyLedger.reserveCreditTopup, replayArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      command: {
        principalId: agentPrincipalRef,
        accountRef,
        amountUnits: '1000',
        processingFeeUnits: '50',
        chargeAmountUnits: '1050',
        state: 'pending',
      },
    })
    await expect(
      fixture.owner.query(api.moneyLedger.readCreditTopupCommand, {
        commandRef: 'money-command:canonical-owner',
        idempotencyKey: 'money-idempotency:canonical-owner',
      }),
    ).resolves.toMatchObject({
      kind: 'accepted',
      command: {
        principalId: agentPrincipalRef,
        accountRef,
        state: 'pending',
      },
    })
    const metadataDigest = reserved.command.metadataDigest
    if (metadataDigest === undefined)
      throw new Error('expected reserved metadata digest')
    const evidence = {
      externalRef: 'cs_money_canonical_owner',
      amount: { currency: 'USD', units: '1050', exponent: 2 },
      status: 'pending' as const,
      evidenceRef: 'stripe:checkout:canonical-owner',
      requestDigest: 'sha256:stripe-request-canonical-owner',
      metadataDigest,
      checkoutSessionDigest: 'sha256:stripe-session-canonical-owner',
      evidenceDigest: 'sha256:stripe-evidence-canonical-owner',
    }
    const foreign = await publishedBusinessOwner(
      backend,
      'money-canonical-topup-foreign',
    )
    const foreignBindArgs = await withSourceWrite('billing', {
      commandRef: 'money-command:canonical-owner',
      evidence,
      operationKey: 'moneyLedger:bindCreditPaymentSession',
      correlationId: 'money-command:canonical-owner:foreign-bind',
    })
    await expect(
      foreign.owner.mutation(
        api.moneyLedger.bindCreditPaymentSession,
        foreignBindArgs,
      ),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'billing_identity_missing',
      retryable: false,
    })
    const bindArgs = await withSourceWrite('billing', {
      commandRef: 'money-command:canonical-owner',
      evidence,
      operationKey: 'moneyLedger:bindCreditPaymentSession',
      correlationId: 'money-command:canonical-owner:bind',
    })
    await expect(
      fixture.owner.mutation(api.moneyLedger.bindCreditPaymentSession, bindArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      command: {
        externalRef: evidence.externalRef,
        providerStatus: 'pending',
        state: 'pending',
      },
    })
    const unknownArgs = await withSourceWrite('billing', {
      principalId: agentPrincipalRef,
      accountRef,
      amount: { currency: 'USD', units: '1000', exponent: 2 },
      commandRef: 'money-command:canonical-owner',
      idempotencyKey: 'money-idempotency:canonical-owner',
      inputDigest: 'sha256:money-canonical-owner-input',
      successReturnRef: 'https://ae.example/account/credits',
      providerRecoveryDeadlineAt: reserved.command.providerRecoveryDeadlineAt,
      externalRef: evidence.externalRef,
      operationKey: 'moneyLedger:markCreditTopupOutcomeUnknown',
      correlationId: 'money-command:canonical-owner:unknown',
    })
    await expect(
      fixture.owner.mutation(
        api.moneyLedger.markCreditTopupOutcomeUnknown,
        unknownArgs,
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      command: { state: 'outcome_unknown' },
    })
    const commands = await backend.run(async (ctx) =>
      await ctx.db
        .query('moneyTopupCommands')
        .withIndex('by_commandRef', (query) =>
          query.eq('commandRef', 'money-command:canonical-owner'),
        )
        .collect(),
    )
    expect(commands).toHaveLength(1)
    expect(commands[0]).toMatchObject({ state: 'outcome_unknown' })

    await backend.run(async (ctx) => {
      const row = await ctx.db
        .query('agentAccessPrincipals')
        .withIndex('by_principalId', (query) =>
          query.eq('principalId', agentPrincipalRef),
        )
        .unique()
      if (row === null) throw new Error('missing agent principal')
      await ctx.db.patch(row._id, { expiresAt: 1 })
    })
    const expiredConsequenceArgs = await withSourceWrite('billing', {
      ...command,
      commandRef: 'money-command:expired-agent',
      idempotencyKey: 'money-idempotency:expired-agent',
      correlationId: 'money-command:expired-agent',
    })
    await expect(
      fixture.owner.mutation(
        api.moneyLedger.reserveCreditTopup,
        expiredConsequenceArgs,
      ),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'billing_identity_missing',
      retryable: false,
    })
    await expect(backend.run(async (ctx) =>
      await ctx.db.query('moneyTopupCommands').collect(),
    )).resolves.toHaveLength(1)
  })

  it('returns the current canonical account credit balance to its owner', async () => {
    const backend = convexTest(schema, convexModules)
    const fixture = await publishedBusinessOwner(
      backend,
      'money-canonical-credit-read',
    )
    const agentPrincipalRef = `prn_${'c'.repeat(32)}`
    const accountRef = accountRefForOwner(fixture.canonicalAccountRef, 'USD')
    await backend.run(async (ctx) => {
      await ctx.db.insert('principals', {
        principalRef: agentPrincipalRef,
        kind: 'agent',
        displayName: 'Canonical money read agent',
        lifecycle: 'active',
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('agentAccessPrincipals', {
        principalId: agentPrincipalRef,
        ownerId: fixture.canonicalAccountRef,
        credentialId: `crd_${'d'.repeat(32)}`,
        applicationRef: 'agentic-economy',
        environment: 'sandbox',
        scopes: ['market_operations:invoke'],
        authorityMode: 'approve_each',
        grantGeneration: 1,
        policyDigest: 'sha256:money-credit-read-policy',
        lifecycle: 'active',
        expiresAt: 8_000_000_000_000,
        recordedAt: 1,
        lastSeenAt: 1,
      })
      await ctx.db.insert('moneyAccounts', {
        accountRef,
        accountKind: 'operator_credit',
        accountId: fixture.canonicalAccountRef,
        currency: 'USD',
        exponent: 2,
        balanceUnits: '4321',
        heldUnits: '0',
        recoveryDueUnits: '0',
        version: 7,
        state: 'active',
        createdAt: 1,
        updatedAt: 1,
      })
    })

    await expect(
      fixture.owner.query(api.moneyLedger.readCreditAccount, {
        principalId: agentPrincipalRef,
        currency: 'USD',
      }),
    ).resolves.toEqual({
      kind: 'ok',
      principalId: agentPrincipalRef,
      accountId: fixture.canonicalAccountRef,
      balance: { currency: 'USD', units: '4321', exponent: 2 },
      autoRecharge: {
        enabled: false,
        threshold: { currency: 'USD', units: '0', exponent: 2 },
        rechargeAmount: { currency: 'USD', units: '0', exponent: 2 },
      },
      evidence: 'source',
    })
    await expect(
      fixture.owner.query(api.moneyLedger.listCreditActivity, {
        principalId: agentPrincipalRef,
        credentialId: `crd_${'d'.repeat(32)}`,
        currency: 'USD',
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).resolves.toMatchObject({ kind: 'ok', page: [] })
    await expect(
      fixture.owner.query(api.moneyLedger.readKeyUsage, {
        principalId: agentPrincipalRef,
        credentialId: `crd_${'d'.repeat(32)}`,
        currency: 'USD',
      }),
    ).resolves.toEqual({
      kind: 'ok',
      credentialId: `crd_${'d'.repeat(32)}`,
      callCount: 0,
      paidCallCount: 0,
      freeCallCount: 0,
      grossSpend: { currency: 'USD', units: '0', exponent: 2 },
      states: [],
    })

    const foreign = await publishedBusinessOwner(
      backend,
      'money-canonical-credit-foreign',
    )
    const creditRead = {
      principalId: agentPrincipalRef,
      currency: 'USD',
    }
    await expect(
      foreign.owner.query(api.moneyLedger.readCreditAccount, creditRead),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'billing_identity_missing',
    })
    await expect(
      backend.query(api.moneyLedger.readCreditAccount, creditRead),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'billing_identity_missing',
    })

    await backend.run(async (ctx) => {
      const row = await ctx.db
        .query('agentAccessPrincipals')
        .withIndex('by_principalId', (query) =>
          query.eq('principalId', agentPrincipalRef),
        )
        .unique()
      if (row === null) throw new Error('missing agent principal')
      await ctx.db.patch(row._id, { lifecycle: 'revoked' })
    })
    await expect(
      fixture.owner.query(api.moneyLedger.readCreditAccount, creditRead),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'billing_identity_missing',
    })

    await backend.run(async (ctx) => {
      const row = await ctx.db
        .query('agentAccessPrincipals')
        .withIndex('by_principalId', (query) =>
          query.eq('principalId', agentPrincipalRef),
        )
        .unique()
      if (row === null) throw new Error('missing agent principal')
      await ctx.db.patch(row._id, { lifecycle: 'active', expiresAt: 1 })
    })
    await expect(
      fixture.owner.query(api.moneyLedger.readCreditAccount, creditRead),
    ).resolves.toMatchObject({
      kind: 'ok',
      principalId: agentPrincipalRef,
      accountId: fixture.canonicalAccountRef,
      balance: { currency: 'USD', units: '4321', exponent: 2 },
    })

    await backend.run(async (ctx) => {
      const agent = await ctx.db
        .query('agentAccessPrincipals')
        .withIndex('by_principalId', (query) =>
          query.eq('principalId', agentPrincipalRef),
        )
        .unique()
      const account = await ctx.db
        .query('accounts')
        .withIndex('by_accountRef', (query) =>
          query.eq('accountRef', fixture.canonicalAccountRef),
        )
        .unique()
      if (agent === null || account === null)
        throw new Error('missing canonical authority rows')
      await ctx.db.patch(agent._id, { expiresAt: 8_000_000_000_000 })
      await ctx.db.patch(account._id, { lifecycle: 'suspended' })
    })
    await expect(
      fixture.owner.query(api.moneyLedger.readCreditAccount, creditRead),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'billing_identity_missing',
    })

    await backend.run(async (ctx) => {
      const account = await ctx.db
        .query('accounts')
        .withIndex('by_accountRef', (query) =>
          query.eq('accountRef', fixture.canonicalAccountRef),
        )
        .unique()
      const credentials = await ctx.db
        .query('credentials')
        .withIndex('by_principalRef_and_lifecycle', (query) =>
          query
            .eq('principalRef', fixture.canonicalPrincipalRef)
            .eq('lifecycle', 'active'),
        )
        .take(2)
      if (account === null || credentials.length !== 1)
        throw new Error('missing interactive authority rows')
      await ctx.db.patch(account._id, { lifecycle: 'active' })
      await ctx.db.patch(credentials[0]!._id, { lifecycle: 'revoked' })
    })
    await expect(
      fixture.owner.query(api.moneyLedger.readCreditAccount, creditRead),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'billing_identity_missing',
    })
  })

  it('derives agent earnings ownership from durable canonical principal rows', async () => {
    const backend = convexTest(schema, convexModules)
    const fixture = await publishedBusinessOwner(
      backend,
      'money-canonical-agent-earnings',
    )
    const agentPrincipalRef = `prn_${'e'.repeat(32)}`
    const credentialRef = `crd_${'f'.repeat(32)}`
    const grantRef = `grt_${'1'.repeat(32)}`
    const policyDigest = 'sha256:money-agent-earnings-policy'
    const principal = {
      principalId: agentPrincipalRef,
      ownerId: fixture.canonicalAccountRef,
      credentialId: credentialRef,
      applicationRef: 'agentic-economy',
      environment: 'sandbox' as const,
      scopes: ['market_supply:manage'],
      authorityMode: 'approve_each' as const,
    }
    const policy = {
      format: 'ae.agent-access-policy:v1' as const,
      operationAccess: 'all_admitted' as const,
      environment: 'sandbox' as const,
      budget: {
        budgetPolicyRef: 'budget:money-agent-earnings',
        generation: 1,
        currency: 'USD',
        exponent: 2,
        maximumSpendPerInvocation: {
          currency: 'USD',
          units: '1000',
          exponent: 2,
        },
        maximumDailySpend: {
          currency: 'USD',
          units: '10000',
          exponent: 2,
        },
        maximumMonthlySpend: {
          currency: 'USD',
          units: '100000',
          exponent: 2,
        },
        maximumConcurrentInvocations: 2,
      },
      rate: {
        ratePolicyRef: 'rate:money-agent-earnings',
        generation: 1,
        maximumCallsPerMinute: 10,
        maximumCallsPerHour: 100,
      },
    }
    await backend.run(async (ctx) => {
      await ctx.db.insert('principals', {
        principalRef: agentPrincipalRef,
        kind: 'agent',
        displayName: 'Canonical earnings agent',
        lifecycle: 'active',
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('agentAccessPrincipals', {
        ...principal,
        grantGeneration: 1,
        policyDigest,
        lifecycle: 'active',
        expiresAt: 8_000_000_000_000,
        recordedAt: 1,
        lastSeenAt: 1,
      })
      await ctx.db.insert('agentAccessGrants', {
        format: 'ae.agent-access-grant:v1',
        grantRef,
        principalId: principal.principalId,
        ownerId: principal.ownerId,
        credentialId: principal.credentialId,
        applicationRef: principal.applicationRef,
        environment: principal.environment,
        authorityMode: principal.authorityMode,
        operationAccess: 'all_admitted',
        policy,
        budgetPolicyRef: policy.budget.budgetPolicyRef,
        ratePolicyRef: policy.rate.ratePolicyRef,
        lifecycle: 'active',
        generation: 1,
        policyDigest,
        createdAt: 1,
        updatedAt: 1,
        expiresAt: 8_000_000_000_000,
      })
    })
    const args = await withSourceWrite('catalog_publish', {
      agentPrincipal: principal,
      operationKey: 'moneyLedger:readAgentProviderEarnings',
      correlationId: 'money-agent-earnings:canonical',
    })

    await expect(
      backend.mutation(api.moneyLedger.readAgentProviderEarnings, args),
    ).resolves.toEqual({
      kind: 'available',
      businessId: String(fixture.businessId),
      accounts: [],
      accountsTruncated: false,
    })
  })
})
