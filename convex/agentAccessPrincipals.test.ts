/// <reference types="vite/client" />
import { makeFunctionReference, type UserIdentity } from 'convex/server'
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCustomerRequestServiceAssertion, toStableHashValue, type CustomerRequestServiceAssertion } from '../src/modules/agent-access/service-auth-envelope'
import type {
  AgentCredentialReplacementRegistration,
  AgentCredentialReplacementTransition,
  IssuedAgentBindingRegistration,
} from '../src/modules/agent-access/agent-access'
import { issuedAgentCanonicalRefs, issuedAgentGrantRef } from '../src/modules/agent-access/issued-agent-binding'
import { defaultSandboxAgentAccessPolicy } from '../src/modules/agent-access/sandbox-policy'
import { normalizeStoredAgentAccessGrant } from '../src/modules/agent-access/policy'
import schema from './schema'
import { api, internal } from './_generated/api'
import { withSourceWriteCommand } from '../tests/helpers/source-write-admission'
import { resolveCanonicalAgentContext, validateCanonicalAgentDelegation } from './lib/canonicalAgentAuthority'
import { canonicalAgentDelegationScopes } from './agentAccessPrincipals'
import { resolveCanonicalAgentBinding } from './authorityBoundary'

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
const renameAgent = makeFunctionReference<'mutation', {
  principalRef: string
  expectedRevision: number
  displayName: string
  correlationRef: string
}, RegisterResult>('agentAccessPrincipals:renameAgentForServer')
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
    scopes: ['customer_requests:read_only', 'market_tools:call'],
    authorityMode: 'read_only',
    spendingPolicy: defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }),
    toolAccess: 'all_admitted',
    toolRefs: [],
    createdAt: NOW,
    expiresAt: NOW + 600_000,
  }
}

async function assertion(input: IssuedAgentBindingRegistration): Promise<CustomerRequestServiceAssertion> {
  return await createCustomerRequestServiceAssertion({
    key: SERVICE_KEY,
    operation: OPERATION,
    command: toStableHashValue({ ...input, scopes: [...input.scopes], toolRefs: [...input.toolRefs] }),
    principal: {
      principalId: 'ae:server-function',
      ownerId: 'ae:server-function',
      credentialId: 'ae:server-function',
      scopes: ['market_tools:call'],
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
      scopes: ['market_tools:call'],
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
    await expect(backend.run(async (ctx) => await ctx.db.query('auditEvents')
      .withIndex('by_activeAccountRef_and_targetType_and_targetRef_and_createdAt', (query) => query
        .eq('activeAccountRef', recordedAccess.ownerId)
        .eq('targetType', 'agent')
        .eq('targetRef', refs.principalRef))
      .collect())).resolves.toEqual([expect.objectContaining({
      eventType: 'agent.created',
      actorRef: rows.membership?.createdBy.actorPrincipalRef,
      activeAccountRef: recordedAccess.ownerId,
      targetRef: refs.principalRef,
      sourceSystem: 'ae_recorded',
      afterState: 'created',
    })])
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

  it('renames one owned Agent through the Principal registry and audits only the state change', async () => {
    const backend = convexTest(schema, modules)
    const owner = backend.withIdentity(identity('user_owner'))
    await owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
    const input = bindingInput()
    await owner.mutation(registerIssuedBinding, { ...input, serviceAuth: await assertion(input) })
    const [agent] = await owner.query(api.agentDirectory.listOwned, { now: NOW })
    if (agent === undefined) throw new Error('agent_missing')
    const command = {
      principalRef: agent.principalRef,
      expectedRevision: 1,
      displayName: 'Renamed Agent',
      correlationRef: 'corr-rename-agent',
    }

    await expect(owner.mutation(renameAgent, {
      ...command,
      displayName: 'Must not be applied',
      correlationRef: 'sk_live_secret-shaped-correlation',
    })).resolves.toEqual({
      kind: 'conflict',
      code: 'correlation_ref_invalid',
      correlationRef: 'invalid-correlation-reference',
    })
    await expect(owner.mutation(renameAgent, command)).resolves.toEqual({
      kind: 'completed',
      principalRef: agent.principalRef,
      displayName: 'Renamed Agent',
      revision: 2,
      correlationRef: command.correlationRef,
    })
    await expect(owner.mutation(renameAgent, {
      ...command,
      expectedRevision: 2,
      displayName: ' Renamed Agent ',
      correlationRef: 'corr-rename-agent-noop',
    })).resolves.toEqual({
      kind: 'replayed',
      principalRef: agent.principalRef,
      displayName: 'Renamed Agent',
      revision: 2,
      correlationRef: 'corr-rename-agent-noop',
    })
    await expect(owner.mutation(renameAgent, command)).resolves.toEqual({
      kind: 'conflict', code: 'principal_revision_conflict', correlationRef: command.correlationRef,
    })

    const sibling = backend.withIdentity(identity('user_sibling'))
    await sibling.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
    await expect(sibling.mutation(renameAgent, {
      ...command,
      expectedRevision: 2,
    })).resolves.toEqual({
      kind: 'conflict', code: 'agent_not_found', correlationRef: command.correlationRef,
    })
    await expect(backend.mutation(renameAgent, command)).resolves.toEqual({
      kind: 'refused', code: 'authentication_required', correlationRef: command.correlationRef,
    })

    const renamedEvents = await backend.run(async (ctx) => {
      const admission = await ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (query) => query.eq('principalId', agent.principalRef))
        .unique()
      if (admission === null) throw new Error('agent_admission_missing')
      return await ctx.db.query('auditEvents')
        .withIndex('by_activeAccountRef_and_targetType_and_targetRef_and_createdAt', (query) => query
          .eq('activeAccountRef', admission.ownerId)
          .eq('targetType', 'agent')
          .eq('targetRef', agent.principalRef))
        .collect()
    })
    expect(renamedEvents.filter(({ eventType }) => eventType === 'agent.renamed')).toHaveLength(1)
    expect(JSON.stringify(renamedEvents)).not.toContain(input.displayName)
    expect(JSON.stringify(renamedEvents)).not.toContain(command.displayName)
  })

  it('admits selected-Tool buyer routes while preserving exact purchased-Tool restrictions through replacement', async () => {
    const backend = convexTest(schema, modules)
    const owner = backend.withIdentity(identity('user_owner'))
    await owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
    const firstOperationRef = `operation:v1:${'a'.repeat(64)}`
    const operationRefs = [...Array.from({ length: 63 }, (_, index) => `operation:v1:${index.toString(16).padStart(64, '0')}`), firstOperationRef]
    const base = bindingInput()
    const input: IssuedAgentBindingRegistration = {
      ...base,
      toolAccess: 'selected_tools',
      toolRefs: operationRefs,
      spendingPolicy: { ...base.spendingPolicy, toolAccess: 'selected_tools', toolRefs: operationRefs },
    }
    await expect(owner.mutation(registerIssuedBinding, { ...input, serviceAuth: await assertion(input) }))
      .resolves.toMatchObject({ kind: 'recorded' })
    const firstDelegation = await backend.run(async (ctx) => await ctx.db.query('authorityDelegationGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', input.grantRef)).unique())
    expect(firstDelegation?.resourceRefs).toEqual(operationRefs)
    for (const operationKey of ['surface:http:tools-call', 'surface:http:account-self', 'surface:mcp:tool.quote', 'surface:mcp:call.status']) {
      await expect(backend.run(async (ctx) => await resolveCanonicalAgentBinding(ctx, {
        credentialId: input.credentialId, applicationRef: input.applicationRef,
        environment: input.environment, scopes: input.scopes, requiredScopes: ['market_tools:call'],
        authorityMode: input.authorityMode, operationKey, correlationId: `selected-${operationKey}`,
      }))).resolves.toMatchObject({ credentialId: input.credentialId })
    }
    for (const resourceRef of [firstOperationRef, `operation:v1:${'c'.repeat(64)}`, 'surface:http:supply-publish']) {
      const admitted = await backend.run(async (ctx) => {
        const canonical = await resolveCanonicalAgentContext(ctx, input.credentialId, NOW + 1)
        if (canonical === null) throw new Error('selected_agent_context_missing')
        return await validateCanonicalAgentDelegation(ctx, {
          evidenceKind: 'selected-tool-test', evidenceRef: resourceRef,
          principalRef: canonical.principalRef, accountRef: canonical.accountRef,
          grantRef: input.grantRef, grantGeneration: 1,
          requiredScopes: ['market_tools:call'], resourceRefs: [resourceRef], now: NOW + 1,
        })
      })
      if (resourceRef === firstOperationRef) expect(admitted).not.toBeNull()
      else expect(admitted).toBeNull()
    }

    const access = await backend.run(async (ctx) => await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_credentialId', (query) => query.eq('credentialId', input.credentialId)).unique())
    if (access === null) throw new Error('selected_agent_access_missing')
    const replacement: AgentCredentialReplacementRegistration = {
      principalRef: access.principalId,
      replacementMode: 'planned',
      issuanceKey: 'selected-replacement-12345678',
      grantRef: issuedAgentGrantRef('user_owner', 'selected-replacement-12345678'),
      credentialId: 'key_selected_replacement',
      applicationRef: input.applicationRef,
      environment: input.environment,
      scopes: input.scopes,
      authorityMode: input.authorityMode,
      toolAccess: 'selected_tools',
      toolRefs: operationRefs,
      spendingPolicy: input.spendingPolicy,
      createdAt: NOW,
      expiresAt: NOW + 600_000,
    }
    await expect(owner.mutation(prepareReplacement, {
      ...replacement,
      serviceAuth: await operationAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...replacement, scopes: [...replacement.scopes], toolRefs: [...replacement.toolRefs] },
      ),
    })).resolves.toMatchObject({ kind: 'recorded' })
    const replacementDelegation = await backend.run(async (ctx) => await ctx.db.query('authorityDelegationGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', replacement.grantRef)).unique())
    expect(replacementDelegation?.resourceRefs).toEqual(firstDelegation?.resourceRefs)

    const mismatched = { ...replacement, issuanceKey: 'selected-mismatch-12345678', grantRef: issuedAgentGrantRef('user_owner', 'selected-mismatch-12345678'), toolRefs: [firstOperationRef] }
    await expect(owner.mutation(prepareReplacement, {
      ...mismatched,
      serviceAuth: await operationAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...mismatched, scopes: [...mismatched.scopes], toolRefs: [...mismatched.toolRefs] },
      ),
    })).resolves.toEqual({ kind: 'conflict' })
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

  it('projects Last authenticated for the current Agent and each credential without replacing Last seen', async () => {
    const backend = convexTest(schema, modules)
    const owner = backend.withIdentity(identity('user_owner'))
    await owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
    const input = bindingInput()
    await owner.mutation(registerIssuedBinding, { ...input, serviceAuth: await assertion(input) })
    const authenticatedAt = NOW - 12_345
    await backend.run(async (ctx) => {
      const admission = await ctx.db.query('agentAccessPrincipals')
        .withIndex('by_credentialId', (index) => index.eq('credentialId', input.credentialId))
        .unique()
      if (admission === null) throw new Error('agent_admission_missing')
      const credential = await ctx.db.query('credentials')
        .withIndex('by_principalRef_and_lifecycle', (query) => query
          .eq('principalRef', admission.principalId)
          .eq('lifecycle', 'active'))
        .unique()
      if (credential === null) throw new Error('credential_missing')
      await ctx.db.patch(credential._id, { lastAuthenticatedAt: authenticatedAt })
    })

    await expect(owner.query(api.agentDirectory.listOwned, { now: NOW })).resolves.toEqual([
      expect.objectContaining({
        lastSeenAt: NOW,
        credentials: [expect.objectContaining({ lastAuthenticatedAt: authenticatedAt })],
      }),
    ])
  })

  it('keeps the public supplier scope exact while granting only its canonical connection verbs', () => {
    expect(canonicalAgentDelegationScopes(['market_supply:manage'])).toEqual([
      'connection:install',
      'connection:refresh',
      'connection:revoke',
      'market_supply:manage',
    ])
    expect(canonicalAgentDelegationScopes(['market_tools:call'])).toEqual([
      'market_tools:call',
    ])
  })

  it('fails closed as soon as the Agent loses active Account membership', async () => {
    const backend = convexTest(schema, modules)
    const owner = backend.withIdentity(identity('user_owner'))
    await owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
    const input = bindingInput()
    await owner.mutation(registerIssuedBinding, { ...input, serviceAuth: await assertion(input) })
    const requiredScope = input.scopes[0]
    if (requiredScope === undefined) throw new Error('membership_scope_fixture_missing')

    const resolve = async (correlationId: string) => await backend.run(async (ctx) => await resolveCanonicalAgentBinding(ctx, {
      credentialId: input.credentialId,
      applicationRef: input.applicationRef,
      environment: input.environment,
      scopes: input.scopes,
      requiredScopes: [requiredScope],
      authorityMode: input.authorityMode,
      operationKey: 'surface:http:account-self',
      correlationId,
    }))
    await expect(resolve('membership-active')).resolves.toMatchObject({ credentialId: input.credentialId })

    await backend.run(async (ctx) => {
      const access = await ctx.db.query('agentAccessPrincipals')
        .withIndex('by_credentialId', (query) => query.eq('credentialId', input.credentialId))
        .unique()
      if (access === null) throw new Error('membership_access_fixture_missing')
      const membership = await ctx.db.query('memberships')
        .withIndex('by_memberPrincipalRef_and_lifecycle', (query) => query
          .eq('memberPrincipalRef', access.principalId)
          .eq('lifecycle', 'active'))
        .unique()
      if (membership === null) throw new Error('membership_fixture_missing')
      await ctx.db.patch(membership._id, { lifecycle: 'ended', revision: membership.revision + 1 })
    })

    await expect(resolve('membership-ended')).resolves.toBeNull()
  })

  it('recovers prior Calls through a promoted credential while preserving original evidence and Account isolation', async () => {
    const backend = convexTest(schema, modules)
    const owner = backend.withIdentity(identity('user_owner'))
    await owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
    const first = bindingInput()
    await owner.mutation(registerIssuedBinding, { ...first, serviceAuth: await assertion(first) })
    const access = await backend.run(async (ctx) => await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_credentialId', (query) => query.eq('credentialId', first.credentialId)).unique())
    if (access === null) throw new Error('agent_access_missing')
    const callRef = 'call:credential-continuity'
    const original = {
      callRef, principalId: access.principalId, ownerId: access.ownerId,
      credentialId: first.credentialId, applicationRef: first.applicationRef,
      environment: first.environment, toolRef: 'tool:credential-continuity',
      idempotencyKey: 'purchase:original', grantRef: first.grantRef,
      grantGeneration: access.grantGeneration, policyDigest: access.spendingPolicyDigest,
      grantExpiresAt: first.expiresAt, inputDigest: 'sha256:original-input',
      requestDigest: 'sha256:original-request', inputJson: '{"private":"input"}', toolJson: '{}',
      state: 'refused' as const,
      result: { kind: 'refused' as const, code: 'input_invalid' as const, retryable: false },
      createdAt: NOW - 1, updatedAt: NOW,
    }
    const originalId = await backend.run(async (ctx) => await ctx.db.insert('capabilityCalls', original))
    const replacement: AgentCredentialReplacementRegistration = {
      principalRef: access.principalId, replacementMode: 'planned',
      issuanceKey: 'call-continuity-replacement-12345678',
      grantRef: issuedAgentGrantRef('user_owner', 'call-continuity-replacement-12345678'),
      credentialId: 'key_call_continuity_successor', applicationRef: first.applicationRef,
      environment: first.environment, scopes: first.scopes, authorityMode: first.authorityMode,
      toolAccess: first.toolAccess, toolRefs: first.toolRefs, spendingPolicy: first.spendingPolicy,
      createdAt: NOW, expiresAt: first.expiresAt,
    }
    const prepared = await owner.mutation(prepareReplacement, {
      ...replacement,
      serviceAuth: await operationAssertion('agentAccessPrincipals.prepareCredentialReplacementForServer', {
        ...replacement, scopes: [...replacement.scopes], toolRefs: [...replacement.toolRefs],
      }),
    })
    const transition = {
      principalRef: access.principalId,
      successorCredentialRef: String(prepared.successorCredentialRef),
      successorGrantRef: replacement.grantRef,
    }
    await owner.mutation(promoteReplacement, {
      ...transition,
      serviceAuth: await operationAssertion('agentAccessPrincipals.promoteCredentialReplacementForServer', transition),
    })
    const successor = {
      principalId: access.principalId, ownerId: access.ownerId,
      credentialId: replacement.credentialId, applicationRef: first.applicationRef,
      environment: first.environment, scopes: [...first.scopes], authorityMode: first.authorityMode,
    }
    await expect(backend.mutation(internal.capabilityCalls.resolveCallAgentAuthority, {
      principal: successor, callRef,
    })).resolves.toEqual(successor)
    const status = async (principal = successor) => {
      const args = { principal, callRef, operationKey: `status:${principal.credentialId}`, correlationId: 'credential-continuity' }
      return await backend.action(api.capabilityCalls.readCallStatus, await withSourceWriteCommand('protected_action', args, {
        operationKey: args.operationKey, correlationId: args.correlationId, principal,
        toolRef: '', input: {}, idempotencyKey: `status:${callRef}`,
      }))
    }
    await expect(status()).resolves.toMatchObject({
      kind: 'found', callRef, state: 'terminal', result: original.result,
    })
    // A terminal result is replayed through the real worker without changing
    // original credential, grant, input, or effect evidence.
    await expect(status()).resolves.toMatchObject({ kind: 'found', callRef, result: original.result })
    const listArgs = {
      principal: successor, operationKey: 'list:credential-continuity', correlationId: 'credential-continuity',
      paginationOpts: { numItems: 1, cursor: null },
    }
    const history = await backend.action(api.capabilityCalls.listCalls, await withSourceWriteCommand('protected_action', listArgs, {
      operationKey: listArgs.operationKey, correlationId: listArgs.correlationId, principal: successor,
      toolRef: '', input: {}, idempotencyKey: 'list:all:start:1',
    }))
    expect(history.page).toEqual([expect.objectContaining({ callRef, state: 'refused' })])
    expect(JSON.stringify(history)).not.toContain('private')
    await expect(backend.run(async (ctx) => await ctx.db.get(originalId))).resolves.toMatchObject(original)
    await expect(status({ ...successor, credentialId: first.credentialId })).resolves.toMatchObject({
      kind: 'refused', code: 'invocation_not_found',
    })
    await expect(status({ ...successor, ownerId: 'acc_00000000000000000000000000000000' })).resolves.toMatchObject({
      kind: 'refused', code: 'invocation_not_found',
    })
    const siblingInput = {
      ...first, issuanceKey: 'call-continuity-sibling-12345678', credentialId: 'key_call_continuity_sibling',
      grantRef: issuedAgentGrantRef('user_owner', 'call-continuity-sibling-12345678'),
    }
    await owner.mutation(registerIssuedBinding, { ...siblingInput, serviceAuth: await assertion(siblingInput) })
    const sibling = await backend.run(async (ctx) => await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_credentialId', (query) => query.eq('credentialId', siblingInput.credentialId)).unique())
    if (sibling === null) throw new Error('sibling_agent_missing')
    await expect(status({ ...successor, principalId: sibling.principalId, credentialId: sibling.credentialId }))
      .resolves.toMatchObject({ kind: 'refused', code: 'invocation_not_found' })
    // Internal worker/replay reads stay pinned to the original effect identity;
    // only the authorised public recovery boundary translates to that identity.
    await expect(backend.query(internal.capabilityCalls.readReplay, {
      callRef, principalId: successor.principalId, credentialId: successor.credentialId,
    })).resolves.toBeNull()
    await expect(backend.query(internal.capabilityCalls.readReplay, {
      callRef, principalId: successor.principalId, credentialId: first.credentialId,
    })).resolves.toMatchObject({ result: original.result })
    await expect(backend.mutation(internal.capabilityCalls.reconcileCallWorkloadAuthority, { callRef }))
      .resolves.toEqual({ kind: 'refused' })

    const disconnect = { principalRef: access.principalId, correlationRef: 'disconnect:call-continuity' }
    await owner.mutation(disconnectAgentLifecycle, {
      ...disconnect,
      serviceAuth: await operationAssertion('agentAccessPrincipals.disconnectAgentForServer', disconnect),
    })
    await expect(status()).resolves.toMatchObject({ kind: 'refused', code: 'invocation_not_found' })
    await expect(owner.action(api.capabilityCalls.readOwnerCallStatus, { callRef })).resolves.toMatchObject({
      kind: 'found', callRef, state: 'terminal', result: original.result,
      previousInput: { private: 'input' },
    })
    const foreignOwner = backend.withIdentity(identity('user_foreign'))
    await foreignOwner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
    await expect(foreignOwner.action(api.capabilityCalls.readOwnerCallStatus, { callRef }))
      .resolves.toMatchObject({ kind: 'refused', code: 'invocation_not_found' })
    const ownerWorkerArgs = {
      callRef, principalId: access.principalId, credentialId: first.credentialId,
      mode: 'status' as const, recoverAsOwner: true as const,
    }
    await expect(foreignOwner.action(internal.capabilityCallWorker.recover, ownerWorkerArgs))
      .resolves.toMatchObject({ kind: 'refused', code: 'invocation_not_found' })
    await expect(backend.action(internal.capabilityCallWorker.recover, ownerWorkerArgs))
      .resolves.toMatchObject({ kind: 'refused', code: 'invocation_not_found' })
    await expect(backend.run(async (ctx) => await ctx.db.get(originalId))).resolves.toMatchObject(original)
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
      replacementMode: 'planned',
      issuanceKey: 'replacement-device-12345678',
      grantRef: issuedAgentGrantRef('user_owner', 'replacement-device-12345678'),
      credentialId: 'key_replacement_2',
      applicationRef: first.applicationRef,
      environment: first.environment,
      scopes: first.scopes,
      authorityMode: first.authorityMode,
      toolAccess: first.toolAccess,
      toolRefs: first.toolRefs,
      spendingPolicy: first.spendingPolicy,
      createdAt: NOW,
      expiresAt: NOW + 600_000,
    }
    const predecessorRequiredScope = first.scopes.at(0)
    const successorRequiredScope = replacement.scopes.at(0)
    if (predecessorRequiredScope === undefined || successorRequiredScope === undefined) {
      throw new Error('replacement_scope_missing')
    }
    const prepared = await owner.mutation(prepareReplacement, {
      ...replacement,
      serviceAuth: await operationAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...replacement, scopes: [...replacement.scopes], toolRefs: [...replacement.toolRefs] },
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
    await expect(backend.run(async (ctx) => await resolveCanonicalAgentBinding(ctx, {
      credentialId: first.credentialId,
      applicationRef: first.applicationRef,
      environment: first.environment,
      scopes: first.scopes,
      requiredScopes: [predecessorRequiredScope],
      authorityMode: first.authorityMode,
      operationKey: 'surface:http:account-self',
      correlationId: 'replacement-predecessor-still-current',
    }))).resolves.toMatchObject({
      principalId: access.principalId,
      credentialId: first.credentialId,
      grantRef: first.grantRef,
    })
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
    await expect(backend.run(async (ctx) => await resolveCanonicalAgentBinding(ctx, {
      credentialId: replacement.credentialId,
      applicationRef: replacement.applicationRef,
      environment: replacement.environment,
      scopes: replacement.scopes,
      requiredScopes: [successorRequiredScope],
      authorityMode: replacement.authorityMode,
      operationKey: 'surface:http:account-self',
      correlationId: 'replacement-successor-promoted',
    }))).resolves.toMatchObject({
      principalId: access.principalId,
      credentialId: replacement.credentialId,
      grantRef: replacement.grantRef,
    })
    await expect(backend.run(async (ctx) => await resolveCanonicalAgentBinding(ctx, {
      credentialId: first.credentialId,
      applicationRef: first.applicationRef,
      environment: first.environment,
      scopes: first.scopes,
      requiredScopes: [predecessorRequiredScope],
      authorityMode: first.authorityMode,
      operationKey: 'surface:http:account-self',
      correlationId: 'replacement-predecessor-revoked',
    }))).resolves.toBeNull()

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
        { ...cancelledInput, scopes: [...cancelledInput.scopes], toolRefs: [...cancelledInput.toolRefs] },
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
    const auditEvents = await backend.run(async (ctx) => await ctx.db.query('auditEvents')
      .withIndex('by_activeAccountRef_and_targetType_and_targetRef_and_createdAt', (query) => query
        .eq('activeAccountRef', access.ownerId)
        .eq('targetType', 'agent')
        .eq('targetRef', access.principalId))
      .collect())
    expect(auditEvents.map(({ eventType }) => eventType)).toEqual(expect.arrayContaining([
      'agent.created',
      'agent.credential.replacement_prepared',
      'agent.credential.replacement_promoted',
      'agent.credential.replacement_cancelled',
    ]))
    expect(auditEvents.filter(({ eventType }) => eventType === 'agent.credential.replacement_prepared')).toHaveLength(2)
    expect(auditEvents.filter(({ eventType }) => eventType === 'agent.credential.replacement_promoted')).toHaveLength(1)
    expect(auditEvents.filter(({ eventType }) => eventType === 'agent.credential.replacement_cancelled')).toHaveLength(1)
    expect(JSON.stringify(auditEvents)).not.toContain(first.credentialId)
    expect(JSON.stringify(auditEvents)).not.toContain(replacement.credentialId)
    expect(JSON.stringify(auditEvents)).not.toContain(cancelledInput.credentialId)
  })

  it('prepares a compromise successor only from revoked predecessor authority and never reactivates it', async () => {
    const backend = convexTest(schema, modules)
    const owner = backend.withIdentity(identity('user_owner'))
    await owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
    const first = bindingInput()
    await owner.mutation(registerIssuedBinding, { ...first, serviceAuth: await assertion(first) })
    const access = await backend.run(async (ctx) => await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_credentialId', (query) => query.eq('credentialId', first.credentialId)).unique())
    if (access === null) throw new Error('compromise_agent_access_missing')
    const predecessorRefs = await backend.run(async (ctx) => {
      const binding = await ctx.db.query('externalIdentityBindings')
        .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
          .eq('providerNamespace', 'clerk/api-key').eq('providerIdentifier', first.credentialId))
        .unique()
      const credential = binding === null ? null : await ctx.db.query('credentials')
        .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
          .eq('bindingRef', binding.bindingRef).eq('generation', binding.credentialGeneration).eq('lifecycle', 'active'))
        .unique()
      const grant = await ctx.db.query('agentAccessGrants')
        .withIndex('by_grantRef', (query) => query.eq('grantRef', first.grantRef)).unique()
      if (binding === null || credential === null || grant === null) throw new Error('compromise_predecessor_missing')
      await Promise.all([
        ctx.db.patch(binding._id, {
          lifecycle: 'revoked',
          providerState: { kind: 'unknown', value: 'suspected_compromise' },
          revokedAt: NOW,
          updatedAt: NOW,
          revision: binding.revision + 1,
        }),
        ctx.db.patch(credential._id, {
          lifecycle: 'revoked', revokedAt: NOW, updatedAt: NOW, revision: credential.revision + 1,
        }),
        ctx.db.patch(grant._id, { lifecycle: 'revoked', updatedAt: NOW }),
      ])
      return { bindingRef: binding.bindingRef, credentialRef: credential.credentialRef }
    })
    const replacement: AgentCredentialReplacementRegistration = {
      principalRef: access.principalId,
      replacementMode: 'compromise',
      issuanceKey: 'compromise-replacement-12345678',
      grantRef: issuedAgentGrantRef('user_owner', 'compromise-replacement-12345678'),
      credentialId: 'key_compromise_successor',
      applicationRef: first.applicationRef,
      environment: first.environment,
      scopes: first.scopes,
      authorityMode: first.authorityMode,
      toolAccess: first.toolAccess,
      toolRefs: first.toolRefs,
      spendingPolicy: first.spendingPolicy,
      createdAt: NOW,
      expiresAt: NOW + 600_000,
    }
    const prepared = await owner.mutation(prepareReplacement, {
      ...replacement,
      serviceAuth: await operationAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...replacement, scopes: [...replacement.scopes], toolRefs: [...replacement.toolRefs] },
      ),
    })
    expect(prepared).toMatchObject({
      kind: 'recorded',
      principalRef: access.principalId,
      generation: 2,
      predecessorKeyId: first.credentialId,
    })
    const transition = {
      principalRef: access.principalId,
      successorCredentialRef: String(prepared.successorCredentialRef),
      successorGrantRef: replacement.grantRef,
    }
    const promoteAuth = await operationAssertion(
      'agentAccessPrincipals.promoteCredentialReplacementForServer',
      transition,
    )
    await expect(owner.mutation(promoteReplacement, { ...transition, serviceAuth: promoteAuth }))
      .resolves.toEqual({ kind: 'completed', providerCredentialId: first.credentialId })
    await expect(owner.mutation(promoteReplacement, { ...transition, serviceAuth: promoteAuth }))
      .resolves.toEqual({ kind: 'replayed', providerCredentialId: first.credentialId })

    const state = await backend.run(async (ctx) => ({
      current: await ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (query) => query.eq('principalId', access.principalId)).unique(),
      predecessorBinding: await ctx.db.query('externalIdentityBindings')
        .withIndex('by_bindingRef', (query) => query.eq('bindingRef', predecessorRefs.bindingRef)).unique(),
      predecessorCredential: await ctx.db.query('credentials')
        .withIndex('by_credentialRef', (query) => query.eq('credentialRef', predecessorRefs.credentialRef)).unique(),
      successorCredential: await ctx.db.query('credentials')
        .withIndex('by_credentialRef', (query) => query.eq('credentialRef', transition.successorCredentialRef)).unique(),
    }))
    expect(state.current).toMatchObject({ credentialId: replacement.credentialId, lifecycle: 'active' })
    expect(state.predecessorBinding).toMatchObject({ lifecycle: 'revoked' })
    expect(state.predecessorCredential).toMatchObject({ lifecycle: 'revoked' })
    expect(state.successorCredential).toMatchObject({ lifecycle: 'active' })
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
      replacementMode: 'planned',
      issuanceKey,
      grantRef: issuedAgentGrantRef('user_owner', issuanceKey),
      credentialId,
      applicationRef: first.applicationRef,
      environment: first.environment,
      scopes: first.scopes,
      authorityMode: first.authorityMode,
      toolAccess: first.toolAccess,
      toolRefs: first.toolRefs,
      spendingPolicy: first.spendingPolicy,
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
      replacementMode: 'planned',
      issuanceKey: replacementIssuance,
      grantRef: issuedAgentGrantRef('user_owner', replacementIssuance),
      credentialId: 'key_agent_a_platform_replacement',
      applicationRef: agentA.applicationRef,
      environment: agentA.environment,
      scopes: agentA.scopes,
      authorityMode: agentA.authorityMode,
      toolAccess: agentA.toolAccess,
      toolRefs: agentA.toolRefs,
      spendingPolicy: agentA.spendingPolicy,
      createdAt: NOW,
      expiresAt: NOW + 600_000,
    }
    const prepared = await owner.mutation(prepareReplacement, {
      ...replacement,
      serviceAuth: await operationAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...replacement, scopes: [...replacement.scopes], toolRefs: [...replacement.toolRefs] },
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
    const lifecycleEvents = await backend.run(async (ctx) => {
      const admission = await ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (query) => query.eq('principalId', principalA))
        .unique()
      if (admission === null) throw new Error('agent_admission_missing')
      return await ctx.db.query('auditEvents')
        .withIndex('by_activeAccountRef_and_targetType_and_targetRef_and_createdAt', (query) => query
          .eq('activeAccountRef', admission.ownerId)
          .eq('targetType', 'agent')
          .eq('targetRef', principalA))
        .collect()
    })
    expect(lifecycleEvents.filter(({ eventType }) => eventType === 'agent.credential.revoked')).toHaveLength(1)
    expect(lifecycleEvents.filter(({ eventType }) => eventType === 'agent.disconnected')).toHaveLength(1)
    expect(lifecycleEvents.every(({ sourceSystem }) => sourceSystem === 'ae_recorded')).toBe(true)
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
    const pagedPrincipals: string[] = []
    let cursor: string | null = null
    let done = false
    for (let pageNumber = 0; pageNumber < 6 && !done; pageNumber += 1) {
      const page: { page: Array<{ principalRef: string }>; continueCursor: string; isDone: boolean } = await owner.query(api.agentDirectory.listOwnedPage, {
        now: NOW,
        paginationOpts: { numItems: 1, cursor },
      })
      pagedPrincipals.push(...page.page.map(({ principalRef }) => principalRef))
      cursor = page.continueCursor
      done = page.isDone
    }
    expect(done).toBe(true)
    expect(pagedPrincipals).toEqual(expect.arrayContaining([principalA, principalB]))
    const credentialA = rows.find((row) => row.principalRef === principalA)?.credentials[0]?.credentialRef
    if (credentialA === undefined) throw new Error('credential missing')
    await insertLifecycleRefreshFamily(backend, principalA, credentialA, agentA.credentialId, 'revoke-a')

    const extraIssuance = 'agent-a-extra-credential-12345678'
    const extra: AgentCredentialReplacementRegistration = {
      principalRef: principalA,
      replacementMode: 'planned',
      issuanceKey: extraIssuance,
      grantRef: issuedAgentGrantRef('user_owner', extraIssuance),
      credentialId: 'key_agent_a_extra',
      applicationRef: agentA.applicationRef,
      environment: agentA.environment,
      scopes: agentA.scopes,
      authorityMode: agentA.authorityMode,
      toolAccess: agentA.toolAccess,
      toolRefs: agentA.toolRefs,
      spendingPolicy: agentA.spendingPolicy,
      createdAt: NOW,
      expiresAt: NOW + 600_000,
    }
    const extraPrepared = await owner.mutation(prepareReplacement, {
      ...extra,
      serviceAuth: await operationAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...extra, scopes: [...extra.scopes], toolRefs: [...extra.toolRefs] },
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
    await expect(backend.run(async (ctx) => await ctx.db.query('agentAccessOAuthRefreshFamilies')
      .withIndex('by_currentCredentialRef_and_lifecycle', (query) => query
        .eq('currentCredentialRef', credentialA).eq('lifecycle', 'revoked')).unique()))
      .resolves.toMatchObject({ revocationReason: 'owner_credential_revoked' })
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
    await expect(backend.run(async (ctx) => await ctx.db.query('agentAccessProviderRevocations')
      .withIndex('by_principalRef_and_lifecycle', (query) => query
        .eq('principalRef', principalA).eq('lifecycle', 'pending'))
      .collect())).resolves.toHaveLength(1)
    await expect(owner.query(api.agentDirectory.listOwned, { now: NOW })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ principalRef: principalA, status: 'attention' }),
      expect.objectContaining({ principalRef: principalB, status: 'connected' }),
    ]))
    const providerCompleted = { ...providerCommand, outcome: 'revoked' as const }
    await expect(owner.mutation(recordProviderRevocation, {
      ...providerCompleted,
      serviceAuth: await operationAssertion('agentAccessPrincipals.recordProviderRevocationForServer', providerCompleted),
    })).resolves.toEqual({ kind: 'completed' })
    await expect(backend.run(async (ctx) => await ctx.db.query('agentAccessProviderRevocations')
      .withIndex('by_principalRef_and_lifecycle', (query) => query
        .eq('principalRef', principalA).eq('lifecycle', 'pending'))
      .collect())).resolves.toHaveLength(0)
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

    const credentialB = rows.find((row) => row.principalRef === principalB)?.credentials[0]?.credentialRef
    if (credentialB === undefined) throw new Error('agent B credential missing')
    await insertLifecycleRefreshFamily(backend, principalB, credentialB, agentB.credentialId, 'disconnect-b')
    const disconnectCommand = { principalRef: principalB, correlationRef: 'corr-disconnect-b' }
    const disconnectAuth = await operationAssertion('agentAccessPrincipals.disconnectAgentForServer', disconnectCommand)
    await expect(owner.mutation(disconnectAgentLifecycle, { ...disconnectCommand, serviceAuth: disconnectAuth }))
      .resolves.toMatchObject({ kind: 'completed', principalRef: principalB })
    await expect(owner.mutation(disconnectAgentLifecycle, { ...disconnectCommand, serviceAuth: disconnectAuth }))
      .resolves.toMatchObject({ kind: 'replayed', principalRef: principalB })
    await expect(backend.run(async (ctx) => await ctx.db.query('agentAccessOAuthRefreshFamilies')
      .withIndex('by_principalRef_and_lifecycle', (query) => query
        .eq('principalRef', principalB).eq('lifecycle', 'revoked')).unique()))
      .resolves.toMatchObject({ revocationReason: 'owner_disconnected' })
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

  it('bounds disconnect fan-out and resumes from durable provider cleanup state', async () => {
    const backend = convexTest(schema, modules)
    const owner = backend.withIdentity(identity('user_owner'))
    await owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
    const input = bindingInput()
    await owner.mutation(registerIssuedBinding, { ...input, serviceAuth: await assertion(input) })
    const [agent] = await owner.query(api.agentDirectory.listOwned, { now: NOW })
    if (agent === undefined) throw new Error('agent_missing')

    await backend.run(async (ctx) => {
      const sourceCredential = await ctx.db.query('credentials')
        .withIndex('by_principalRef_and_lifecycle', (query) => query
          .eq('principalRef', agent.principalRef).eq('lifecycle', 'active'))
        .unique()
      const sourceBinding = sourceCredential === null ? null : await ctx.db.query('externalIdentityBindings')
        .withIndex('by_bindingRef', (query) => query.eq('bindingRef', sourceCredential.bindingRef))
        .unique()
      if (sourceCredential === null || sourceBinding === null) throw new Error('source_credential_missing')
      for (let index = 2; index <= 30; index += 1) {
        const bindingRef = `bnd_batch_${index}`
        await ctx.db.insert('externalIdentityBindings', {
          bindingRef,
          principalRef: agent.principalRef,
          providerNamespace: sourceBinding.providerNamespace,
          providerIdentifier: `key_batch_${index}`,
          providerState: { kind: 'known', value: 'active' },
          lifecycle: 'active',
          credentialGeneration: index,
          bindIdempotencyRef: `batch-binding-${index}`,
          revision: 1,
          createdAt: NOW + index,
          updatedAt: NOW + index,
        })
        await ctx.db.insert('credentials', {
          credentialRef: `crd_batch_${index}`,
          bindingRef,
          principalRef: agent.principalRef,
          type: sourceCredential.type,
          lifecycle: 'active',
          generation: index,
          issueIdempotencyRef: `batch-credential-${index}`,
          revision: 1,
          issuedAt: NOW + index,
          expiresAt: NOW + 600_000,
          updatedAt: NOW + index,
        })
      }
    })

    const command = { principalRef: agent.principalRef, correlationRef: 'corr-bounded-disconnect' }
    const serviceAuth = await operationAssertion('agentAccessPrincipals.disconnectAgentForServer', command)
    const first = await owner.mutation(disconnectAgentLifecycle, { ...command, serviceAuth })
    expect(first).toMatchObject({ kind: 'completed', hasMore: true })
    const firstTargets = first.providerTargets as Array<{ credentialRef: string; providerCredentialId: string }>
    expect(firstTargets).toHaveLength(25)
    await expect(backend.run(async (ctx) => await ctx.db.query('agentAccessProviderRevocations')
      .withIndex('by_principalRef_and_lifecycle', (query) => query
        .eq('principalRef', agent.principalRef).eq('lifecycle', 'pending'))
      .collect())).resolves.toHaveLength(25)
    for (const target of firstTargets) {
      const provider = { ...target, principalRef: agent.principalRef, correlationRef: command.correlationRef, outcome: 'revoked' as const }
      await owner.mutation(recordProviderRevocation, {
        ...provider,
        serviceAuth: await operationAssertion('agentAccessPrincipals.recordProviderRevocationForServer', provider),
      })
    }

    const second = await owner.mutation(disconnectAgentLifecycle, { ...command, serviceAuth })
    expect(second).toMatchObject({ hasMore: false })
    expect(second.providerTargets as unknown[]).toHaveLength(5)
    await expect(backend.run(async (ctx) => await ctx.db.query('agentAccessProviderRevocations')
      .withIndex('by_principalRef_and_lifecycle', (query) => query
        .eq('principalRef', agent.principalRef).eq('lifecycle', 'pending'))
      .collect())).resolves.toHaveLength(5)
  })
})

async function insertLifecycleRefreshFamily(
  backend: TestConvex<typeof schema>,
  principalRef: string,
  credentialRef: string,
  providerCredentialId: string,
  suffix: string,
) {
  await backend.run(async (ctx) => {
    const access = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', principalRef)).unique()
    const credential = await ctx.db.query('credentials')
      .withIndex('by_credentialRef', (query) => query.eq('credentialRef', credentialRef)).unique()
    if (access === null || credential === null) throw new Error('refresh lifecycle fixture missing')
    const grants = await ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
        .eq('credentialId', providerCredentialId).eq('environment', access.environment).eq('lifecycle', 'active')).take(2)
    const storedGrant = grants.find((candidate) => candidate.principalId === principalRef)
    const normalizedGrant = storedGrant === undefined ? undefined : normalizeStoredAgentAccessGrant(storedGrant)
    const grant = normalizedGrant?.format === 'ae.agent-access-grant:v2' ? normalizedGrant : undefined
    const spendingPolicy = grant?.spendingPolicy.format === 'ae.agent-access-policy:v2'
      ? grant.spendingPolicy
      : undefined
    const ownerships = await ctx.db.query('accountOwnerships')
      .withIndex('by_accountRef_and_lifecycle', (query) => query.eq('accountRef', access.ownerId).eq('lifecycle', 'active')).take(2)
    const ownership = ownerships[0]
    if (grant === undefined || spendingPolicy === undefined
      || ownerships.length !== 1 || ownership === undefined) {
      throw new Error('refresh lifecycle authority fixture invalid')
    }
    const familyRef = `refresh-family:${suffix}`
    const tokenHash = `sha256:refresh-family:${suffix}`
    await ctx.db.insert('agentAccessOAuthRefreshFamilies', {
      familyRef, revision: 1, clientId: `client:${suffix}`, ownerId: access.ownerId,
      ownerPrincipalRef: ownership.ownerPrincipalRef, providerSubject: 'user_owner',
      principalRef, displayName: 'Lifecycle refresh connection', applicationRef: access.applicationRef,
      environment: access.environment, scopes: [...access.scopes], authorityMode: access.authorityMode,
      toolAccess: grant.toolAccess, toolRefs: [...grant.toolRefs],
      spendingPolicy: {
        format: 'ae.agent-access-policy:v2', toolAccess: spendingPolicy.toolAccess,
        toolRefs: [...spendingPolicy.toolRefs], environment: spendingPolicy.environment,
        budget: { ...spendingPolicy.budget }, rate: { ...spendingPolicy.rate },
      },
      currentCredentialRef: credentialRef, currentProviderCredentialId: providerCredentialId,
      currentGrantRef: grant.grantRef, currentGeneration: credential.generation,
      currentAccessExpiresAt: credential.expiresAt ?? NOW + 600_000,
      currentTokenHash: tokenHash, lifecycle: 'active', createdAt: NOW,
      expiresAt: NOW + 2_592_000_000, updatedAt: NOW,
    })
    await ctx.db.insert('agentAccessOAuthRefreshTokens', {
      tokenHash, accessTokenHash: `sha256:access-family:${suffix}`,
      familyRef, generation: 1, lifecycle: 'active', createdAt: NOW,
    })
  })
}
