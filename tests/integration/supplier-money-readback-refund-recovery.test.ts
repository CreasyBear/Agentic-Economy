import {
  createSupplierMoneyOwner,
  readOwnerProviderEarnings,
  withBillingIdentity,
} from './supplier-money-readback-harness'
import type { Doc } from '../../convex/_generated/dataModel'
import { describe, expect, it } from 'vitest'
import { internal } from '../../convex/_generated/api'
import { recordQualifiedUsePayoutAllocation } from '../../convex/moneyQualifiedUsePayout'
import {
  accountRefForOwner,
  accountRefForExternalLoss,
  accountRefForRake,
  qualifiedUseMaterialDigest,
  qualifiedUseRef,
} from '@/modules/money/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

describe('supplier money readback refund recovery', () => {
  it('does not materialize a payout from a released charge until Qualified Use, then replays and applies a refund', async () => {
    const { backend, owner, businessRef, providerAccountRef } =
      await createSupplierMoneyOwner('supplier-earnings')
    const ownerAccountId = 'user_supplier-earnings'
    const principalId = `prn_${'1'.repeat(32)}`
    const authorityOwnerPrincipalRef = `prn_${'2'.repeat(32)}`
    const authorityAccountRef = `acc_${'3'.repeat(32)}`
    const authorityOwnershipRef = `own_${'4'.repeat(32)}`
    const authorityMembershipRef = `mem_${'5'.repeat(32)}`
    const authorityGrantRef = `grt_${'6'.repeat(32)}`
    const authorityGrantGeneration = 1
    const authorityExpiresAt = 8_000_000_000_000_000
    const authorityOperationRef = `operation:${businessRef}`
    const authorityInvocationRef = `invocation:${businessRef}`
    const credentialId = `credential:${businessRef}`
    const transactionRef = `transaction:${businessRef}:charge`
    const billing = withBillingIdentity(backend, principalId)

    await backend.run(async (ctx) => {
      await ctx.db.insert('principals', {
        principalRef: authorityOwnerPrincipalRef,
        kind: 'human',
        displayName: 'Supplier authority owner',
        lifecycle: 'active',
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('principals', {
        principalRef: principalId,
        kind: 'agent',
        displayName: 'Supplier authority agent',
        lifecycle: 'active',
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('accounts', {
        accountRef: authorityAccountRef,
        displayName: 'Supplier authority Account',
        lifecycle: 'active',
        recoveryPolicy: { kind: 'no_transfer', revision: 1 },
        creationActorPrincipalRef: authorityOwnerPrincipalRef,
        creationIdempotencyRef: `create:${authorityAccountRef}`,
        initialOwnershipRef: authorityOwnershipRef,
        currentOwnershipRef: authorityOwnershipRef,
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
        lastAction: {
          actorPrincipalRef: authorityOwnerPrincipalRef,
          activeAccountRef: authorityAccountRef,
          correlationRef: `create:${authorityAccountRef}`,
          idempotencyRef: `create:${authorityAccountRef}`,
        },
      })
      await ctx.db.insert('accountOwnerships', {
        ownershipRef: authorityOwnershipRef,
        accountRef: authorityAccountRef,
        ownerPrincipalRef: authorityOwnerPrincipalRef,
        lifecycle: 'active',
        changeKind: 'creation',
        revision: 1,
        createdAt: 1,
        createdBy: {
          actorPrincipalRef: authorityOwnerPrincipalRef,
          activeAccountRef: authorityAccountRef,
          correlationRef: `create:${authorityOwnershipRef}`,
          idempotencyRef: `create:${authorityOwnershipRef}`,
        },
      })
      await ctx.db.insert('memberships', {
        membershipRef: authorityMembershipRef,
        accountRef: authorityAccountRef,
        memberPrincipalRef: principalId,
        lifecycle: 'active',
        revision: 1,
        createdAt: 1,
        createdBy: {
          actorPrincipalRef: authorityOwnerPrincipalRef,
          activeAccountRef: authorityAccountRef,
          correlationRef: `create:${authorityMembershipRef}`,
          idempotencyRef: `create:${authorityMembershipRef}`,
        },
      })
      await ctx.db.insert('authorityDelegationGrants', {
        grantRef: authorityGrantRef,
        accountRef: authorityAccountRef,
        actorPrincipalRef: principalId,
        subjectPrincipalRef: principalId,
        scopes: ['market.operations.invoke'],
        resourceRefs: [authorityOperationRef],
        budgetLimit: 1_000,
        budgetUsed: 1,
        expiresAt: authorityExpiresAt,
        generation: authorityGrantGeneration,
        revision: 1,
        lifecycle: 'active',
        createdAt: 1,
        createdBy: {
          actorPrincipalRef: principalId,
          activeAccountRef: authorityAccountRef,
          correlationRef: `create:${authorityGrantRef}`,
          idempotencyRef: `create:${authorityGrantRef}`,
        },
      })
      await ctx.db.insert('capabilityOperationInvocations', {
        invocationRef: authorityInvocationRef,
        principalId,
        ownerId: ownerAccountId,
        credentialId,
        applicationRef: `application:${businessRef}`,
        operationRef: authorityOperationRef,
        idempotencyKey: `invoke:${authorityInvocationRef}`,
        environment: 'production',
        grantRef: authorityGrantRef,
        grantGeneration: authorityGrantGeneration,
        policyDigest: 'sha256:supplier-authority-policy',
        grantExpiresAt: authorityExpiresAt,
        inputDigest: 'sha256:supplier-authority-input',
        requestDigest: 'sha256:supplier-authority-request',
        state: 'completed',
        createdAt: 1,
        updatedAt: 1,
      })
      const account = (
        row: Pick<
          Doc<'moneyAccounts'>,
          | 'accountRef'
          | 'accountKind'
          | 'accountId'
          | 'businessId'
          | 'balanceUnits'
        >,
      ): Promise<unknown> =>
        ctx.db.insert('moneyAccounts', {
          currency: 'USD',
          exponent: 2,
          heldUnits: '0',
          recoveryDueUnits: '0',
          version: 1,
          state: 'active',
          createdAt: 1,
          updatedAt: 1,
          ...row,
        })
      await account({
        accountRef: accountRefForOwner(ownerAccountId, 'USD'),
        accountKind: 'operator_credit',
        accountId: ownerAccountId,
        balanceUnits: '0',
      })
      await account({
        accountRef: providerAccountRef,
        accountKind: 'provider_earnings',
        businessId: businessRef,
        balanceUnits: '900',
      })
      await account({
        accountRef: accountRefForRake('USD'),
        accountKind: 'ae_rake',
        balanceUnits: '100',
      })
      await ctx.db.insert('moneyPayoutAccounts', {
        businessId: businessRef,
        currency: 'USD',
        exponent: 2,
        stripeAccountId: `acct_${businessRef}`,
        state: 'ready',
        detailsSubmitted: true,
        recipientCapabilityActive: true,
        requirementsDigest: 'sha256:requirements',
        createdAt: 1,
        updatedAt: 1,
      })
      const budget = (
        windowKind: 'day' | 'month' | 'concurrency',
        windowStart: string,
        reservedUnits: string,
        reservedCount: number,
      ): Promise<unknown> =>
        ctx.db.insert('moneyCredentialBudgetStates', {
          principalId,
          credentialId,
          accountId: ownerAccountId,
          budgetPolicyRef: `budget:${businessRef}`,
          environment: 'production',
          generation: 1,
          windowKind,
          windowStart,
          currency: 'USD',
          exponent: 2,
          settledUnits: '0',
          reservedUnits,
          reservedCount,
          version: 1,
          updatedAt: 1,
        })
      await budget('day', '1970-01-01', '1000', 0)
      await budget('month', '1970-01', '1000', 0)
      await budget('concurrency', 'all', '0', 1)
      await ctx.db.insert('moneyTransactions', {
        transactionRef,
        kind: 'charge',
        idempotencyKey: transactionRef,
        inputDigest: 'sha256:input',
        accountId: ownerAccountId,
        principalId,
        currency: 'USD',
        credentialId,
        budgetPolicyRef: `budget:${businessRef}`,
        budgetGeneration: 1,
        budgetEnvironment: 'production',
        budgetDayStart: '1970-01-01',
        budgetMonthStart: '1970-01',
        budgetState: 'reserved',
        amountUnits: '1000',
        exponent: 2,
        state: 'outcome_unknown',
        expectedAccountVersion: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      const entry = (
        row: Pick<
          Doc<'moneyLedgerEntries'>,
          | 'entryRef'
          | 'accountRef'
          | 'entryType'
          | 'direction'
          | 'amountUnits'
          | 'principalId'
          | 'businessId'
          | 'invocationRef'
          | 'attemptRef'
        >,
      ): Promise<unknown> =>
        ctx.db.insert('moneyLedgerEntries', {
          transactionRef,
          idempotencyKey: transactionRef,
          sourceDigest: 'sha256:source',
          evidenceRefs: ['evidence:charge'],
          currency: 'USD',
          exponent: 2,
          createdAt: 1,
          ...row,
        })
      await entry({
        entryRef: `${transactionRef}:charge`,
        accountRef: accountRefForOwner(ownerAccountId, 'USD'),
        entryType: 'charge',
        direction: 'debit',
        amountUnits: '1000',
        principalId,
        invocationRef: authorityInvocationRef,
        attemptRef: `attempt:${businessRef}`,
      })
      await entry({
        entryRef: `${transactionRef}:provider`,
        accountRef: providerAccountRef,
        entryType: 'payout_accrual',
        direction: 'credit',
        amountUnits: '900',
        businessId: businessRef,
        invocationRef: authorityInvocationRef,
        attemptRef: `attempt:${businessRef}`,
      })
      await entry({
        entryRef: `${transactionRef}:rake`,
        accountRef: accountRefForRake('USD'),
        entryType: 'rake',
        direction: 'credit',
        amountUnits: '100',
        businessId: businessRef,
      })
      await ctx.db.insert('moneyUsageEvents', {
        usageRef: `usage:${businessRef}`,
        principalId,
        credentialId,
        currency: 'USD',
        accountId: ownerAccountId,
        exponent: 2,
        serviceRef: `service:${businessRef}`,
        offeringRef: `offering:${businessRef}`,
        businessId: businessRef,
        invocationRef: authorityInvocationRef,
        attemptRef: `attempt:${businessRef}`,
        operationKey: authorityOperationRef,
        priceDigest: 'sha256:price',
        chargeState: 'paid',
        amountUnits: '1000',
        transactionRef,
        observedAt: 1,
      })
    })

    const reconcile = {
      principalId,
      transactionRef,
      refundTransactionRef: `${transactionRef}:refund`,
      refundIdempotencyKey: `${transactionRef}:refund`,
      refundInputDigest: 'sha256:refund-input',
      sourceDigest: 'sha256:source',
      evidenceRefs: ['evidence:charge'],
      observedAt: 2,
    }
    await expect(
      billing.mutation(internal.moneyLedger.reconcileCharge, {
        ...reconcile,
        outcome: 'released',
      }),
    ).resolves.toMatchObject({ kind: 'accepted', outcome: 'released' })

    const first = await owner.query(readOwnerProviderEarnings, {})
    expect(first).toMatchObject({
      kind: 'available',
      businessId: businessRef,
      accounts: [
        {
          currency: 'USD',
          earnings: {
            kind: 'ok',
            grossAccrual: { currency: 'USD', units: '1000', exponent: 2 },
            rake: { currency: 'USD', units: '100', exponent: 2 },
            providerNet: { currency: 'USD', units: '900', exponent: 2 },
            paidOut: { currency: 'USD', units: '0', exponent: 2 },
            held: { currency: 'USD', units: '900', exponent: 2 },
          },
          payout: {
            kind: 'ok',
            accountState: 'ready',
            providerNet: { currency: 'USD', units: '0', exponent: 2 },
            minimumPayout: { currency: 'USD', units: '0', exponent: 2 },
          },
        },
      ],
      accountsTruncated: false,
    })
    if (first.kind !== 'available')
      throw new Error('owner earnings unavailable after release')
    const firstPayout = first.accounts[0]?.payout
    if (firstPayout === undefined) throw new Error('payout readback missing')
    expect(firstPayout).not.toHaveProperty('payoutState')
    expect(firstPayout).not.toHaveProperty('payoutRef')
    expect(firstPayout).not.toHaveProperty('idempotencyKey')
    const qualifiedIdentity = {
      invocationRef: authorityInvocationRef,
      attemptRef: `attempt:${businessRef}`,
      effectGeneration: 1,
    }
    const qualifiedMaterial = {
      ...qualifiedIdentity,
      businessId: businessRef,
      operationRef: authorityOperationRef,
      publicationRef: `publication:${businessRef}`,
      publicationRevision: 1,
      contractDigest: 'sha256:contract',
      bindingDigest: 'sha256:binding',
      principalClass: 'agent_key' as const,
      requestDigest: 'sha256:request',
      responseDigest: 'sha256:response',
      evidenceRefs: ['evidence:qualified'],
    }
    const qualifiedRef = qualifiedUseRef(qualifiedIdentity)
    const materialDigest = qualifiedUseMaterialDigest(qualifiedMaterial)
    const qualifiedReceipt = {
      qualifiedUseRef: qualifiedRef,
      materialDigest,
      ...qualifiedMaterial,
      environment: 'production' as const,
      qualifiedAt: 2,
      usageRef: `usage:${businessRef}`,
      transactionRef,
    }
    const payoutRef = await backend.run(async (ctx) => {
      await recordQualifiedUsePayoutAllocation(ctx, qualifiedReceipt, principalId)
      await ctx.db.insert('qualifiedUseReceipts', {
        ...qualifiedReceipt,
        owningAccountRef: authorityAccountRef,
        authorityPrincipalRef: principalId,
        authorityGrantRef,
        authorityGrantGeneration,
        authorityResourceRef: authorityOperationRef,
      })
      const payouts = await ctx.db
        .query('moneyPayouts')
        .withIndex('by_businessId_and_currency_and_updatedAt', (q) =>
          q.eq('businessId', businessRef).eq('currency', 'USD'),
        )
        .order('desc')
        .take(1)
      const dailyPayout = payouts[0]
      if (dailyPayout === undefined) throw new Error('daily payout missing')
      return dailyPayout.payoutRef
    })
    await backend.run(async (ctx) => {
      const providerAccount = await ctx.db
        .query('moneyAccounts')
        .withIndex('by_accountRef', (q) => q.eq('accountRef', providerAccountRef))
        .unique()
      const payout = await ctx.db
        .query('moneyPayouts')
        .withIndex('by_payoutRef', (q) => q.eq('payoutRef', payoutRef))
        .unique()
      if (providerAccount === null || payout === null)
        throw new Error('dispute fixture missing')
      await ctx.db.patch(providerAccount._id, {
        balanceUnits: '0',
        version: providerAccount.version + 1,
      })
      await ctx.db.insert('moneyTransactions', {
        transactionRef: `payout:${businessRef}`,
        kind: 'payout_accrual',
        idempotencyKey: `payout:${businessRef}`,
        inputDigest: 'sha256:payout-input',
        principalId: `business:${businessRef}`,
        currency: 'USD',
        amountUnits: '900',
        exponent: 2,
        state: 'applied',
        expectedAccountVersion: providerAccount.version,
        externalRef: payoutRef,
        createdAt: 3,
        updatedAt: 3,
      })
      await ctx.db.insert('moneyLedgerEntries', {
        entryRef: `payout:${businessRef}:entry`,
        accountRef: providerAccountRef,
        entryType: 'payout_accrual',
        direction: 'debit',
        amountUnits: '900',
        currency: 'USD',
        exponent: 2,
        transactionRef: `payout:${businessRef}`,
        idempotencyKey: `payout:${businessRef}`,
        businessId: businessRef,
        sourceDigest: 'sha256:payout',
        evidenceRefs: ['evidence:payout'],
        createdAt: 3,
      })
      await ctx.db.patch(payout._id, {
        state: 'paid',
        providerHeldBeforeUnits: '900',
        providerHeldAfterUnits: '0',
        providerPaidBeforeUnits: '0',
        providerPaidAfterUnits: '900',
        updatedAt: 3,
      })
    })
    const receiptBefore = await backend.run(async (ctx) =>
      await ctx.db.query('qualifiedUseReceipts').withIndex('by_qualifiedUseRef', (q) => q.eq('qualifiedUseRef', qualifiedRef)).unique(),
    )
    const dispute = {
      qualifiedUseRef: qualifiedRef,
      disputeRef: `dispute:${businessRef}`,
      sourceDigest: 'sha256:dispute-source',
      evidenceRefs: ['evidence:dispute'],
      observedAt: 4,
    }
    await expect(
      backend.mutation(internal.moneyLedger.reverseDisputedQualifiedUse, dispute),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transactionRef: `qualified-use-dispute-refund:${qualifiedRef}`,
    })
    const receiptAfter = await backend.run(async (ctx) =>
      await ctx.db.query('qualifiedUseReceipts').withIndex('by_qualifiedUseRef', (q) => q.eq('qualifiedUseRef', qualifiedRef)).unique(),
    )
    expect(receiptAfter).toEqual(receiptBefore)

    const beforeReplay = await backend.run(async (ctx) => ({
      refunds: await ctx.db.query('moneyTransactions').withIndex('by_reversalOf', (q) => q.eq('reversalOf', transactionRef)).take(2),
      entries: await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', `qualified-use-dispute-refund:${qualifiedRef}`)).take(4),
      provider: await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', providerAccountRef)).unique(),
    }))
    expect(beforeReplay.entries).toHaveLength(3)
    const disputeReplay = await backend.mutation(internal.moneyLedger.reverseDisputedQualifiedUse, dispute)
    expect(disputeReplay).toEqual({
      kind: 'accepted',
      transactionRef: `qualified-use-dispute-refund:${qualifiedRef}`,
      currency: 'USD',
    })
    const afterReplay = await backend.run(async (ctx) => ({
      refunds: await ctx.db.query('moneyTransactions').withIndex('by_reversalOf', (q) => q.eq('reversalOf', transactionRef)).take(2),
      entries: await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', `qualified-use-dispute-refund:${qualifiedRef}`)).take(4),
      provider: await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', providerAccountRef)).unique(),
    }))
    expect(afterReplay.entries).toHaveLength(3)
    expect(afterReplay).toEqual(beforeReplay)
    await expect(
      backend.mutation(internal.moneyLedger.reverseDisputedQualifiedUse, {
        ...dispute,
        sourceDigest: 'sha256:changed',
      }),
    ).resolves.toMatchObject({ kind: 'refused', code: 'ledger_idempotency_conflict' })
    const refunded = await owner.query(readOwnerProviderEarnings, {})
    expect(refunded).toMatchObject({
      kind: 'available',
      accounts: [
        {
          earnings: {
            providerNet: { currency: 'USD', units: '0', exponent: 2 },
            paidOut: { currency: 'USD', units: '900', exponent: 2 },
            held: { currency: 'USD', units: '0', exponent: 2 },
            recoveryDue: { currency: 'USD', units: '900', exponent: 2 },
          },
          payout: {
            payoutRef,
            providerNet: { currency: 'USD', units: '900', exponent: 2 },
          },
        },
      ],
    })
    const laterObservedAt = Date.UTC(1970, 1, 5)
    const insertRecoveryCharge = async (
      suffix: string,
      providerUnits: string,
      recoveryUnits: string,
    ): Promise<string> => {
      const ref = `transaction:${businessRef}:recovery:${suffix}`
      const invocation = `invocation:${businessRef}:recovery:${suffix}`
      const attempt = `attempt:${businessRef}:recovery:${suffix}`
      const operationKey = `operation:${businessRef}:recovery:${suffix}`
      await backend.run(async (ctx) => {
        await ctx.db.insert('moneyTransactions', {
          transactionRef: ref,
          kind: 'charge',
          idempotencyKey: ref,
          accountId: ownerAccountId,
          inputDigest: `sha256:recovery-input:${suffix}`,
          principalId,
          credentialId,
          budgetPolicyRef: `budget:${businessRef}`,
          budgetGeneration: 1,
          budgetEnvironment: 'production',
          budgetDayStart: '1970-02-05',
          budgetMonthStart: '1970-02',
          budgetState: 'reserved',
          currency: 'USD',
          amountUnits: '700',
          exponent: 2,
          state: 'outcome_unknown',
          expectedAccountVersion: 1,
          createdAt: laterObservedAt,
          updatedAt: laterObservedAt,
        })
        const entry = (
          row: Pick<
            Doc<'moneyLedgerEntries'>,
            | 'entryRef'
            | 'accountRef'
            | 'entryType'
            | 'direction'
            | 'amountUnits'
            | 'principalId'
            | 'businessId'
            | 'invocationRef'
            | 'attemptRef'
          >,
        ): Promise<unknown> =>
          ctx.db.insert('moneyLedgerEntries', {
            transactionRef: ref,
            idempotencyKey: ref,
            sourceDigest: 'sha256:recovery-source',
            evidenceRefs: ['evidence:recovery-charge'],
            currency: 'USD',
            exponent: 2,
            createdAt: laterObservedAt,
            ...row,
          })
        await entry({
          entryRef: `${ref}:charge`,
          accountRef: accountRefForOwner(ownerAccountId, 'USD'),
          entryType: 'charge',
          direction: 'debit',
          amountUnits: '700',
          principalId,
          invocationRef: invocation,
          attemptRef: attempt,
        })
        await entry({
          entryRef: `${ref}:provider`,
          accountRef: providerAccountRef,
          entryType: 'payout_accrual',
          direction: 'credit',
          amountUnits: providerUnits,
          businessId: businessRef,
          invocationRef: invocation,
          attemptRef: attempt,
        })
        await entry({
          entryRef: `${ref}:rake`,
          accountRef: accountRefForRake('USD'),
          entryType: 'rake',
          direction: 'credit',
          amountUnits: '100',
          businessId: businessRef,
        })
        await entry({
          entryRef: `${ref}:provider-recovery`,
          accountRef: providerAccountRef,
          entryType: 'payout_accrual',
          direction: 'debit',
          amountUnits: recoveryUnits,
          businessId: businessRef,
          invocationRef: invocation,
          attemptRef: attempt,
        })
        await ctx.db.insert('moneyUsageEvents', {
          usageRef: `${invocation}:${attempt}:${operationKey}`,
          principalId,
          credentialId,
          currency: 'USD',
          accountId: ownerAccountId,
          exponent: 2,
          serviceRef: `service:${businessRef}`,
          offeringRef: `offering:${businessRef}`,
          businessId: businessRef,
          invocationRef: invocation,
          attemptRef: attempt,
          operationKey,
          priceDigest: 'sha256:recovery-price',
          chargeState: 'paid',
          amountUnits: '700',
          transactionRef: ref,
          observedAt: laterObservedAt,
        })
      })
      return ref
    }
    const recoveryChargeA = await insertRecoveryCharge('a', '600', '600')
    const recoveryChargeB = await insertRecoveryCharge('b', '600', '300')
    await backend.run(async (ctx) => {
      const provider = await ctx.db
        .query('moneyAccounts')
        .withIndex('by_accountRef', (q) => q.eq('accountRef', providerAccountRef))
        .unique()
      const rake = await ctx.db
        .query('moneyAccounts')
        .withIndex('by_accountRef', (q) => q.eq('accountRef', accountRefForRake('USD')))
        .unique()
      if (provider === null || rake === null) throw new Error('recovery accounts missing')
      await ctx.db.patch(provider._id, {
        balanceUnits: '300',
        recoveryDueUnits: '0',
        version: provider.version + 1,
        updatedAt: laterObservedAt,
      })
      await ctx.db.patch(rake._id, {
        balanceUnits: '200',
        version: rake.version + 1,
        updatedAt: laterObservedAt,
      })
      const concurrency = await ctx.db
        .query('moneyCredentialBudgetStates')
        .withIndex('by_principal_credential_env_generation_window', (q) =>
          q
            .eq('principalId', principalId)
            .eq('credentialId', credentialId)
            .eq('environment', 'production')
            .eq('generation', 1)
            .eq('windowKind', 'concurrency')
            .eq('windowStart', 'all'),
        )
        .unique()
      if (concurrency === null) throw new Error('recovery budget missing')
      await ctx.db.patch(concurrency._id, {
        reservedCount: 2,
        updatedAt: laterObservedAt,
      })
      const recoveryBudget = (
        windowKind: 'day' | 'month',
        windowStart: string,
      ): Promise<unknown> =>
        ctx.db.insert('moneyCredentialBudgetStates', {
          principalId,
          credentialId,
          accountId: ownerAccountId,
          budgetPolicyRef: `budget:${businessRef}`,
          environment: 'production',
          generation: 1,
          windowKind,
          windowStart,
          currency: 'USD',
          exponent: 2,
          settledUnits: '0',
          reservedUnits: '1400',
          reservedCount: 0,
          version: 1,
          updatedAt: laterObservedAt,
        })
      await recoveryBudget('day', '1970-02-05')
      await recoveryBudget('month', '1970-02')
    })
    const recoveryEvidence = {
      sourceDigest: 'sha256:recovery-source',
      evidenceRefs: ['evidence:recovery-charge'],
    }
    const releaseArgs = (ref: string) => ({
      principalId,
      transactionRef: ref,
      outcome: 'released' as const,
      refundTransactionRef: `${ref}:refund`,
      refundIdempotencyKey: `${ref}:refund`,
      refundInputDigest: `sha256:refund:${ref}`,
      ...recoveryEvidence,
      observedAt: laterObservedAt,
    })
    await expect(
      billing.mutation(internal.moneyLedger.reconcileCharge, releaseArgs(recoveryChargeA)),
    ).resolves.toMatchObject({ kind: 'accepted', outcome: 'released' })
    await expect(
      billing.mutation(internal.moneyLedger.reconcileCharge, releaseArgs(recoveryChargeB)),
    ).resolves.toMatchObject({ kind: 'accepted', outcome: 'released' })
    const recoveryEntries = await backend.run(async (ctx) => ({
      a: await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) => q.eq('transactionRef', recoveryChargeA))
        .take(5),
      b: await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) => q.eq('transactionRef', recoveryChargeB))
        .take(5),
      periods: await ctx.db
        .query('moneyPayouts')
        .withIndex('by_businessId_and_currency_and_updatedAt', (q) =>
          q.eq('businessId', businessRef).eq('currency', 'USD'),
        )
        .order('desc')
        .take(4),
    }))
    expect(recoveryEntries.a).toHaveLength(4)
    expect(recoveryEntries.b).toHaveLength(4)
    expect(
      recoveryEntries.a.filter(
        (entry) =>
          entry.entryType === 'payout_accrual' &&
          entry.direction === 'debit',
      ),
    ).toHaveLength(1)
    expect(
      recoveryEntries.b.filter(
        (entry) =>
          entry.entryType === 'payout_accrual' &&
          entry.direction === 'debit',
      ),
    ).toHaveLength(1)
    expect(recoveryEntries.periods).toHaveLength(1)
    const beforeRecoveryReplay = recoveryEntries.periods
    await expect(
      billing.mutation(internal.moneyLedger.reconcileCharge, releaseArgs(recoveryChargeA)),
    ).resolves.toEqual({
      kind: 'accepted',
      transactionRef: recoveryChargeA,
      outcome: 'released',
    })
    await expect(
      billing.mutation(internal.moneyLedger.reconcileCharge, releaseArgs(recoveryChargeB)),
    ).resolves.toEqual({
      kind: 'accepted',
      transactionRef: recoveryChargeB,
      outcome: 'released',
    })
    const afterRecoveryReplay = await backend.run(async (ctx) =>
      await ctx.db
        .query('moneyPayouts')
        .withIndex('by_businessId_and_currency_and_updatedAt', (q) =>
          q.eq('businessId', businessRef).eq('currency', 'USD'),
        )
        .order('desc')
        .take(4),
    )
    expect(afterRecoveryReplay).toEqual(beforeRecoveryReplay)
    const recoveryEarnings = await owner.query(readOwnerProviderEarnings, {})
    expect(recoveryEarnings).toMatchObject({
      kind: 'available',
      accounts: [
        {
          earnings: {
            providerNet: { currency: 'USD', units: '1200', exponent: 2 },
            paidOut: { currency: 'USD', units: '900', exponent: 2 },
            held: { currency: 'USD', units: '300', exponent: 2 },
            recoveryDue: { currency: 'USD', units: '0', exponent: 2 },
          },
        },
      ],
    })
    const replayRecoveryEntries = await backend.run(async (ctx) => ({
      a: await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) => q.eq('transactionRef', recoveryChargeA))
        .take(5),
      b: await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) => q.eq('transactionRef', recoveryChargeB))
        .take(5),
    }))
    expect(replayRecoveryEntries.a).toHaveLength(4)
    expect(replayRecoveryEntries.b).toHaveLength(4)
    expect(
      replayRecoveryEntries.a.filter(
        (entry) =>
          entry.entryType === 'payout_accrual' &&
          entry.direction === 'debit',
      ),
    ).toHaveLength(1)
    expect(
      replayRecoveryEntries.b.filter(
        (entry) =>
          entry.entryType === 'payout_accrual' &&
          entry.direction === 'debit',
      ),
    ).toHaveLength(1)
  })

  it('refunds a brokered external settlement while preserving payout evidence and Stripe ineligibility', async () => {
    const { backend, owner, businessRef, providerAccountRef } =
      await createSupplierMoneyOwner('supplier-brokered-dispute')
    const ownerAccountId = 'user_supplier-brokered-dispute'
    const principalId = `principal:${businessRef}`
    const credentialId = `credential:${businessRef}`
    const transactionRef = `transaction:${businessRef}:brokered-charge`
    const invocationRef = `invocation:${businessRef}:brokered`
    const attemptRef = `attempt:${businessRef}:brokered`
    const usageRef = `usage:${businessRef}:brokered`
    const qualifiedIdentity = { invocationRef, attemptRef, effectGeneration: 1 }
    const qualifiedMaterial = {
      ...qualifiedIdentity,
      businessId: businessRef,
      operationRef: `operation:${businessRef}:brokered`,
      publicationRef: `publication:${businessRef}:brokered`,
      publicationRevision: 1,
      contractDigest: 'sha256:brokered-contract',
      bindingDigest: 'sha256:brokered-binding',
      principalClass: 'agent_key' as const,
      requestDigest: 'sha256:brokered-request',
      responseDigest: 'sha256:brokered-response',
      evidenceRefs: ['evidence:brokered-qualified'],
    }
    const qualifiedRef = qualifiedUseRef(qualifiedIdentity)
    const materialDigest = qualifiedUseMaterialDigest(qualifiedMaterial)
    const externalRef = `x402:settlement:${businessRef}:brokered`
    const payoutIdentity = {
      format: 'money-brokered-external-payout:v1',
      chargeTransactionRef: transactionRef,
      externalRef,
    }
    const payoutRef = canonicalDigest(payoutIdentity)
    const payoutKey = canonicalDigest({
      ...payoutIdentity,
      format: 'money-brokered-external-payout-idempotency:v1',
    })
    const payoutSource = canonicalDigest({
      ...payoutIdentity,
      format: 'money-brokered-external-payout-source:v1',
    })
    const payoutEvidence = canonicalDigest({
      ...payoutIdentity,
      format: 'money-brokered-external-payout-evidence:v1',
    })
    const laterEarningRef = `transaction:${businessRef}:later-earning`
    const laterEarningInvocationRef = `invocation:${businessRef}:later-earning`
    const laterEarningAttemptRef = `attempt:${businessRef}:later-earning`
    await backend.run(async (ctx) => {
      const account = (
        row: Pick<
          Doc<'moneyAccounts'>,
          | 'accountRef'
          | 'accountKind'
          | 'accountId'
          | 'businessId'
          | 'balanceUnits'
        >,
      ): Promise<unknown> =>
        ctx.db.insert('moneyAccounts', {
          currency: 'USD',
          exponent: 2,
          heldUnits: '0',
          recoveryDueUnits: '0',
          version: 1,
          state: 'active',
          createdAt: 1,
          updatedAt: 1,
          ...row,
        })
      await account({
        accountRef: accountRefForOwner(ownerAccountId, 'USD'),
        accountKind: 'operator_credit',
        accountId: ownerAccountId,
        balanceUnits: '0',
      })
      await account({
        accountRef: providerAccountRef,
        accountKind: 'provider_earnings',
        businessId: businessRef,
        balanceUnits: '0',
        ...{ version: 2 },
      })
      await account({
        accountRef: accountRefForRake('USD'),
        accountKind: 'ae_rake',
        balanceUnits: '100',
      })
      await ctx.db.insert('moneyPayoutAccounts', {
        businessId: businessRef,
        currency: 'USD',
        exponent: 2,
        stripeAccountId: `acct_${businessRef}`,
        state: 'ready',
        detailsSubmitted: true,
        recipientCapabilityActive: true,
        requirementsDigest: 'sha256:brokered-requirements',
        createdAt: 1,
        updatedAt: 1,
      })
      const budget = (
        windowKind: 'day' | 'month' | 'concurrency',
        windowStart: string,
        settledUnits: string,
        reservedCount: number,
      ): Promise<unknown> =>
        ctx.db.insert('moneyCredentialBudgetStates', {
          principalId,
          credentialId,
          accountId: ownerAccountId,
          budgetPolicyRef: `budget:${businessRef}:brokered`,
          environment: 'production',
          generation: 1,
          windowKind,
          windowStart,
          currency: 'USD',
          exponent: 2,
          settledUnits,
          reservedUnits: '0',
          reservedCount,
          version: 1,
          updatedAt: 3,
        })
      await budget('day', '1970-01-01', '1000', 0)
      await budget('month', '1970-01', '1000', 0)
      await budget('concurrency', 'all', '0', 0)
      await ctx.db.insert('moneyTransactions', {
        transactionRef,
        kind: 'charge',
        idempotencyKey: transactionRef,
        inputDigest: 'sha256:brokered-input',
        accountId: ownerAccountId,
        principalId,
        currency: 'USD',
        credentialId,
        budgetPolicyRef: `budget:${businessRef}:brokered`,
        budgetGeneration: 1,
        budgetEnvironment: 'production',
        budgetDayStart: '1970-01-01',
        budgetMonthStart: '1970-01',
        budgetState: 'settled',
        amountUnits: '1000',
        exponent: 2,
        state: 'applied',
        expectedAccountVersion: 1,
        settledAt: 3,
        externalRef,
        createdAt: 1,
        updatedAt: 3,
      })
      const entry = (
        row: Pick<
          Doc<'moneyLedgerEntries'>,
          | 'entryRef'
          | 'accountRef'
          | 'entryType'
          | 'direction'
          | 'amountUnits'
          | 'principalId'
          | 'businessId'
          | 'invocationRef'
          | 'attemptRef'
        >,
      ): Promise<unknown> =>
        ctx.db.insert('moneyLedgerEntries', {
          transactionRef,
          idempotencyKey: transactionRef,
          sourceDigest: 'sha256:brokered-source',
          evidenceRefs: ['evidence:brokered-charge'],
          currency: 'USD',
          exponent: 2,
          createdAt: 1,
          ...row,
        })
      await entry({
        entryRef: `${transactionRef}:charge`,
        accountRef: accountRefForOwner(ownerAccountId, 'USD'),
        entryType: 'charge',
        direction: 'debit',
        amountUnits: '1000',
        principalId,
        invocationRef,
        attemptRef,
      })
      await entry({
        entryRef: `${transactionRef}:provider`,
        accountRef: providerAccountRef,
        entryType: 'payout_accrual',
        direction: 'credit',
        amountUnits: '900',
        businessId: businessRef,
        invocationRef,
        attemptRef,
      })
      await entry({
        entryRef: `${transactionRef}:rake`,
        accountRef: accountRefForRake('USD'),
        entryType: 'rake',
        direction: 'credit',
        amountUnits: '100',
        businessId: businessRef,
      })
      await ctx.db.insert('moneyUsageEvents', {
        usageRef,
        principalId,
        credentialId,
        currency: 'USD',
        accountId: ownerAccountId,
        exponent: 2,
        serviceRef: `service:${businessRef}:brokered`,
        offeringRef: `offering:${businessRef}:brokered`,
        businessId: businessRef,
        invocationRef,
        attemptRef,
        operationKey: qualifiedMaterial.operationRef,
        priceDigest: 'sha256:brokered-price',
        chargeState: 'paid',
        amountUnits: '1000',
        transactionRef,
        observedAt: 1,
      })
      await ctx.db.insert('qualifiedUseReceipts', {
        qualifiedUseRef: qualifiedRef,
        materialDigest,
        ...qualifiedMaterial,
        environment: 'production',
        qualifiedAt: 3,
        usageRef,
        transactionRef,
      })
      await ctx.db.insert('moneyTransactions', {
        transactionRef: payoutRef,
        kind: 'payout_accrual',
        idempotencyKey: payoutKey,
        inputDigest: payoutSource,
        principalId: `business:${businessRef}`,
        currency: 'USD',
        amountUnits: '900',
        exponent: 2,
        state: 'applied',
        expectedAccountVersion: 1,
        externalRef,
        createdAt: 3,
        updatedAt: 3,
      })
      await ctx.db.insert('moneyLedgerEntries', {
        entryRef: `${payoutRef}:external-settlement`,
        accountRef: providerAccountRef,
        entryType: 'payout_accrual',
        direction: 'debit',
        amountUnits: '900',
        currency: 'USD',
        exponent: 2,
        transactionRef: payoutRef,
        idempotencyKey: payoutKey,
        businessId: businessRef,
        sourceDigest: payoutSource,
        evidenceRefs: [payoutEvidence],
        createdAt: 3,
      })
      await ctx.db.insert('moneyTransactions', {
        transactionRef: laterEarningRef,
        kind: 'charge',
        idempotencyKey: laterEarningRef,
        inputDigest: 'sha256:later-earning-input',
        principalId: `principal:${businessRef}:later-earning`,
        currency: 'USD',
        amountUnits: '50',
        exponent: 2,
        state: 'applied',
        expectedAccountVersion: 2,
        budgetState: 'settled',
        settledAt: 4,
        createdAt: 4,
        updatedAt: 4,
      })
      await ctx.db.insert('moneyLedgerEntries', {
        entryRef: `${laterEarningRef}:provider`,
        accountRef: providerAccountRef,
        entryType: 'payout_accrual',
        direction: 'credit',
        amountUnits: '50',
        currency: 'USD',
        exponent: 2,
        transactionRef: laterEarningRef,
        idempotencyKey: laterEarningRef,
        businessId: businessRef,
        invocationRef: laterEarningInvocationRef,
        attemptRef: laterEarningAttemptRef,
        sourceDigest: 'sha256:later-earning-source',
        evidenceRefs: ['evidence:later-earning'],
        createdAt: 4,
      })
      const provider = await ctx.db
        .query('moneyAccounts')
        .withIndex('by_accountRef', (q) => q.eq('accountRef', providerAccountRef))
        .unique()
      if (provider === null) throw new Error('later earning provider missing')
      await ctx.db.patch(provider._id, {
        balanceUnits: '50',
        version: 3,
        updatedAt: 4,
      })
    })
    const dispute = {
      qualifiedUseRef: qualifiedRef,
      disputeRef: `dispute:${businessRef}:brokered`,
      sourceDigest: 'sha256:brokered-dispute-source',
      evidenceRefs: ['evidence:brokered-dispute'],
      observedAt: 4,
    }
    await expect(
      backend.mutation(internal.moneyLedger.reverseDisputedQualifiedUse, dispute),
    ).resolves.toMatchObject({ kind: 'accepted', currency: 'USD' })
    const readback = await owner.query(readOwnerProviderEarnings, {})
    expect(readback).toMatchObject({
      kind: 'available',
      accounts: [{
        earnings: {
          providerNet: { currency: 'USD', units: '950', exponent: 2 },
          rake: { currency: 'USD', units: '0', exponent: 2 },
          paidOut: { currency: 'USD', units: '900', exponent: 2 },
          held: { currency: 'USD', units: '50', exponent: 2 },
          recoveryDue: { currency: 'USD', units: '0', exponent: 2 },
        },
        payout: {
          accountState: 'ready',
          providerNet: { currency: 'USD', units: '0', exponent: 2 },
        },
      }],
    })
    const effects = await backend.run(async (ctx) => ({
      operator: await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', accountRefForOwner(ownerAccountId, 'USD'))).unique(),
      provider: await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', providerAccountRef)).unique(),
      rake: await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', accountRefForRake('USD'))).unique(),
      loss: await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', accountRefForExternalLoss('USD'))).unique(),
      charge: await ctx.db.query('moneyTransactions').withIndex('by_transactionRef', (q) => q.eq('transactionRef', transactionRef)).unique(),
      lossTransaction: await ctx.db.query('moneyTransactions').withIndex('by_transactionRef', (q) => q.eq('transactionRef', `qualified-use-dispute-loss:${qualifiedRef}`)).unique(),
      refunds: await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', `qualified-use-dispute-refund:${qualifiedRef}`)).take(3),
    }))
    expect(effects).toMatchObject({
      operator: { balanceUnits: '1000' },
      provider: { balanceUnits: '50', recoveryDueUnits: '0', version: 3 },
      rake: { balanceUnits: '0' },
      loss: { accountKind: 'ae_external_loss', balanceUnits: '900' },
      charge: { state: 'reversed', budgetState: 'released' },
      lossTransaction: { kind: 'external_loss', amountUnits: '900' },
    })
    expect(effects.refunds).toHaveLength(2)
    expect(effects.refunds).toEqual(expect.arrayContaining([
      expect.objectContaining({ entryType: 'refund', direction: 'credit', amountUnits: '1000' }),
      expect.objectContaining({ entryType: 'refund', direction: 'debit', amountUnits: '100' }),
    ]))
    const beforeReplay = await backend.run(async (ctx) => ({
      accounts: await ctx.db.query('moneyAccounts').take(10),
      budgets: await ctx.db.query('moneyCredentialBudgetStates').take(10),
      transactions: await ctx.db.query('moneyTransactions').take(10),
      entries: await ctx.db.query('moneyLedgerEntries').take(20),
      refunds: await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', `qualified-use-dispute-refund:${qualifiedRef}`)).take(3),
      payout: await ctx.db.query('moneyTransactions').withIndex('by_transactionRef', (q) => q.eq('transactionRef', payoutRef)).unique(),
    }))
    await expect(
      backend.mutation(internal.moneyLedger.reverseDisputedQualifiedUse, dispute),
    ).resolves.toMatchObject({ kind: 'accepted', currency: 'USD' })
    await expect(backend.run(async (ctx) => ({
      accounts: await ctx.db.query('moneyAccounts').take(10),
      budgets: await ctx.db.query('moneyCredentialBudgetStates').take(10),
      transactions: await ctx.db.query('moneyTransactions').take(10),
      entries: await ctx.db.query('moneyLedgerEntries').take(20),
      refunds: await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', `qualified-use-dispute-refund:${qualifiedRef}`)).take(3),
      payout: await ctx.db.query('moneyTransactions').withIndex('by_transactionRef', (q) => q.eq('transactionRef', payoutRef)).unique(),
    }))).resolves.toEqual(beforeReplay)
    await expect(
      backend.mutation(internal.moneyLedger.reverseDisputedQualifiedUse, { ...dispute, sourceDigest: 'sha256:brokered-conflict' }),
    ).resolves.toMatchObject({ kind: 'refused', code: 'ledger_idempotency_conflict' })
  })
})
