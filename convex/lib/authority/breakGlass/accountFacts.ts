import type { MutationCtx } from '../../../_generated/server'
import { RecoveryError } from '../../../../src/modules/authority/recovery/public'
import {
  accountRef,
  ownershipRef,
  principalRef,
  type RecoveryPolicy,
} from '../../../../src/modules/principal-account/public'

export async function resolveRecoveryAccountFacts(
  ctx: MutationCtx,
  selectedAccountRef: string,
) {
  const selected = accountRef(selectedAccountRef)
  const account = await ctx.db.query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', selected)).unique()
  if (account === null || account.currentOwnershipRef.length === 0) {
    throw new RecoveryError('recovery_account_facts_invalid')
  }
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef)).unique()
  if (ownership === null) throw new RecoveryError('recovery_account_facts_invalid')
  return Object.freeze({
    account: Object.freeze({
      accountRef: selected,
      lifecycle: account.lifecycle,
      recoveryPolicy: Object.freeze({ ...account.recoveryPolicy }) as RecoveryPolicy,
      revision: account.revision,
      updatedAt: account.updatedAt,
      currentOwnershipRef: ownershipRef(account.currentOwnershipRef),
    }),
    ownership: Object.freeze({
      ownershipRef: ownershipRef(ownership.ownershipRef),
      accountRef: accountRef(ownership.accountRef),
      ownerPrincipalRef: principalRef(ownership.ownerPrincipalRef),
      lifecycle: ownership.lifecycle,
      revision: ownership.revision,
    }),
  })
}
