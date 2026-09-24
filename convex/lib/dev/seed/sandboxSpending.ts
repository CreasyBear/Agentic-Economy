import { v } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import { resolveAndBindLegalCustomer } from '../../money/legalCustomer/binding'
import { requireLocalE2EOwnerAuthority } from './identity' 

/*
 * Sandbox money authority for the local bypass owner.
 *
 * The agent side of Quote authority belongs to `ae connect` (see the shape (a)
 * note above `requireLocalE2EOwnerAuthority`): that flow writes the canonical
 * agent Principal, its delegation root and its agentAccessGrants row, and Quote
 * resolves all three live. The one fact `ae connect` never writes is the owning
 * account's money identity, so this seeds exactly that - the
 * moneyLegalCustomerBindings row `capabilityQuotes.prepareFinancialSubjects`
 * reads - through its own command (`resolveAndBindLegalCustomer`,
 * convex/lib/money/legalCustomer/binding.ts). Nothing behind that command is patched,
 * and no secret material is written.
 */
export const seedSandboxSpendingPolicyArgs = {}
export const seedSandboxSpendingPolicyResult = v.object({
    created: v.boolean(),
    accountRef: v.string(),
    legalCustomerRef: v.string(),
  })
export async function seedSandboxSpendingPolicyHandler(ctx: MutationCtx) {
    const owner = await requireLocalE2EOwnerAuthority(ctx)
    const existing = await ctx.db.query('moneyLegalCustomerBindings')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', owner.accountRef))
      .unique()
    const bound = await resolveAndBindLegalCustomer(ctx, owner.accountRef, Date.now())
    if (bound.kind === 'refused') {
      throw new Error(`dev_seed_sandbox_legal_customer_${bound.code}`)
    }
    return {
      created: existing === null,
      accountRef: owner.accountRef,
      legalCustomerRef: bound.legalCustomerRef,
    }
}
