import type { MutationCtx } from '../../../_generated/server'
import {
  accountRef,
  principalRef,
  type PrincipalRef,
} from '../../../../src/modules/principal-account/public'
import {
  DelegationError,
  type DelegationContextPort,
} from '../../../../src/modules/authority/delegation/public'
import type { AuthorizeRecoveryRequest } from '../../../../src/modules/authority/recovery/public'

export function createRecoveryDelegationContextPort(
  ctx: MutationCtx,
  trustedActor: PrincipalRef,
  action: AuthorizeRecoveryRequest['action'],
  selectedAccountRef: AuthorizeRecoveryRequest['accountRef'],
): DelegationContextPort {
  return Object.freeze({
    resolveActiveContext: async (context) => {
      const selected = accountRef(context.activeAccountRef)
      const actor = principalRef(context.actorPrincipalRef)
      if (selected !== selectedAccountRef || actor !== trustedActor) {
        throw new DelegationError('delegation_actor_mismatch')
      }
      const [principal, account, membership] = await Promise.all([
        ctx.db.query('principals')
          .withIndex('by_principalRef', (query) => query.eq('principalRef', actor)).unique(),
        ctx.db.query('accounts')
          .withIndex('by_accountRef', (query) => query.eq('accountRef', selected)).unique(),
        ctx.db.query('memberships')
          .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
            .eq('accountRef', selected)
            .eq('memberPrincipalRef', actor)
            .eq('lifecycle', 'active'))
          .unique(),
      ])
      const expectedLifecycle = action === 'freeze' ? 'active' : 'suspended'
      if (principal?.lifecycle !== 'active'
        || account?.lifecycle !== expectedLifecycle
        || membership === null
        || !Number.isSafeInteger(account.revision)
        || account.revision < 1) {
        throw new DelegationError('delegation_actor_mismatch')
      }
      return Object.freeze({
        accountRef: selected,
        actorPrincipalRef: actor,
        accountRevision: account.revision,
        correlationRef: context.correlationRef,
        idempotencyRef: context.idempotencyRef,
      })
    },
    resolveRootIssuerContext: async () => {
      throw new DelegationError('delegation_actor_mismatch')
    },
    requireActivePrincipal: async (candidate) => {
      const selected = principalRef(candidate)
      const row = await ctx.db.query('principals')
        .withIndex('by_principalRef', (query) => query.eq('principalRef', selected)).unique()
      if (row?.lifecycle !== 'active') throw new DelegationError('delegation_actor_mismatch')
    },
  })
}
