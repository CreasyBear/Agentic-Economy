import type { UserIdentity } from 'convex/server'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { api } from '../../../convex/_generated/api'
import { createConvexServerFunctionAssertion } from '../../../src/lib/server/convex-source'
import { principalRef } from '../../../src/modules/principal-account/principal/public'
import type { Doc } from '../../../convex/_generated/dataModel'
import { resolveActiveAccountRefForPrincipal } from '../../../convex/interactiveAuthority'
import { samIdentity } from '../../helpers/interactive-authority-provisioning'
import {
  collectAuthorityTables,
  createInteractiveAuthorityBackend as createBackend,
  type InteractiveAuthorityBackend,
} from '../../helpers/interactive-authority-runtime'
import {
  INTERACTIVE_ACCOUNT_REF as PERSONAL_ACCOUNT_REF,
  INTERACTIVE_AUTHORITY_NOW as NOW,
  INTERACTIVE_PRINCIPAL_REF as PRINCIPAL_REF,
  INTERACTIVE_TOKEN_IDENTIFIER as TOKEN_IDENTIFIER,
  seedInteractiveAuthority as seedAuthority,
} from '../../helpers/interactive-authority-seed'

const PROVISION_OPERATION = 'workspaceProvisioning.provisionOrganizationWorkspaceForServer'
const PROVISION_SCOPE = 'workspace:provision_organization'

const CLERK_ORG_ID = 'org_test_workspace_provision'
const WORKSPACE_DISPLAY_NAME = 'OpenAI Research Team'

type WorkspaceProvisionSuccess = Readonly<{
  kind: 'created' | 'replayed'
  accountRef: string
  ownershipRef: string
  bindingRef: string
}>

type WorkspaceProvisionRefusalCode =
  | 'creator_binding_missing'
  | 'creator_principal_inactive'
  | 'authority_conflict'
  | 'clerk_org_id_invalid'
  | 'workspace_closed'

type WorkspaceProvisionOutcome = WorkspaceProvisionSuccess | Readonly<{
  kind: 'refused'
  code: WorkspaceProvisionRefusalCode
}>
const provisionOrganizationWorkspaceForServerRef = api.workspaceProvisioning.provisionOrganizationWorkspaceForServer


const correlationRef = (label: string) => `test:workspace-provision:${label}`

const identity = (overrides: Partial<UserIdentity> = {}) =>
  samIdentity(TOKEN_IDENTIFIER, overrides)

async function expectWorkspaceProvisionFailure(
  run: () => Promise<WorkspaceProvisionOutcome>,
  code: WorkspaceProvisionRefusalCode,
): Promise<void> {
  const result = await run()
  expect(result).toMatchObject({ kind: 'refused', code })
}

async function buildProvisionServiceAuth(
  command: Readonly<{
    clerkOrgId: string
    displayName: string
    creatorTokenIdentifier: string
    correlationRef: string
  }>,
) {
  return await createConvexServerFunctionAssertion({
    operation: PROVISION_OPERATION,
    scope: PROVISION_SCOPE,
    command,
    now: NOW,
  })
}

async function requestWorkspaceProvisioning(
  backend: InteractiveAuthorityBackend,
  input: Readonly<{
    clerkOrgId: string
    displayName: string
    creatorTokenIdentifier: string
    correlationRef: string
  }>,
): Promise<WorkspaceProvisionOutcome> {
  const serviceAuth = await buildProvisionServiceAuth(input)
  return await backend.mutation(provisionOrganizationWorkspaceForServerRef, {
    ...input,
    serviceAuth: { ...serviceAuth, scopes: [...serviceAuth.scopes] },
  })
}

async function provisionOrganizationWorkspaceForServer(
  backend: InteractiveAuthorityBackend,
  input: Readonly<{
    clerkOrgId: string
    displayName: string
    creatorTokenIdentifier: string
    correlationRef: string
  }>,
): Promise<WorkspaceProvisionSuccess> {
  const result = await requestWorkspaceProvisioning(backend, input)
  if (result.kind === 'refused') throw new Error(`Expected provisioned workspace, got refusal ${result.code}`)
  return result
}


async function countOrgBindings(backend: InteractiveAuthorityBackend): Promise<number> {
  return await backend.run(async (ctx) =>
    (await ctx.db.query('accountExternalOrganizationBindings').collect()).length)
}

async function readOrgBindingForClerkOrg(
  backend: InteractiveAuthorityBackend,
  clerkOrgId: string,
): Promise<Doc<'accountExternalOrganizationBindings'> | null> {
  return await backend.run(async (ctx) =>
    ctx.db.query('accountExternalOrganizationBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
        .eq('providerNamespace', 'clerk/organization')
        .eq('providerIdentifier', clerkOrgId))
      .unique())
}

async function readPersonalAccount(
  backend: InteractiveAuthorityBackend,
): Promise<Doc<'accounts'> | null> {
  return await backend.run(async (ctx) =>
    ctx.db.query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', PERSONAL_ACCOUNT_REF))
      .unique())
}

async function countMembershipsForCreator(backend: InteractiveAuthorityBackend): Promise<number> {
  return await backend.run(async (ctx) => {
    const rows = await ctx.db.query('memberships')
      .withIndex('by_memberPrincipalRef_and_lifecycle', (query) =>
        query.eq('memberPrincipalRef', PRINCIPAL_REF).eq('lifecycle', 'active'))
      .collect()
    return rows.length
  })
}

async function seedCreatorWithPersonalAccount(
  backend: InteractiveAuthorityBackend,
  options: Parameters<typeof seedAuthority>[1] = {},
): Promise<void> {
  await seedAuthority(backend, options)
}

describe('workspace provisioning (W-11)', () => {
  const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
  const SERVICE_KEY = 'workspace-provision-test-key-material-32b'

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY
  })

  afterEach(() => {
    vi.useRealTimers()
    if (previousServiceKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousServiceKey
  })

  describe('provisionOrganizationWorkspaceForServer', () => {
    it('P1: first provision creates org account and ownership with creator as owner', async () => {
      const backend = createBackend()
      await seedCreatorWithPersonalAccount(backend)
      const before = await collectAuthorityTables(backend)

      const result = await provisionOrganizationWorkspaceForServer(backend, {
        clerkOrgId: CLERK_ORG_ID,
        displayName: WORKSPACE_DISPLAY_NAME,
        creatorTokenIdentifier: TOKEN_IDENTIFIER,
        correlationRef: correlationRef('p1'),
      })

      expect(result.kind).toBe('created')
      const after = await collectAuthorityTables(backend)
      expect(after.accounts).toHaveLength(before.accounts.length + 1)
      expect(after.ownerships).toHaveLength(before.ownerships.length + 1)
      expect(await countOrgBindings(backend)).toBe(1)

      const orgBinding = await readOrgBindingForClerkOrg(backend, CLERK_ORG_ID)
      expect(orgBinding).toMatchObject({
        accountRef: result.accountRef,
        providerNamespace: 'clerk/organization',
        providerIdentifier: CLERK_ORG_ID,
        lifecycle: 'active',
      })

      const ownership = after.ownerships.find((row) => row.ownershipRef === result.ownershipRef)
      expect(ownership).toMatchObject({
        accountRef: result.accountRef,
        ownerPrincipalRef: PRINCIPAL_REF,
        lifecycle: 'active',
        changeKind: 'creation',
      })

    })

    it('rejects a public provisioning call without a valid service assertion', async () => {
      const backend = createBackend()
      await seedCreatorWithPersonalAccount(backend)

      await expect(backend.mutation(provisionOrganizationWorkspaceForServerRef, {
        clerkOrgId: CLERK_ORG_ID,
        displayName: WORKSPACE_DISPLAY_NAME,
        creatorTokenIdentifier: TOKEN_IDENTIFIER,
        correlationRef: correlationRef('missing-service-auth'),
        serviceAuth: {
          principalId: 'ae:server-function',
          ownerId: 'ae:server-function',
          credentialId: 'ae:server-function',
          scopes: [PROVISION_SCOPE],
          issuedAt: NOW,
          signature: 'invalid',
        },
      })).rejects.toMatchObject({ code: 'authority_conflict' })
      expect(await countOrgBindings(backend)).toBe(0)
    })

    it('P2: replaying the same clerkOrgId returns the same account without new rows', async () => {
      const backend = createBackend()
      await seedCreatorWithPersonalAccount(backend)

      const first = await provisionOrganizationWorkspaceForServer(backend, {
        clerkOrgId: CLERK_ORG_ID,
        displayName: WORKSPACE_DISPLAY_NAME,
        creatorTokenIdentifier: TOKEN_IDENTIFIER,
        correlationRef: correlationRef('p2-first'),
      })
      expect(first.kind).toBe('created')

      const countsAfterFirst = {
        accounts: (await collectAuthorityTables(backend)).accounts.length,
        ownerships: (await collectAuthorityTables(backend)).ownerships.length,
        orgBindings: await countOrgBindings(backend),
      }

      const replayed = await provisionOrganizationWorkspaceForServer(backend, {
        clerkOrgId: CLERK_ORG_ID,
        displayName: WORKSPACE_DISPLAY_NAME,
        creatorTokenIdentifier: TOKEN_IDENTIFIER,
        correlationRef: correlationRef('p2-second'),
      })

      expect(replayed).toMatchObject({
        kind: 'replayed',
        accountRef: first.accountRef,
        ownershipRef: first.ownershipRef,
        bindingRef: first.bindingRef,
      })
      expect((await collectAuthorityTables(backend)).accounts).toHaveLength(countsAfterFirst.accounts)
      expect((await collectAuthorityTables(backend)).ownerships).toHaveLength(countsAfterFirst.ownerships)
      expect(await countOrgBindings(backend)).toBe(countsAfterFirst.orgBindings)
    })

    it('P2b: a replay after closure refuses without creating another Account or binding', async () => {
      const backend = createBackend()
      await seedCreatorWithPersonalAccount(backend)
      const first = await provisionOrganizationWorkspaceForServer(backend, {
        clerkOrgId: CLERK_ORG_ID,
        displayName: WORKSPACE_DISPLAY_NAME,
        creatorTokenIdentifier: TOKEN_IDENTIFIER,
        correlationRef: correlationRef('p2b-first'),
      })
      const beforeClose = await collectAuthorityTables(backend)

      await backend.run(async (ctx) => {
        const account = await ctx.db.query('accounts')
          .withIndex('by_accountRef', (query) => query.eq('accountRef', first.accountRef))
          .unique()
        const ownership = await ctx.db.query('accountOwnerships')
          .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', first.ownershipRef))
          .unique()
        const bindings = await ctx.db.query('accountExternalOrganizationBindings')
          .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
            .eq('providerNamespace', 'clerk/organization')
            .eq('providerIdentifier', CLERK_ORG_ID))
          .take(2)
        const [binding] = bindings
        if (account === null || ownership === null || binding === undefined) throw new Error('provisioned rows missing')
        await ctx.db.patch(account._id, { lifecycle: 'closed' })
        await ctx.db.patch(ownership._id, { lifecycle: 'ended' })
        await ctx.db.patch(binding._id, { lifecycle: 'revoked' })
      })

      await expectWorkspaceProvisionFailure(
        () => requestWorkspaceProvisioning(backend, {
          clerkOrgId: CLERK_ORG_ID,
          displayName: WORKSPACE_DISPLAY_NAME,
          creatorTokenIdentifier: TOKEN_IDENTIFIER,
          correlationRef: correlationRef('p2b-replay'),
        }),
        'workspace_closed',
      )

      const afterReplay = await collectAuthorityTables(backend)
      expect(afterReplay.accounts).toHaveLength(beforeClose.accounts.length)
      expect(afterReplay.ownerships).toHaveLength(beforeClose.ownerships.length)
      expect(await countOrgBindings(backend)).toBe(1)
      expect(await readOrgBindingForClerkOrg(backend, CLERK_ORG_ID)).toMatchObject({ lifecycle: 'revoked' })
    })

    it('P3: unknown creatorTokenIdentifier refuses creator_binding_missing', async () => {
      const backend = createBackend()
      await seedCreatorWithPersonalAccount(backend)

      await expectWorkspaceProvisionFailure(
        () => requestWorkspaceProvisioning(backend, {
          clerkOrgId: CLERK_ORG_ID,
          displayName: WORKSPACE_DISPLAY_NAME,
          creatorTokenIdentifier: 'https://clerk.example.test|user_unknown',
          correlationRef: correlationRef('p3'),
        }),
        'creator_binding_missing',
      )
    })

    it('P4: suspended creator principal refuses creator_principal_inactive', async () => {
      const backend = createBackend()
      await seedCreatorWithPersonalAccount(backend, { principalLifecycle: 'suspended' })

      await expectWorkspaceProvisionFailure(
        () => requestWorkspaceProvisioning(backend, {
          clerkOrgId: CLERK_ORG_ID,
          displayName: WORKSPACE_DISPLAY_NAME,
          creatorTokenIdentifier: TOKEN_IDENTIFIER,
          correlationRef: correlationRef('p4'),
        }),
        'creator_principal_inactive',
      )
    })

    it.each([
      ['empty', ''],
      ['whitespace', '   '],
      ['too-long', 'x'.repeat(201)],
      ['invalid-characters', '\n'],
    ] as const)('P5: invalid displayName (%s) falls back to Business', async (_label, displayName) => {
      const backend = createBackend()
      await seedCreatorWithPersonalAccount(backend)

      const result = await provisionOrganizationWorkspaceForServer(backend, {
        clerkOrgId: CLERK_ORG_ID,
        displayName,
        creatorTokenIdentifier: TOKEN_IDENTIFIER,
        correlationRef: correlationRef(`p5-${_label}`),
      })
      const account = (await collectAuthorityTables(backend)).accounts.find(
        (row) => row.accountRef === result.accountRef,
      )
      expect(account).toMatchObject({ displayName: 'Business' })
    })

    it.each([
      ['user id', 'user_test_not_an_org'],
      ['account ref', `acc_${'f'.repeat(32)}`],
    ] as const)('P6: invalid clerkOrgId (%s) refuses clerk_org_id_invalid', async (_label, clerkOrgId) => {
      const backend = createBackend()
      await seedCreatorWithPersonalAccount(backend)

      await expectWorkspaceProvisionFailure(
        () => requestWorkspaceProvisioning(backend, {
          clerkOrgId,
          displayName: WORKSPACE_DISPLAY_NAME,
          creatorTokenIdentifier: TOKEN_IDENTIFIER,
          correlationRef: correlationRef(`p6-${_label}`),
        }),
        'clerk_org_id_invalid',
      )
    })

    it('P7: personal account from seed stays active, intact, and unbound to any org', async () => {
      const backend = createBackend()
      await seedCreatorWithPersonalAccount(backend)
      const personalBefore = await readPersonalAccount(backend)
      expect(personalBefore).not.toBeNull()

      await provisionOrganizationWorkspaceForServer(backend, {
        clerkOrgId: CLERK_ORG_ID,
        displayName: WORKSPACE_DISPLAY_NAME,
        creatorTokenIdentifier: TOKEN_IDENTIFIER,
        correlationRef: correlationRef('p7'),
      })

      const personalAfter = await readPersonalAccount(backend)
      expect(personalAfter).toEqual(personalBefore)

      const bindingsOnPersonal = await backend.run(async (ctx) =>
        (await ctx.db.query('accountExternalOrganizationBindings')
          .withIndex('by_accountRef_and_lifecycle', (query) =>
            query.eq('accountRef', PERSONAL_ACCOUNT_REF).eq('lifecycle', 'active'))
          .collect()).length)
      expect(bindingsOnPersonal).toBe(0)
    })

    it('P8: creator receives ownership only and no memberships row', async () => {
      const backend = createBackend()
      await seedCreatorWithPersonalAccount(backend)

      const result = await provisionOrganizationWorkspaceForServer(backend, {
        clerkOrgId: CLERK_ORG_ID,
        displayName: WORKSPACE_DISPLAY_NAME,
        creatorTokenIdentifier: TOKEN_IDENTIFIER,
        correlationRef: correlationRef('p8'),
      })

      expect(await countMembershipsForCreator(backend)).toBe(0)
      const ownerships = (await collectAuthorityTables(backend)).ownerships.filter(
        (row) => row.ownerPrincipalRef === PRINCIPAL_REF && row.lifecycle === 'active',
      )
      expect(ownerships.map((row) => row.accountRef)).toContain(result.accountRef)
      expect(ownerships.map((row) => row.accountRef)).toContain(PERSONAL_ACCOUNT_REF)
    })

    it('P9: provisioned account row satisfies full schema fields', async () => {
      const backend = createBackend()
      await seedCreatorWithPersonalAccount(backend)

      const result = await provisionOrganizationWorkspaceForServer(backend, {
        clerkOrgId: CLERK_ORG_ID,
        displayName: WORKSPACE_DISPLAY_NAME,
        creatorTokenIdentifier: TOKEN_IDENTIFIER,
        correlationRef: correlationRef('p9'),
      })

      const account = (await collectAuthorityTables(backend)).accounts.find(
        (row) => row.accountRef === result.accountRef,
      )
      expect(account).toMatchObject({
        displayName: WORKSPACE_DISPLAY_NAME,
        lifecycle: 'active',
        recoveryPolicy: { kind: 'no_transfer', revision: 1 },
        creationActorPrincipalRef: PRINCIPAL_REF,
        creationIdempotencyRef: `clerk-org:${CLERK_ORG_ID}`,
        initialOwnershipRef: result.ownershipRef,
        currentOwnershipRef: result.ownershipRef,
      })
      expect(account?.lastAction).toMatchObject({
        actorPrincipalRef: PRINCIPAL_REF,
        activeAccountRef: result.accountRef,
        correlationRef: correlationRef('p9'),
      })
    })

  })

  describe('post-provision active account resolution', () => {
    it('P13: org_id resolves the provisioned account after binding exists', async () => {
      const backend = createBackend()
      await seedCreatorWithPersonalAccount(backend)

      const provisioned = await provisionOrganizationWorkspaceForServer(backend, {
        clerkOrgId: CLERK_ORG_ID,
        displayName: WORKSPACE_DISPLAY_NAME,
        creatorTokenIdentifier: TOKEN_IDENTIFIER,
        correlationRef: correlationRef('p13'),
      })

      const resolution = await backend.run(async (ctx) =>
        resolveActiveAccountRefForPrincipal(ctx.db, principalRef(PRINCIPAL_REF), identity({ org_id: CLERK_ORG_ID })))

      expect(resolution).toEqual({ activeAccountRef: provisioned.accountRef })
    })
  })
})
