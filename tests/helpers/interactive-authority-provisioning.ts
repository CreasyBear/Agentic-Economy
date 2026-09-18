import type { UserIdentity } from 'convex/server'
import { expect } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { INTERACTIVE_AUTHORITY_NOW } from './interactive-authority-seed'
import type { AuthorityTables, InteractiveAuthorityBackend } from './interactive-authority-runtime'

export function expectInitialProvisionedChain(
  chain: ReturnType<typeof unpackSingleCanonicalChain>,
  token: string,
  provisionedDisplayName: string,
): void {
  expect(chain.binding).toMatchObject({
    providerNamespace: 'clerk/user',
    providerIdentifier: token,
    providerState: { kind: 'known', value: 'active' },
    lifecycle: 'active',
    credentialGeneration: 1,
  })
  expect(chain.principal).toMatchObject({
    kind: 'human',
    displayName: provisionedDisplayName,
    lifecycle: 'active',
  })
  expect(chain.ownership).toMatchObject({
    accountRef: chain.account.accountRef,
    ownerPrincipalRef: chain.principal.principalRef,
    lifecycle: 'active',
    changeKind: 'creation',
  })
  expect(chain.account).toMatchObject({
    lifecycle: 'active',
    initialOwnershipRef: chain.ownership.ownershipRef,
    currentOwnershipRef: chain.ownership.ownershipRef,
    creationActorPrincipalRef: chain.principal.principalRef,
  })
  expect(chain.credential).toMatchObject({
    bindingRef: chain.binding.bindingRef,
    principalRef: chain.principal.principalRef,
    type: 'provider_token',
    lifecycle: 'active',
    generation: 1,
    issuedAt: INTERACTIVE_AUTHORITY_NOW,
    expiresAt: 20_000,
  })
  expect(chain.credential.expiryMaterialization).toMatchObject({
    state: 'scheduled',
    credentialGeneration: 1,
    credentialExpiresAt: 20_000,
    scheduleRef: expect.any(String),
  })
}

export async function insertProvisionedOwnerBusiness(
  backend: InteractiveAuthorityBackend,
  accountRef: string,
  tokenIdentifier: string,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('businesses', {
      owningAccountRef: accountRef,
      slug: 'provisioned-owner-business',
      name: 'Provisioned Owner Business',
      normalizedName: 'provisioned owner business',
      category: 'programmable provider',
      businessContext: {
        kind: 'programmable_provider',
        website: 'https://provisioned.example.test',
        providerIdentifier: 'provider:x402:provisioned.example.test',
      },
      publicStatus: 'published',
      trustTier: 'registry_verified',
      sourceHash: canonicalDigest({
        kind: 'test-provisioned-owner-business:v1',
        tokenIdentifier,
      }),
      createdAt: INTERACTIVE_AUTHORITY_NOW,
      updatedAt: INTERACTIVE_AUTHORITY_NOW,
    })
  })
}

export function expectSingleCanonicalRowCounts(tables: AuthorityTables): void {
  expect(tables.memberships).toEqual([])
  expect(tables.bindings).toHaveLength(1)
  expect(tables.principals).toHaveLength(1)
  expect(tables.accounts).toHaveLength(1)
  expect(tables.ownerships).toHaveLength(1)
  expect(tables.credentials).toHaveLength(1)
}

export function unpackSingleCanonicalChain(tables: AuthorityTables) {
  expectSingleCanonicalRowCounts(tables)
  return {
    binding: tables.bindings[0]!,
    principal: tables.principals[0]!,
    account: tables.accounts[0]!,
    ownership: tables.ownerships[0]!,
    credential: tables.credentials[0]!,
  }
}

export function samIdentity(
  tokenIdentifier: string,
  overrides: Partial<UserIdentity> = {},
): UserIdentity {
  return {
    subject: 'user_sam',
    issuer: 'https://clerk.example.test',
    tokenIdentifier,
    exp: 20,
    ...overrides,
  }
}

export function provisionedIdentity(
  tokenIdentifier: string,
  overrides: Partial<UserIdentity> = {},
): UserIdentity {
  return samIdentity(tokenIdentifier, {
    subject: 'user_provisioned',
    tokenIdentifier,
    ...overrides,
  })
}
