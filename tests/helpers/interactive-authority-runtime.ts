import type { UserIdentity } from 'convex/server'
import { convexTest, type TestConvex } from 'convex-test'
import { expect } from 'vitest'

import schema from '../../convex/schema'
import { api } from '../../convex/_generated/api'
import {
  materializeCurrentInteractiveAuthority,
  reconcileScheduledInteractiveAuthority,
  resolveInteractiveAuthorityContext,
} from '../../convex/interactiveAuthority'
import { resolveBusinessActor } from '../../convex/authz'
import { convexModules as modules } from './convex-fixtures'
import {
  INTERACTIVE_CREDENTIAL_REF,
  INTERACTIVE_TOKEN_IDENTIFIER,
  seedInteractiveAuthority,
  type InteractiveAuthoritySeedOptions,
} from './interactive-authority-seed'

export type InteractiveAuthorityBackend = TestConvex<typeof schema>

export function createInteractiveAuthorityBackend(): InteractiveAuthorityBackend {
  return convexTest(schema, modules)
}

export async function seededInteractiveAuthorityBackend(
  options: InteractiveAuthoritySeedOptions = {},
): Promise<InteractiveAuthorityBackend> {
  const backend = createInteractiveAuthorityBackend()
  await seedInteractiveAuthority(backend, options)
  return backend
}

export async function collectAuthorityTables(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => ({
    bindings: await ctx.db.query('externalIdentityBindings').collect(),
    credentials: await ctx.db.query('credentials').collect(),
    principals: await ctx.db.query('principals').collect(),
    accounts: await ctx.db.query('accounts').collect(),
    ownerships: await ctx.db.query('accountOwnerships').collect(),
    memberships: await ctx.db.query('memberships').collect(),
  }))
}

export type AuthorityTables = Awaited<ReturnType<typeof collectAuthorityTables>>

export async function resolveInteractiveContext(
  backend: InteractiveAuthorityBackend,
  presentedIdentity: UserIdentity = {
    subject: 'user_sam',
    issuer: 'https://clerk.example.test',
    tokenIdentifier: INTERACTIVE_TOKEN_IDENTIFIER,
    exp: 20,
  },
) {
  return backend.run(async (ctx) =>
    resolveInteractiveAuthorityContext(ctx.db, presentedIdentity))
}

export async function runInteractiveBusinessActor(
  backend: InteractiveAuthorityBackend,
  getUserIdentity: () => Promise<UserIdentity | null>,
  withScheduler = false,
) {
  return backend.run(async (ctx) => resolveBusinessActor({
    db: ctx.db,
    ...(withScheduler ? { scheduler: ctx.scheduler } : {}),
    auth: { getUserIdentity },
  }))
}

export function readMaterializeHandler() {
  return (materializeCurrentInteractiveAuthority as unknown as {
    _handler: (ctx: unknown, args: Record<string, never>) => Promise<boolean>
  })._handler
}

export function readReconcileHandler() {
  return (reconcileScheduledInteractiveAuthority as unknown as {
    _handler: (ctx: unknown, args: { authority: unknown }) => Promise<unknown>
  })._handler
}

export async function expectInteractiveMaterialize(
  session: Pick<InteractiveAuthorityBackend, 'mutation'>,
  succeeded: boolean,
) {
  await expect(session.mutation(
    api.interactiveAuthority.materializeCurrentInteractiveAuthority,
    {},
  )).resolves.toBe(succeeded)
}

export async function revokeInteractiveCredential(
  backend: InteractiveAuthorityBackend,
  revokedAt: number,
): Promise<void> {
  await backend.run(async (ctx) => {
    const row = await ctx.db.query('credentials')
      .withIndex('by_credentialRef', (query) => query.eq('credentialRef', INTERACTIVE_CREDENTIAL_REF)).unique()
    if (row === null) throw new Error('credential missing')
    await ctx.db.patch(row._id, { lifecycle: 'revoked', revokedAt, revision: row.revision + 1 })
  })
}

export type { InteractiveAuthoritySeedOptions }
