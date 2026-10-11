/// <reference types="vite/client" />
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, describe, expect, it } from 'vitest'

import {
  CLERK_SECURITY_OBSERVE_OPERATION,
  CLERK_SECURITY_OBSERVE_SCOPE,
  type ClerkSecurityObservation,
} from '../src/modules/security/account-security'
import { createCustomerRequestServiceAssertion } from '../src/modules/agent-access/service-auth-envelope'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { createAgentAccessGrant } from '../src/modules/agent-access/policy'
import { defaultSandboxAgentAccessPolicy } from '../src/modules/agent-access/sandbox-policy'
import { convexTestWithWorkers } from '../tests/helpers/convex-fixtures'
import { api, internal } from './_generated/api'
import schema from './schema'
import { interactiveCredentialExpiryNonce } from './lib/principalAccount/interactiveCredential/nonce'
import { ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT } from './lib/security/accountHistory/history'

const modules = import.meta.glob('./**/*.ts')
const serviceKey = 'clerk-security-test-service-key-material-32'
const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN

afterEach(() => {
  if (previousServiceKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
  else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousServiceKey
})

describe('account security history', () => {
  it('persists one redacted Account event and replays the same delivery', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    const backend = convexTest(schema, modules)
    const owner = await insertOwner(backend, 'one')
    const command = observation(owner.providerIdentifier)
    const serviceAuth = await assertion(command)

    expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
      ...command,
      serviceAuth,
    })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))
    expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
      ...command,
      serviceAuth: await assertion(command),
    })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'replayed' }))

    const rows = await backend.run(async (ctx) => await ctx.db.query('auditEvents').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      activeAccountRef: owner.accountRef,
      actorRef: owner.principalRef,
      eventType: 'account.session.revoked',
      sourceSystem: 'clerk_observed',
      targetType: 'session',
      observedAt: command.observedAt,
    })
    expect(JSON.stringify(rows[0])).not.toContain('user_one')
    expect(JSON.stringify(rows[0])).not.toContain('session_raw')
  })

  it('refuses an invalid exact-command assertion without writing an event', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    const backend = convexTest(schema, modules)
    const owner = await insertOwner(backend, 'two')
    const command = observation(owner.providerIdentifier)
    const different = { ...command, observedAt: command.observedAt + 1 }

    expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
      ...command,
      serviceAuth: await assertion(different),
    })).toEqual({ kind: 'refused', code: 'authentication_required' })
    expect(await backend.run(async (ctx) => await ctx.db.query('auditEvents').collect())).toEqual([])
  })

  it('ignores an unbound Clerk subject without creating an Account event', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    const backend = convexTest(schema, modules)
    const command = observation('https://clerk.example.test|user_unbound')

    expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
      ...command,
      serviceAuth: await assertion(command),
    })).toEqual({ kind: 'accepted', status: 'ignored' })
    expect(await backend.run(async (ctx) => await ctx.db.query('auditEvents').collect())).toEqual([])
  })

  it('paginates strictly within the authenticated current Account', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    const backend = convexTest(schema, modules)
    const first = await insertOwner(backend, 'first')
    const second = await insertOwner(backend, 'second')
    for (const [owner, delivery, observedAt] of [
      [first, 'a', 1_000],
      [first, 'b', 2_000],
      [second, 'c', 3_000],
    ] as const) {
      const command = observation(owner.providerIdentifier, delivery, observedAt, {
        securityAction: 'observe_only',
      })
      await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })
    }

    const firstPage = await first.client.query(
      api.securityAccountHistory.listCurrentOwnerSecurityHistory,
      { paginationOpts: { cursor: null, numItems: 1 } },
    )
    expect(firstPage.page).toHaveLength(1)
    expect(firstPage.page[0]?.actorRef).toBe(first.principalRef)
    expect(firstPage.isDone).toBe(false)
    const secondPage = await first.client.query(
      api.securityAccountHistory.listCurrentOwnerSecurityHistory,
      { paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 } },
    )
    expect(secondPage.page).toHaveLength(1)
    expect(secondPage.page[0]?.actorRef).toBe(first.principalRef)
    expect(secondPage.page.some((row) => row.actorRef === second.principalRef)).toBe(false)
  })

  it('enforces the activation time, closed event family, stored outcome, and provenance', async () => {
    const backend = convexTest(schema, modules)
    const owner = await insertOwner(backend, 'activation')
    await backend.run(async (ctx) => {
      await ctx.db.insert('auditEvents', auditRow({
        eventId: 'audit:missing-source',
        activeAccountRef: owner.accountRef,
        createdAt: ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT + 4_000,
      }))
      await ctx.db.insert('auditEvents', auditRow({
        eventId: 'audit:pre-activation',
        activeAccountRef: owner.accountRef,
        sourceSystem: 'ae_recorded',
        createdAt: ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT - 1,
      }))
      await ctx.db.insert('auditEvents', auditRow({
        eventId: 'audit:unrelated-family',
        activeAccountRef: owner.accountRef,
        eventType: 'billing.receipt_recorded',
        sourceSystem: 'ae_recorded',
        createdAt: ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT + 3_000,
      }))
      await ctx.db.insert('auditEvents', auditRow({
        eventId: 'audit:missing-outcome',
        activeAccountRef: owner.accountRef,
        sourceSystem: 'ae_recorded',
        afterState: undefined,
        createdAt: ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT + 2_000,
      }))
      await ctx.db.insert('auditEvents', auditRow({
        eventId: 'audit:current',
        activeAccountRef: owner.accountRef,
        sourceSystem: 'ae_recorded',
        createdAt: ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT + 1_000,
      }))
    })

    const page = await owner.client.query(
      api.securityAccountHistory.listCurrentOwnerSecurityHistory,
      { paginationOpts: { cursor: null, numItems: 10 } },
    )
    expect(page.page).toHaveLength(1)
    expect(page.page[0]?.eventRef).toBe('audit:current')
    expect(page.page[0]?.sourceSystem).toBe('ae_recorded')
    expect(page.page[0]?.outcome).toBe('created')
    expect(page.page[0]).not.toHaveProperty('observedAt')
    expect(page.page.map((row) => row.eventRef)).toEqual(['audit:current'])
  })

  it('paginates one owned Agent by the Account-target index without leaking sibling history', async () => {
    const backend = convexTest(schema, modules)
    const owner = await insertOwner(backend, 'agent_history_owner')
    const sibling = await insertOwner(backend, 'agent_history_sibling')
    const agentRef = await insertAgent(backend, owner, 'history_agent')
    await backend.run(async (ctx) => {
      await ctx.db.insert('auditEvents', auditRow({
        eventId: 'audit:agent-history:created',
        activeAccountRef: owner.accountRef,
        targetRef: agentRef,
        sourceSystem: 'ae_recorded',
        createdAt: ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT + 1_000,
      }))
      await ctx.db.insert('auditEvents', auditRow({
        eventId: 'audit:agent-history:renamed',
        activeAccountRef: owner.accountRef,
        targetRef: agentRef,
        eventType: 'agent.renamed',
        sourceSystem: 'ae_recorded',
        createdAt: ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT + 2_000,
      }))
      await ctx.db.insert('auditEvents', auditRow({
        eventId: 'audit:agent-history:foreign',
        activeAccountRef: sibling.accountRef,
        targetRef: agentRef,
        sourceSystem: 'ae_recorded',
        createdAt: ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT + 3_000,
      }))
    })

    const firstPage = await owner.client.query(
      api.securityAccountHistory.listCurrentOwnerAgentSecurityHistory,
      { principalRef: agentRef, paginationOpts: { cursor: null, numItems: 1 } },
    )
    expect(firstPage.page).toEqual([expect.objectContaining({
      eventRef: 'audit:agent-history:renamed',
      targetRef: agentRef,
      sourceSystem: 'ae_recorded',
    })])
    expect(firstPage.isDone).toBe(false)
    const secondPage = await owner.client.query(
      api.securityAccountHistory.listCurrentOwnerAgentSecurityHistory,
      { principalRef: agentRef, paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 } },
    )
    expect(secondPage.page).toEqual([expect.objectContaining({
      eventRef: 'audit:agent-history:created',
      targetRef: agentRef,
    })])
    expect(secondPage.page.some(({ eventRef }) => eventRef === 'audit:agent-history:foreign')).toBe(false)
    await expect(sibling.client.query(
      api.securityAccountHistory.listCurrentOwnerAgentSecurityHistory,
      { principalRef: agentRef, paginationOpts: { cursor: null, numItems: 10 } },
    )).rejects.toThrow('agent_history_not_found')
  })

  describe('W-03 credential revocation cascade', () => {
    it('B1: first session.revoked delivery audits and revokes credentials issued at or before observedAt', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const backend = convexTest(schema, modules)
      const owner = await insertOwner(backend, 'revoke_first')
      const observedAt = 5_000
      const command = observation(owner.providerIdentifier, 'delivery_revoke_b1', observedAt, {
        eventType: 'session.revoked',
        securityAction: 'revoke_interactive_credentials',
      })

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))

      const credential = await readProviderTokenCredential(backend, owner.bindingRef)
      expect(credential).toMatchObject({ lifecycle: 'revoked', issuedAt: 1 })
      expect(credential?.revokedAt).toBeDefined()
    })

    it('B2: replayed session.revoked delivery does not re-patch credentials', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const backend = convexTest(schema, modules)
      const owner = await insertOwner(backend, 'revoke_replay')
      const command = observation(owner.providerIdentifier, 'delivery_revoke_b2', 5_000, {
        eventType: 'session.revoked',
        securityAction: 'revoke_interactive_credentials',
      })
      const serviceAuth = await assertion(command)

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth,
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))

      const afterFirst = await readProviderTokenCredential(backend, owner.bindingRef)
      expect(afterFirst?.lifecycle).toBe('revoked')
      const revisionAfterFirst = afterFirst?.revision

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'replayed' }))

      const afterReplay = await readProviderTokenCredential(backend, owner.bindingRef)
      expect(afterReplay?.revision).toBe(revisionAfterFirst)
    })

    it('B3: session.ended records audit only and leaves credentials active', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const backend = convexTest(schema, modules)
      const owner = await insertOwner(backend, 'ended_observe')
      const command = observation(owner.providerIdentifier, 'delivery_ended_b3', 4_000, {
        eventType: 'session.ended',
        securityAction: 'observe_only',
      })

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))

      const credential = await readProviderTokenCredential(backend, owner.bindingRef)
      expect(credential).toMatchObject({ lifecycle: 'active' })
    })

    it('B5: user.updated with revoke_interactive_credentials revokes credentials', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const backend = convexTest(schema, modules)
      const owner = await insertOwner(backend, 'password_reset')
      const command = observation(owner.providerIdentifier, 'delivery_password_b5', 7_000, {
        eventType: 'user.updated',
        securityAction: 'revoke_interactive_credentials',
        targetRefHash: canonicalDigest({ kind: 'security-profile', owner: owner.accountRef }),
      })

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))

      const credential = await readProviderTokenCredential(backend, owner.bindingRef)
      expect(credential).toMatchObject({ lifecycle: 'revoked' })
    })

    it('B8: credentials issued after observedAt remain active', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const backend = convexTest(schema, modules)
      const owner = await insertOwner(backend, 'issued_after')
      const observedAt = 5_000
      await insertProviderTokenCredential(backend, owner, {
        credentialRef: `${owner.credentialRef}_successor`,
        generation: 2,
        issuedAt: 6_000,
      })
      const command = observation(owner.providerIdentifier, 'delivery_b8', observedAt, {
        eventType: 'session.revoked',
        securityAction: 'revoke_interactive_credentials',
      })

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))

      const credentials = await listProviderTokenCredentials(backend, owner.bindingRef)
      expect(credentials).toEqual(expect.arrayContaining([
        expect.objectContaining({ generation: 1, lifecycle: 'revoked' }),
        expect.objectContaining({ generation: 2, lifecycle: 'active', issuedAt: 6_000 }),
      ]))
    })

    it('B12: multiple account ownerships revoke credentials without authority_conflict', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const backend = convexTest(schema, modules)
      const owner = await insertOwner(backend, 'multi_owner')
      await insertAdditionalOwnership(backend, owner, 'multi_owner_b')
      const command = observation(owner.providerIdentifier, 'delivery_b12', 5_000, {
        eventType: 'session.revoked',
        securityAction: 'revoke_interactive_credentials',
      })

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))

      const credential = await readProviderTokenCredential(backend, owner.bindingRef)
      expect(credential).toMatchObject({ lifecycle: 'revoked' })
    })

    it('B13: member-only principal with zero ownerships revokes credentials', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const backend = convexTest(schema, modules)
      const host = await insertOwner(backend, 'member_host')
      const member = await insertMemberOnlyPrincipal(backend, 'member_only', host.accountRef)
      const command = observation(member.providerIdentifier, 'delivery_b13', 5_000, {
        eventType: 'session.revoked',
        securityAction: 'revoke_interactive_credentials',
      })

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))

      const credential = await readProviderTokenCredential(backend, member.bindingRef)
      expect(credential).toMatchObject({ lifecycle: 'revoked' })
    })
  })

  describe('W-05 machine agent grant revocation cascade', () => {
    it('C1: session.revoked revokes interactive credentials but leaves owner machine grants active', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const backend = convexTest(schema, modules)
      const owner = await insertOwner(backend, 'w05_c1_owner')
      const machine = await insertOwnerMachineAgent(backend, owner, 'w05_c1_agent', owner.providerIdentifier)
      const observedAt = 5_000
      const command = observation(owner.providerIdentifier, 'delivery_w05_c1', observedAt, {
        eventType: 'session.revoked',
        securityAction: 'revoke_interactive_credentials',
      })

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))

      const interactive = await readProviderTokenCredential(backend, owner.bindingRef)
      expect(interactive).toMatchObject({ lifecycle: 'revoked' })

      const grantRow = await readAgentAccessGrantRow(backend, machine.grantRef)
      expect(grantRow).toMatchObject({ lifecycle: 'active' })

      const activeGrant = await readActiveGrantForMachine(backend, machine, observedAt)
      expect(activeGrant).not.toBeNull()
      expect(activeGrant?.grantRef).toBe(machine.grantRef)
    })

    it('C4: password-reset user.updated cascades owner machine grants and admission lifecycle', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const backend = convexTest(schema, modules)
      const owner = await insertOwner(backend, 'w05_c4_owner')
      const machine = await insertOwnerMachineAgent(backend, owner, 'w05_c4_agent', owner.providerIdentifier)
      const observedAt = 7_000
      const command = observation(owner.providerIdentifier, 'delivery_w05_c4', observedAt, {
        eventType: 'user.updated',
        securityAction: 'revoke_interactive_credentials',
        targetRefHash: canonicalDigest({ kind: 'security-profile', owner: owner.accountRef }),
      })

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))

      const interactive = await readProviderTokenCredential(backend, owner.bindingRef)
      expect(interactive).toMatchObject({ lifecycle: 'revoked' })

      const grantRow = await readAgentAccessGrantRow(backend, machine.grantRef)
      expect(grantRow).toMatchObject({ lifecycle: 'revoked' })

      const admission = await readAgentAccessPrincipal(backend, machine.agentPrincipalRef)
      expect(admission).toMatchObject({ lifecycle: 'revoked' })

      const activeGrant = await readActiveGrantForMachine(backend, machine, observedAt)
      expect(activeGrant).toBeNull()
    })

    it('C7: password-reset does not revoke teammate machine grants on the same account', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const backend = convexTest(schema, modules)
      const owner = await insertOwner(backend, 'w05_c7_owner')
      const teammate = await insertMemberOnlyPrincipal(backend, 'w05_c7_teammate', owner.accountRef)
      const ownerMachine = await insertOwnerMachineAgent(backend, owner, 'w05_c7_owner_agent', owner.providerIdentifier)
      const teammateMachine = await insertOwnerMachineAgent(
        backend,
        owner,
        'w05_c7_teammate_agent',
        teammate.providerIdentifier,
        teammate.principalRef,
      )
      const observedAt = 7_000
      const command = observation(owner.providerIdentifier, 'delivery_w05_c7', observedAt, {
        eventType: 'user.updated',
        securityAction: 'revoke_interactive_credentials',
        targetRefHash: canonicalDigest({ kind: 'security-profile', owner: owner.accountRef }),
      })

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))

      const ownerGrant = await readAgentAccessGrantRow(backend, ownerMachine.grantRef)
      expect(ownerGrant).toMatchObject({ lifecycle: 'revoked' })

      const teammateGrant = await readAgentAccessGrantRow(backend, teammateMachine.grantRef)
      expect(teammateGrant).toMatchObject({ lifecycle: 'active' })

      const teammateAdmission = await readAgentAccessPrincipal(backend, teammateMachine.agentPrincipalRef)
      expect(teammateAdmission).toMatchObject({ lifecycle: 'active' })

      const activeTeammateGrant = await readActiveGrantForMachine(backend, teammateMachine, observedAt)
      expect(activeTeammateGrant?.grantRef).toBe(teammateMachine.grantRef)
    })

    it('C11: replayed password-reset delivery does not re-patch revoked machine rows', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const backend = convexTest(schema, modules)
      const owner = await insertOwner(backend, 'w05_c11_owner')
      const machine = await insertOwnerMachineAgent(backend, owner, 'w05_c11_agent', owner.providerIdentifier)
      const observedAt = 7_000
      const command = observation(owner.providerIdentifier, 'delivery_w05_c11', observedAt, {
        eventType: 'user.updated',
        securityAction: 'revoke_interactive_credentials',
        targetRefHash: canonicalDigest({ kind: 'security-profile', owner: owner.accountRef }),
      })
      const serviceAuth = await assertion(command)

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth,
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))

      const grantAfterFirst = await readAgentAccessGrantRow(backend, machine.grantRef)
      const admissionAfterFirst = await readAgentAccessPrincipal(backend, machine.agentPrincipalRef)
      const interactiveAfterFirst = await readProviderTokenCredential(backend, owner.bindingRef)

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'replayed' }))

      const grantAfterReplay = await readAgentAccessGrantRow(backend, machine.grantRef)
      const admissionAfterReplay = await readAgentAccessPrincipal(backend, machine.agentPrincipalRef)
      const interactiveAfterReplay = await readProviderTokenCredential(backend, owner.bindingRef)

      expect(grantAfterReplay).toEqual(grantAfterFirst)
      expect(admissionAfterReplay).toEqual(admissionAfterFirst)
      expect(interactiveAfterReplay?.revision).toBe(interactiveAfterFirst?.revision)
    })
  })

  describe('W-06 profile sync', () => {
    it('S1: observe_only profile observation updates principal displayName and audits', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const backend = convexTest(schema, modules)
      const owner = await insertOwner(backend, 'w06_s1')
      const command = profileObservation(owner, 'delivery_w06_s1', 9_000, 'Ada Lovelace')

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))

      const principal = await readPrincipal(backend, owner.principalRef)
      expect(principal).toMatchObject({ displayName: 'Ada Lovelace', revision: 2 })

      const rows = await backend.run(async (ctx) => await ctx.db.query('auditEvents').collect())
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        eventType: 'account.security_profile.updated',
        actorRef: owner.principalRef,
        activeAccountRef: owner.accountRef,
        sourceSystem: 'clerk_observed',
      })
    })

    it('S2: replayed profile observation does not duplicate audit or bump revision', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const backend = convexTest(schema, modules)
      const owner = await insertOwner(backend, 'w06_s2')
      const command = profileObservation(owner, 'delivery_w06_s2', 9_000, 'Ada Lovelace')
      const serviceAuth = await assertion(command)

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth,
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'replayed' }))

      const principal = await readPrincipal(backend, owner.principalRef)
      expect(principal?.revision).toBe(2)
      const rows = await backend.run(async (ctx) => await ctx.db.query('auditEvents').collect())
      expect(rows).toHaveLength(1)
    })

    it('S3: matching displayName records audit without bumping principal revision', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const backend = convexTest(schema, modules)
      const owner = await insertOwner(backend, 'w06_s3')
      const unchangedName = 'w06_s3 owner'
      const command = profileObservation(owner, 'delivery_w06_s3', 9_000, unchangedName)

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))

      const principal = await readPrincipal(backend, owner.principalRef)
      expect(principal).toMatchObject({ displayName: unchangedName, revision: 1 })
      const rows = await backend.run(async (ctx) => await ctx.db.query('auditEvents').collect())
      expect(rows).toHaveLength(1)
      expect(rows[0]?.eventType).toBe('account.security_profile.updated')
    })

    it('S4: stale observedAt does not overwrite a newer principal displayName', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const backend = convexTest(schema, modules)
      const owner = await insertOwner(backend, 'w06_s4')
      await backend.run(async (ctx) => {
        const principal = await ctx.db.query('principals')
          .withIndex('by_principalRef', (index) => index.eq('principalRef', owner.principalRef))
          .unique()
        if (principal === null) throw new Error('principal_missing')
        await ctx.db.patch(principal._id, {
          displayName: 'Current Name',
          updatedAt: 10_000,
          revision: 2,
        })
      })
      const command = profileObservation(owner, 'delivery_w06_s4', 5_000, 'Stale Name')

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))

      const principal = await readPrincipal(backend, owner.principalRef)
      expect(principal).toMatchObject({ displayName: 'Current Name', revision: 2 })
    })

    it('S5: profile sync does not change workspace account displayName', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const backend = convexTest(schema, modules)
      const owner = await insertOwner(backend, 'w06_s5')
      const workspaceName = 'w06_s5 account'
      const command = profileObservation(owner, 'delivery_w06_s5', 9_000, 'Ada Lovelace')

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))

      const account = await readAccount(backend, owner.accountRef)
      expect(account?.displayName).toBe(workspaceName)
    })

    it('E1: first primary email sighting records the digest, a later change enqueues email_changed once', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const prior = { phase2: process.env.AE_EMAIL_PHASE2_ENABLED, kind: process.env.AE_EMAIL_KIND_EMAIL_CHANGED_ENABLED }
      process.env.AE_EMAIL_PHASE2_ENABLED = 'true'
      process.env.AE_EMAIL_KIND_EMAIL_CHANGED_ENABLED = 'true'
      try {
        const backend = convexTestWithWorkers()
        const owner = await insertOwner(backend, 'w06_e1')
        const send = async (delivery: string, observedAt: number, email: string) => {
          const command = {
            ...profileObservation(owner, delivery, observedAt, 'Ada Lovelace'),
            primaryEmailDigest: canonicalDigest({ contract: 'ae.clerk-primary-email:v1', email }),
          }
          await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
            ...command, serviceAuth: await assertion(command),
          })
        }
        const notices = async () => (await backend.run(async (ctx) => await ctx.db.query('notificationDeliveries').collect()))
          .filter((row) => row.eventKind === 'email_changed')

        await send('delivery_e1_a', 9_000, 'a@example.test')
        expect(await notices()).toHaveLength(0)
        await send('delivery_e1_b', 9_100, 'b@example.test')
        expect(await notices()).toHaveLength(1)
        await send('delivery_e1_b', 9_100, 'b@example.test')
        expect(await notices()).toHaveLength(1)
      } finally {
        if (prior.phase2 === undefined) delete process.env.AE_EMAIL_PHASE2_ENABLED; else process.env.AE_EMAIL_PHASE2_ENABLED = prior.phase2
        if (prior.kind === undefined) delete process.env.AE_EMAIL_KIND_EMAIL_CHANGED_ENABLED; else process.env.AE_EMAIL_KIND_EMAIL_CHANGED_ENABLED = prior.kind
      }
    })

    it('S7: password-reset observation revokes credentials and updates displayName', async () => {
      process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
      const backend = convexTest(schema, modules)
      const owner = await insertOwner(backend, 'w06_s7')
      const command = observation(owner.providerIdentifier, 'delivery_w06_s7', 7_000, {
        eventType: 'user.updated',
        securityAction: 'revoke_interactive_credentials',
        profileDisplayName: 'Ada Lovelace',
        targetRefHash: canonicalDigest({ kind: 'security-profile', owner: owner.accountRef }),
      })

      expect(await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
        ...command,
        serviceAuth: await assertion(command),
      })).toEqual(expect.objectContaining({ kind: 'accepted', status: 'applied' }))

      const credential = await readProviderTokenCredential(backend, owner.bindingRef)
      expect(credential).toMatchObject({ lifecycle: 'revoked' })
      const principal = await readPrincipal(backend, owner.principalRef)
      expect(principal).toMatchObject({ displayName: 'Ada Lovelace', revision: 2 })
    })
  })
})

function auditRow(input: Readonly<{
  eventId: string
  activeAccountRef: string
  eventType?: 'agent.created' | 'agent.renamed' | 'billing.receipt_recorded'
  sourceSystem?: 'ae_recorded'
  afterState?: string | undefined
  targetRef?: string
  createdAt: number
}>) {
  return {
    eventId: input.eventId,
    eventType: input.eventType ?? 'agent.created' as const,
    actorKind: 'owner' as const,
    actorRef: 'prn_0123456789abcdef0123456789abcdef',
    activeAccountRef: input.activeAccountRef,
    ...(input.sourceSystem === undefined ? {} : { sourceSystem: input.sourceSystem }),
    targetType: 'agent' as const,
    targetRef: input.targetRef ?? 'prn_abcdef0123456789abcdef0123456789',
    beforeState: 'missing',
    ...(input.afterState === undefined && Object.hasOwn(input, 'afterState')
      ? {}
      : { afterState: input.afterState ?? 'created' }),
    idempotencyKey: input.eventId,
    correlationId: input.eventId,
    evidenceRefs: [],
    redactedPayloadJson: '{}',
    payloadHash: canonicalDigest({ eventId: input.eventId }),
    createdAt: input.createdAt,
  }
}

async function insertAgent(
  backend: TestConvex<typeof schema>,
  owner: Awaited<ReturnType<typeof insertOwner>>,
  suffix: string,
): Promise<string> {
  const digest = canonicalDigest({ kind: 'security-history-agent', suffix })
    .slice('sha256:'.length, 'sha256:'.length + 32)
  const principalRef = `prn_${digest}`
  await backend.run(async (ctx) => {
    await ctx.db.insert('principals', {
      principalRef,
      kind: 'agent',
      displayName: `${suffix} agent`,
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('memberships', {
      membershipRef: `mem_${digest}`,
      accountRef: owner.accountRef,
      memberPrincipalRef: principalRef,
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      createdBy: {
        actorPrincipalRef: owner.principalRef,
        activeAccountRef: owner.accountRef,
        correlationRef: `create:${principalRef}`,
        idempotencyRef: `create:${principalRef}`,
      },
    })
    await ctx.db.insert('agentAccessPrincipals', {
      principalId: principalRef,
      ownerId: owner.accountRef,
      credentialId: `key_${suffix}`,
      applicationRef: 'agentic-economy',
      environment: 'sandbox',
      scopes: ['market_tools:call'],
      authorityMode: 'read_only',
      grantGeneration: 1,
      spendingPolicyDigest: canonicalDigest({ kind: 'agent-policy', suffix }),
      lifecycle: 'active',
      expiresAt: 8_000_000_000_000,
      recordedAt: 1,
      lastSeenAt: 1,
    })
  })
  return principalRef
}

function profileObservation(
  owner: Pick<Awaited<ReturnType<typeof insertOwner>>, 'providerIdentifier' | 'accountRef'>,
  delivery: string,
  observedAt: number,
  profileDisplayName: string,
): ClerkSecurityObservation {
  return observation(owner.providerIdentifier, delivery, observedAt, {
    eventType: 'user.updated',
    securityAction: 'observe_only',
    profileDisplayName,
    targetRefHash: canonicalDigest({ kind: 'security-profile', owner: owner.accountRef }),
  })
}

function observation(
  providerIdentifier: string,
  delivery = 'delivery',
  observedAt = 1_000,
  overrides: Partial<ClerkSecurityObservation> = {},
): ClerkSecurityObservation {
  const eventType = overrides.eventType ?? 'session.revoked'
  const securityAction = overrides.securityAction ?? (
    eventType === 'session.revoked' || eventType === 'user.updated'
      ? 'revoke_interactive_credentials'
      : 'observe_only'
  )
  return {
    deliveryRefHash: canonicalDigest({ kind: 'delivery', delivery }),
    providerIdentifier,
    eventType,
    targetRefHash: canonicalDigest({ kind: 'session', delivery }),
    observedAt,
    securityAction,
    ...overrides,
  }
}

async function readPrincipal(backend: TestConvex<typeof schema>, principalRef: string) {
  return await backend.run(async (ctx) => await ctx.db.query('principals')
    .withIndex('by_principalRef', (index) => index.eq('principalRef', principalRef))
    .unique())
}

async function readAccount(backend: TestConvex<typeof schema>, accountRef: string) {
  return await backend.run(async (ctx) => await ctx.db.query('accounts')
    .withIndex('by_accountRef', (index) => index.eq('accountRef', accountRef))
    .unique())
}

async function readProviderTokenCredential(
  backend: TestConvex<typeof schema>,
  bindingRef: string,
  generation = 1,
) {
  return await backend.run(async (ctx) => await ctx.db.query('credentials')
    .withIndex('by_bindingRef_and_generation_and_lifecycle', (index) => index
      .eq('bindingRef', bindingRef)
      .eq('generation', generation)
      .eq('lifecycle', 'active'))
    .unique()
    ?? await ctx.db.query('credentials')
      .withIndex('by_bindingRef_and_generation_and_lifecycle', (index) => index
        .eq('bindingRef', bindingRef)
        .eq('generation', generation)
        .eq('lifecycle', 'revoked'))
      .unique())
}

async function listProviderTokenCredentials(
  backend: TestConvex<typeof schema>,
  bindingRef: string,
) {
  return await backend.run(async (ctx) => {
    const rows = await ctx.db.query('credentials')
      .filter((filter) => filter.eq(filter.field('bindingRef'), bindingRef))
      .collect()
    return rows
      .filter((row) => row.type === 'provider_token')
      .sort((left, right) => left.generation - right.generation)
  })
}

async function insertProviderTokenCredential(
  backend: TestConvex<typeof schema>,
  owner: Pick<Awaited<ReturnType<typeof insertOwner>>, 'bindingRef' | 'principalRef' | 'credentialRef'>,
  input: Readonly<{ credentialRef: string; generation: number; issuedAt: number }>,
) {
  const expiresAt = 8_000_000_000_000
  const credential = {
    bindingRef: owner.bindingRef,
    credentialRef: input.credentialRef,
    generation: input.generation,
    expiresAt,
  }
  await backend.run(async (ctx) => {
    await ctx.db.insert('credentials', {
      ...credential,
      principalRef: owner.principalRef,
      type: 'provider_token',
      lifecycle: 'active',
      issueIdempotencyRef: `issue:${input.credentialRef}`,
      revision: 1,
      issuedAt: input.issuedAt,
      expiryMaterialization: {
        state: 'scheduled',
        credentialGeneration: input.generation,
        credentialExpiresAt: expiresAt,
        scheduleNonce: interactiveCredentialExpiryNonce(credential),
        scheduleRef: `scheduled:${input.credentialRef}`,
        materializedAt: input.issuedAt,
      },
      updatedAt: input.issuedAt,
    })
  })
}

async function insertAdditionalOwnership(
  backend: TestConvex<typeof schema>,
  owner: Awaited<ReturnType<typeof insertOwner>>,
  suffix: string,
) {
  const digest = canonicalDigest({ kind: 'security-history-owner', suffix })
    .slice('sha256:'.length, 'sha256:'.length + 32)
  const accountRef = `acc_${digest}`
  const ownershipRef = `own_${digest}`
  await backend.run(async (ctx) => {
    await ctx.db.insert('accounts', {
      accountRef,
      displayName: `${suffix} account`,
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: owner.principalRef,
      creationIdempotencyRef: `create:${accountRef}`,
      initialOwnershipRef: ownershipRef,
      currentOwnershipRef: ownershipRef,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      lastAction: {
        actorPrincipalRef: owner.principalRef,
        activeAccountRef: accountRef,
        correlationRef: `create:${accountRef}`,
        idempotencyRef: `create:${accountRef}`,
      },
    })
    await ctx.db.insert('accountOwnerships', {
      ownershipRef,
      accountRef,
      ownerPrincipalRef: owner.principalRef,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: 1,
      createdBy: {
        actorPrincipalRef: owner.principalRef,
        activeAccountRef: accountRef,
        correlationRef: `create:${ownershipRef}`,
        idempotencyRef: `create:${ownershipRef}`,
      },
    })
  })
}

async function insertMemberOnlyPrincipal(
  backend: TestConvex<typeof schema>,
  suffix: string,
  hostAccountRef: string,
) {
  const digest = canonicalDigest({ kind: 'security-history-member', suffix })
    .slice('sha256:'.length, 'sha256:'.length + 32)
  const providerIdentifier = `https://clerk.example.test|user_${suffix}`
  const principalRef = `prn_${digest}`
  const bindingRef = `eib_${digest}`
  const credentialRef = `crd_${digest}`
  const expiresAt = 8_000_000_000_000
  const credential = { bindingRef, credentialRef, generation: 1, expiresAt }
  await backend.run(async (ctx) => {
    await ctx.db.insert('principals', {
      principalRef,
      kind: 'human',
      displayName: `${suffix} member`,
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('externalIdentityBindings', {
      bindingRef,
      principalRef,
      providerNamespace: 'clerk/user',
      providerIdentifier,
      interactiveSessionsRevokedBefore: 0,
      providerState: { kind: 'known', value: 'active' },
      lifecycle: 'active',
      credentialGeneration: 1,
      bindIdempotencyRef: `bind:${bindingRef}`,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('memberships', {
      membershipRef: `mem_${digest}`,
      accountRef: hostAccountRef,
      memberPrincipalRef: principalRef,
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      createdBy: {
        actorPrincipalRef: principalRef,
        activeAccountRef: hostAccountRef,
        correlationRef: `create:mem_${digest}`,
        idempotencyRef: `create:mem_${digest}`,
      },
    })
    await ctx.db.insert('credentials', {
      ...credential,
      principalRef,
      type: 'provider_token',
      lifecycle: 'active',
      issueIdempotencyRef: `issue:${credentialRef}`,
      revision: 1,
      issuedAt: 1,
      expiryMaterialization: {
        state: 'scheduled',
        credentialGeneration: 1,
        credentialExpiresAt: expiresAt,
        scheduleNonce: interactiveCredentialExpiryNonce(credential),
        scheduleRef: `scheduled:${credentialRef}`,
        materializedAt: 1,
      },
      updatedAt: 1,
    })
  })
  return { providerIdentifier, principalRef, bindingRef, credentialRef }
}

async function assertion(command: ClerkSecurityObservation) {
  const result = await createCustomerRequestServiceAssertion({
    key: serviceKey,
    operation: CLERK_SECURITY_OBSERVE_OPERATION,
    command,
    principal: {
      principalId: 'ae:server-function',
      ownerId: 'ae:server-function',
      credentialId: 'ae:server-function',
      scopes: [CLERK_SECURITY_OBSERVE_SCOPE],
    },
    issuedAt: Date.now(),
  })
  return { ...result, scopes: [...result.scopes] }
}

type OwnerFixture = Awaited<ReturnType<typeof insertOwner>>

type MachineAgentFixture = Readonly<{
  agentPrincipalRef: string
  credentialId: string
  grantRef: string
  applicationRef: string
  environment: 'sandbox'
}>

async function insertOwnerMachineAgent(
  backend: TestConvex<typeof schema>,
  owner: Pick<OwnerFixture, 'accountRef' | 'principalRef' | 'providerIdentifier'>,
  suffix: string,
  ownerTokenIdentifier: string,
  membershipCreatedByPrincipalRef?: string,
): Promise<MachineAgentFixture> {
  const digest = canonicalDigest({ kind: 'w05-machine-agent', suffix })
    .slice('sha256:'.length, 'sha256:'.length + 32)
  const agentPrincipalRef = `prn_${digest}`
  const credentialId = `key_w05_${suffix}`
  const bindingRef = `eib_${digest}`
  const credentialRef = `crd_${digest}`
  const grantRef = `grant:w05:${suffix}`
  const applicationRef = 'agentic-economy'
  const environment = 'sandbox' as const
  const expiresAt = 8_000_000_000_000
  const grantDecision = createAgentAccessGrant({
    grantRef,
    principalId: agentPrincipalRef,
    ownerId: owner.accountRef,
    applicationRef,
    credentialId,
    environment,
    toolAccess: 'all_admitted',
    authorityMode: 'read_only',
    spendingPolicy: defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }),
    lifecycle: 'active',
    generation: 1,
    createdAt: 1,
    updatedAt: 1,
    expiresAt,
  })
  if (grantDecision.kind === 'refused') throw new Error(grantDecision.code)
  const grant = grantDecision.grant
  const membershipActorRef = membershipCreatedByPrincipalRef ?? owner.principalRef

  await backend.run(async (ctx) => {
    await ctx.db.insert('principals', {
      principalRef: agentPrincipalRef,
      kind: 'agent',
      displayName: `${suffix} agent`,
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('memberships', {
      membershipRef: `mem_${digest}`,
      accountRef: owner.accountRef,
      memberPrincipalRef: agentPrincipalRef,
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      createdBy: {
        actorPrincipalRef: membershipActorRef,
        activeAccountRef: owner.accountRef,
        correlationRef: `create:${agentPrincipalRef}`,
        idempotencyRef: `create:${agentPrincipalRef}`,
      },
    })
    await ctx.db.insert('externalIdentityBindings', {
      bindingRef,
      principalRef: agentPrincipalRef,
      providerNamespace: 'clerk/api-key',
      providerIdentifier: credentialId,
      providerState: { kind: 'known', value: 'active' },
      lifecycle: 'active',
      credentialGeneration: 1,
      bindIdempotencyRef: `bind:${bindingRef}`,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('credentials', {
      bindingRef,
      credentialRef,
      principalRef: agentPrincipalRef,
      type: 'api_key',
      lifecycle: 'active',
      generation: 1,
      issueIdempotencyRef: `issue:${credentialRef}`,
      revision: 1,
      issuedAt: 1,
      expiresAt,
      updatedAt: 1,
    })
    await ctx.db.insert('agentAccessPrincipals', {
      principalId: agentPrincipalRef,
      ownerId: owner.accountRef,
      ownerTokenIdentifier,
      credentialId,
      applicationRef,
      environment,
      scopes: ['market_tools:call'],
      authorityMode: 'read_only',
      grantGeneration: grant.generation,
      spendingPolicyDigest: grant.spendingPolicyDigest,
      lifecycle: 'active',
      expiresAt,
      recordedAt: 1,
      lastSeenAt: 1,
    })
    await ctx.db.insert('agentAccessGrants', grant)
  })

  return {
    agentPrincipalRef,
    credentialId,
    grantRef,
    applicationRef,
    environment,
  }
}

async function readAgentAccessGrantRow(
  backend: TestConvex<typeof schema>,
  grantRef: string,
) {
  return await backend.run(async (ctx) => await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (index) => index.eq('grantRef', grantRef))
    .unique())
}

async function readAgentAccessPrincipal(
  backend: TestConvex<typeof schema>,
  principalId: string,
) {
  return await backend.run(async (ctx) => await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (index) => index.eq('principalId', principalId))
    .unique())
}

async function readActiveGrantForMachine(
  backend: TestConvex<typeof schema>,
  machine: MachineAgentFixture,
  now: number,
) {
  return await backend.query(internal.agentAccessPolicy.readActiveGrant, {
    credentialId: machine.credentialId,
    environment: machine.environment,
    principalId: machine.agentPrincipalRef,
    applicationRef: machine.applicationRef,
    grantRef: machine.grantRef,
    now,
  })
}

async function insertOwner(backend: TestConvex<typeof schema>, suffix: string) {
  const digest = canonicalDigest({ kind: 'security-history-owner', suffix })
    .slice('sha256:'.length, 'sha256:'.length + 32)
  const providerIdentifier = `https://clerk.example.test|user_${suffix}`
  const principalRef = `prn_${digest}`
  const accountRef = `acc_${digest}`
  const ownershipRef = `own_${digest}`
  const bindingRef = `eib_${digest}`
  const credentialRef = `crd_${digest}`
  const expiresAt = 8_000_000_000_000
  const credential = { bindingRef, credentialRef, generation: 1, expiresAt }
  await backend.run(async (ctx) => {
    await ctx.db.insert('principals', {
      principalRef,
      kind: 'human',
      displayName: `${suffix} owner`,
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('accounts', {
      accountRef,
      displayName: `${suffix} account`,
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: principalRef,
      creationIdempotencyRef: `create:${accountRef}`,
      initialOwnershipRef: ownershipRef,
      currentOwnershipRef: ownershipRef,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      lastAction: {
        actorPrincipalRef: principalRef,
        activeAccountRef: accountRef,
        correlationRef: `create:${accountRef}`,
        idempotencyRef: `create:${accountRef}`,
      },
    })
    await ctx.db.insert('accountOwnerships', {
      ownershipRef,
      accountRef,
      ownerPrincipalRef: principalRef,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: 1,
      createdBy: {
        actorPrincipalRef: principalRef,
        activeAccountRef: accountRef,
        correlationRef: `create:${ownershipRef}`,
        idempotencyRef: `create:${ownershipRef}`,
      },
    })
    await ctx.db.insert('externalIdentityBindings', {
      bindingRef,
      principalRef,
      providerNamespace: 'clerk/user',
      providerIdentifier,
      interactiveSessionsRevokedBefore: 0,
      providerState: { kind: 'known', value: 'active' },
      lifecycle: 'active',
      credentialGeneration: 1,
      bindIdempotencyRef: `bind:${bindingRef}`,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('credentials', {
      ...credential,
      principalRef,
      type: 'provider_token',
      lifecycle: 'active',
      issueIdempotencyRef: `issue:${credentialRef}`,
      revision: 1,
      issuedAt: 1,
      expiryMaterialization: {
        state: 'scheduled',
        credentialGeneration: 1,
        credentialExpiresAt: expiresAt,
        scheduleNonce: interactiveCredentialExpiryNonce(credential),
        scheduleRef: `scheduled:${credentialRef}`,
        materializedAt: 1,
      },
      updatedAt: 1,
    })
  })
  const identity = {
    subject: `user_${suffix}`,
    issuer: 'https://clerk.example.test',
    tokenIdentifier: providerIdentifier,
  }
  return {
    providerIdentifier,
    principalRef,
    accountRef,
    bindingRef,
    credentialRef,
    client: backend.withIdentity(identity),
  }
}
