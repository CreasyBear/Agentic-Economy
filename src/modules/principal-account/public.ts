import { accountTables } from './account/public'
import { externalIdentityTables } from './external-identity/public'
import { principalTables } from './principal/public'

export * from './account/public'
export * from './external-identity/public'
export * from './principal/public'
export * from './workload-context/public'

/** Canonical Phase 1 tables, composed only at the module's public boundary. */
export const principalAccountTables = {
  ...principalTables,
  ...accountTables,
  ...externalIdentityTables,
} as const
