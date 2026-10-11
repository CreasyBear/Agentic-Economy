/// <reference types="vite/client" />
import { makeFunctionReference, type UserIdentity } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { internal } from '../../../convex/_generated/api'
import { createCustomerRequestServiceAssertion } from '@/modules/agent-access/service-auth-envelope'
import { createAgentAccessGrant } from '@/modules/agent-access/policy'
import { defaultSandboxAgentAccessPolicy } from '@/modules/agent-access/sandbox-policy'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { samIdentity } from '../../helpers/interactive-authority-provisioning'
import {
  createInteractiveAuthorityBackend as createBackend,
  type InteractiveAuthorityBackend,
} from '../../helpers/interactive-authority-runtime'
import {
  INTERACTIVE_ACCOUNT_REF as ACCOUNT_REF,
  INTERACTIVE_AUTHORITY_NOW as NOW,
  INTERACTIVE_BINDING_REF as BINDING_REF,
  INTERACTIVE_CREDENTIAL_REF as CREDENTIAL_REF,
  INTERACTIVE_PRINCIPAL_REF as PRINCIPAL_REF,
  INTERACTIVE_TOKEN_IDENTIFIER as TOKEN_IDENTIFIER,
  seedInteractiveAuthority as seedAuthority,
} from '../../helpers/interactive-authority-seed'

const serviceKey = 'personal-account-deletion-test-service-key-material'
const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN

const RETIRE_OPERATION = 'personalAccount.retirePersonalAccountForServer'
const RETIRE_SCOPE = 'personal_account:retire_for_server'

const TEAMMATE_PRINCIPAL_REF = `prn_${'t'.repeat(32)}`
const TEAMMATE_MEMBERSHIP_REF = `mem_${'t'.repeat(32)}`
const MACHINE_AGENT_REF = `prn_${'m'.repeat(32)}`
const UNBOUND_PROVIDER = 'https://clerk.example.test|user_unbound'

type RetirePersonalAccountCommand = Readonly<{
  deliveryRefHash: string
  providerIdentifier: string
  eventType: 'user.deleted'
  targetRefHash: string
  observedAt: number
  securityAction: 'retire_personal_account'
}>

type RetirePersonalAccountResult = Readonly<
  | { kind: 'accepted'; status: 'applied' | 'replayed' | 'ignored'; eventRef?: string }
  | { kind: 'refused'; code: string }
>

type DeletionEligibility = Readonly<
  | { kind: 'eligible' }
  | { kind: 'blocked'; reason: 'last_owner_of_populated_workspace' | 'workspace_close_required' }
>

type UserDataExport = Readonly<{
  exportedAt: number
  principal: Readonly<{
    principalRef: string
    kind: string
    lifecycle: string
    displayName: string
  }>
  memberships: readonly Record<string, unknown>[]
  ownerships: readonly Record<string, unknown>[]
  linkedAccounts: readonly Record<string, unknown>[]
  securityHistory: readonly Record<string, unknown>[]
}>

const retirePersonalAccountForServerRef = makeFunctionReference<
  'mutation',
  RetirePersonalAccountCommand & Readonly<{ serviceAuth: Awaited<ReturnType<typeof serviceAssertion>> }>,
  RetirePersonalAccountResult
>('personalAccount:retirePersonalAccountForServer')

const readDeletionEligibilityRef = internal.personalAccount.readDeletionEligibility

const exportUserDataRef = makeFunctionReference<
  'query',
  Record<string, never>,
  UserDataExport
>('personalAccount:exportUserData')

const identity = (overrides: Partial<UserIdentity> = {}) =>
  samIdentity(TOKEN_IDENTIFIER, overrides)

afterEach(() => {
  if (previousServiceKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
  else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousServiceKey
})

describe('personalAccount retirePersonalAccountForServer (W-09)', () => {
  it('R1: retiring active human owner sets principal lifecycle retired and display name', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    const backend = createBackend()
    await seedAuthority(backend)
    const command = retireCommand(TOKEN_IDENTIFIER)

    expect(await retire(backend, command)).toEqual(expect.objectContaining({
      kind: 'accepted',
      status: 'applied',
    }))

    const principal = await readPrincipal(backend)
    expect(principal).toMatchObject({
      lifecycle: 'retired',
      displayName: 'Deleted User',
      revision: 6,
    })
  })

  it('R2: Clerk binding lifecycle set to revoked', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    const backend = createBackend()
    await seedAuthority(backend)
    await retire(backend, retireCommand(TOKEN_IDENTIFIER))

    const binding = await readBinding(backend)
    expect(binding).toMatchObject({ lifecycle: 'revoked' })
  })

  it('R3: interactive credentials revoked', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    const backend = createBackend()
    await seedAuthority(backend)
    await retire(backend, retireCommand(TOKEN_IDENTIFIER))

    const credential = await readCredential(backend)
    expect(credential).toMatchObject({ lifecycle: 'revoked' })
  })

  it('R4: memberships ended', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    const backend = createBackend()
    await seedAuthority(backend, { addMembershipToOwnership: true })
    await retire(backend, retireCommand(TOKEN_IDENTIFIER))

    const memberships = await listMemberships(backend)
    expect(memberships.length).toBeGreaterThan(0)
    expect(memberships.every((row) => row.lifecycle === 'ended')).toBe(true)
  })

  it('R6: notification PII scrubbed', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    const backend = createBackend()
    await seedAuthority(backend)
    await seedNotificationEmail(backend)
    await seedNotificationPreferenceWithEmail(backend)
    await retire(backend, retireCommand(TOKEN_IDENTIFIER))

    expect(await listNotificationEmails(backend)).toEqual([])
    const preferences = await listNotificationPreferences(backend)
    expect(preferences.every((row) => row.deliveryEmail === undefined)).toBe(true)
  })

  it('R7: machine agents created by this human are cascaded to revoked', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    const backend = createBackend()
    await seedAuthority(backend)
    await seedOwnerMachineAgent(backend)
    await retire(backend, retireCommand(TOKEN_IDENTIFIER))

    const admission = await readAgentAccessPrincipal(backend, MACHINE_AGENT_REF)
    expect(admission).toMatchObject({ lifecycle: 'revoked' })
  })

  it('R7c: revokes every owned machine agent, however many', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    const backend = createBackend()
    await seedAuthority(backend)
    await backend.run(async (ctx) => {
      for (let i = 0; i < 70; i++) {
        await ctx.db.insert('agentAccessPrincipals', {
          principalId: `prn_bulk_${i}`, ownerId: ACCOUNT_REF, ownerTokenIdentifier: TOKEN_IDENTIFIER,
          credentialId: `key_bulk_${i}`, applicationRef: 'agentic-economy', environment: 'sandbox',
          scopes: ['market_tools:call'], authorityMode: 'read_only', grantGeneration: 1,
          spendingPolicyDigest: 'sha256:bulk', lifecycle: 'active', expiresAt: 20_000, recordedAt: NOW, lastSeenAt: NOW,
        })
      }
    })
    vi.useFakeTimers()
    try {
      await retire(backend, retireCommand(TOKEN_IDENTIFIER))
      await backend.finishAllScheduledFunctions(vi.runAllTimers)
    } finally { vi.useRealTimers() }
    const rows = await backend.run(async (ctx) => await ctx.db.query('agentAccessPrincipals').collect())
    expect(rows).toHaveLength(70)
    expect(rows.every((row) => row.lifecycle === 'revoked')).toBe(true)
  })

  it('R7b: closes the owned account, ends ownership, revokes owner-less agents, blocks members', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    const backend = createBackend()
    await seedAuthority(backend)
    await seedTeammateMembership(backend)
    await seedOwnerMachineAgent(backend, { ownerTokenIdentifier: undefined })
    await retire(backend, retireCommand(TOKEN_IDENTIFIER))

    const { account, ownerships, memberships } = await backend.run(async (ctx) => ({
      account: await ctx.db.query('accounts').withIndex('by_accountRef', (q) => q.eq('accountRef', ACCOUNT_REF)).unique(),
      ownerships: await ctx.db.query('accountOwnerships').collect(),
      memberships: await ctx.db.query('memberships').collect(),
    }))
    expect(memberships.filter((row) => row.accountRef === ACCOUNT_REF).every((row) => row.lifecycle === 'ended')).toBe(true)
    expect(account).toMatchObject({ lifecycle: 'closed' })
    expect(ownerships.filter((row) => row.accountRef === ACCOUNT_REF).every((row) => row.lifecycle === 'ended')).toBe(true)
    expect(await readAgentAccessPrincipal(backend, MACHINE_AGENT_REF)).toMatchObject({ lifecycle: 'revoked' })
    expect(ownerships.some((row) => row.accountRef === ACCOUNT_REF && row.lifecycle === 'active')).toBe(false)
  })

  it('R8: records account.personal_account.retired audit event', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    const backend = createBackend()
    await seedAuthority(backend)
    await retire(backend, retireCommand(TOKEN_IDENTIFIER))

    const events = await listAuditEvents(backend)
    expect(events).toEqual([expect.objectContaining({
      eventType: 'account.personal_account.retired',
      actorRef: PRINCIPAL_REF,
      activeAccountRef: ACCOUNT_REF,
    })])
  })

  it('R9: replay identical delivery is idempotent', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    const backend = createBackend()
    await seedAuthority(backend)
    const command = retireCommand(TOKEN_IDENTIFIER, 'delivery_r9')

    expect(await retire(backend, command)).toEqual(expect.objectContaining({
      kind: 'accepted',
      status: 'applied',
    }))
    const revisionAfterFirst = (await readPrincipal(backend))?.revision
    const auditAfterFirst = (await listAuditEvents(backend)).length

    expect(await retire(backend, command)).toEqual(expect.objectContaining({
      kind: 'accepted',
      status: 'replayed',
    }))
    expect((await readPrincipal(backend))?.revision).toBe(revisionAfterFirst)
    expect((await listAuditEvents(backend)).length).toBe(auditAfterFirst)
  })

  it('R10: unbound subject returns ignored', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    const backend = createBackend()
    await seedAuthority(backend)

    expect(await retire(backend, retireCommand(UNBOUND_PROVIDER))).toEqual({
      kind: 'accepted',
      status: 'ignored',
    })
  })

  it('R15: commercial records are untouched', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    const backend = createBackend()
    await seedAuthority(backend)
    const before = await seedCommercialRecords(backend)
    await retire(backend, retireCommand(TOKEN_IDENTIFIER))
    const after = await readCommercialSnapshots(backend)

    expect(after).toEqual(before)
  })
})

describe('personalAccount readDeletionEligibility (W-09)', () => {
  it('E0: unauthenticated readDeletionEligibility throws', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectRefusal(() => backend.query(readDeletionEligibilityRef, {}), 'identity_invalid')
  })

  it('E1: member-only caller with no open calls is eligible', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { access: 'membership' })

    await expect(readEligibility(backend)).resolves.toEqual({ kind: 'eligible' })
  })

  it('E2: sole owner of populated workspace is blocked as last owner', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedTeammateMembership(backend)

    await expect(readEligibility(backend)).resolves.toEqual({
      kind: 'blocked',
      reason: 'last_owner_of_populated_workspace',
    })
  })

  it('E3: sole owner of empty workspace is blocked until workspace close', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expect(readEligibility(backend)).resolves.toEqual({
      kind: 'blocked',
      reason: 'workspace_close_required',
    })
  })
})

describe('personalAccount exportUserData (W-09)', () => {
  it('X0: unauthenticated exportUserData throws', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectRefusal(() => backend.query(exportUserDataRef, {}), 'identity_invalid')
  })

  it('X1: authenticated exportUserData returns structured JSON export', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const exported = await exportData(backend)
    expect(exported.principal).toMatchObject({
      principalRef: PRINCIPAL_REF,
      kind: 'human',
      lifecycle: 'active',
    })
    expect(Array.isArray(exported.memberships)).toBe(true)
    expect(Array.isArray(exported.ownerships)).toBe(true)
    expect(Array.isArray(exported.linkedAccounts)).toBe(true)
    expect(Array.isArray(exported.securityHistory)).toBe(true)
    expect(typeof exported.exportedAt).toBe('number')
  })

  it('X2: export JSON contains no secrets or raw tokens', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const serialized = JSON.stringify(await exportData(backend))
    expect(serialized).not.toContain(CREDENTIAL_REF)
    expect(serialized).not.toContain('operator@example.test')
    expect(serialized).not.toContain('whsec_')
    expect(serialized).not.toContain('Bearer ')
  })

  it('X7: export lists only the requester\'s own audit events', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const OTHER_REF = 'user_other-member'
    await backend.run(async (ctx) => {
      for (const [id, actor] of [['mine', PRINCIPAL_REF], ['theirs', OTHER_REF]] as const) {
        await ctx.db.insert('auditEvents', {
          eventId: `audit:export:${id}`,
          eventType: 'account.session.created',
          actorKind: 'owner',
          actorRef: actor,
          targetType: 'session',
          targetRef: `session:${id}`,
          afterState: 'created',
          sourceSystem: 'test',
          activeAccountRef: ACCOUNT_REF,
          idempotencyKey: `export:${id}`,
          correlationId: `correlation:${id}`,
          evidenceRefs: [],
          redactedPayloadJson: '{}',
          payloadHash: canonicalDigest({ id }),
          createdAt: NOW,
        } as never)
      }
    })

    const refs = (await exportData(backend)).securityHistory.map((e) => e.eventRef)
    expect(refs).toContain('audit:export:mine')
    expect(refs).not.toContain('audit:export:theirs')
  })

  it('X6: retired principal cannot call exportUserData', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    const backend = createBackend()
    await seedAuthority(backend)
    await retire(backend, retireCommand(TOKEN_IDENTIFIER))

    await expectRefusal(() => exportData(backend), 'personal_account_retired')
  })
})

async function retire(
  backend: InteractiveAuthorityBackend,
  command: RetirePersonalAccountCommand,
): Promise<RetirePersonalAccountResult> {
  return await backend.mutation(retirePersonalAccountForServerRef, {
    ...command,
    serviceAuth: await serviceAssertion(command),
  })
}

async function readEligibility(
  backend: InteractiveAuthorityBackend,
  presentedIdentity: UserIdentity = identity(),
): Promise<DeletionEligibility> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.query(readDeletionEligibilityRef, {})
}

async function exportData(
  backend: InteractiveAuthorityBackend,
  presentedIdentity: UserIdentity = identity(),
): Promise<UserDataExport> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.query(exportUserDataRef, {})
}

async function expectRefusal(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toMatchObject({
    name: 'InteractiveAuthorityError',
    code,
  })
}

function retireCommand(
  providerIdentifier: string,
  delivery = 'delivery',
  observedAt = 9_000,
): RetirePersonalAccountCommand {
  return {
    deliveryRefHash: canonicalDigest({
      contract: 'ae.clerk-webhook-delivery:v1',
      deliveryRef: delivery,
    }),
    providerIdentifier,
    eventType: 'user.deleted',
    targetRefHash: canonicalDigest({
      contract: 'ae.clerk-webhook-target:v1',
      provider: 'clerk',
      targetKind: 'user_deletion',
      targetRef: providerIdentifier.split('|').at(-1) ?? providerIdentifier,
    }),
    observedAt,
    securityAction: 'retire_personal_account',
  }
}

async function serviceAssertion(command: RetirePersonalAccountCommand) {
  const result = await createCustomerRequestServiceAssertion({
    key: serviceKey,
    operation: RETIRE_OPERATION,
    command,
    principal: {
      principalId: 'ae:server-function',
      ownerId: 'ae:server-function',
      credentialId: 'ae:server-function',
      scopes: [RETIRE_SCOPE],
    },
    issuedAt: Date.now(),
  })
  return { ...result, scopes: [...result.scopes] }
}

async function readPrincipal(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => await ctx.db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', PRINCIPAL_REF))
    .unique())
}

async function readBinding(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => await ctx.db.query('externalIdentityBindings')
    .withIndex('by_bindingRef', (query) => query.eq('bindingRef', BINDING_REF))
    .unique())
}

async function readCredential(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => await ctx.db.query('credentials')
    .withIndex('by_credentialRef', (query) => query.eq('credentialRef', CREDENTIAL_REF))
    .unique())
}

async function listMemberships(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => {
    const rows = await ctx.db.query('memberships').collect()
    return rows.filter((row) => row.memberPrincipalRef === PRINCIPAL_REF)
  })
}


async function seedNotificationEmail(backend: InteractiveAuthorityBackend): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('principalNotificationEmails', {
      principalRef: PRINCIPAL_REF,
      email: 'operator@example.test',
      revision: 1,
      observedAt: NOW,
      sourceRef: 'test:fixture',
    })
  })
}

async function seedNotificationPreferenceWithEmail(backend: InteractiveAuthorityBackend): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('userNotificationPreferences', {
      accountRef: ACCOUNT_REF,
      principalRef: PRINCIPAL_REF,
      lowCreditBalance: true,
      lowCreditThresholdCents: 2500,
      spendCapWarning: true,
      callFailureSpike: true,
      invoiceReady: true,
      teamMembershipChanged: true,
      deliveryEmail: 'operator@example.test',
      revision: 1,
      updatedAt: NOW,
      lastCorrelationRef: 'test:notification-prefs',
    })
  })
}

async function listNotificationEmails(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => await ctx.db.query('principalNotificationEmails')
    .filter((filter) => filter.eq(filter.field('principalRef'), PRINCIPAL_REF))
    .collect())
}

type PreferenceRow = Readonly<{ deliveryEmail?: string }>

async function listNotificationPreferences(backend: InteractiveAuthorityBackend): Promise<PreferenceRow[]> {
  return await backend.run(async (ctx) =>
    (await ctx.db.query('userNotificationPreferences')
      .filter((filter) => filter.eq(filter.field('principalRef'), PRINCIPAL_REF))
      .collect()) as PreferenceRow[])
}

async function seedOwnerMachineAgent(
  backend: InteractiveAuthorityBackend,
  options: { ownerTokenIdentifier?: string | undefined } = { ownerTokenIdentifier: TOKEN_IDENTIFIER },
): Promise<void> {
  const credentialId = 'key_w09_machine'
  const grantRef = 'grant:w09:machine'
  const applicationRef = 'agentic-economy'
  const environment = 'sandbox' as const
  const expiresAt = 20_000
  const grantDecision = createAgentAccessGrant({
    grantRef,
    principalId: MACHINE_AGENT_REF,
    ownerId: ACCOUNT_REF,
    applicationRef,
    credentialId,
    environment,
    toolAccess: 'all_admitted',
    authorityMode: 'read_only',
    spendingPolicy: defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }),
    lifecycle: 'active',
    generation: 1,
    createdAt: NOW,
    updatedAt: NOW,
    expiresAt,
  })
  if (grantDecision.kind === 'refused') throw new Error(grantDecision.code)
  const grant = grantDecision.grant
  const bindingRef = `eib_${'m'.repeat(32)}`
  const credentialRef = `crd_${'m'.repeat(32)}`

  await backend.run(async (ctx) => {
    await ctx.db.insert('principals', {
      principalRef: MACHINE_AGENT_REF,
      kind: 'agent',
      displayName: 'Owner machine agent',
      lifecycle: 'active',
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })
    await ctx.db.insert('memberships', {
      membershipRef: `mem_${'m'.repeat(32)}`,
      accountRef: ACCOUNT_REF,
      memberPrincipalRef: MACHINE_AGENT_REF,
      lifecycle: 'active',
      revision: 1,
      createdAt: NOW,
      createdBy: {
        actorPrincipalRef: PRINCIPAL_REF,
        activeAccountRef: ACCOUNT_REF,
        correlationRef: `create:${MACHINE_AGENT_REF}`,
        idempotencyRef: `create:${MACHINE_AGENT_REF}`,
      },
    })
    await ctx.db.insert('agentAccessPrincipals', {
      principalId: MACHINE_AGENT_REF,
      ownerId: ACCOUNT_REF,
      ...(options.ownerTokenIdentifier === undefined ? {} : { ownerTokenIdentifier: options.ownerTokenIdentifier }),
      credentialId,
      applicationRef,
      environment,
      scopes: ['market_tools:call'],
      authorityMode: 'read_only',
      grantGeneration: grant.generation,
      spendingPolicyDigest: grant.spendingPolicyDigest,
      lifecycle: 'active',
      expiresAt,
      recordedAt: NOW,
      lastSeenAt: NOW,
    })
    await ctx.db.insert('agentAccessGrants', grant)
    await ctx.db.insert('externalIdentityBindings', {
      bindingRef,
      principalRef: MACHINE_AGENT_REF,
      providerNamespace: 'clerk/api-key',
      providerIdentifier: credentialId,
      providerState: { kind: 'known', value: 'active' },
      lifecycle: 'active',
      credentialGeneration: 1,
      bindIdempotencyRef: `bind:${bindingRef}`,
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })
    await ctx.db.insert('credentials', {
      bindingRef,
      credentialRef,
      principalRef: MACHINE_AGENT_REF,
      type: 'api_key',
      lifecycle: 'active',
      generation: 1,
      issueIdempotencyRef: `issue:${credentialRef}`,
      revision: 1,
      issuedAt: NOW,
      expiresAt,
      updatedAt: NOW,
    })
  })
}

async function readAgentAccessPrincipal(backend: InteractiveAuthorityBackend, principalId: string) {
  return await backend.run(async (ctx) => await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', principalId))
    .unique())
}

async function listAuditEvents(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => await ctx.db.query('auditEvents').collect())
}

async function seedTeammateMembership(backend: InteractiveAuthorityBackend): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('principals', {
      principalRef: TEAMMATE_PRINCIPAL_REF,
      kind: 'human',
      displayName: 'Teammate',
      lifecycle: 'active',
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })
    await ctx.db.insert('memberships', {
      membershipRef: TEAMMATE_MEMBERSHIP_REF,
      accountRef: ACCOUNT_REF,
      memberPrincipalRef: TEAMMATE_PRINCIPAL_REF,
      lifecycle: 'active',
      revision: 1,
      createdAt: NOW,
      createdBy: {
        actorPrincipalRef: PRINCIPAL_REF,
        activeAccountRef: ACCOUNT_REF,
        correlationRef: `create:${TEAMMATE_MEMBERSHIP_REF}`,
        idempotencyRef: `create:${TEAMMATE_MEMBERSHIP_REF}`,
      },
    })
  })
}

type CommercialSnapshots = Readonly<{
  calls: readonly unknown[]
  documents: readonly unknown[]
  ledger: readonly unknown[]
}>

async function seedCommercialRecords(backend: InteractiveAuthorityBackend): Promise<CommercialSnapshots> {
  const callRef = 'call:w09:r15'
  const documentRef = 'doc:w09:r15'
  const observationRef = 'obs:w09:r15'
  await backend.run(async (ctx) => {
    await ctx.db.insert('capabilityCalls', {
      callRef,
      principalId: PRINCIPAL_REF,
      ownerId: ACCOUNT_REF,
      credentialId: 'credential:w09',
      applicationRef: 'application:w09',
      toolRef: 'tool:w09',
      idempotencyKey: 'idempotency:w09:r15',
      environment: 'sandbox',
      grantRef: 'grant:w09',
      grantGeneration: 1,
      policyDigest: canonicalDigest({ kind: 'grant', callRef }),
      grantExpiresAt: NOW + 60_000,
      inputDigest: canonicalDigest({ kind: 'input', callRef }),
      requestDigest: canonicalDigest({ kind: 'request', callRef }),
      state: 'completed',
      dispatchState: 'completed',
      createdAt: NOW,
      updatedAt: NOW,
    })
    await ctx.db.insert('moneyDocuments', {
      documentRef,
      accountRef: ACCOUNT_REF,
      kind: 'tax_invoice',
      sourceTransactionRefs: ['txn:w09:r15'],
      amountUnits: '1000000',
      residualUnits: '0',
      policyRefs: ['policy:w09'],
      policyDigest: canonicalDigest({ kind: 'policy', documentRef }),
      templateVersion: 'v1',
      renderInputJson: '{}',
      renderInputDigest: canonicalDigest({ kind: 'render', documentRef }),
      state: 'issued',
      environment: 'sandbox',
      sourceCount: 1,
      snapshotDigest: canonicalDigest({ kind: 'snapshot', documentRef }),
      createdAt: NOW,
    })
    await ctx.db.insert('moneyTreasuryObservations', {
      observationRef,
      environment: 'sandbox',
      custodyRef: 'custody:w09',
      custodyGeneration: 1,
      network: 'sandbox',
      asset: 'USDC',
      exponent: 6,
      totalUnits: '1000000',
      bufferUnits: '0',
      evidenceRef: 'evidence:w09',
      evidenceDigest: canonicalDigest({ kind: 'evidence', observationRef }),
      observedAt: NOW,
      recordedAt: NOW,
    })
  })
  return await readCommercialSnapshots(backend)
}

async function readCommercialSnapshots(backend: InteractiveAuthorityBackend): Promise<CommercialSnapshots> {
  return await backend.run(async (ctx) => ({
    calls: await ctx.db.query('capabilityCalls').collect(),
    documents: await ctx.db.query('moneyDocuments').collect(),
    ledger: await ctx.db.query('moneyTreasuryObservations').collect(),
  }))
}
