/// <reference types="vite/client" />
import { makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AgentAccessPrincipal,
  AgentCredentialReplacementRegistration,
  IssuedAgentBindingRegistration,
} from '@/modules/agent-access/agent-access'
import {
  CUSTOMER_REQUEST_APPROVAL_REQUIRED_SCOPE,
  CUSTOMER_REQUEST_SPENDING_POLICY_SCOPE,
  CUSTOMER_REQUEST_STANDING_AUTHORITY_SCOPE,
  MARKET_TOOLS_CALL_SCOPE,
} from '@/modules/agent-access/contract'
import { issuedAgentGrantRef, replacementAgentCanonicalRefs } from '@/modules/agent-access/issued-agent-binding'
import { defaultSandboxAgentAccessPolicy } from '@/modules/agent-access/sandbox-policy'
import {
  createCustomerRequestServiceAssertion,
  toStableHashValue,
  type CustomerRequestServiceAssertion,
} from '@/modules/agent-access/service-auth-envelope'
import { createAgentAccessGrant, normalizeStoredAgentAccessGrant } from '@/modules/agent-access/policy'
import { internal } from '../../../convex/_generated/api'
import { resolveCanonicalAgentBinding } from '../../../convex/authorityBoundary'
import { convexTestWithWorkers, publishedBusinessOwner, type ConvexFixtureBackend } from '../../helpers/convex-fixtures'
import { issueBuyerAgent as registerIssuedBuyerAgent } from '../../helpers/issued-buyer-agent'

const SERVICE_KEY = 'agent-credential-replacement-test-key-32-bytes'
const REGISTER_OPERATION = 'agentAccessPrincipals.registerIssuedAgentBindingForServer'
const NOW = 10_000

type RegisterResult = Readonly<Record<string, unknown>>

const prepareReplacement = makeFunctionReference<
  'mutation',
  AgentCredentialReplacementRegistration & Readonly<{ serviceAuth: CustomerRequestServiceAssertion }>,
  RegisterResult
>('agentAccessPrincipals:prepareCredentialReplacementForServer')
const promoteReplacement = makeFunctionReference<
  'mutation',
  Readonly<{
    principalRef: string
    successorCredentialRef: string
    successorGrantRef: string
    serviceAuth: CustomerRequestServiceAssertion
  }>,
  RegisterResult
>('agentAccessPrincipals:promoteCredentialReplacementForServer')
const cancelReplacement = makeFunctionReference<
  'mutation',
  Readonly<{
    principalRef: string
    successorCredentialRef: string
    successorGrantRef: string
    serviceAuth: CustomerRequestServiceAssertion
  }>,
  RegisterResult
>('agentAccessPrincipals:cancelCredentialReplacementForServer')

type IssuedBuyer = Readonly<{
  input: IssuedAgentBindingRegistration
  principal: AgentAccessPrincipal
}>

async function serviceAssertion(
  operation: string,
  command: Record<string, unknown>,
  issuedAt = NOW,
): Promise<CustomerRequestServiceAssertion> {
  return await createCustomerRequestServiceAssertion({
    key: SERVICE_KEY,
    operation,
    command: toStableHashValue(command),
    principal: {
      principalId: 'ae:server-function',
      ownerId: 'ae:server-function',
      credentialId: 'ae:server-function',
      scopes: [MARKET_TOOLS_CALL_SCOPE],
    },
    issuedAt,
  })
}

async function issueBuyerAgent(
  backend: ConvexFixtureBackend,
  owner: ReturnType<ConvexFixtureBackend['withIdentity']>,
  subject: string,
): Promise<IssuedBuyer> {
  return await registerIssuedBuyerAgent(backend, owner, subject, {
    serviceKey: SERVICE_KEY,
    registerOperation: REGISTER_OPERATION,
    issuanceKey: `buyer-${subject}`,
    createdAt: NOW,
    expiresAt: NOW + 600_000,
    registration: {
      displayName: 'Buyer credential rotation fixture',
      applicationRef: 'agentic-economy',
      environment: 'sandbox',
      scopes: [MARKET_TOOLS_CALL_SCOPE, CUSTOMER_REQUEST_SPENDING_POLICY_SCOPE],
      authorityMode: 'spending_policy',
      toolAccess: 'all_admitted',
      toolRefs: [],
      spendingPolicy: defaultSandboxAgentAccessPolicy({ currency: 'AUD', exponent: 6 }),
    },
  })
}

async function readGrant(backend: ConvexFixtureBackend, grantRef: string) {
  const stored = await backend.run(async (ctx) => await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', grantRef))
    .unique())
  if (stored === null) throw new Error(`grant_missing:${grantRef}`)
  const grant = normalizeStoredAgentAccessGrant(stored)
  if (grant.format !== 'ae.agent-access-grant:v2') throw new Error(`grant_format_unexpected:${grantRef}`)
  return grant
}

async function resolve(
  backend: ConvexFixtureBackend,
  input: Readonly<{
    credentialId: string
    applicationRef: string
    environment: 'sandbox' | 'production'
    scopes: readonly string[]
    correlationId: string
  }>,
) {
  return await backend.run(async (ctx) => await resolveCanonicalAgentBinding(ctx, {
    ...input,
    requiredScopes: [MARKET_TOOLS_CALL_SCOPE],
    authorityMode: 'spending_policy',
    operationKey: 'surface:http:tools-call',
  }))
}

function replacementInput(
  first: IssuedBuyer,
  subject: string,
  issuanceKey: string,
  credentialId: string,
  replacementMode: 'planned' | 'compromise' = 'planned',
  spendingPolicy = first.input.spendingPolicy,
  scopes = first.input.scopes,
  authorityMode = first.input.authorityMode,
): AgentCredentialReplacementRegistration {
  return {
    principalRef: first.principal.principalId,
    replacementMode,
    issuanceKey,
    grantRef: issuedAgentGrantRef(subject, issuanceKey),
    credentialId,
    applicationRef: first.input.applicationRef,
    environment: first.input.environment,
    scopes,
    authorityMode,
    toolAccess: first.input.toolAccess,
    toolRefs: first.input.toolRefs,
    spendingPolicy,
    createdAt: NOW,
    expiresAt: NOW + 600_000,
  }
}

async function readReplacementArtifacts(
  backend: ConvexFixtureBackend,
  first: IssuedBuyer,
  replacement: AgentCredentialReplacementRegistration,
  generation = 2,
) {
  const refs = replacementAgentCanonicalRefs({
    principalRef: first.principal.principalId,
    credentialId: replacement.credentialId,
    generation,
    grantRef: replacement.grantRef,
  })
  return await backend.run(async (ctx) => ({
    binding: await ctx.db.query('externalIdentityBindings')
      .withIndex('by_bindingRef', (query) => query.eq('bindingRef', refs.bindingRef)).unique(),
    credential: await ctx.db.query('credentials')
      .withIndex('by_credentialRef', (query) => query.eq('credentialRef', refs.credentialRef)).unique(),
    grant: await ctx.db.query('agentAccessGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', replacement.grantRef)).unique(),
  }))
}

async function readCurrentArtifacts(
  backend: ConvexFixtureBackend,
  first: IssuedBuyer,
) {
  return await backend.run(async (ctx) => {
    const principal = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', first.principal.principalId)).unique()
    const binding = principal === null ? null : await ctx.db.query('externalIdentityBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
        .eq('providerNamespace', 'clerk/api-key').eq('providerIdentifier', principal.credentialId))
      .unique()
    const credential = binding === null ? null : await ctx.db.query('credentials')
      .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
        .eq('bindingRef', binding.bindingRef).eq('generation', binding.credentialGeneration).eq('lifecycle', 'active'))
      .unique()
    const grant = await ctx.db.query('agentAccessGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', first.input.grantRef)).unique()
    return { principal, binding, credential, grant }
  })
}

describe('buyer Agent credential replacement', () => {
  const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN

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

  it('advances credential and grant generation while retaining shared capacity across rotation', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'agent-credential-replacement')
    const subject = 'user_agent-credential-replacement'
    const first = await issueBuyerAgent(backend, fixture.owner, subject)
    const predecessorGrant = await readGrant(backend, first.input.grantRef)
    const replacement = replacementInput(
      first,
      subject,
      'buyer-replacement-12345678',
      'credential:buyer-replacement',
    )

    const prepared = await fixture.owner.mutation(prepareReplacement, {
      ...replacement,
      serviceAuth: await serviceAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...replacement, scopes: [...replacement.scopes], toolRefs: [...replacement.toolRefs] },
      ),
    })
    expect(prepared).toMatchObject({
      kind: 'recorded',
      principalRef: first.principal.principalId,
      generation: 2,
      predecessorKeyId: first.input.credentialId,
    })
    if (prepared.kind !== 'recorded' && prepared.kind !== 'replayed') {
      throw new Error(`replacement_prepare_failed:${String(prepared.kind)}`)
    }

    const successorCredentialRef = String(prepared.successorCredentialRef)
    const successorCredential = await backend.run(async (ctx) => await ctx.db.query('credentials')
      .withIndex('by_credentialRef', (query) => query.eq('credentialRef', successorCredentialRef))
      .unique())
    expect(successorCredential).toMatchObject({ generation: 2, lifecycle: 'active' })
    const successorGrant = await readGrant(backend, replacement.grantRef)
    expect(successorGrant.generation).toBe(2)
    expect(await resolve(backend, {
      credentialId: replacement.credentialId,
      applicationRef: replacement.applicationRef,
      environment: replacement.environment,
      scopes: replacement.scopes,
      correlationId: 'buyer-replacement-before-promotion',
    })).toBeNull()

    const transition = {
      principalRef: first.principal.principalId,
      successorCredentialRef,
      successorGrantRef: replacement.grantRef,
    }
    await expect(fixture.owner.mutation(promoteReplacement, {
      ...transition,
      serviceAuth: await serviceAssertion(
        'agentAccessPrincipals.promoteCredentialReplacementForServer',
        transition,
      ),
    })).resolves.toMatchObject({ kind: 'completed', providerCredentialId: first.input.credentialId })
    await expect(fixture.owner.mutation(promoteReplacement, {
      ...transition,
      serviceAuth: await serviceAssertion(
        'agentAccessPrincipals.promoteCredentialReplacementForServer',
        transition,
      ),
    })).resolves.toMatchObject({ kind: 'replayed', providerCredentialId: first.input.credentialId })
    vi.setSystemTime(NOW + 700_000)
    await expect(fixture.owner.mutation(promoteReplacement, {
      ...transition,
      serviceAuth: await serviceAssertion(
        'agentAccessPrincipals.promoteCredentialReplacementForServer',
        transition,
        NOW + 700_000,
      ),
    })).resolves.toMatchObject({ kind: 'replayed', providerCredentialId: first.input.credentialId })
    vi.setSystemTime(NOW)

    await expect(resolve(backend, {
      credentialId: replacement.credentialId,
      applicationRef: replacement.applicationRef,
      environment: replacement.environment,
      scopes: replacement.scopes,
      correlationId: 'buyer-replacement-after-promotion',
    })).resolves.toMatchObject({
      principalId: first.principal.principalId,
      credentialId: replacement.credentialId,
      grantRef: replacement.grantRef,
    })

    const promotedPrincipal = await backend.run(async (ctx) => await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', first.principal.principalId))
      .unique())
    expect(promotedPrincipal).toMatchObject({
      credentialId: replacement.credentialId,
      grantGeneration: 2,
    })
    expect(successorGrant.spendingPolicy.budget.generation)
      .toBe(predecessorGrant.spendingPolicy.budget.generation)
    expect(successorGrant.spendingPolicy.rate.generation)
      .toBe(predecessorGrant.spendingPolicy.rate.generation)
    expect(successorGrant.spendingPolicy.budget).toEqual(predecessorGrant.spendingPolicy.budget)
    expect(successorGrant.spendingPolicy.rate).toEqual(predecessorGrant.spendingPolicy.rate)
  })

  it('does not let cancelled successors hide a later active successor', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'agent-credential-replacement-successor-limit')
    const subject = 'user_agent-credential-replacement-successor-limit'
    const first = await issueBuyerAgent(backend, fixture.owner, subject)
    const prepare = async (replacement: AgentCredentialReplacementRegistration, expectSuccess = true) => {
      const prepared = await fixture.owner.mutation(prepareReplacement, {
        ...replacement,
        serviceAuth: await serviceAssertion(
          'agentAccessPrincipals.prepareCredentialReplacementForServer',
          { ...replacement, scopes: [...replacement.scopes], toolRefs: [...replacement.toolRefs] },
        ),
      })
      if (!expectSuccess) return prepared
      expect(prepared).toMatchObject({ kind: expect.stringMatching(/recorded|replayed/), generation: 2 })
      if (prepared.kind !== 'recorded' && prepared.kind !== 'replayed') {
        throw new Error(`successor_prepare_failed:${String(prepared.kind)}`)
      }
      return prepared
    }
    const cancel = async (replacement: AgentCredentialReplacementRegistration) => {
      const prepared = await prepare(replacement)
      const transition = {
        principalRef: first.principal.principalId,
        successorCredentialRef: String(prepared.successorCredentialRef),
        successorGrantRef: replacement.grantRef,
      }
      await expect(fixture.owner.mutation(cancelReplacement, {
        ...transition,
        serviceAuth: await serviceAssertion(
          'agentAccessPrincipals.cancelCredentialReplacementForServer',
          transition,
        ),
      })).resolves.toMatchObject({ kind: 'completed' })
    }

    await cancel(replacementInput(first, subject, 'buyer-cancelled-1-123456', 'credential:cancelled-1'))
    await cancel(replacementInput(first, subject, 'buyer-cancelled-2-123456', 'credential:cancelled-2'))
    const activeReplacement = replacementInput(first, subject, 'buyer-active-3-123456', 'credential:active-3')
    await expect(prepare(activeReplacement)).resolves.toMatchObject({ kind: 'recorded' })
    const current = await readCurrentArtifacts(backend, first)
    if (current.credential === null) throw new Error('successor_limit_predecessor_missing')

    const rejectedReplacement = replacementInput(first, subject, 'buyer-active-4-123456', 'credential:active-4')
    await expect(prepare(rejectedReplacement, false)).resolves.toEqual({ kind: 'conflict' })
    await expect(readReplacementArtifacts(backend, first, rejectedReplacement)).resolves.toEqual({
      binding: null,
      credential: null,
      grant: null,
    })
    await expect(backend.run(async (ctx) => await ctx.db.query('credentials')
      .withIndex('by_predecessorCredentialRef', (query) => query.eq('predecessorCredentialRef', current.credential!.credentialRef))
      .filter((query) => query.eq(query.field('lifecycle'), 'active'))
      .collect())).resolves.toHaveLength(1)
  })

  it('rejects authority mode and scope drift without creating successor records', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'agent-credential-replacement-drift')
    const subject = 'user_agent-credential-replacement-drift'
    const first = await issueBuyerAgent(backend, fixture.owner, subject)

    const modeDrift = replacementInput(
      first,
      subject,
      'buyer-mode-drift-12345678',
      'credential:buyer-mode-drift',
      'planned',
      first.input.spendingPolicy,
      [MARKET_TOOLS_CALL_SCOPE, CUSTOMER_REQUEST_APPROVAL_REQUIRED_SCOPE],
      'approval_required',
    )
    await expect(fixture.owner.mutation(prepareReplacement, {
      ...modeDrift,
      serviceAuth: await serviceAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...modeDrift, scopes: [...modeDrift.scopes], toolRefs: [...modeDrift.toolRefs] },
      ),
    })).resolves.toEqual({ kind: 'conflict' })
    await expect(readReplacementArtifacts(backend, first, modeDrift)).resolves.toEqual({
      binding: null,
      credential: null,
      grant: null,
    })

    const scopeDrift = replacementInput(
      first,
      subject,
      'buyer-scope-drift-12345678',
      'credential:buyer-scope-drift',
      'planned',
      first.input.spendingPolicy,
      [...first.input.scopes, CUSTOMER_REQUEST_STANDING_AUTHORITY_SCOPE],
      first.input.authorityMode,
    )
    await expect(fixture.owner.mutation(prepareReplacement, {
      ...scopeDrift,
      serviceAuth: await serviceAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...scopeDrift, scopes: [...scopeDrift.scopes], toolRefs: [...scopeDrift.toolRefs] },
      ),
    })).resolves.toEqual({ kind: 'conflict' })
    await expect(readReplacementArtifacts(backend, first, scopeDrift)).resolves.toEqual({
      binding: null,
      credential: null,
      grant: null,
    })
  })

  it('rejects replay when the existing successor binding is revoked', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'agent-credential-replacement-revoked-binding')
    const subject = 'user_agent-credential-replacement-revoked-binding'
    const first = await issueBuyerAgent(backend, fixture.owner, subject)
    const replacement = replacementInput(
      first,
      subject,
      'buyer-revoked-binding-12345678',
      'credential:revoked-binding',
    )
    const prepared = await fixture.owner.mutation(prepareReplacement, {
      ...replacement,
      serviceAuth: await serviceAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...replacement, scopes: [...replacement.scopes], toolRefs: [...replacement.toolRefs] },
      ),
    })
    if (prepared.kind !== 'recorded' && prepared.kind !== 'replayed') {
      throw new Error(`revoked_binding_prepare_failed:${String(prepared.kind)}`)
    }
    const before = await readReplacementArtifacts(backend, first, replacement)
    if (before.binding === null) throw new Error('revoked_binding_missing')
    await backend.run(async (ctx) => {
      await ctx.db.patch(before.binding!._id, {
        lifecycle: 'revoked',
        providerState: { kind: 'unknown', value: 'test_revoked' },
        revokedAt: NOW,
        updatedAt: NOW,
        revision: before.binding!.revision + 1,
      })
    })
    const revoked = await readReplacementArtifacts(backend, first, replacement)
    await expect(fixture.owner.mutation(prepareReplacement, {
      ...replacement,
      serviceAuth: await serviceAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...replacement, scopes: [...replacement.scopes], toolRefs: [...replacement.toolRefs] },
      ),
    })).resolves.toEqual({ kind: 'conflict' })
    await expect(readReplacementArtifacts(backend, first, replacement)).resolves.toEqual(revoked)
  })

  it.each(['cancelled', 'inactive', 'expired'] as const)(
    'refuses promotion of a %s successor before predecessor revocation',
    async (successorState) => {
      const backend = convexTestWithWorkers({ pauseWorkpool: true })
      const fixture = await publishedBusinessOwner(backend, `agent-credential-replacement-${successorState}`)
      const subject = `user_agent-credential-replacement-${successorState}`
      const first = await issueBuyerAgent(backend, fixture.owner, subject)
      const replacement = replacementInput(
        first,
        subject,
        `buyer-${successorState}-12345678`,
        `credential:${successorState}`,
      )
      const prepared = await fixture.owner.mutation(prepareReplacement, {
        ...replacement,
        serviceAuth: await serviceAssertion(
          'agentAccessPrincipals.prepareCredentialReplacementForServer',
          { ...replacement, scopes: [...replacement.scopes], toolRefs: [...replacement.toolRefs] },
        ),
      })
      if (prepared.kind !== 'recorded' && prepared.kind !== 'replayed') {
        throw new Error(`inactive_successor_prepare_failed:${String(prepared.kind)}`)
      }
      const transition = {
        principalRef: first.principal.principalId,
        successorCredentialRef: String(prepared.successorCredentialRef),
        successorGrantRef: replacement.grantRef,
      }
      const artifacts = await readReplacementArtifacts(backend, first, replacement)
      if (artifacts.binding === null || artifacts.credential === null || artifacts.grant === null) {
        throw new Error(`inactive_successor_artifacts_missing:${successorState}`)
      }
      if (successorState === 'cancelled') {
        await expect(fixture.owner.mutation(cancelReplacement, {
          ...transition,
          serviceAuth: await serviceAssertion(
            'agentAccessPrincipals.cancelCredentialReplacementForServer',
            transition,
          ),
        })).resolves.toMatchObject({ kind: 'completed' })
      } else if (successorState === 'inactive') {
        await backend.run(async (ctx) => {
          await ctx.db.patch(artifacts.grant!._id, { lifecycle: 'revoked', updatedAt: NOW })
        })
      } else {
        await backend.run(async (ctx) => {
          await Promise.all([
            ctx.db.patch(artifacts.credential!._id, { expiresAt: NOW - 1, updatedAt: NOW }),
            ctx.db.patch(artifacts.grant!._id, { expiresAt: NOW - 1, updatedAt: NOW }),
          ])
        })
      }
      const currentBefore = await readCurrentArtifacts(backend, first)
      await expect(fixture.owner.mutation(promoteReplacement, {
        ...transition,
        serviceAuth: await serviceAssertion(
          'agentAccessPrincipals.promoteCredentialReplacementForServer',
          transition,
        ),
      })).resolves.toEqual({ kind: 'conflict' })
      await expect(readCurrentArtifacts(backend, first)).resolves.toEqual(currentBefore)
    },
  )

  it('creates no successor artifacts when grant validation rejects the requested expiry', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'agent-credential-replacement-invalid-grant')
    const subject = 'user_agent-credential-replacement-invalid-grant'
    const first = await issueBuyerAgent(backend, fixture.owner, subject)
    const replacement = {
      ...replacementInput(
        first,
        subject,
        'buyer-invalid-grant-12345678',
        'credential:invalid-grant',
      ),
      createdAt: NOW + 60_000,
      expiresAt: NOW + 1,
    }

    await expect(fixture.owner.mutation(prepareReplacement, {
      ...replacement,
      serviceAuth: await serviceAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...replacement, scopes: [...replacement.scopes], toolRefs: [...replacement.toolRefs] },
      ),
    })).resolves.toEqual({ kind: 'conflict' })
    await expect(readReplacementArtifacts(backend, first, replacement)).resolves.toEqual({
      binding: null,
      credential: null,
      grant: null,
    })
  })

  it('rejects policy drift and rotates a compromised credential with independent grant generation and revoked history', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'agent-credential-compromise')
    const subject = 'user_agent-credential-compromise'
    const first = await issueBuyerAgent(backend, fixture.owner, subject)
    const predecessorGrant = await readGrant(backend, first.input.grantRef)
    const driftedPolicy = {
      ...first.input.spendingPolicy,
      budget: {
        ...first.input.spendingPolicy.budget,
        maximumDailySpend: {
          ...first.input.spendingPolicy.budget.maximumDailySpend,
          units: '6000000',
        },
      },
      rate: {
        ...first.input.spendingPolicy.rate,
        maximumCallsPerMinute: first.input.spendingPolicy.rate.maximumCallsPerMinute + 1,
      },
    }
    const drifted = replacementInput(
      first,
      subject,
      'buyer-compromise-drift-12345678',
      'credential:buyer-compromise-drift',
      'planned',
      driftedPolicy,
    )
    await expect(fixture.owner.mutation(prepareReplacement, {
      ...drifted,
      serviceAuth: await serviceAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...drifted, scopes: [...drifted.scopes], toolRefs: [...drifted.toolRefs] },
      ),
    })).resolves.toEqual({ kind: 'conflict' })
    await expect(backend.run(async (ctx) => await ctx.db.query('credentials')
      .withIndex('by_principalRef_and_lifecycle', (query) => query
        .eq('principalRef', first.principal.principalId).eq('lifecycle', 'active'))
      .collect())).resolves.toHaveLength(1)

    const updated = createAgentAccessGrant({
      ...predecessorGrant,
      grantRef: `${first.input.grantRef}:updated`,
      generation: 2,
    })
    if (updated.kind !== 'accepted') throw new Error('updated_grant_invalid')
    await expect(backend.mutation(internal.agentAccessPolicy.upsertGrant, { grant: updated.grant }))
      .resolves.toMatchObject({ kind: 'recorded', generation: 2 })
    await backend.run(async (ctx) => {
      const current = await ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (query) => query.eq('principalId', first.principal.principalId)).unique()
      if (current === null) throw new Error('current_principal_missing')
      await ctx.db.patch(current._id, { grantGeneration: 2 })
      const binding = await ctx.db.query('externalIdentityBindings')
        .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
          .eq('providerNamespace', 'clerk/api-key').eq('providerIdentifier', first.input.credentialId))
        .unique()
      const credential = binding === null ? null : await ctx.db.query('credentials')
        .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
          .eq('bindingRef', binding.bindingRef)
          .eq('generation', binding.credentialGeneration)
          .eq('lifecycle', 'active'))
        .unique()
      const grant = await ctx.db.query('agentAccessGrants')
        .withIndex('by_grantRef', (query) => query.eq('grantRef', updated.grant.grantRef))
        .unique()
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
          lifecycle: 'revoked',
          revokedAt: NOW,
          updatedAt: NOW,
          revision: credential.revision + 1,
        }),
        ctx.db.patch(grant._id, { lifecycle: 'revoked', updatedAt: NOW }),
      ])
    })

    const replacement = replacementInput(
      first,
      subject,
      'buyer-compromise-12345678',
      'credential:buyer-compromise',
      'compromise',
    )
    const prepared = await fixture.owner.mutation(prepareReplacement, {
      ...replacement,
      serviceAuth: await serviceAssertion(
        'agentAccessPrincipals.prepareCredentialReplacementForServer',
        { ...replacement, scopes: [...replacement.scopes], toolRefs: [...replacement.toolRefs] },
      ),
    })
    expect(prepared).toMatchObject({ kind: 'recorded', generation: 2 })
    if (prepared.kind !== 'recorded' && prepared.kind !== 'replayed') {
      throw new Error(`compromise_prepare_failed:${String(prepared.kind)}`)
    }
    const transition = {
      principalRef: first.principal.principalId,
      successorCredentialRef: String(prepared.successorCredentialRef),
      successorGrantRef: replacement.grantRef,
    }
    const promoteArgs = {
      ...transition,
      serviceAuth: await serviceAssertion(
        'agentAccessPrincipals.promoteCredentialReplacementForServer',
        transition,
      ),
    }
    await expect(fixture.owner.mutation(promoteReplacement, promoteArgs))
      .resolves.toEqual({ kind: 'completed', providerCredentialId: first.input.credentialId })
    await expect(fixture.owner.mutation(promoteReplacement, promoteArgs))
      .resolves.toEqual({ kind: 'replayed', providerCredentialId: first.input.credentialId })

    const successorGrant = await readGrant(backend, replacement.grantRef)
    expect(successorGrant.generation).toBe(3)
    expect(successorGrant.spendingPolicy.budget).toEqual(predecessorGrant.spendingPolicy.budget)
    expect(successorGrant.spendingPolicy.rate).toEqual(predecessorGrant.spendingPolicy.rate)
    await expect(resolve(backend, {
      credentialId: replacement.credentialId,
      applicationRef: replacement.applicationRef,
      environment: replacement.environment,
      scopes: replacement.scopes,
      correlationId: 'compromise-promoted',
    })).resolves.toMatchObject({ credentialId: replacement.credentialId, grantRef: replacement.grantRef })
  })
})
