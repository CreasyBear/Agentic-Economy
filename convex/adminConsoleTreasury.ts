import { v } from 'convex/values'
import { adminTreasuryViewValue } from '@/modules/money/treasury-report'
import { defineAdminQuery } from './lib/adminConsole/reads/registrars'
import { readAdminTreasury } from './lib/adminConsole/reads/treasury'

export const read = defineAdminQuery({
  action: 'read_admin_readbacks', args: {},
  returns: v.union(adminTreasuryViewValue, v.object({ kind: v.literal('refused'), code: v.string() })),
  handler: readAdminTreasury,
})
