import { api } from '../../../convex/_generated/api'
import { verifySupplyAgentPrincipal } from '../../../convex/agentAccessPrincipals'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import { accountRefForOwner } from '../../../src/modules/money/public'
import {
  convexTestWithMarketComponents,
  convexModules,
  publishedBusinessOwner,
} from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'
import schema from '../../../convex/schema'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

describe('money ledger canonical authority', () => {
  it('consumes strict proof while advancing one payout authority generation', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'money-payout-authority-update')
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyPayoutAccounts', {
        businessId: String(fixture.businessId),
        currency: 'USD',
        exponent: 2,
        stripeAccountId: 'acct_authority_update',
        state: 'ready',
        detailsSubmitted: true,
        recipientCapabilityActive: true,
        requirementsDigest: 'sha256:requirements',
        version: 1,
        createdAt: 1,
        updatedAt: 1,
      })
    })
    const base = {
      businessId: String(fixture.businessId),
      currency: 'USD',
      stripeAccountId: 'acct_authority_update',
      expectedAccountVersion: 1,
      commandRef: 'payout-authority-update:one',
      idempotencyKey: 'payout-authority-update:one',
      operationKey: 'moneyLedger:authorizeConnectOnboarding',
      correlationId: 'payout-authority-update:one',
    } as const
    await expect(fixture.owner.mutation(
      api.moneyLedger.authorizeConnectOnboarding,
      await withSourceWrite('billing', base),
    )).resolves.toEqual({
      kind: 'refused',
      code: 'reauthentication_required',
      retryable: false,
    })
    const proof = {
      reverificationId: 'reverification:payout-authority:update:one',
      firstFactorAgeMinutes: 0,
      secondFactorAgeMinutes: -1,
    } as const
    const admitted = await withSourceWrite('billing', { ...base, proof })
    await expect(fixture.owner.mutation(
      api.moneyLedger.authorizeConnectOnboarding,
      admitted,
    )).resolves.toMatchObject({
      kind: 'accepted',
      account: { stripeAccountId: 'acct_authority_update', version: 2 },
    })
    await expect(fixture.owner.mutation(
      api.moneyLedger.authorizeConnectOnboarding,
      await withSourceWrite('billing', { ...base, proof }),
    )).resolves.toMatchObject({ kind: 'accepted', account: { version: 2 } })
    await expect(fixture.owner.mutation(
      api.moneyLedger.authorizeConnectOnboarding,
      await withSourceWrite('billing', {
        ...base,
        commandRef: 'payout-authority-update:changed',
        idempotencyKey: 'payout-authority-update:changed',
        correlationId: 'payout-authority-update:changed',
        proof,
      }),
    )).resolves.toEqual({
      kind: 'refused',
      code: 'command_changed',
      retryable: false,
    })
    await expect(backend.run(async (ctx) => ({
      account: await ctx.db.query('moneyPayoutAccounts')
        .withIndex('by_businessId_and_currency', (query) => query
          .eq('businessId', String(fixture.businessId))
          .eq('currency', 'USD'))
        .unique(),
      proofs: await ctx.db.query('consequenceProofUses').collect(),
      audits: await ctx.db.query('auditEvents').collect(),
    }))).resolves.toMatchObject({
      account: { version: 2 },
      proofs: [expect.objectContaining({ reverificationId: proof.reverificationId })],
      audits: [expect.objectContaining({
        eventType: 'consequence.proof_consumed',
        activeAccountRef: fixture.canonicalAccountRef,
        sourceSystem: 'ae_recorded',
        targetType: 'consequence_command',
      })],
    })
  })

  it('consumes one strict proof before reserving one exact payout authority command', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'money-payout-authority')
    const base = {
      businessId: String(fixture.businessId),
      currency: 'USD',
      exponent: 2,
      idempotencyKey: 'connect:payout-authority:one',
      commandRef: 'connect-command:payout-authority:one',
      inputDigest: 'sha256:connect-input-one',
      providerRequestDigest: 'sha256:connect-provider-one',
      recoveryLeaseOwner: 'connect-lease:one',
      operationKey: 'moneyLedger:reserveConnectAccount',
      correlationId: 'connect-command:payout-authority:one',
    } as const
    const withoutProof = await withSourceWrite('billing', base)
    await expect(
      fixture.owner.mutation(api.moneyLedger.reserveConnectAccount, withoutProof),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'reauthentication_required',
      retryable: false,
    })
    await expect(backend.run(async (ctx) => ({
      commands: await ctx.db.query('moneyConnectAccountCommands').collect(),
      proofs: await ctx.db.query('consequenceProofUses').collect(),
    }))).resolves.toEqual({ commands: [], proofs: [] })

    const proof = {
      reverificationId: 'reverification:payout-authority:one',
      firstFactorAgeMinutes: 0,
      secondFactorAgeMinutes: -1,
    } as const
    const admitted = await withSourceWrite('billing', { ...base, proof })
    await expect(
      fixture.owner.mutation(api.moneyLedger.reserveConnectAccount, admitted),
    ).resolves.toMatchObject({
      kind: 'accepted',
      execute: true,
      command: { state: 'pending', commandRef: base.commandRef },
    })
    await backend.run(async (ctx) => {
      const command = await ctx.db
        .query('moneyConnectAccountCommands')
        .withIndex('by_commandRef', (q) => q.eq('commandRef', base.commandRef))
        .unique()
      expect(command).not.toBeNull()
      if (command !== null) {
        await ctx.db.patch(command._id, {
          state: 'failed',
          failureCode: 'provider_unavailable',
          failureRetryable: true,
        })
      }
    })

    const changed = await withSourceWrite('billing', {
      ...base,
      commandRef: 'connect-command:payout-authority:changed',
      idempotencyKey: 'connect:payout-authority:changed',
      correlationId: 'connect-command:payout-authority:changed',
      proof,
    })
    await expect(
      fixture.owner.mutation(api.moneyLedger.reserveConnectAccount, changed),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'command_changed',
      retryable: false,
    })
    await expect(backend.run(async (ctx) => ({
      commands: await ctx.db.query('moneyConnectAccountCommands').collect(),
      proofs: await ctx.db.query('consequenceProofUses').collect(),
    }))).resolves.toMatchObject({
      commands: [expect.objectContaining({ commandRef: base.commandRef })],
      proofs: [expect.objectContaining({ reverificationId: proof.reverificationId })],
    })
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
    const policyDigest = canonicalDigest(policy)
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
      backend.run(async (ctx) => await verifySupplyAgentPrincipal(ctx, principal)),
    ).resolves.toMatchObject({ kind: 'allowed', ownerId: fixture.canonicalAccountRef })

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
