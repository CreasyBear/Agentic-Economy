import type { MutationCtx } from '../_generated/server'

export async function resolveAndBindLegalCustomer(
  ctx: MutationCtx,
  accountRef: string,
  now: number,
): Promise<Readonly<
  | { kind: 'resolved'; legalCustomerRef: string }
  | { kind: 'refused'; code: 'legal_customer_unavailable' | 'legal_customer_rebinding_blocked' }
>> {
  const account = await ctx.db.query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', accountRef))
    .unique()
  if (account === null || account.lifecycle !== 'active') {
    return { kind: 'refused', code: 'legal_customer_unavailable' }
  }
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
    .unique()
  if (ownership === null
    || ownership.accountRef !== accountRef
    || ownership.lifecycle !== 'active') {
    return { kind: 'refused', code: 'legal_customer_unavailable' }
  }

  const binding = await ctx.db.query('moneyLegalCustomerBindings')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', accountRef))
    .unique()
  if (binding === null) {
    await ctx.db.insert('moneyLegalCustomerBindings', {
      accountRef,
      legalCustomerRef: ownership.ownerPrincipalRef,
      ownershipRef: ownership.ownershipRef,
      accountRevision: account.revision,
      ownershipRevision: ownership.revision,
      state: 'active',
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    return { kind: 'resolved', legalCustomerRef: ownership.ownerPrincipalRef }
  }
  if (binding.state !== 'active' || binding.legalCustomerRef !== ownership.ownerPrincipalRef) {
    // Legal-customer identity is financial authority. It is never silently
    // rebound inside funding or inspection. An explicit consequence command
    // must first prove the Formance capacity and pending-Call state are empty.
    return { kind: 'refused', code: 'legal_customer_rebinding_blocked' }
  }
  if (binding.ownershipRef !== ownership.ownershipRef
    || binding.accountRevision !== account.revision
    || binding.ownershipRevision !== ownership.revision) {
    await ctx.db.patch(binding._id, {
      ownershipRef: ownership.ownershipRef,
      accountRevision: account.revision,
      ownershipRevision: ownership.revision,
      version: binding.version + 1,
      updatedAt: now,
    })
  }
  return { kind: 'resolved', legalCustomerRef: binding.legalCustomerRef }
}
