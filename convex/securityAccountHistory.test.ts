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
import { api } from './_generated/api'
import schema from './schema'
import { interactiveCredentialExpiryNonce } from './interactiveCredentialLifecycle'
import { ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT } from './securityAccountHistory'

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
      const command = observation(owner.providerIdentifier, delivery, observedAt)
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
    const agentPrincipalRef = await insertAgent(backend, owner, 'history_agent')
    await backend.run(async (ctx) => {
      await ctx.db.insert('auditEvents', auditRow({
        eventId: 'audit:agent-history:created',
        activeAccountRef: owner.accountRef,
        targetRef: agentPrincipalRef,
        sourceSystem: 'ae_recorded',
        createdAt: ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT + 1_000,
      }))
      await ctx.db.insert('auditEvents', auditRow({
        eventId: 'audit:agent-history:renamed',
        activeAccountRef: owner.accountRef,
        targetRef: agentPrincipalRef,
        eventType: 'agent.renamed',
        sourceSystem: 'ae_recorded',
        createdAt: ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT + 2_000,
      }))
      await ctx.db.insert('auditEvents', auditRow({
        eventId: 'audit:agent-history:foreign',
        activeAccountRef: sibling.accountRef,
        targetRef: agentPrincipalRef,
        sourceSystem: 'ae_recorded',
        createdAt: ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT + 3_000,
      }))
    })

    const firstPage = await owner.client.query(
      api.securityAccountHistory.listCurrentOwnerAgentSecurityHistory,
      { principalRef: agentPrincipalRef, paginationOpts: { cursor: null, numItems: 1 } },
    )
    expect(firstPage.page).toEqual([expect.objectContaining({
      eventRef: 'audit:agent-history:renamed',
      targetRef: agentPrincipalRef,
      sourceSystem: 'ae_recorded',
    })])
    expect(firstPage.isDone).toBe(false)
    const secondPage = await owner.client.query(
      api.securityAccountHistory.listCurrentOwnerAgentSecurityHistory,
      { principalRef: agentPrincipalRef, paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 } },
    )
    expect(secondPage.page).toEqual([expect.objectContaining({
      eventRef: 'audit:agent-history:created',
      targetRef: agentPrincipalRef,
    })])
    expect(secondPage.page.some(({ eventRef }) => eventRef === 'audit:agent-history:foreign')).toBe(false)
    await expect(sibling.client.query(
      api.securityAccountHistory.listCurrentOwnerAgentSecurityHistory,
      { principalRef: agentPrincipalRef, paginationOpts: { cursor: null, numItems: 10 } },
    )).rejects.toThrow('agent_history_not_found')
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
      scopes: ['market_operations:invoke'],
      authorityMode: 'inspect_only',
      grantGeneration: 1,
      policyDigest: canonicalDigest({ kind: 'agent-policy', suffix }),
      lifecycle: 'active',
      expiresAt: 8_000_000_000_000,
      recordedAt: 1,
      lastSeenAt: 1,
    })
  })
  return principalRef
}

function observation(
  providerIdentifier: string,
  delivery = 'delivery',
  observedAt = 1_000,
): ClerkSecurityObservation {
  return {
    deliveryRefHash: canonicalDigest({ kind: 'delivery', delivery }),
    providerIdentifier,
    eventType: 'session.revoked',
    targetRefHash: canonicalDigest({ kind: 'session', delivery }),
    observedAt,
  }
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
    client: backend.withIdentity(identity),
  }
}
