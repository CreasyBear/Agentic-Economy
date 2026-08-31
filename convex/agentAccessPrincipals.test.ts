/// <reference types="vite/client" />
import { makeFunctionReference, type UserIdentity } from 'convex/server'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCustomerRequestServiceAssertion, toStableHashValue, type CustomerRequestServiceAssertion } from '../src/modules/agent-access/service-auth-envelope'
import type {
  AgentCredentialReplacementRegistration,
  AgentCredentialReplacementTransition,
  IssuedAgentBindingRegistration,
} from '../src/modules/agent-access/agent-access'
import { issuedAgentCanonicalRefs, issuedAgentGrantRef } from '../src/modules/agent-access/issued-agent-binding'
import { defaultSandboxAgentAccessPolicy } from '../src/modules/agent-access/sandbox-policy'
import schema from './schema'
import { api } from './_generated/api'
import { resolveCanonicalAgentContext, validateCanonicalAgentDelegation } from './lib/canonicalAgentAuthority'
import { canonicalAgentDelegationScopes } from './agentAccessPrincipals'

const modules = import.meta.glob('./**/*.ts')
const NOW = 10_000
const SERVICE_KEY = 'issued-agent-binding-server-key-at-least-32-bytes'
const OPERATION = 'agentAccessPrincipals.registerIssuedAgentBindingForServer'
const identity = (subject: string): UserIdentity => ({
  subject,
  issuer: 'https://clerk.example.test',
  tokenIdentifier: `https://clerk.example.test|${subject}`,
  exp: 1_000,
})

type RegisterArgs = IssuedAgentBindingRegistration & Readonly<{
  serviceAuth: CustomerRequestServiceAssertion
}>
type RegisterResult = Readonly<Record<string, unknown>>
const registerIssuedBinding = makeFunctionReference<'mutation', RegisterArgs, RegisterResult>(
  'agentAccessPrincipals:registerIssuedAgentBindingForServer',
)
const prepareReplacement = makeFunctionReference<'mutation', AgentCredentialReplacementRegistration & { serviceAuth: CustomerRequestServiceAssertion }, RegisterResult>(
  'agentAccessPrincipals:prepareCredentialReplacementForServer',
)
const promoteReplacement = makeFunctionReference<'mutation', AgentCredentialReplacementTransition & { serviceAuth: CustomerRequestServiceAssertion }, RegisterResult>(
  'agentAccessPrincipals:promoteCredentialReplacementForServer',
)
const cancelReplacement = makeFunctionReference<'mutation', AgentCredentialReplacementTransition & { serviceAuth: CustomerRequestServiceAssertion }, RegisterResult>(
  'agentAccessPrincipals:cancelCredentialReplacementForServer',
)
const revokeCredentialLifecycle = makeFunctionReference<'mutation', { credentialRef: string; correlationRef: string; serviceAuth: CustomerRequestServiceAssertion }, RegisterResult>(
  'agentAccessPrincipals:revokeCredentialForServer',
)
const disconnectAgentLifecycle = makeFunctionReference<'mutation', { principalRef: string; correlationRef: string; serviceAuth: CustomerRequestServiceAssertion }, RegisterResult>(
  'agentAccessPrincipals:disconnectAgentForServer',
)
const recordProviderRevocation = makeFunctionReference<'mutation', {
  principalRef: string
  credentialRef: string
  providerCredentialId: string
  correlationRef: string
  outcome: 'revoked' | 'failed'
  serviceAuth: CustomerRequestServiceAssertion
}, RegisterResult>('agentAccessPrincipals:recordProviderRevocationForServer')

function bindingInput(subject = 'user_owner'): IssuedAgentBindingRegistration {
  const issuanceKey = 'device-binding-12345678'
  return {
    issuanceKey,
    grantRef: issuedAgentGrantRef(subject, issuanceKey),
    credentialId: 'key_fresh_binding',
    displayName: 'Fresh CLI assistant',
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    scopes: ['customer_requests:inspect_only', 'market_operations:invoke'],
    authorityMode: 'inspect_only',
    policy: defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }),
    createdAt: NOW,
    expiresAt: NOW + 600_000,
  }
}

async function assertion(input: IssuedAgentBindingRegistration): Promise<CustomerRequestServiceAssertion> {
  return await createCustomerRequestServiceAssertion({
    key: SERVICE_KEY,
    operation: OPERATION,
    command: toStableHashValue({ ...input, scopes: [...input.scopes] }),
    principal: {
      principalId: 'ae:server-function',
      ownerId: 'ae:server-function',
      credentialId: 'ae:server-function',
      scopes: ['market_operations:invoke'],
    },
    issuedAt: NOW,
  })
}

async function operationAssertion(operation: string, command: Record<string, unknown>): Promise<CustomerRequestServiceAssertion> {
  return await createCustomerRequestServiceAssertion({
    key: SERVICE_KEY,
    operation,
    command: toStableHashValue(command),
    principal: {
      principalId: 'ae:server-function', ownerId: 'ae:server-function', credentialId: 'ae:server-function',
      scopes: ['market_operations:invoke'],
    },
    issuedAt: NOW,
  })
}

describe('issued agent binding', () => {
  const previousKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY
  })

  afterEach(() => {
    vi.useRealTimers()
    if (previousKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousKey
  })

  it('atomically creates a first-class agent under the authenticated owner account', async () => {
    const backend = convexTest(schema, modules)
    const owner = backend.withIdentity(identity('user_owner'))
    await expect(owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})).resolves.toBe(true)
    const input = bindingInput()
    const serviceAuth = await assertion(input)

    await expect(owner.mutation(registerIssuedBinding, { ...input, serviceAuth }))
      .resolves.toMatchObject({ kind: 'recorded', grantRef: input.grantRef })
    await expect(owner.mutation(registerIssuedBinding, { ...input, serviceAuth }))
      .resolves.toMatchObject({ kind: 'replayed', grantRef: input.grantRef })

    const recordedAccess = await backend.run(async (ctx) => await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_credentialId', (query) => query.eq('credentialId', input.credentialId))
      .unique())
    if (recordedAccess === null) throw new Error('issued_agent_access_missing')
    const refs = issuedAgentCanonicalRefs({
      ownerAccountRef: recordedAccess.ownerId,
      issuanceKey: input.issuanceKey,
      credentialId: input.credentialId,
      generation: 1,
      grantRef: input.grantRef,
    })
    const rows = await backend.run(async (ctx) => ({
      principal: await ctx.db.query('principals').withIndex('by_principalRef', (query) => query.eq('principalRef', refs.principalRef)).unique(),
      membership: await ctx.db.query('memberships').withIndex('by_membershipRef', (query) => query.eq('membershipRef', refs.membershipRef)).unique(),
      binding: await ctx.db.query('externalIdentityBindings').withIndex('by_bindingRef', (query) => query.eq('bindingRef', refs.bindingRef)).unique(),
      credential: await ctx.db.query('credentials').withIndex('by_credentialRef', (query) => query.eq('credentialRef', refs.credentialRef)).unique(),
      delegation: await ctx.db.query('authorityDelegationGrants').withIndex('by_grantRef', (query) => query.eq('grantRef', input.grantRef)).unique(),
      accessPrincipal: await ctx.db.query('agentAccessPrincipals').withIndex('by_principalId', (query) => query.eq('principalId', refs.principalRef)).unique(),
      accessGrant: await ctx.db.query('agentAccessGrants').withIndex('by_grantRef', (query) => query.eq('grantRef', input.grantRef)).unique(),
    }))
    expect(rows.principal).toMatchObject({ principalRef: refs.principalRef, kind: 'agent', lifecycle: 'active' })
    expect(rows.membership).toMatchObject({ memberPrincipalRef: refs.principalRef, lifecycle: 'active' })
    expect(rows.binding).toMatchObject({ principalRef: refs.principalRef, providerIdentifier: input.credentialId })
    expect(rows.credential).toMatchObject({ principalRef: refs.principalRef, type: 'api_key', expiresAt: input.expiresAt })
    expect(rows.delegation).toMatchObject({ subjectPrincipalRef: refs.principalRef, resourceRefs: ['*'] })
    expect(rows.accessPrincipal).toMatchObject({ principalId: refs.principalRef, ownerId: rows.membership?.accountRef })
    expect(rows.accessGrant).toMatchObject({ principalId: refs.principalRef, ownerId: rows.membership?.accountRef })
    await expect(owner.query(api.agentDirectory.listOwned, { now: NOW })).resolves.toEqual([expect.objectContaining({
      principalRef: refs.principalRef,
      displayName: input.displayName,
      currentProviderCredentialId: input.credentialId,
      credentials: [expect.objectContaining({
        credentialRef: refs.credentialRef,
        providerCredentialId: input.credentialId,
        generation: 1,
        lifecycle: 'active',
      })],
    })])
    const conflicting = { ...input, credentialId: 'key_different_first_credential' }
    const conflictingRefs = issuedAgentCanonicalRefs({
      ownerAccountRef: recordedAccess.ownerId,
      issuanceKey: conflicting.issuanceKey,
      credentialId: conflicting.credentialId,
      generation: 1,
      grantRef: conflicting.grantRef,
    })
    expect(conflictingRefs.principalRef).toBe(refs.principalRef)
    expect(conflictingRefs.credentialRef).not.toBe(refs.credentialRef)
    await expect(owner.mutation(registerIssuedBinding, {
      ...conflicting,
      serviceAuth: await assertion(conflicting),
    })).rejects.toThrow()
    await expect(backend.run(async (ctx) => await ctx.db.query('credentials')
      .withIndex('by_credentialRef', (query) => query.eq('credentialRef', conflictingRefs.credentialRef))
      .unique())).resolves.toBeNull()
    await expect(backend.run(async (ctx) => {
      const canonical = await resolveCanonicalAgentContext(ctx, input.credentialId, NOW + 1)
      if (canonical === null) return null
      const delegation = await validateCanonicalAgentDelegation(ctx, {
        evidenceKind: 'issued-agent-test',
        evidenceRef: 'surface:http:operations-call',
        principalRef: canonical.principalRef,
        accountRef: canonical.accountRef,
        grantRef: input.grantRef,
        grantGeneration: 1,
        requiredScopes: input.scopes,
        resourceRefs: ['surface:http:operations-call'],
        now: NOW + 1,
      })
      return { canonical, delegation }
    })).resolves.toMatchObject({
      canonical: {
        principalRef: refs.principalRef,
        accountRef: rows.membership?.accountRef,
        credentialLocator: input.credentialId,
      },
      delegation: {
        grantRef: input.grantRef,
        subjectPrincipalRef: refs.principalRef,
        resourceRefs: ['surface:http:operations-call'],
      },
    })
  })

  it('projects credential expiry from the caller-supplied read time', async () => {
    const backend = convexTest(schema, modules)
    const owner = backend.withIdentity(identity('user_owner'))
    await owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
    const input = bindingInput()
    await owner.mutation(registerIssuedBinding, { ...input, serviceAuth: await assertion(input) })

    await expect(owner.query(api.agentDirectory.listOwned, { now: input.expiresAt - 1 }))
      .resolves.toEqual([expect.objectContaining({ status: 'connected' })])
    await expect(owner.query(api.agentDirectory.listOwned, { now: input.expiresAt }))
      .resolves.toEqual([expect.objectContaining({
        status: 'expired',
        credentials: [expect.objectContaining({ lifecycle: 'stale' })],
      })])
  })

  it('keeps the public supplier scope exact while granting only its canonical connection verbs', () => {
    expect(canonicalAgentDelegationScopes(['market_supply:manage'])).toEqual([
      'connection:install',
      'connection:refresh',
      'connection:revoke',
      'market_supply:manage',
    ])
    expect(canonicalAgentDelegationScopes(['market_operations:invoke'])).toEqual([
      'market_operations:invoke',
    ])
  })

  it('stages, promotes, replays, and cancels credential replacements without replacing the agent', async () => {
    const backend = convexTest(schema, modules)
    const owner = backend.withIdentity(identity('user_owner'))
    await owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
    const first = bindingInput()
    await owner.mutation(registerIssuedBinding, { ...first, serviceAuth: await assertion(first) })
    const access = await backend.run(async (ctx) => await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_credentialId', (query) => query.eq('credentialId', first.credentialId)).unique())
    if (access === null) throw new Error('agent_access_missing')
    const replacement: AgentCredentialReplacementRegistration = {
      principalRef: access.principalId,
      issuanceKey: 'replacement-device-12345678',
      grantRef: issuedAgentGrantRef('user_owner', 'replacement-device-12345678'),
      credentialId: 'key_replacement_2',
      applicationRef: first.applicationRef,
      environment: first.environment,
      scopes: first.scopes,
      authorityMode: first.authorityMode,
      policy: first.policy,
      createdAt: NOW,
      expiresAt: NOW + 600_000,
    }
    const prepared = await owner.mutation(prepareReplacement, {
      ...replacement,
      serviceAuth: await operationAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...replacement, scopes: [...replacement.scopes] },
      ),
    })
    expect(prepared).toMatchObject({
      kind: 'recorded', principalRef: access.principalId, generation: 2,
      predecessorKeyId: first.credentialId,
    })
    const transition = {
      principalRef: access.principalId,
      successorCredentialRef: String(prepared.successorCredentialRef),
      successorGrantRef: replacement.grantRef,
    }
    await expect(owner.query(api.agentDirectory.listOwned, { now: NOW })).resolves.toEqual([
      expect.objectContaining({ principalRef: access.principalId, currentProviderCredentialId: first.credentialId }),
    ])
    const promoteAuth = await operationAssertion('agentAccessPrincipals.promoteCredentialReplacementForServer', transition)
    await expect(owner.mutation(promoteReplacement, { ...transition, serviceAuth: promoteAuth }))
      .resolves.toEqual({ kind: 'completed', providerCredentialId: first.credentialId })
    await expect(owner.mutation(promoteReplacement, { ...transition, serviceAuth: promoteAuth }))
      .resolves.toEqual({ kind: 'replayed', providerCredentialId: first.credentialId })
    await expect(owner.query(api.agentDirectory.listOwned, { now: NOW })).resolves.toEqual([
      expect.objectContaining({
        principalRef: access.principalId,
        currentProviderCredentialId: replacement.credentialId,
        credentials: expect.arrayContaining([
          expect.objectContaining({ generation: 1, lifecycle: 'revoked' }),
          expect.objectContaining({ generation: 2, lifecycle: 'active' }),
        ]),
      }),
    ])

    const cancelledInput: AgentCredentialReplacementRegistration = {
      ...replacement,
      issuanceKey: 'replacement-device-87654321',
      grantRef: issuedAgentGrantRef('user_owner', 'replacement-device-87654321'),
      credentialId: 'key_replacement_3',
    }
    const cancelledPrepared = await owner.mutation(prepareReplacement, {
      ...cancelledInput,
      serviceAuth: await operationAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...cancelledInput, scopes: [...cancelledInput.scopes] },
      ),
    })
    const cancel = {
      principalRef: access.principalId,
      successorCredentialRef: String(cancelledPrepared.successorCredentialRef),
      successorGrantRef: cancelledInput.grantRef,
    }
    const cancelAuth = await operationAssertion('agentAccessPrincipals.cancelCredentialReplacementForServer', cancel)
    await expect(owner.mutation(cancelReplacement, { ...cancel, serviceAuth: cancelAuth }))
      .resolves.toEqual({ kind: 'completed', providerCredentialId: cancelledInput.credentialId })
    await expect(owner.mutation(cancelReplacement, { ...cancel, serviceAuth: cancelAuth }))
      .resolves.toEqual({ kind: 'replayed', providerCredentialId: cancelledInput.credentialId })
    await expect(owner.query(api.agentDirectory.listOwned, { now: NOW })).resolves.toEqual([
      expect.objectContaining({ principalRef: access.principalId, currentProviderCredentialId: replacement.credentialId }),
    ])
  })

  it('admits only one pending successor for a credential generation', async () => {
    const backend = convexTest(schema, modules)
    const owner = backend.withIdentity(identity('user_owner'))
    await owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
    const first = bindingInput()
    await owner.mutation(registerIssuedBinding, { ...first, serviceAuth: await assertion(first) })
    const access = await backend.run(async (ctx) => await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_credentialId', (query) => query.eq('credentialId', first.credentialId)).unique())
    if (access === null) throw new Error('agent_access_missing')

    const replacement = (issuanceKey: string, credentialId: string): AgentCredentialReplacementRegistration => ({
      principalRef: access.principalId,
      issuanceKey,
      grantRef: issuedAgentGrantRef('user_owner', issuanceKey),
      credentialId,
      applicationRef: first.applicationRef,
      environment: first.environment,
      scopes: first.scopes,
      authorityMode: first.authorityMode,
      policy: first.policy,
      createdAt: NOW,
      expiresAt: NOW + 600_000,
    })
    const firstSuccessor = replacement('replacement-race-first-12345678', 'key_replacement_race_first')
    const secondSuccessor = replacement('replacement-race-second-12345678', 'key_replacement_race_second')

    await expect(owner.mutation(prepareReplacement, {
      ...firstSuccessor,
      serviceAuth: await operationAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...firstSuccessor, scopes: [...firstSuccessor.scopes] },
      ),
    })).resolves.toMatchObject({ kind: 'recorded', generation: 2 })
    await expect(owner.mutation(prepareReplacement, {
      ...secondSuccessor,
      serviceAuth: await operationAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...secondSuccessor, scopes: [...secondSuccessor.scopes] },
      ),
    })).resolves.toEqual({ kind: 'conflict' })

    const successors = await backend.run(async (ctx) => {
      const credentials = await ctx.db.query('credentials')
        .withIndex('by_principalRef_and_lifecycle', (query) => query
          .eq('principalRef', access.principalId)
          .eq('lifecycle', 'active'))
        .collect()
      const predecessor = credentials.find(({ generation }) => generation === 1)
      if (predecessor === undefined) return []
      return await ctx.db.query('credentials')
        .withIndex('by_predecessorCredentialRef', (query) => query.eq('predecessorCredentialRef', predecessor.credentialRef))
        .collect()
    })
    expect(successors.filter(({ lifecycle }) => lifecycle === 'active')).toHaveLength(1)
  })

  it('proves the authenticated two-agent lifecycle from connection through retained history', async () => {
    const backend = convexTest(schema, modules)
    const owner = backend.withIdentity(identity('user_owner'))
    await expect(owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})).resolves.toBe(true)

    const agentA = { ...bindingInput(), displayName: 'Agent A' }
    const agentBIssuance = 'agent-b-platform-journey-12345678'
    const agentB = {
      ...bindingInput(),
      issuanceKey: agentBIssuance,
      grantRef: issuedAgentGrantRef('user_owner', agentBIssuance),
      credentialId: 'key_agent_b_platform_journey',
      displayName: 'Agent B',
    }
    await owner.mutation(registerIssuedBinding, { ...agentA, serviceAuth: await assertion(agentA) })
    await owner.mutation(registerIssuedBinding, { ...agentB, serviceAuth: await assertion(agentB) })

    const connected = await owner.query(api.agentDirectory.listOwned, { now: NOW })
    expect(connected).toEqual(expect.arrayContaining([
      expect.objectContaining({ displayName: 'Agent A', status: 'connected' }),
      expect.objectContaining({ displayName: 'Agent B', status: 'connected' }),
    ]))
    const principalA = connected.find((item) => item.displayName === 'Agent A')?.principalRef
    const principalB = connected.find((item) => item.displayName === 'Agent B')?.principalRef
    if (principalA === undefined || principalB === undefined) throw new Error('platform_journey_agent_missing')
    expect(principalA).not.toBe(principalB)

    const replacementIssuance = 'agent-a-platform-replacement-12345678'
    const replacement: AgentCredentialReplacementRegistration = {
      principalRef: principalA,
      issuanceKey: replacementIssuance,
      grantRef: issuedAgentGrantRef('user_owner', replacementIssuance),
      credentialId: 'key_agent_a_platform_replacement',
      applicationRef: agentA.applicationRef,
      environment: agentA.environment,
      scopes: agentA.scopes,
      authorityMode: agentA.authorityMode,
      policy: agentA.policy,
      createdAt: NOW,
      expiresAt: NOW + 600_000,
    }
    const prepared = await owner.mutation(prepareReplacement, {
      ...replacement,
      serviceAuth: await operationAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...replacement, scopes: [...replacement.scopes] },
      ),
    })
    const promote = {
      principalRef: principalA,
      successorCredentialRef: String(prepared.successorCredentialRef),
      successorGrantRef: replacement.grantRef,
    }
    await owner.mutation(promoteReplacement, {
      ...promote,
      serviceAuth: await operationAssertion('agentAccessPrincipals.promoteCredentialReplacementForServer', promote),
    })

    await expect(backend.run(async (ctx) => ({
      agentA: await resolveCanonicalAgentContext(ctx, replacement.credentialId, NOW + 1),
      agentB: await resolveCanonicalAgentContext(ctx, agentB.credentialId, NOW + 1),
    }))).resolves.toMatchObject({
      agentA: { principalRef: principalA },
      agentB: { principalRef: principalB },
    })

    const spareIssuance = 'agent-a-platform-spare-12345678'
    const spare: AgentCredentialReplacementRegistration = {
      ...replacement,
      issuanceKey: spareIssuance,
      grantRef: issuedAgentGrantRef('user_owner', spareIssuance),
      credentialId: 'key_agent_a_platform_spare',
    }
    const sparePrepared = await owner.mutation(prepareReplacement, {
      ...spare,
      serviceAuth: await operationAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...spare, scopes: [...spare.scopes] },
      ),
    })
    const spareCredentialRef = String(sparePrepared.successorCredentialRef)
    const revokeSpare = { credentialRef: spareCredentialRef, correlationRef: 'corr-platform-revoke-spare' }
    const spareRevocation = await owner.mutation(revokeCredentialLifecycle, {
      ...revokeSpare,
      serviceAuth: await operationAssertion('agentAccessPrincipals.revokeCredentialForServer', revokeSpare),
    })
    expect(spareRevocation).toMatchObject({ kind: 'completed', principalRef: principalA })
    const spareProvider = {
      principalRef: principalA,
      credentialRef: spareCredentialRef,
      providerCredentialId: spare.credentialId,
      correlationRef: revokeSpare.correlationRef,
      outcome: 'revoked' as const,
    }
    await owner.mutation(recordProviderRevocation, {
      ...spareProvider,
      serviceAuth: await operationAssertion('agentAccessPrincipals.recordProviderRevocationForServer', spareProvider),
    })
    await expect(backend.run(async (ctx) => ({
      agentA: await resolveCanonicalAgentContext(ctx, replacement.credentialId, NOW + 1),
      agentB: await resolveCanonicalAgentContext(ctx, agentB.credentialId, NOW + 1),
    }))).resolves.toMatchObject({
      agentA: { principalRef: principalA },
      agentB: { principalRef: principalB },
    })

    const disconnect = { principalRef: principalA, correlationRef: 'corr-platform-disconnect-a' }
    const disconnected = await owner.mutation(disconnectAgentLifecycle, {
      ...disconnect,
      serviceAuth: await operationAssertion('agentAccessPrincipals.disconnectAgentForServer', disconnect),
    })
    expect(disconnected).toMatchObject({ kind: 'completed', principalRef: principalA })
    const providerTargets = disconnected.providerTargets as Array<{ credentialRef: string; providerCredentialId: string }>
    await Promise.all(providerTargets.map(async (target) => {
      const provider = { ...target, principalRef: principalA, correlationRef: disconnect.correlationRef, outcome: 'revoked' as const }
      await owner.mutation(recordProviderRevocation, {
        ...provider,
        serviceAuth: await operationAssertion('agentAccessPrincipals.recordProviderRevocationForServer', provider),
      })
    }))

    const finalDirectory = await owner.query(api.agentDirectory.listOwned, { now: NOW })
    expect(finalDirectory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        principalRef: principalA,
        status: 'disconnected',
        credentials: expect.arrayContaining([
          expect.objectContaining({ generation: 1, lifecycle: 'revoked' }),
          expect.objectContaining({ generation: 2, lifecycle: 'revoked' }),
          expect.objectContaining({ generation: 3, lifecycle: 'revoked' }),
        ]),
      }),
      expect.objectContaining({ principalRef: principalB, status: 'connected' }),
    ]))
    await expect(backend.run(async (ctx) => resolveCanonicalAgentContext(ctx, agentB.credentialId, NOW + 1)))
      .resolves.toMatchObject({ principalRef: principalB })
  })

  it('fails closed for anonymous, sibling-owner, and assertion-mismatch calls', async () => {
    const backend = convexTest(schema, modules)
    const input = bindingInput()
    const serviceAuth = await assertion(input)
    await expect(backend.mutation(registerIssuedBinding, { ...input, serviceAuth }))
      .resolves.toEqual({ kind: 'refused', code: 'authentication_required' })

    const sibling = backend.withIdentity(identity('user_sibling'))
    await expect(sibling.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})).resolves.toBe(true)
    await expect(sibling.mutation(registerIssuedBinding, { ...input, serviceAuth }))
      .resolves.toEqual({ kind: 'refused', code: 'authentication_required' })

    const owner = backend.withIdentity(identity('user_owner'))
    await expect(owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})).resolves.toBe(true)
    await expect(owner.mutation(registerIssuedBinding, {
      ...input,
      credentialId: 'key_tampered_binding',
      serviceAuth,
    })).resolves.toEqual({ kind: 'refused', code: 'authentication_required' })
  })

  it('revokes one credential or disconnects one agent without crossing principal boundaries', async () => {
    const backend = convexTest(schema, modules)
    const owner = backend.withIdentity(identity('user_owner'))
    await owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
    const agentA = bindingInput()
    const agentBIssuance = 'agent-b-issuance-12345678'
    const agentB = {
      ...bindingInput(), issuanceKey: agentBIssuance, credentialId: 'key_agent_b',
      grantRef: issuedAgentGrantRef('user_owner', agentBIssuance),
    }
    await owner.mutation(registerIssuedBinding, { ...agentA, serviceAuth: await assertion(agentA) })
    await owner.mutation(registerIssuedBinding, { ...agentB, serviceAuth: await assertion(agentB) })
    const rows = await owner.query(api.agentDirectory.listOwned, { now: NOW })
    const principalA = rows.find((row) => row.currentProviderCredentialId === agentA.credentialId)?.principalRef
    const principalB = rows.find((row) => row.currentProviderCredentialId === agentB.credentialId)?.principalRef
    if (principalA === undefined || principalB === undefined) throw new Error('agent principal missing')
    const credentialA = rows.find((row) => row.principalRef === principalA)?.credentials[0]?.credentialRef
    if (credentialA === undefined) throw new Error('credential missing')

    const extraIssuance = 'agent-a-extra-credential-12345678'
    const extra: AgentCredentialReplacementRegistration = {
      principalRef: principalA,
      issuanceKey: extraIssuance,
      grantRef: issuedAgentGrantRef('user_owner', extraIssuance),
      credentialId: 'key_agent_a_extra',
      applicationRef: agentA.applicationRef,
      environment: agentA.environment,
      scopes: agentA.scopes,
      authorityMode: agentA.authorityMode,
      policy: agentA.policy,
      createdAt: NOW,
      expiresAt: NOW + 600_000,
    }
    const extraPrepared = await owner.mutation(prepareReplacement, {
      ...extra,
      serviceAuth: await operationAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...extra, scopes: [...extra.scopes] },
      ),
    })
    const extraCredentialRef = String(extraPrepared.successorCredentialRef)
    const revokeExtra = { credentialRef: extraCredentialRef, correlationRef: 'corr-revoke-a-extra' }
    const revokedExtra = await owner.mutation(revokeCredentialLifecycle, {
      ...revokeExtra,
      serviceAuth: await operationAssertion('agentAccessPrincipals.revokeCredentialForServer', revokeExtra),
    })
    expect(revokedExtra).toMatchObject({ kind: 'completed', principalRef: principalA })
    await expect(owner.query(api.agentDirectory.listOwned, { now: NOW })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ principalRef: principalA, status: 'attention', currentProviderCredentialId: agentA.credentialId }),
      expect.objectContaining({ principalRef: principalB, status: 'connected' }),
    ]))
    const extraProvider = {
      principalRef: principalA,
      credentialRef: extraCredentialRef,
      providerCredentialId: extra.credentialId,
      correlationRef: revokeExtra.correlationRef,
      outcome: 'revoked' as const,
    }
    await owner.mutation(recordProviderRevocation, {
      ...extraProvider,
      serviceAuth: await operationAssertion('agentAccessPrincipals.recordProviderRevocationForServer', extraProvider),
    })
    await expect(owner.query(api.agentDirectory.listOwned, { now: NOW })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ principalRef: principalA, status: 'connected', currentProviderCredentialId: agentA.credentialId }),
    ]))

    const revokeCommand = { credentialRef: credentialA, correlationRef: 'corr-revoke-a' }
    const revokeAuth = await operationAssertion('agentAccessPrincipals.revokeCredentialForServer', revokeCommand)
    const revoked = await owner.mutation(revokeCredentialLifecycle, { ...revokeCommand, serviceAuth: revokeAuth })
    expect(revoked).toMatchObject({ kind: 'completed', principalRef: principalA })
    expect(revoked.providerTargets).toEqual([expect.objectContaining({ providerCredentialId: agentA.credentialId })])
    await expect(owner.mutation(revokeCredentialLifecycle, { ...revokeCommand, serviceAuth: revokeAuth }))
      .resolves.toMatchObject({ kind: 'replayed', principalRef: principalA })

    const providerCommand = {
      principalRef: principalA,
      credentialRef: credentialA,
      providerCredentialId: agentA.credentialId,
      correlationRef: 'corr-revoke-a',
      outcome: 'failed' as const,
    }
    await expect(owner.mutation(recordProviderRevocation, {
      ...providerCommand,
      serviceAuth: await operationAssertion('agentAccessPrincipals.recordProviderRevocationForServer', providerCommand),
    })).resolves.toEqual({ kind: 'completed' })
    await expect(owner.query(api.agentDirectory.listOwned, { now: NOW })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ principalRef: principalA, status: 'attention' }),
      expect.objectContaining({ principalRef: principalB, status: 'connected' }),
    ]))
    const providerCompleted = { ...providerCommand, outcome: 'revoked' as const }
    await expect(owner.mutation(recordProviderRevocation, {
      ...providerCompleted,
      serviceAuth: await operationAssertion('agentAccessPrincipals.recordProviderRevocationForServer', providerCompleted),
    })).resolves.toEqual({ kind: 'completed' })
    await expect(owner.query(api.agentDirectory.listOwned, { now: NOW })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        principalRef: principalA,
        status: 'disconnected',
        credentials: expect.arrayContaining([expect.objectContaining({ credentialRef: credentialA, lifecycle: 'revoked' })]),
      }),
    ]))
    await expect(owner.mutation(revokeCredentialLifecycle, { ...revokeCommand, serviceAuth: revokeAuth }))
      .resolves.toMatchObject({ kind: 'replayed', providerTargets: [] })
    await expect(owner.mutation(recordProviderRevocation, {
      ...providerCommand,
      serviceAuth: await operationAssertion('agentAccessPrincipals.recordProviderRevocationForServer', providerCommand),
    })).resolves.toEqual({ kind: 'replayed' })
    await expect(owner.query(api.agentDirectory.listOwned, { now: NOW })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ principalRef: principalA, status: 'disconnected' }),
    ]))

    const disconnectCommand = { principalRef: principalB, correlationRef: 'corr-disconnect-b' }
    const disconnectAuth = await operationAssertion('agentAccessPrincipals.disconnectAgentForServer', disconnectCommand)
    await expect(owner.mutation(disconnectAgentLifecycle, { ...disconnectCommand, serviceAuth: disconnectAuth }))
      .resolves.toMatchObject({ kind: 'completed', principalRef: principalB })
    await expect(owner.mutation(disconnectAgentLifecycle, { ...disconnectCommand, serviceAuth: disconnectAuth }))
      .resolves.toMatchObject({ kind: 'replayed', principalRef: principalB })
    const finalRows = await owner.query(api.agentDirectory.listOwned, { now: NOW })
    expect(finalRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ principalRef: principalA }),
      expect.objectContaining({ principalRef: principalB, status: 'attention' }),
    ]))
    await expect(backend.run(async (ctx) => ({
      principal: await ctx.db.query('principals').withIndex('by_principalRef', (query) => query.eq('principalRef', principalB)).unique(),
      membership: await ctx.db.query('memberships').withIndex('by_memberPrincipalRef_and_lifecycle', (query) => query.eq('memberPrincipalRef', principalB).eq('lifecycle', 'active')).unique(),
    }))).resolves.toMatchObject({ principal: { lifecycle: 'active' }, membership: { lifecycle: 'active' } })
  })

  it('refuses disconnection before changing state when a provider binding is missing', async () => {
    const backend = convexTest(schema, modules)
    const owner = backend.withIdentity(identity('user_owner'))
    await owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
    const input = bindingInput()
    await owner.mutation(registerIssuedBinding, { ...input, serviceAuth: await assertion(input) })
    const directory = await owner.query(api.agentDirectory.listOwned, { now: NOW })
    const agent = directory[0]
    if (agent === undefined) throw new Error('agent_missing')

    await backend.run(async (ctx) => {
      const binding = await ctx.db.query('externalIdentityBindings')
        .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
          .eq('providerNamespace', 'clerk/api-key')
          .eq('providerIdentifier', input.credentialId))
        .unique()
      if (binding === null) throw new Error('binding_missing')
      await ctx.db.delete(binding._id)
    })

    const command = { principalRef: agent.principalRef, correlationRef: 'corr-disconnect-invalid-binding' }
    await expect(owner.mutation(disconnectAgentLifecycle, {
      ...command,
      serviceAuth: await operationAssertion('agentAccessPrincipals.disconnectAgentForServer', command),
    })).resolves.toEqual({
      kind: 'conflict',
      code: 'credential_binding_invalid',
      correlationRef: command.correlationRef,
    })
    await expect(backend.run(async (ctx) => await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', agent.principalRef))
      .unique())).resolves.toMatchObject({ lifecycle: 'active' })
  })
})
