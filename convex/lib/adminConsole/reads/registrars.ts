import type { AdminAction } from '@/modules/security/public'
import type { AllowedAdminAuthority } from '@/lib/operator/admin-console/contracts'
import { v, type Infer, type ObjectType, type PropertyValidators, type Validator } from 'convex/values'

import { query, type QueryCtx } from '../../../_generated/server'
import { resolveAdminAuthority } from '../../../authz'
import { adminRefusalValue } from '../commands/contracts'

type AdminQueryDefinition<
  Args extends PropertyValidators,
  ReturnValue,
  Ret extends Validator<ReturnValue, 'required', string>,
> = Readonly<{
  action: AdminAction
  args: Args
  returns: Ret
  handler: (
    ctx: QueryCtx & { admin: AllowedAdminAuthority },
    args: ObjectType<Args>,
  ) => Promise<Infer<Ret>>
}>


export function defineAdminQuery<
  Args extends PropertyValidators,
  ReturnValue,
  Ret extends Validator<ReturnValue, 'required', string>,
>(def: AdminQueryDefinition<Args, ReturnValue, Ret>) {
  const returns = v.union(adminRefusalValue, def.returns)
  return query<
    Args,
    typeof returns,
    Promise<{ kind: 'refused'; code: string } | Infer<Ret>>,
    [ObjectType<Args>]
  >({
    args: def.args,
    returns,
    handler: async (ctx, args) => {
      const authority = await resolveAdminAuthority(ctx, def.action)
      if (authority.kind === 'denied') {
        return { kind: 'refused', code: authority.reason }
      }
      return await def.handler({ ...ctx, admin: authority }, args)
    },
  })
}
