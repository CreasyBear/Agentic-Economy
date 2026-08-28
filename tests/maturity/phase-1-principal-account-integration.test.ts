import { describe, expect, it } from 'vitest'

import schema from '../../convex/schema'
import {
  accountTables,
  externalIdentityBindingValue,
  externalIdentityTables,
  principalAccountTables,
  principalTables,
  principalValue,
} from '../../src/modules/principal-account/public'

const canonicalIdentityTableNames = [
  'principals',
  'accounts',
  'accountOwnerships',
  'memberships',
  'externalIdentityBindings',
  'credentials',
] as const

const principalAccountTableNames = [
  'principals',
  'accounts',
  'accountOwnerships',
  'memberships',
  'accountRecoveryParticipantApprovals',
  'accountSuccessionAuthorizations',
  'accountSuccessionAuthorizationParticipants',
  'externalIdentityBindings',
  'credentials',
] as const

describe('Phase 1 principal/account integration', () => {
  it('composes every leaf-owned table fragment once through the public boundary', () => {
    expect(principalAccountTables).toEqual({
      ...principalTables,
      ...accountTables,
      ...externalIdentityTables,
    })
    expect(Object.keys(principalAccountTables)).toEqual(principalAccountTableNames)
    for (const tableName of principalAccountTableNames) {
      expect(schema.tables[tableName]).toBe(principalAccountTables[tableName])
    }
  })

  it('keeps identity bindings referential and never makes them resource owners', () => {
    expect(Object.keys(externalIdentityBindingValue.fields)).toContain('principalRef')
    expect(Object.keys(externalIdentityBindingValue.fields)).not.toEqual(
      expect.arrayContaining(['accountRef', 'ownerPrincipalRef', 'memberPrincipalRef']),
    )
  })

  it('keeps authority and Account selection out of the canonical Principal record', () => {
    expect(Object.keys(principalValue.fields)).not.toEqual(
      expect.arrayContaining(['accountRef', 'activeAccountRef', 'authority', 'role', 'scope', 'superuser']),
    )
  })
})
