import { makeFunctionReference } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createInteractiveAuthorityBackend } from '../../helpers/interactive-authority-runtime'
import {
  INTERACTIVE_ACCOUNT_REF, INTERACTIVE_TOKEN_IDENTIFIER, seedInteractiveAuthority,
} from '../../helpers/interactive-authority-seed'
import { samIdentity } from '../../helpers/interactive-authority-provisioning'

const rename = makeFunctionReference<'mutation', {
  name: string; expectedRevision: number; correlationRef: string; idempotencyRef: string
}, { kind: 'updated' | 'replayed' | 'unchanged'; name: string }>('workspaceAccounts:renameUnboundWorkspace')
const read = makeFunctionReference<'query', Record<string, never>, {
  accountRef: string; displayName: string; accountRevision: number; callerIsOwner: boolean;
  clerkOrgId: string | null; ownerDisplayName: string; ownerClerkUserId: string | null
}>('workspaceAccounts:readWorkspaceOrganizationBinding')
const identity = samIdentity(INTERACTIVE_TOKEN_IDENTIFIER, { fva: [1, 1] })

function command(expectedRevision: number) {
  return { name: 'Sam’s workspace', expectedRevision, correlationRef: 'test:rename', idempotencyRef: 'test:rename:one' }
}

describe('personal workspace name authority', () => {
  it('writes AE only for an unbound owner, idempotently', async () => {
    const backend = createInteractiveAuthorityBackend()
    await seedInteractiveAuthority(backend)
    const owner = backend.withIdentity(identity)
    const before = await owner.query(read, {})
    expect(before).toMatchObject({ clerkOrgId: null, ownerDisplayName: 'Sam canonical principal', callerIsOwner: true })
    expect(await owner.mutation(rename, command(before.accountRevision))).toMatchObject({ kind: 'updated', name: 'Sam’s workspace' })
    expect(await owner.mutation(rename, command(before.accountRevision))).toMatchObject({ kind: 'replayed' })
    expect(await owner.query(read, {})).toMatchObject({ displayName: 'Sam’s workspace', accountRevision: before.accountRevision + 1 })
  })

  it('refuses a member and refuses an organisation-bound AE write', async () => {
    const backend = createInteractiveAuthorityBackend()
    await seedInteractiveAuthority(backend, { access: 'membership' })
    const session = backend.withIdentity(identity)
    const before = await session.query(read, {})
    await expect(session.mutation(rename, command(before.accountRevision))).rejects.toMatchObject({ code: 'ownership_mismatch' })
    await backend.run(async (ctx) => { await ctx.db.insert('accountExternalOrganizationBindings', {
      bindingRef: `eob_${'o'.repeat(32)}`, accountRef: INTERACTIVE_ACCOUNT_REF,
      providerNamespace: 'clerk/organization', providerIdentifier: 'org_test', lifecycle: 'active',
      revision: 1, createdAt: 1, updatedAt: 1,
    }) })
    const bound = await session.query(read, {})
    expect(bound.clerkOrgId).toBe('org_test')
    await expect(session.mutation(rename, command(before.accountRevision))).rejects.toMatchObject({ code: 'ownership_mismatch' })
  })
})
