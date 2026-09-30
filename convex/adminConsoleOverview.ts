import { defineAdminQuery } from './lib/adminConsole/reads/registrars'
import {
  adminOverviewValue,
  readAdminOverviewView,
} from './lib/adminConsole/reads/overview'

export const readAdminOverview = defineAdminQuery({
  action: 'read_admin_readbacks',
  args: {},
  returns: adminOverviewValue,
  handler: async (ctx) => await readAdminOverviewView(ctx),
})
