/// <reference types="vite/client" />
import { makeFunctionReference, type UserIdentity } from 'convex/server'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCustomerRequestServiceAssertion, toStableHashValue, type CustomerRequestServiceAssertion } from '../src/modules/agent-access/service-auth-envelope'
import type { IssuedAgentBindingRegistration } from '../src/modules/agent-access/agent-access'
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

    const refs = issuedAgentCanonicalRefs(input.credentialId, input.grantRef)
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
})
