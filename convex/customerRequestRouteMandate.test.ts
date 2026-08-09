/// <reference types="vite/client" />

import { convexTest, type TestConvex } from 'convex-test'
import type { FunctionReturnType } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { openCapabilityDecisionModel } from '@/modules/capability-contract/public'
import { decodeDurableCapabilityContract } from '@/modules/capability-contract-registry/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { exactAmountSchema, type ExactAmount } from '@/modules/money/public'
import {
  normalizeCapabilityPublication,
  frankfurterSingleRatePublicationImport,
} from '@/modules/capability-supply/public'
import {
  compileCustomerRequest,
  writableCustomerRequestV2Aggregate,
  type CustomerRequestRoutePlan,
} from '@/modules/customer-request/compiler'
import type { RouteMandate } from '@/modules/customer-request/route-mandate'
import { isRecord } from '@/modules/common/is-record'
import { deriveRouteStepAuthority } from '@/modules/customer-request/route-mandate-admission'
import {
  createCustomerRequestRoutePlanGeneration,
  writableCustomerRequestRoutePlanGeneration,
  type CustomerRequestRoutePlanGeneration,
} from '@/modules/customer-request/route-plan-generation'
import { claimBusinessCommand } from './business'
import { registerCapabilityContractDocument } from './capabilityContractDocuments'
import { ensureCatalogProjectionControlsCommand, publishBusinessCatalogCommand } from './catalog'
import { internal } from './_generated/api'
import schema from './schema'
import {
  listRouteableCapabilitySupply,
  publishCapabilityForSeed,
  registerCapabilityBindingCommand,
  registerCapabilityOfferingCommand,
  setCapabilitySupplyEligibility,
} from './capabilitySupply'

const modules = import.meta.glob('./**/*.ts')
const identity = {
  subject: 'customer-route-mandate',
  issuer: 'https://identity.test',
  tokenIdentifier: 'https://identity.test|customer-route-mandate',
}
type RouteMandateBackend = TestConvex<typeof schema>
type StandingRouteMandateResult = FunctionReturnType<
  typeof internal.customerRequestStandingRoutePolicy.issueMandate
>
type RouteMandateIssueResult = FunctionReturnType<
  typeof internal.customerRequestRouteMandate.issue
>
type RouteMandateAdmissionResult = FunctionReturnType<
  typeof internal.customerRequestRouteMandateAdmission.admitStep
>

const TEST_ROUTE_BINDING_PREFIX = 'binding:test-route-mandate:'
const TEST_ROUTE_VARIANTS = [
  {
    slug: 'agentic-market-exa',
    suffix: 'one',
    offeringId: 'offering:test-route-mandate:one',
    bindingId: `${TEST_ROUTE_BINDING_PREFIX}one`,
    endpointUrl: 'https://agentic-economy-phi.vercel.app/api/test/route-mandate/one',
    price: { currency: 'AUD', units: '1200', exponent: 2 },
  },
  {
    slug: 'frankfurter-ecb-rates',
    suffix: 'two',
    offeringId: 'offering:test-route-mandate:two',
    bindingId: `${TEST_ROUTE_BINDING_PREFIX}two`,
    endpointUrl: 'https://agentic-economy-phi.vercel.app/api/test/route-mandate/two',
    price: { currency: 'AUD', units: '900', exponent: 2 },
  },
] as const


describe('durable RouteMandate lifecycle', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the newest bounded repeat-permission assistants without history lockout', async () => {
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      for (let index = 0; index < 70; index += 1) {
        await ctx.db.insert('customerRequestAgentPrincipals', {
          principalId: `agent:history:${index}`,
          ownerId: 'owner:history',
          credentialId: `credential:history:${index}`,
          scopes: index % 2 === 0
            ? ['customer_requests:create', 'customer_requests:standing_authority']
            : ['customer_requests:create'],
          recordedAt: index,
          lastSeenAt: index,
        })
      }
    })

    const credentials = await backend.query(
      internal.customerRequestPrincipals.listStandingCredentials,
      { ownerId: 'owner:history' },
    )

    expect(credentials).toHaveLength(32)
    expect(credentials[0]).toEqual({ credentialId: 'credential:history:68', lastSeenAt: 68 })
    expect(credentials.at(-1)).toEqual({ credentialId: 'credential:history:6', lastSeenAt: 6 })
  })

  it('issues and exactly replays one immutable standing policy against the current route generation', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const current = await committedRequest(backend)
    const route = current.routeGeneration.routes[0]
    if (route === undefined || route.maximumTotalCost.kind !== 'known') {
      throw new Error('exact route fixture missing')
    }
    await expect(backend.mutation(internal.customerRequestPrincipals.recordAgentPrincipal, {
      principalId: 'agent:assistant:standing',
      ownerId: identity.subject,
      ownerTokenIdentifier: identity.tokenIdentifier,
      credentialId: 'credential:assistant:standing',
      scopes: ['customer_requests:create', 'customer_requests:standing_authority'],
      seenAt: 900,
    })).resolves.toEqual({ kind: 'recorded' })
    const command = {
      requestId: current.aggregate.snapshot.requestId,
      expectedRequestRevision: current.aggregate.snapshot.revision,
      expectedGenerationRef: current.routeGeneration.generationRef,
      selectedRoutePlanId: route.routePlanId,
      delegatedCredentialId: 'credential:assistant:standing',
      perUseSpend: { ...route.maximumTotalCost.amount },
      cumulativeSpend: scaleExactAmount(route.maximumTotalCost.amount, 2),
      perUseDataAllocations: route.steps.reduce((total, step) => total + step.dataUse.length, 0),
      cumulativeDataAllocations: route.steps.reduce((total, step) => total + step.dataUse.length, 0) * 2,
      occurrences: 2,
      validUntil: Math.min(route.expiresAt, 9_000),
      idempotencyKey: 'standing-policy:one',
    }
    const customer = backend.withIdentity(identity)

    const issued = await customer.mutation(internal.customerRequestStandingRoutePolicy.issue, command)
    expect(issued).toMatchObject({
      kind: 'issued',
      policy: {
        format: 'ae.standing-route-policy:v1',
        principalId: identity.tokenIdentifier,
        delegatedCredentialId: command.delegatedCredentialId,
        generationRef: current.routeGeneration.generationRef,
        routes: [{ routePlanId: route.routePlanId, routeDigest: route.routeDigest }],
        limits: {
          perUseSpend: command.perUseSpend,
          cumulativeSpend: command.cumulativeSpend,
          occurrences: 2,
        },
        validFrom: 1_000,
        validUntil: command.validUntil,
      },
    })
    await expect(customer.mutation(internal.customerRequestStandingRoutePolicy.issue, command))
      .resolves.toEqual({ ...issued, kind: 'replayed' })
    await expect(customer.mutation(internal.customerRequestStandingRoutePolicy.issue, {
      ...command,
      expectedGenerationRef: 'route-generation:changed',
    })).resolves.toEqual({ kind: 'conflict', reason: 'command_changed' })
    if (issued.kind !== 'issued') throw new Error('standing policy issuance failed')
    const useCommand = {
      requestId: command.requestId,
      policyRef: issued.policy.policyRef,
      expectedPolicyDigest: issued.policy.policyDigest,
      expectedRequestRevision: command.expectedRequestRevision,
      expectedGenerationRef: command.expectedGenerationRef,
      selectedRoutePlanId: command.selectedRoutePlanId,
      delegatedCredentialId: command.delegatedCredentialId,
      mandateExpiresAt: command.validUntil,
      idempotencyKey: 'standing-use:one',
    }
    const firstIssue = await customer.mutation(
      internal.customerRequestStandingRoutePolicy.issueMandate,
      useCommand,
    )
    expect(firstIssue).toMatchObject({
      kind: 'issued',
      use: {
        standingPolicyRef: issued.policy.policyRef,
        occurrence: 1,
        maximumSpend: command.perUseSpend,
        dataAllocations: command.perUseDataAllocations,
      },
      mandate: {
        format: 'ae.route-mandate:v1',
        principal: { principalId: identity.tokenIdentifier },
        authorization: {
          kind: 'standing_low_risk',
          standingPolicyRef: issued.policy.policyRef,
        },
        request: {
          requestId: command.requestId,
          requestRevision: command.expectedRequestRevision,
        },
        route: {
          generationRef: command.expectedGenerationRef,
          routePlanId: command.selectedRoutePlanId,
          maximumTotalSpend: command.perUseSpend,
        },
      },
    })
    await expect(customer.mutation(
      internal.customerRequestStandingRoutePolicy.issueMandate,
      useCommand,
    )).resolves.toEqual({ ...firstIssue, kind: 'replayed' })
    if (firstIssue.kind !== 'issued') throw new Error('standing mandate issuance failed')
    await expect(customer.query(internal.customerRequestRouteMandate.getCurrent, {
      requestId: command.requestId,
    })).resolves.toEqual({ kind: 'active', mandate: firstIssue.mandate })
    const secondCommand = { ...useCommand, idempotencyKey: 'standing-use:two' }
    await expect(customer.mutation(
      internal.customerRequestStandingRoutePolicy.issueMandate,
      secondCommand,
    )).resolves.toEqual({ kind: 'conflict', reason: 'active_mandate_exists' })
    await expect(backend.run(async (ctx) => (
      await ctx.db.query('customerRequestStandingRouteAuthorityUses').take(10)
    ))).resolves.toHaveLength(1)

    await expect(customer.mutation(internal.customerRequestRouteMandate.revoke, {
      requestId: command.requestId,
      mandateRef: firstIssue.mandate.mandateRef,
      idempotencyKey: 'revoke:standing-use:one',
    })).resolves.toMatchObject({ kind: 'revoked' })
    const secondIssue = await customer.mutation(
      internal.customerRequestStandingRoutePolicy.issueMandate,
      secondCommand,
    )
    expect(secondIssue).toMatchObject({ kind: 'issued', use: { occurrence: 2 } })
    if (secondIssue.kind !== 'issued') throw new Error('second standing mandate issuance failed')
    await expect(customer.mutation(internal.customerRequestRouteMandate.revoke, {
      requestId: command.requestId,
      mandateRef: secondIssue.mandate.mandateRef,
      idempotencyKey: 'revoke:standing-use:two',
    })).resolves.toMatchObject({ kind: 'revoked' })
    await expect(customer.mutation(
      internal.customerRequestStandingRoutePolicy.issueMandate,
      { ...useCommand, idempotencyKey: 'standing-use:three' },
    )).resolves.toEqual({ kind: 'refused', reason: 'occurrence_limit_exceeded' })
    await expect(customer.query(internal.customerRequestStandingRoutePolicy.get, {
      requestId: command.requestId,
      policyRef: issued.policy.policyRef,
    })).resolves.toEqual({ kind: 'active', policy: issued.policy })
    const revokePolicyCommand = {
      requestId: command.requestId,
      policyRef: issued.policy.policyRef,
      expectedPolicyDigest: issued.policy.policyDigest,
      idempotencyKey: 'revoke:standing-policy:one',
    }
    const revokedPolicy = await customer.mutation(
      internal.customerRequestStandingRoutePolicy.revoke,
      revokePolicyCommand,
    )
    expect(revokedPolicy).toMatchObject({
      kind: 'revoked',
      policy: { policyRef: issued.policy.policyRef, revokedAt: 1_000 },
    })
    await expect(customer.mutation(
      internal.customerRequestStandingRoutePolicy.revoke,
      revokePolicyCommand,
    )).resolves.toEqual({ ...revokedPolicy, kind: 'replayed' })
    if (revokedPolicy.kind !== 'revoked') throw new Error('standing policy revocation failed')
    await expect(customer.query(internal.customerRequestStandingRoutePolicy.get, {
      requestId: command.requestId,
      policyRef: issued.policy.policyRef,
    })).resolves.toEqual({ kind: 'revoked', policy: revokedPolicy.policy })
    await expect(customer.mutation(
      internal.customerRequestStandingRoutePolicy.issueMandate,
      { ...useCommand, idempotencyKey: 'standing-use:after-policy-revocation' },
    )).resolves.toEqual({ kind: 'refused', reason: 'policy_revoked' })
  })

  it('linearizes competing repeat uses without exceeding cumulative authority', async () => {
    for (const limit of [
      { name: 'spend', spendUses: 1, dataUses: 2, occurrences: 2, reason: 'spend_limit_exceeded' },
      { name: 'data', spendUses: 2, dataUses: 1, occurrences: 2, reason: 'data_limit_exceeded' },
      { name: 'occurrence', spendUses: 2, dataUses: 2, occurrences: 1, reason: 'occurrence_limit_exceeded' },
    ] as const) {
      vi.spyOn(Date, 'now').mockReturnValue(1_000)
      const backend = convexTest(schema, modules)
      const current = await committedRequest(backend)
      const route = current.routeGeneration.routes[0]
      if (route === undefined || route.maximumTotalCost.kind !== 'known') {
        throw new Error('exact route fixture missing')
      }
      const dataAllocations = route.steps.reduce((total, step) => total + step.dataUse.length, 0)
      const credentialId = `credential:assistant:competing-${limit.name}`
      await backend.mutation(internal.customerRequestPrincipals.recordAgentPrincipal, {
        principalId: `agent:assistant:competing-${limit.name}`,
        ownerId: identity.subject,
        ownerTokenIdentifier: identity.tokenIdentifier,
        credentialId,
        scopes: ['customer_requests:create', 'customer_requests:standing_authority'],
        seenAt: 900,
      })
      const customer = backend.withIdentity(identity)
      const policy = await customer.mutation(internal.customerRequestStandingRoutePolicy.issue, {
        requestId: current.aggregate.snapshot.requestId,
        expectedRequestRevision: current.aggregate.snapshot.revision,
        expectedGenerationRef: current.routeGeneration.generationRef,
        selectedRoutePlanId: route.routePlanId,
        delegatedCredentialId: credentialId,
        perUseSpend: { ...route.maximumTotalCost.amount },
        cumulativeSpend: scaleExactAmount(route.maximumTotalCost.amount, limit.spendUses),
        perUseDataAllocations: dataAllocations,
        cumulativeDataAllocations: dataAllocations * limit.dataUses,
        occurrences: limit.occurrences,
        validUntil: Math.min(route.expiresAt, 9_000),
        idempotencyKey: `standing-policy:competing-${limit.name}`,
      })
      if (policy.kind !== 'issued') throw new Error(`standing policy issuance failed: ${JSON.stringify(policy)}`)
      const command = {
        requestId: current.aggregate.snapshot.requestId,
        policyRef: policy.policy.policyRef,
        expectedPolicyDigest: policy.policy.policyDigest,
        expectedRequestRevision: current.aggregate.snapshot.revision,
        expectedGenerationRef: current.routeGeneration.generationRef,
        selectedRoutePlanId: route.routePlanId,
        delegatedCredentialId: credentialId,
        mandateExpiresAt: Math.min(route.expiresAt, 9_000),
      }

      const results = await Promise.all([
        customer.mutation(internal.customerRequestStandingRoutePolicy.issueMandate, {
          ...command,
          idempotencyKey: `standing-use:competing-${limit.name}-a`,
        }),
        customer.mutation(internal.customerRequestStandingRoutePolicy.issueMandate, {
          ...command,
          idempotencyKey: `standing-use:competing-${limit.name}-b`,
        }),
      ])

      expect(results.filter(({ kind }: StandingRouteMandateResult) => kind === 'issued'), limit.name).toHaveLength(1)
      expect(results.filter(({ kind }: StandingRouteMandateResult) => kind === 'refused'), limit.name).toEqual([{
        kind: 'refused',
        reason: limit.reason,
      }])
      await backend.run(async (ctx) => {
        expect(await ctx.db.query('customerRequestStandingRouteAuthorityUses').take(10), limit.name).toHaveLength(1)
        expect(await ctx.db.query('customerRequestRouteMandateIssues').take(10), limit.name).toHaveLength(1)
      })
    }
  })

  it('linearizes repeat use against withdrawal without post-withdrawal authority', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const current = await committedRequest(backend)
    const route = current.routeGeneration.routes[0]
    if (route === undefined || route.maximumTotalCost.kind !== 'known') {
      throw new Error('exact route fixture missing')
    }
    const dataAllocations = route.steps.reduce((total, step) => total + step.dataUse.length, 0)
    const credentialId = 'credential:assistant:withdrawal-race'
    await backend.mutation(internal.customerRequestPrincipals.recordAgentPrincipal, {
      principalId: 'agent:assistant:withdrawal-race',
      ownerId: identity.subject,
      ownerTokenIdentifier: identity.tokenIdentifier,
      credentialId,
      scopes: ['customer_requests:create', 'customer_requests:standing_authority'],
      seenAt: 900,
    })
    const customer = backend.withIdentity(identity)
    const policy = await customer.mutation(internal.customerRequestStandingRoutePolicy.issue, {
      requestId: current.aggregate.snapshot.requestId,
      expectedRequestRevision: current.aggregate.snapshot.revision,
      expectedGenerationRef: current.routeGeneration.generationRef,
      selectedRoutePlanId: route.routePlanId,
      delegatedCredentialId: credentialId,
      perUseSpend: { ...route.maximumTotalCost.amount },
      cumulativeSpend: { ...route.maximumTotalCost.amount },
      perUseDataAllocations: dataAllocations,
      cumulativeDataAllocations: dataAllocations,
      occurrences: 1,
      validUntil: Math.min(route.expiresAt, 9_000),
      idempotencyKey: 'standing-policy:withdrawal-race',
    })
    if (policy.kind !== 'issued') throw new Error(`standing policy issuance failed: ${JSON.stringify(policy)}`)

    const [use, withdrawal] = await Promise.all([
      customer.mutation(internal.customerRequestStandingRoutePolicy.issueMandate, {
        requestId: current.aggregate.snapshot.requestId,
        policyRef: policy.policy.policyRef,
        expectedPolicyDigest: policy.policy.policyDigest,
        expectedRequestRevision: current.aggregate.snapshot.revision,
        expectedGenerationRef: current.routeGeneration.generationRef,
        selectedRoutePlanId: route.routePlanId,
        delegatedCredentialId: credentialId,
        mandateExpiresAt: Math.min(route.expiresAt, 9_000),
        idempotencyKey: 'standing-use:withdrawal-race',
      }),
      customer.mutation(internal.customerRequestStandingRoutePolicy.revoke, {
        requestId: current.aggregate.snapshot.requestId,
        policyRef: policy.policy.policyRef,
        expectedPolicyDigest: policy.policy.policyDigest,
        idempotencyKey: 'standing-policy-withdrawal:race',
      }),
    ])

    expect(withdrawal).toMatchObject({ kind: 'revoked', policy: { revokedAt: 1_000 } })
    expect([
      { kind: 'issued' },
      { kind: 'refused', reason: 'policy_revoked' },
    ]).toContainEqual(use.kind === 'issued'
      ? { kind: use.kind }
      : { kind: use.kind, reason: use.reason })
    await expect(customer.query(internal.customerRequestStandingRoutePolicy.get, {
      requestId: current.aggregate.snapshot.requestId,
      policyRef: policy.policy.policyRef,
    })).resolves.toMatchObject({ kind: 'revoked', policy: { revokedAt: 1_000 } })
    await backend.run(async (ctx) => {
      const uses = await ctx.db.query('customerRequestStandingRouteAuthorityUses').take(10)
      const mandates = await ctx.db.query('customerRequestRouteMandateIssues').take(10)
      expect(uses).toHaveLength(use.kind === 'issued' ? 1 : 0)
      expect(mandates).toHaveLength(use.kind === 'issued' ? 1 : 0)
    })
  })

  it('issues and exactly replays one server-derived mandate only for the authenticated Request principal', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const current = await committedRequest(backend)
    const route = current.routeGeneration.routes[0]
    if (route === undefined || route.maximumTotalCost.kind !== 'known') {
      throw new Error('exact route fixture missing')
    }
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const command = {
      requestId: current.aggregate.snapshot.requestId,
      expectedRequestRevision: current.aggregate.snapshot.revision,
      expectedGenerationRef: current.routeGeneration.generationRef,
      selectedRoutePlanId: route.routePlanId,
      maximumTotalSpend: { ...route.maximumTotalCost.amount },
      expiresAt: Math.min(route.expiresAt, 30_000),
      idempotencyKey: 'confirm:route:one',
    }
    const customer = backend.withIdentity(identity)

    const issued = await customer.mutation(internal.customerRequestRouteMandate.issue, command)
    if (issued.kind !== 'issued') throw new Error(`mandate issuance failed: ${JSON.stringify(issued)}`)
    expect(issued).toMatchObject({
      kind: 'issued',
      mandate: {
        format: 'ae.route-mandate:v1',
        principal: { principalId: identity.tokenIdentifier },
        authorization: { kind: 'explicit' },
        request: {
          requestId: current.aggregate.snapshot.requestId,
          requestRevision: current.aggregate.snapshot.revision,
        },
        route: {
          generationRef: current.routeGeneration.generationRef,
          routePlanId: route.routePlanId,
          routeDigest: route.routeDigest,
          maximumTotalSpend: command.maximumTotalSpend,
        },
        issuedAt: 1_000,
        expiresAt: command.expiresAt,
      },
    })
    await expect(customer.mutation(internal.customerRequestRouteMandate.issue, command))
      .resolves.toEqual({ ...issued, kind: 'replayed' })
    await expect(customer.mutation(internal.customerRequestRouteMandate.issue, {
      ...command,
      selectedRoutePlanId: 'route:caller-changed',
    })).resolves.toEqual({ kind: 'conflict', reason: 'command_changed' })
    await expect(customer.query(internal.customerRequestRouteMandate.getCurrent, {
      requestId: command.requestId,
    })).resolves.toEqual({ kind: 'active', mandate: issued.mandate })

    const stranger = backend.withIdentity({
      subject: 'stranger', issuer: identity.issuer,
      tokenIdentifier: `${identity.issuer}|stranger`,
    })
    await expect(stranger.mutation(internal.customerRequestRouteMandate.issue, command))
      .resolves.toEqual({ kind: 'refused', reason: 'request_not_found' })
    await expect(stranger.query(internal.customerRequestRouteMandate.getCurrent, {
      requestId: command.requestId,
    })).resolves.toEqual({ kind: 'not_found' })
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('customerRequestRouteMandateCommands').first()
      if (row === null) throw new Error('mandate command row missing')
      await ctx.db.patch(row._id, {
        result: {
          ...row.result,
          route: { ...row.result.route, routeDigest: 'sha256:' + 'f'.repeat(64) },
        },
      })
    })
    await expect(customer.mutation(internal.customerRequestRouteMandate.issue, command))
      .rejects.toThrow('customer_request_route_mandate_command_integrity_failure')
  })

  it('fails legacy delegated ownership closed until the canonical Clerk token identifier is bound', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const delegatedPrincipalId = 'agent:delegated-route-mandate'
    await expect(backend.mutation(internal.customerRequestPrincipals.recordAgentPrincipal, {
      principalId: delegatedPrincipalId,
      ownerId: identity.subject,
      credentialId: 'credential:delegated-route-mandate',
      scopes: ['customer_requests:create'],
      seenAt: 900,
    })).resolves.toEqual({ kind: 'recorded' })
    const current = await committedRequest(backend, delegatedPrincipalId)
    const route = current.routeGeneration.routes[0]
    if (route === undefined || route.maximumTotalCost.kind !== 'known') {
      throw new Error('exact route fixture missing')
    }
    const customer = backend.withIdentity(identity)
    const command = {
      requestId: current.aggregate.snapshot.requestId,
      expectedRequestRevision: current.aggregate.snapshot.revision,
      expectedGenerationRef: current.routeGeneration.generationRef,
      selectedRoutePlanId: route.routePlanId,
      maximumTotalSpend: { ...route.maximumTotalCost.amount },
      expiresAt: Math.min(route.expiresAt, 30_000),
      idempotencyKey: 'confirm:route:delegated-owner',
    }
    await expect(customer.mutation(internal.customerRequestRouteMandate.issue, command))
      .resolves.toEqual({ kind: 'refused', reason: 'request_not_found' })
    await expect(backend.mutation(internal.customerRequestPrincipals.recordAgentPrincipal, {
      principalId: delegatedPrincipalId,
      ownerId: identity.subject,
      ownerTokenIdentifier: identity.tokenIdentifier,
      credentialId: 'credential:delegated-route-mandate',
      scopes: ['customer_requests:create'],
      seenAt: 950,
    })).resolves.toEqual({ kind: 'recorded' })
    const issued = await customer.mutation(internal.customerRequestRouteMandate.issue, command)
    if (issued.kind !== 'issued') throw new Error(`delegated mandate issuance failed: ${JSON.stringify(issued)}`)
    expect(issued.mandate.principal.principalId).toBe(delegatedPrincipalId)
    await expect(customer.query(internal.customerRequestRouteMandate.getCurrent, {
      requestId: current.aggregate.snapshot.requestId,
    })).resolves.toEqual({ kind: 'active', mandate: issued.mandate })
    await backend.run(async (ctx) => {
      const delegated = await ctx.db.query('customerRequestAgentPrincipals')
        .withIndex('by_principalId', (query) => query.eq('principalId', delegatedPrincipalId)).unique()
      expect(delegated?.ownerTokenIdentifier).toBe(identity.tokenIdentifier)
    })
  })

  it('distinguishes no mandate from an expired exact mandate', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const current = await committedRequest(backend)
    const route = current.routeGeneration.routes[0]
    if (route === undefined || route.maximumTotalCost.kind !== 'known') {
      throw new Error('exact route fixture missing')
    }
    const customer = backend.withIdentity(identity)
    await expect(customer.query(internal.customerRequestRouteMandate.getCurrent, {
      requestId: current.aggregate.snapshot.requestId,
    })).resolves.toEqual({ kind: 'none' })
    const issued = await customer.mutation(internal.customerRequestRouteMandate.issue, {
      requestId: current.aggregate.snapshot.requestId,
      expectedRequestRevision: current.aggregate.snapshot.revision,
      expectedGenerationRef: current.routeGeneration.generationRef,
      selectedRoutePlanId: route.routePlanId,
      maximumTotalSpend: { ...route.maximumTotalCost.amount },
      expiresAt: 1_100,
      idempotencyKey: 'confirm:route:expiry-state',
    })
    if (issued.kind !== 'issued') throw new Error(`mandate issuance failed: ${JSON.stringify(issued)}`)
    vi.spyOn(Date, 'now').mockReturnValue(1_100)
    await expect(customer.query(internal.customerRequestRouteMandate.getCurrent, {
      requestId: current.aggregate.snapshot.requestId,
    })).resolves.toEqual({ kind: 'expired', mandateRef: issued.mandate.mandateRef })
  })

  it('refuses stale heads, altered scope, and caller-supplied authority material', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const current = await committedRequest(backend)
    const route = current.routeGeneration.routes[0]
    if (route === undefined || route.maximumTotalCost.kind !== 'known') {
      throw new Error('exact route fixture missing')
    }
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const command = {
      requestId: current.aggregate.snapshot.requestId,
      expectedRequestRevision: current.aggregate.snapshot.revision,
      expectedGenerationRef: current.routeGeneration.generationRef,
      selectedRoutePlanId: route.routePlanId,
      maximumTotalSpend: { ...route.maximumTotalCost.amount },
      expiresAt: Math.min(route.expiresAt, 30_000),
      idempotencyKey: 'confirm:route:scope',
    }
    const customer = backend.withIdentity(identity)

    await expect(customer.mutation(internal.customerRequestRouteMandate.issue, {
      ...command,
      expectedRequestRevision: command.expectedRequestRevision - 1,
      idempotencyKey: 'confirm:route:stale-request',
    })).resolves.toEqual({ kind: 'conflict', reason: 'request_revision_changed' })
    await expect(customer.mutation(internal.customerRequestRouteMandate.issue, {
      ...command,
      expectedGenerationRef: 'route-generation:stale',
      idempotencyKey: 'confirm:route:stale-generation',
    })).resolves.toEqual({ kind: 'conflict', reason: 'route_generation_changed' })
    await expect(customer.mutation(internal.customerRequestRouteMandate.issue, {
      ...command,
      maximumTotalSpend: {
        ...command.maximumTotalSpend,
        units: (BigInt(command.maximumTotalSpend.units) - 1n).toString(),
      },
      idempotencyKey: 'confirm:route:altered-spend',
    })).resolves.toEqual({ kind: 'refused', reason: 'mandate_scope_invalid' })
    await expect(customer.mutation(internal.customerRequestRouteMandate.issue, {
      ...command,
      principal: { principalId: 'caller:substitution' },
      authorization: { kind: 'explicit', authorizationEvidenceRef: 'caller:evidence' },
      idempotencyKey: 'confirm:route:caller-authority',
    } as never)).rejects.toThrow()
  })

  it('refuses issuance when the registered capability graph no longer supports the stored route', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const current = await committedRequest(backend)
    const route = current.routeGeneration.routes[0]
    const step = route?.steps[0]
    if (route === undefined || step === undefined || route.maximumTotalCost.kind !== 'known') {
      throw new Error('exact route fixture missing')
    }
    const routeCost = route.maximumTotalCost
    await backend.run(async (ctx) => {
      const offering = await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', step.offeringId)).unique()
      if (offering === null) throw new Error('selected offering missing')
      await ctx.db.patch(offering._id, {
        presentation: {
          ...offering.presentation,
          price: { kind: 'fixed', amount: offsetExactAmount(routeCost.amount, 1n) },
        },
      })
    })
    vi.spyOn(Date, 'now').mockReturnValue(1_000)

    await expect(backend.withIdentity(identity).mutation(internal.customerRequestRouteMandate.issue, {
      requestId: current.aggregate.snapshot.requestId,
      expectedRequestRevision: current.aggregate.snapshot.revision,
      expectedGenerationRef: current.routeGeneration.generationRef,
      selectedRoutePlanId: route.routePlanId,
      maximumTotalSpend: { ...routeCost.amount },
      expiresAt: Math.min(route.expiresAt, 30_000),
      idempotencyKey: 'confirm:route:graph-drift',
    })).resolves.toEqual({ kind: 'conflict', reason: 'route_generation_changed' })
  })

  it('immutably supersedes stale authority and permits a new mandate for the new exact route head', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const first = await committedRequest(backend)
    const firstRoute = first.routeGeneration.routes[0]
    if (firstRoute === undefined || firstRoute.maximumTotalCost.kind !== 'known') {
      throw new Error('first route fixture missing')
    }
    const customer = backend.withIdentity(identity)
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const firstIssue = await customer.mutation(internal.customerRequestRouteMandate.issue, {
      requestId: first.aggregate.snapshot.requestId,
      expectedRequestRevision: first.aggregate.snapshot.revision,
      expectedGenerationRef: first.routeGeneration.generationRef,
      selectedRoutePlanId: firstRoute.routePlanId,
      maximumTotalSpend: { ...firstRoute.maximumTotalCost.amount },
      expiresAt: Math.min(firstRoute.expiresAt, 30_000),
      idempotencyKey: 'confirm:route:first-generation',
    })
    if (firstIssue.kind !== 'issued') throw new Error(`first mandate failed: ${JSON.stringify(firstIssue)}`)

    vi.spyOn(Date, 'now').mockReturnValue(2_000)
    const revised = await compileFixture(backend, {
      expectedRevision: first.aggregate.snapshot.revision,
      expectedRouteGeneration: first.routeGeneration.generation,
      intent: 'Find a governed result with a materially revised request',
      now: 2_000,
    })
    const committed = await backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:route-mandate-revision',
      commandDigest: 'sha256:' + '2'.repeat(64),
      expectedRevision: first.aggregate.snapshot.revision,
      expectedRouteGeneration: first.routeGeneration.generation,
      aggregate: revised.aggregate,
      routeGeneration: revised.routeGeneration,
    })
    expect(committed).toEqual({
      kind: 'stored',
      requestId: first.aggregate.snapshot.requestId,
      revision: first.aggregate.snapshot.revision + 1,
    })
    await expect(customer.query(internal.customerRequestRouteMandate.getCurrent, {
      requestId: first.aggregate.snapshot.requestId,
    })).resolves.toMatchObject({
      kind: 'superseded',
      mandateRef: firstIssue.mandate.mandateRef,
    })

    const nextRoute = revised.routeGeneration.routes[0]
    if (nextRoute === undefined || nextRoute.maximumTotalCost.kind !== 'known') {
      throw new Error('revised route fixture missing')
    }
    const nextIssue = await customer.mutation(internal.customerRequestRouteMandate.issue, {
      requestId: revised.aggregate.snapshot.requestId,
      expectedRequestRevision: revised.aggregate.snapshot.revision,
      expectedGenerationRef: revised.routeGeneration.generationRef,
      selectedRoutePlanId: nextRoute.routePlanId,
      maximumTotalSpend: { ...nextRoute.maximumTotalCost.amount },
      expiresAt: Math.min(nextRoute.expiresAt, 40_000),
      idempotencyKey: 'confirm:route:next-generation',
    })
    expect(nextIssue).toMatchObject({
      kind: 'issued',
      mandate: {
        request: { requestRevision: revised.aggregate.snapshot.revision },
        route: { generationRef: revised.routeGeneration.generationRef },
      },
    })
    if (nextIssue.kind !== 'issued') throw new Error(`next mandate failed: ${JSON.stringify(nextIssue)}`)
    await expect(customer.query(internal.customerRequestRouteMandate.getHistory, {
      requestId: revised.aggregate.snapshot.requestId,
    })).resolves.toMatchObject({
      kind: 'found',
      issues: [{ mandate: firstIssue.mandate }, { mandate: nextIssue.mandate }],
      revocations: [{
        mandateRef: firstIssue.mandate.mandateRef,
        reason: 'request_revised',
        supersededByRequestRevision: revised.aggregate.snapshot.revision,
        supersededByGenerationRef: revised.routeGeneration.generationRef,
        recordedAt: 2_000,
      }],
    })
  })

  it('revokes by authenticated exact command without mutating the issued mandate', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const current = await committedRequest(backend)
    const route = current.routeGeneration.routes[0]
    if (route === undefined || route.maximumTotalCost.kind !== 'known') {
      throw new Error('exact route fixture missing')
    }
    const customer = backend.withIdentity(identity)
    const issueCommand = {
      requestId: current.aggregate.snapshot.requestId,
      expectedRequestRevision: current.aggregate.snapshot.revision,
      expectedGenerationRef: current.routeGeneration.generationRef,
      selectedRoutePlanId: route.routePlanId,
      maximumTotalSpend: { ...route.maximumTotalCost.amount },
      expiresAt: Math.min(route.expiresAt, 30_000),
      idempotencyKey: 'confirm:route:revoke-proof',
    }
    const issued = await customer.mutation(internal.customerRequestRouteMandate.issue, issueCommand)
    if (issued.kind !== 'issued') throw new Error(`mandate issuance failed: ${JSON.stringify(issued)}`)
    const command = {
      requestId: current.aggregate.snapshot.requestId,
      mandateRef: issued.mandate.mandateRef,
      idempotencyKey: 'revoke:route:exact',
    }
    const revoked = await customer.mutation(internal.customerRequestRouteMandate.revoke, command)
    expect(revoked).toMatchObject({
      kind: 'revoked',
      revocation: {
        mandateRef: issued.mandate.mandateRef,
        mandateDigest: issued.mandate.mandateDigest,
        reason: 'customer_revoked',
        requestRevision: current.aggregate.snapshot.revision,
        generationRef: current.routeGeneration.generationRef,
      },
    })
    await expect(customer.mutation(internal.customerRequestRouteMandate.revoke, command))
      .resolves.toEqual({ ...revoked, kind: 'replayed' })
    await expect(customer.mutation(internal.customerRequestRouteMandate.revoke, {
      ...command,
      mandateRef: 'route-mandate:v1:caller-changed',
    })).resolves.toEqual({ kind: 'conflict', reason: 'command_changed' })
    await expect(customer.query(internal.customerRequestRouteMandate.getCurrent, {
      requestId: command.requestId,
    })).resolves.toMatchObject({
      kind: 'revoked', mandateRef: issued.mandate.mandateRef,
    })
    await expect(customer.query(internal.customerRequestRouteMandate.getHistory, {
      requestId: command.requestId,
    })).resolves.toMatchObject({
      kind: 'found',
      issues: [{
        mandate: issued.mandate,
        evidence: {
          authentication: { tokenIdentifier: identity.tokenIdentifier },
          authorization: {
            kind: 'explicit',
            principalId: identity.tokenIdentifier,
            requestId: command.requestId,
            generationRef: current.routeGeneration.generationRef,
            selectedRoutePlanId: route.routePlanId,
          },
        },
      }],
      revocations: [revoked.kind === 'revoked' ? revoked.revocation : {}],
    })
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('customerRequestRouteMandateRevocations')
        .withIndex('by_mandateRef', (query) => query.eq('mandateRef', issued.mandate.mandateRef)).unique()
      if (row === null) throw new Error('mandate revocation row missing')
      await ctx.db.patch(row._id, { reason: 'request_revised' })
    })
    await expect(customer.query(internal.customerRequestRouteMandate.getCurrent, {
      requestId: command.requestId,
    })).rejects.toThrow('customer_request_route_mandate_revocation_integrity_failure')
    await expect(customer.mutation(internal.customerRequestRouteMandate.issue, {
      ...issueCommand,
      idempotencyKey: 'confirm:route:tampered-revocation',
    })).rejects.toThrow('customer_request_route_mandate_replacement_integrity_failure')
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('customerRequestRouteMandateRevocations')
        .withIndex('by_mandateRef', (query) => query.eq('mandateRef', issued.mandate.mandateRef)).unique()
      if (row === null) throw new Error('mandate revocation row missing')
      await ctx.db.patch(row._id, { reason: 'customer_revoked' })
    })
    const replacement = await customer.mutation(internal.customerRequestRouteMandate.issue, {
      ...issueCommand,
      idempotencyKey: 'confirm:route:after-revocation',
    })
    if (replacement.kind !== 'issued') {
      throw new Error(`replacement mandate failed: ${JSON.stringify(replacement)}`)
    }
    expect(replacement.mandate.mandateRef).not.toBe(issued.mandate.mandateRef)
    expect(replacement.mandate.issuedAt).toBe(issued.mandate.issuedAt)
    await expect(customer.query(internal.customerRequestRouteMandate.getCurrent, {
      requestId: command.requestId,
    })).resolves.toEqual({ kind: 'active', mandate: replacement.mandate })

    const stranger = backend.withIdentity({
      subject: 'stranger', issuer: identity.issuer,
      tokenIdentifier: `${identity.issuer}|stranger`,
    })
    await expect(stranger.mutation(internal.customerRequestRouteMandate.revoke, {
      ...command,
      idempotencyKey: 'revoke:route:stranger',
    })).resolves.toEqual({ kind: 'refused', reason: 'request_not_found' })
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('customerRequestRouteMandateRevocations')
        .withIndex('by_mandateRef', (query) => query.eq('mandateRef', issued.mandate.mandateRef)).unique()
      if (row === null) throw new Error('mandate revocation row missing')
      await ctx.db.patch(row._id, { reason: 'request_revised' })
    })
    await expect(customer.mutation(internal.customerRequestRouteMandate.revoke, command))
      .rejects.toThrow('customer_request_route_mandate_revocation_command_integrity_failure')
    await expect(customer.query(internal.customerRequestRouteMandate.getHistory, {
      requestId: command.requestId,
    })).rejects.toThrow('customer_request_route_mandate_history_integrity_failure')
  })

  it('serializes concurrent confirmation so only one mandate owns the current head', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const current = await committedRequest(backend)
    const route = current.routeGeneration.routes[0]
    if (route === undefined || route.maximumTotalCost.kind !== 'known') {
      throw new Error('exact route fixture missing')
    }
    const base = {
      requestId: current.aggregate.snapshot.requestId,
      expectedRequestRevision: current.aggregate.snapshot.revision,
      expectedGenerationRef: current.routeGeneration.generationRef,
      selectedRoutePlanId: route.routePlanId,
      maximumTotalSpend: { ...route.maximumTotalCost.amount },
      expiresAt: Math.min(route.expiresAt, 30_000),
    }
    const customer = backend.withIdentity(identity)
    const results = await Promise.all([
      customer.mutation(internal.customerRequestRouteMandate.issue, {
        ...base, idempotencyKey: 'confirm:concurrent:one',
      }),
      customer.mutation(internal.customerRequestRouteMandate.issue, {
        ...base, idempotencyKey: 'confirm:concurrent:two',
      }),
    ])
    expect(results.map(({ kind }: RouteMandateIssueResult) => kind).sort()).toEqual(['conflict', 'issued'])
    expect(results.find(({ kind }: RouteMandateIssueResult) => kind === 'conflict')).toEqual({
      kind: 'conflict', reason: 'active_mandate_exists',
    })
    const winner = results.find((result: RouteMandateIssueResult) => result.kind === 'issued')
    if (winner?.kind !== 'issued') throw new Error('concurrent mandate winner missing')
    await expect(customer.query(internal.customerRequestRouteMandate.getCurrent, {
      requestId: base.requestId,
    })).resolves.toEqual({ kind: 'active', mandate: winner.mandate })
  })

  it('stops treating an issued mandate as active after registered graph drift', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const current = await committedRequest(backend)
    const route = current.routeGeneration.routes[0]
    const step = route?.steps[0]
    if (route === undefined || step === undefined || route.maximumTotalCost.kind !== 'known') {
      throw new Error('exact route fixture missing')
    }
    const routeCost = route.maximumTotalCost
    const customer = backend.withIdentity(identity)
    const issued = await customer.mutation(internal.customerRequestRouteMandate.issue, {
      requestId: current.aggregate.snapshot.requestId,
      expectedRequestRevision: current.aggregate.snapshot.revision,
      expectedGenerationRef: current.routeGeneration.generationRef,
      selectedRoutePlanId: route.routePlanId,
      maximumTotalSpend: { ...routeCost.amount },
      expiresAt: Math.min(route.expiresAt, 30_000),
      idempotencyKey: 'confirm:route:before-graph-drift',
    })
    if (issued.kind !== 'issued') throw new Error(`mandate issuance failed: ${JSON.stringify(issued)}`)
    await backend.run(async (ctx) => {
      const offering = await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', step.offeringId)).unique()
      if (offering === null) throw new Error('selected offering missing')
      await ctx.db.patch(offering._id, {
        presentation: {
          ...offering.presentation,
          price: { kind: 'fixed', amount: offsetExactAmount(routeCost.amount, 1n) },
        },
      })
    })
    await expect(customer.query(internal.customerRequestRouteMandate.getCurrent, {
      requestId: current.aggregate.snapshot.requestId,
    })).resolves.toEqual({
      kind: 'superseded', mandateRef: issued.mandate.mandateRef,
    })
  })

  it('fails closed when durable authentication evidence no longer matches the issued mandate', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const current = await committedRequest(backend)
    const route = current.routeGeneration.routes[0]
    if (route === undefined || route.maximumTotalCost.kind !== 'known') {
      throw new Error('exact route fixture missing')
    }
    const command = {
      requestId: current.aggregate.snapshot.requestId,
      expectedRequestRevision: current.aggregate.snapshot.revision,
      expectedGenerationRef: current.routeGeneration.generationRef,
      selectedRoutePlanId: route.routePlanId,
      maximumTotalSpend: { ...route.maximumTotalCost.amount },
      expiresAt: Math.min(route.expiresAt, 30_000),
      idempotencyKey: 'confirm:route:evidence-integrity',
    }
    const customer = backend.withIdentity(identity)
    const issued = await customer.mutation(internal.customerRequestRouteMandate.issue, command)
    if (issued.kind !== 'issued') throw new Error(`mandate issuance failed: ${JSON.stringify(issued)}`)
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('customerRequestRouteMandateIssues')
        .withIndex('by_mandateRef', (query) => query.eq('mandateRef', issued.mandate.mandateRef)).unique()
      if (row === null) throw new Error('mandate issue row missing')
      await ctx.db.patch(row._id, {
        evidence: {
          ...row.evidence,
          authentication: { ...row.evidence.authentication, subject: 'tampered-subject' },
        },
      })
    })
    await expect(customer.query(internal.customerRequestRouteMandate.getCurrent, {
      requestId: command.requestId,
    })).rejects.toThrow('customer_request_route_mandate_head_integrity_failure')
    await expect(customer.mutation(internal.customerRequestRouteMandate.issue, command))
      .rejects.toThrow('customer_request_route_mandate_command_integrity_failure')
    vi.spyOn(Date, 'now').mockReturnValue(2_000)
    const revised = await compileFixture(backend, {
      expectedRevision: current.aggregate.snapshot.revision,
      expectedRouteGeneration: current.routeGeneration.generation,
      intent: 'Find a different governed result',
      now: 2_000,
    })
    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:route-mandate-tampered-supersession',
      commandDigest: 'sha256:' + 'e'.repeat(64),
      expectedRevision: current.aggregate.snapshot.revision,
      expectedRouteGeneration: current.routeGeneration.generation,
      aggregate: revised.aggregate,
      routeGeneration: revised.routeGeneration,
    })).rejects.toThrow('customer_request_route_mandate_head_integrity_failure')
  })

  it('atomically admits one exact current route step and replays without reserving twice', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const current = await committedRequest(backend)
    const route = current.routeGeneration.routes[0]
    const step = route?.steps[0]
    if (route === undefined || step === undefined || route.maximumTotalCost.kind !== 'known') {
      throw new Error('exact route step fixture missing')
    }
    const customer = backend.withIdentity(identity)
    const issued = await customer.mutation(internal.customerRequestRouteMandate.issue, {
      requestId: current.aggregate.snapshot.requestId,
      expectedRequestRevision: current.aggregate.snapshot.revision,
      expectedGenerationRef: current.routeGeneration.generationRef,
      selectedRoutePlanId: route.routePlanId,
      maximumTotalSpend: { ...route.maximumTotalCost.amount },
      expiresAt: Math.min(route.expiresAt, 30_000),
      idempotencyKey: 'confirm:route:admission',
    })
    if (issued.kind !== 'issued') throw new Error(`mandate issuance failed: ${JSON.stringify(issued)}`)
    const mandateStep = issued.mandate.route.steps[0]
    if (mandateStep === undefined) throw new Error('issued route step missing')
    vi.spyOn(Date, 'now').mockReturnValue(1_100)
    const command = {
      requestId: current.aggregate.snapshot.requestId,
      mandateRef: issued.mandate.mandateRef,
      expectedMandateDigest: issued.mandate.mandateDigest,
      expectedGenerationRef: current.routeGeneration.generationRef,
      expectedRoutePlanId: route.routePlanId,
      expectedRouteDigest: route.routeDigest,
      stepPosition: mandateStep.position,
      expectedActionId: mandateStep.actionId,
      expectedCapabilityId: mandateStep.contractRef.capabilityId,
      expectedCapabilityVersion: mandateStep.contractRef.version,
      expectedCapabilityContractDigest: mandateStep.contractRef.contractDigest,
      idempotencyKey: 'admit:route-step:one',
    }

    const admitted = await customer.mutation(
      internal.customerRequestRouteMandateAdmission.admitStep,
      command,
    )
    expect(admitted).toMatchObject({
      kind: 'admitted',
      grant: {
        format: 'ae.route-step-grant:v1',
        mandateRef: issued.mandate.mandateRef,
        mandateDigest: issued.mandate.mandateDigest,
        request: {
          requestId: current.aggregate.snapshot.requestId,
          requestRevision: current.aggregate.snapshot.revision,
        },
        route: {
          generationRef: current.routeGeneration.generationRef,
          routePlanId: route.routePlanId,
          routeDigest: route.routeDigest,
        },
        step: {
          position: mandateStep.position,
          actionId: mandateStep.actionId,
          businessId: mandateStep.businessId,
          offeringId: mandateStep.offeringId,
          bindingId: mandateStep.bindingId,
          contractRef: mandateStep.contractRef,
          maximumSpend: { ...route.maximumTotalCost.amount },
          dataScope: [{
            effectId: 'query_release',
            inputPointer: '/base',
            classification: 'public',
            phase: 'execution',
            purposes: ['retrieve_ecb_reference_rate'],
          }, {
            effectId: 'query_release',
            inputPointer: '/quote',
            classification: 'public',
            phase: 'execution',
            purposes: ['retrieve_ecb_reference_rate'],
          }],
        },
        fallbackUse: { kind: 'primary_route' },
        admission: {
          reservationRef: expect.stringMatching(/^route-step-reservation:v1:sha256:/),
          reservationDigest: expect.stringMatching(/^sha256:/),
        },
        admittedAt: 1_100,
        expiresAt: issued.mandate.expiresAt,
      },
    })
    await expect(customer.mutation(
      internal.customerRequestRouteMandateAdmission.admitStep,
      command,
    )).resolves.toEqual({ ...admitted, kind: 'replayed' })
    await backend.run(async (ctx) => {
      const reservations = await ctx.db.query('customerRequestRouteStepReservations').collect()
      expect(reservations).toHaveLength(1)
      expect(admitted.kind === 'admitted' ? admitted.grant.admission : null).toEqual({
        reservationRef: reservations[0]?.reservationRef,
        reservationDigest: reservations[0]?.reservationDigest,
      })
      expect(await ctx.db.query('customerRequestRouteDataReservations').collect()).toHaveLength(2)
      expect(await ctx.db.query('customerRequestRouteStepAdmissionCommands').collect()).toHaveLength(1)
    })
  })

  it('fails replay closed when a reserved recipient-purpose disclosure is altered', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const fixture = await issuedAdmissionFixture(backend, 'data-integrity')
    vi.spyOn(Date, 'now').mockReturnValue(1_100)
    const command = admissionCommand(fixture, 'admit:route-step:data-integrity')
    const admitted = await fixture.customer.mutation(
      internal.customerRequestRouteMandateAdmission.admitStep,
      command,
    )
    if (admitted.kind !== 'admitted') throw new Error(`step admission failed: ${JSON.stringify(admitted)}`)
    await backend.run(async (ctx) => {
      const allocation = await ctx.db.query('customerRequestRouteDataReservations').first()
      if (allocation === null) throw new Error('route data reservation missing')
      const widened = {
        reservationRef: allocation.reservationRef,
        mandateRef: allocation.mandateRef,
        actionId: allocation.actionId,
        effectId: allocation.effectId,
        inputPointer: allocation.inputPointer,
        classification: allocation.classification,
        phase: allocation.phase,
        recipient: allocation.recipient,
        purpose: 'attacker-widened-purpose',
        recordedAt: allocation.recordedAt,
      }
      const allocationDigest = canonicalDigest(widened)
      await ctx.db.patch(allocation._id, {
        ...widened,
        allocationDigest,
        allocationRef: `route-data-reservation:v1:${allocationDigest}`,
      })
    })

    await expect(fixture.customer.mutation(
      internal.customerRequestRouteMandateAdmission.admitStep,
      command,
    )).rejects.toThrow('customer_request_route_data_reservation_integrity_failure')
  })

  it('refuses an empty operation identity before reserving authority', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const fixture = await issuedAdmissionFixture(backend, 'empty-operation')
    vi.spyOn(Date, 'now').mockReturnValue(1_100)

    await expect(fixture.customer.mutation(
      internal.customerRequestRouteMandateAdmission.admitStep,
      admissionCommand(fixture, '   '),
    )).resolves.toEqual({ kind: 'refused', reason: 'mandate_scope_mismatch' })
    await backend.run(async (ctx) => {
      expect(await ctx.db.query('customerRequestRouteStepReservations').first()).toBeNull()
      expect(await ctx.db.query('customerRequestRouteDataReservations').first()).toBeNull()
      expect(await ctx.db.query('customerRequestRouteStepAdmissionCommands').first()).toBeNull()
    })
  })

  it('refuses unauthenticated and different-principal step release without durable writes', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const fixture = await issuedAdmissionFixture(backend, 'admission-authorization')
    const command = admissionCommand(fixture, 'admit:route-step:admission-authorization')
    vi.spyOn(Date, 'now').mockReturnValue(1_100)

    await expect(backend.mutation(
      internal.customerRequestRouteMandateAdmission.admitStep,
      command,
    )).resolves.toEqual({ kind: 'refused', reason: 'mandate_not_current' })
    await expect(backend.withIdentity({
      subject: 'user_route_stranger',
      issuer: 'https://identity.example',
      tokenIdentifier: 'token_route_stranger',
    }).mutation(
      internal.customerRequestRouteMandateAdmission.admitStep,
      command,
    )).resolves.toEqual({ kind: 'refused', reason: 'mandate_not_current' })
    await backend.run(async (ctx) => {
      expect(await ctx.db.query('customerRequestRouteStepReservations').first()).toBeNull()
      expect(await ctx.db.query('customerRequestRouteDataReservations').first()).toBeNull()
      expect(await ctx.db.query('customerRequestRouteStepAdmissionCommands').first()).toBeNull()
    })
  })

  it('refuses release when the exact selected publication loses readiness', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const fixture = await issuedAdmissionFixture(backend, 'selected-supply-readiness')
    const step = fixture.issued.mandate.route.steps[0]
    if (step === undefined) throw new Error('issued route step missing')
    await backend.run(async (ctx) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', step.publicationRef).eq('revision', step.publicationRevision)
        )).unique()
      if (publication === null) throw new Error('selected capability publication missing')
      await ctx.db.patch(publication._id, { healthState: 'unhealthy', updatedAt: 1_050 })
    })
    vi.spyOn(Date, 'now').mockReturnValue(1_100)

    await expect(fixture.customer.mutation(
      internal.customerRequestRouteMandateAdmission.admitStep,
      admissionCommand(fixture, 'admit:route-step:selected-supply-readiness'),
    )).resolves.toEqual({ kind: 'refused', reason: 'mandate_scope_mismatch' })
    await backend.run(async (ctx) => {
      expect(await ctx.db.query('customerRequestRouteStepReservations').first()).toBeNull()
      expect(await ctx.db.query('customerRequestRouteDataReservations').first()).toBeNull()
      expect(await ctx.db.query('customerRequestRouteStepAdmissionCommands').first()).toBeNull()
    })
  })

  it('refuses an identical replay when the selected publication loses readiness', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const fixture = await issuedAdmissionFixture(backend, 'replay-supply-readiness')
    const command = admissionCommand(fixture, 'admit:route-step:replay-supply-readiness')
    vi.spyOn(Date, 'now').mockReturnValue(1_100)
    await expect(fixture.customer.mutation(
      internal.customerRequestRouteMandateAdmission.admitStep,
      command,
    )).resolves.toMatchObject({ kind: 'admitted' })
    const step = fixture.issued.mandate.route.steps[0]
    if (step === undefined) throw new Error('issued route step missing')
    await backend.run(async (ctx) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', step.publicationRef).eq('revision', step.publicationRevision)
        )).unique()
      if (publication === null) throw new Error('selected capability publication missing')
      await ctx.db.patch(publication._id, { healthState: 'unhealthy', updatedAt: 1_150 })
    })
    vi.spyOn(Date, 'now').mockReturnValue(1_200)

    await expect(fixture.customer.mutation(
      internal.customerRequestRouteMandateAdmission.admitStep,
      command,
    )).resolves.toEqual({ kind: 'refused', reason: 'mandate_scope_mismatch' })
    await backend.run(async (ctx) => {
      expect(await ctx.db.query('customerRequestRouteStepReservations').collect()).toHaveLength(1)
      expect(await ctx.db.query('customerRequestRouteDataReservations').collect()).toHaveLength(2)
      expect(await ctx.db.query('customerRequestRouteStepAdmissionCommands').collect()).toHaveLength(1)
    })
  })

  it('refuses route, fallback, step and capability substitutions without reserving anything', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const fixture = await issuedAdmissionFixture(backend, 'substitution')
    const base = admissionCommand(fixture, 'admit:route-step:substitution')
    const fallback = fixture.issued.mandate.route.fallback.alternatives[0]
    if (fallback === undefined) throw new Error('fallback fixture missing')
    vi.spyOn(Date, 'now').mockReturnValue(1_100)

    for (const changed of [
      { ...base, expectedGenerationRef: 'route-generation:substituted' },
      { ...base, expectedRoutePlanId: fallback.routePlanId, expectedRouteDigest: fallback.routeDigest },
      { ...base, stepPosition: base.stepPosition + 1 },
      { ...base, expectedActionId: 'action:substituted' },
      { ...base, expectedCapabilityId: 'capability.substituted' },
      { ...base, expectedCapabilityVersion: base.expectedCapabilityVersion + 1 },
      { ...base, expectedCapabilityContractDigest: 'sha256:' + 'f'.repeat(64) },
    ]) {
      await expect(fixture.customer.mutation(
        internal.customerRequestRouteMandateAdmission.admitStep,
        changed,
      )).resolves.toEqual({ kind: 'refused', reason: 'mandate_scope_mismatch' })
    }
    await backend.run(async (ctx) => {
      expect(await ctx.db.query('customerRequestRouteStepReservations').first()).toBeNull()
      expect(await ctx.db.query('customerRequestRouteDataReservations').first()).toBeNull()
      expect(await ctx.db.query('customerRequestRouteStepAdmissionCommands').first()).toBeNull()
    })
  })

  it('serializes competing step commands to one reservation', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const fixture = await issuedAdmissionFixture(backend, 'concurrency')
    vi.spyOn(Date, 'now').mockReturnValue(1_100)

    const results = await Promise.all([
      fixture.customer.mutation(
        internal.customerRequestRouteMandateAdmission.admitStep,
        admissionCommand(fixture, 'admit:route-step:concurrent-one'),
      ),
      fixture.customer.mutation(
        internal.customerRequestRouteMandateAdmission.admitStep,
        admissionCommand(fixture, 'admit:route-step:concurrent-two'),
      ),
    ])
    expect(results.find((entry: RouteMandateAdmissionResult) => entry.kind === 'refused')).toEqual({
      kind: 'refused', reason: 'step_already_reserved',
    })
    await backend.run(async (ctx) => {
      expect(await ctx.db.query('customerRequestRouteStepReservations').collect()).toHaveLength(1)
      expect(await ctx.db.query('customerRequestRouteDataReservations').collect()).toHaveLength(2)
      expect(await ctx.db.query('customerRequestRouteStepAdmissionCommands').collect()).toHaveLength(1)
    })
  })

  it('rolls back step and command reservations when a late disclosure allocation cannot commit', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const fixture = await issuedAdmissionFixture(backend, 'atomic-rollback')
    const command = admissionCommand(fixture, 'admit:route-step:atomic-rollback')
    const operationKeyDigest = canonicalDigest({
      principalId: fixture.issued.mandate.principal.principalId,
      requestId: command.requestId,
      mandateRef: command.mandateRef,
      idempotencyKey: command.idempotencyKey,
    })
    // Convex serialization erases branded types (e.g. PointedSchemaIdentity); the runtime shape is exact.
    const issuedMandate = fixture.issued.mandate
    if (!isRouteMandate(issuedMandate)) throw new Error('issued mandate shape invalid')
    const derived = deriveRouteStepAuthority({
      mandate: issuedMandate,
      expectedMandateDigest: command.expectedMandateDigest,
      expectedGenerationRef: command.expectedGenerationRef,
      expectedRoutePlanId: command.expectedRoutePlanId,
      expectedRouteDigest: command.expectedRouteDigest,
      stepPosition: command.stepPosition,
      expectedActionId: command.expectedActionId,
      expectedCapabilityId: command.expectedCapabilityId,
      expectedCapabilityVersion: command.expectedCapabilityVersion,
      expectedCapabilityContractDigest: command.expectedCapabilityContractDigest,
      operationKeyDigest,
      now: 1_100,
    })
    if (derived.kind !== 'derived') throw new Error(`grant derivation failed: ${derived.reason}`)
    const authority = derived.authority
    const reservationMaterial = {
      mandateRef: authority.mandateRef,
      mandateDigest: authority.mandateDigest,
      requestId: authority.request.requestId,
      routePlanId: authority.route.routePlanId,
      routeDigest: authority.route.routeDigest,
      generationRef: authority.route.generationRef,
      actionId: authority.step.actionId,
      position: authority.step.position,
      operationKeyDigest: authority.operationKeyDigest,
      reservedSpend: authority.step.maximumSpend,
      authorityDigest: authority.authorityDigest,
      recordedAt: authority.admittedAt,
    }
    const reservationDigest = canonicalDigest(reservationMaterial)
    const reservationRef = `route-step-reservation:v1:${reservationDigest}`
    const scope = authority.step.dataScope[0]
    const purpose = scope?.purposes[0]
    if (scope === undefined || purpose === undefined) throw new Error('disclosure fixture missing')
    const allocation = {
      reservationRef,
      mandateRef: authority.mandateRef,
      actionId: authority.step.actionId,
      effectId: scope.effectId,
      inputPointer: scope.inputPointer,
      classification: scope.classification,
      phase: scope.phase,
      recipient: scope.recipient,
      purpose,
      recordedAt: authority.admittedAt,
    }
    const allocationDigest = canonicalDigest(allocation)
    await backend.run(async (ctx) => {
      await ctx.db.insert('customerRequestRouteDataReservations', {
        allocationRef: `route-data-reservation:v1:${allocationDigest}`,
        allocationDigest,
        ...allocation,
        recipient: { ...allocation.recipient },
      })
    })
    vi.spyOn(Date, 'now').mockReturnValue(1_100)

    await expect(fixture.customer.mutation(
      internal.customerRequestRouteMandateAdmission.admitStep,
      command,
    )).rejects.toThrow('customer_request_route_data_reservation_ref_collision')
    await backend.run(async (ctx) => {
      expect(await ctx.db.query('customerRequestRouteStepReservations').first()).toBeNull()
      expect(await ctx.db.query('customerRequestRouteStepAdmissionCommands').first()).toBeNull()
      expect(await ctx.db.query('customerRequestRouteDataReservations').collect()).toHaveLength(1)
    })
  })
})

function isRouteMandate(value: unknown): value is RouteMandate {
  if (!isRecord(value)
    || value.format !== 'ae.route-mandate:v1'
    || !hasStringFields(value, ['mandateRef', 'mandateDigest'])
    || !isMandatePrincipal(value.principal)
    || !isMandateAuthorization(value.authorization)
    || !isRecord(value.request)
    || !hasStringFields(value.request, ['requestId'])
    || !isFiniteNumber(value.request.requestRevision)
    || !isRouteMandateRoute(value.route)
    || !isFiniteNumber(value.issuedAt)
    || !isFiniteNumber(value.expiresAt)) {
    return false
  }
  return true
}

function isMandatePrincipal(value: unknown): value is RouteMandate['principal'] {
  return isRecord(value)
    && hasStringFields(value, ['principalId', 'authenticationEvidenceRef'])
}

function isMandateAuthorization(value: unknown): value is RouteMandate['authorization'] {
  if (!isRecord(value)) return false
  if (value.kind === 'explicit') {
    return hasStringFields(value, [
      'authorizationEvidenceRef',
      'authorizationEvidenceDigest',
      'authorityScopeDigest',
    ])
  }
  if (value.kind === 'standing_low_risk') {
    return hasStringFields(value, [
      'standingPolicyRef',
      'standingPolicyDigest',
      'authorityUseRef',
      'authorityScopeDigest',
    ])
  }
  return false
}

function isRouteMandateRoute(value: unknown): value is RouteMandate['route'] {
  if (!isRecord(value)
    || !hasStringFields(value, [
      'generationRef',
      'generationDigest',
      'registrySnapshotDigest',
      'routePlanId',
      'routeDigest',
      'stepGraphDigest',
      'dataScopeDigest',
      'effectScopeDigest',
      'evidenceScopeDigest',
    ])
    || !isFiniteNumber(value.generation)
    || !isFiniteNumber(value.routeExpiresAt)
    || !Array.isArray(value.steps)
    || !value.steps.every((step) => isRouteMandateStep(step))
    || !exactAmountSchema.safeParse(value.maximumTotalSpend).success
    || !isRecord(value.fallback)) {
    return false
  }
  return value.fallback.kind === 'new_mandate_required'
    && Array.isArray(value.fallback.alternatives)
    && value.fallback.alternatives.every((alternative) => (
      isRecord(alternative)
      && hasStringFields(alternative, ['routePlanId', 'routeDigest'])
    ))
}

function isRouteMandateStep(value: unknown): value is RouteMandate['route']['steps'][number] {
  if (!isRecord(value)
    || !hasStringFields(value, [
      'actionId',
      'candidateRef',
      'businessId',
      'offeringId',
      'bindingId',
      'offeringRegistrationHash',
      'bindingRegistrationHash',
      'publicationRef',
      'inputScopeDigest',
    ])
    || !isFiniteNumber(value.position)
    || !isFiniteNumber(value.publicationRevision)
    || !isCapabilityContractRef(value.contractRef)
    || !isRegisteredPrice(value.price)
    || !Array.isArray(value.dataScope)
    || !value.dataScope.every((scope) => isRouteMandateDataScope(scope))
    || !Array.isArray(value.effects)
    || !value.effects.every((effect) => isRouteMandateEffect(effect))
    || !Array.isArray(value.evidence)
    || !value.evidence.every((evidence) => isRouteMandateEvidence(evidence))
    || !isRouteMandateCancellation(value.cancellation)
    || !isRouteMandateRecovery(value.recovery)) {
    return false
  }
  return true
}

function isCapabilityContractRef(value: unknown): boolean {
  return isRecord(value)
    && hasStringFields(value, ['capabilityId', 'contractDigest'])
    && isFiniteNumber(value.version)
}


function isRegisteredPrice(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.kind === 'fixed') {
    return exactAmountSchema.safeParse(value.amount).success
  }
  if (value.kind === 'range') {
    return exactAmountSchema.safeParse(value.minimum).success
      && exactAmountSchema.safeParse(value.maximum).success
  }
  return value.kind === 'on_request'
}

function isRouteMandateDataScope(value: unknown): boolean {
  if (!isRecord(value)
    || !hasStringFields(value, ['effectId', 'inputPointer'])
    || !(
      value.classification === 'public'
      || value.classification === 'personal'
      || value.classification === 'sensitive'
      || value.classification === 'credential'
    )
    || !(value.phase === 'preparation' || value.phase === 'execution')
    || !isRouteMandateRecipient(value.recipient)
    || !isStringArray(value.purposes)) {
    return false
  }
  return true
}

function isRouteMandateRecipient(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.kind === 'registered_binding') {
    return hasStringFields(value, ['businessId', 'bindingId'])
  }
  if (value.kind === 'named_recipient') {
    return hasStringFields(value, ['recipientId'])
  }
  return false
}

function isRouteMandateEffect(value: unknown): boolean {
  return isRecord(value)
    && hasStringFields(value, ['effectId'])
    && (
      value.class === 'data_release'
      || value.class === 'financial_exposure'
      || value.class === 'external_state_change'
    )
    && (value.authority === 'none' || value.authority === 'explicit' || value.authority === 'mandate_or_explicit')
    && (
      value.reversibility === 'not_applicable'
      || value.reversibility === 'reversible'
      || value.reversibility === 'conditional'
      || value.reversibility === 'irreversible'
    )
}

function isRouteMandateEvidence(value: unknown): boolean {
  if (!isRecord(value)
    || !hasStringFields(value, [
      'evidenceId',
      'outputPointer',
      'purpose',
      'annotationId',
      'label',
      'role',
      'schemaIdentity',
    ])
    || typeof value.guaranteed !== 'boolean') {
    return false
  }
  return value.semanticIdentity === undefined || typeof value.semanticIdentity === 'string'
}

function isRouteMandateCancellation(value: unknown): boolean {
  return isRecord(value)
    && (value.kind === 'unsupported' || value.kind === 'adapter_managed')
    && isStringArray(value.evidenceRefs)
}

function isRouteMandateRecovery(value: unknown): boolean {
  return isRecord(value)
    && (value.idempotency === 'not_applicable' || value.idempotency === 'required')
    && (value.recovery === 'retry_safe' || value.recovery === 'reconcile_required')
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasStringFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => typeof value[field] === 'string')
}

async function issuedAdmissionFixture(
  backend: RouteMandateBackend,
  suffix: string,
) {
  const current = await committedRequest(backend, identity.tokenIdentifier, {
    includeFallback: suffix === 'substitution',
  })
  const route = current.routeGeneration.routes[0]
  if (route === undefined || route.maximumTotalCost.kind !== 'known') {
    throw new Error('exact route fixture missing')
  }
  const customer = backend.withIdentity(identity)
  const issued = await customer.mutation(internal.customerRequestRouteMandate.issue, {
    requestId: current.aggregate.snapshot.requestId,
    expectedRequestRevision: current.aggregate.snapshot.revision,
    expectedGenerationRef: current.routeGeneration.generationRef,
    selectedRoutePlanId: route.routePlanId,
    maximumTotalSpend: { ...route.maximumTotalCost.amount },
    expiresAt: Math.min(route.expiresAt, 30_000),
    idempotencyKey: `confirm:route:${suffix}`,
  })
  if (issued.kind !== 'issued') throw new Error(`mandate issuance failed: ${JSON.stringify(issued)}`)
  const step = issued.mandate.route.steps[0]
  if (step === undefined) throw new Error('issued route step missing')
  return { current, route, customer, issued, step }
}

function admissionCommand(
  fixture: Awaited<ReturnType<typeof issuedAdmissionFixture>>,
  idempotencyKey: string,
) {
  return {
    requestId: fixture.current.aggregate.snapshot.requestId,
    mandateRef: fixture.issued.mandate.mandateRef,
    expectedMandateDigest: fixture.issued.mandate.mandateDigest,
    expectedGenerationRef: fixture.current.routeGeneration.generationRef,
    expectedRoutePlanId: fixture.route.routePlanId,
    expectedRouteDigest: fixture.route.routeDigest,
    stepPosition: fixture.step.position,
    expectedActionId: fixture.step.actionId,
    expectedCapabilityId: fixture.step.contractRef.capabilityId,
    expectedCapabilityVersion: fixture.step.contractRef.version,
    expectedCapabilityContractDigest: fixture.step.contractRef.contractDigest,
    idempotencyKey,
  }
}

async function seedRouteMandateTestCatalog(backend: RouteMandateBackend): Promise<void> {
  await backend.run(async (ctx) => {
    const actor = {
      kind: 'authenticated_owner' as const,
      clerkUserId: identity.subject,
      displayName: 'Route Mandate Test Owner',
    }
    await ensureCatalogProjectionControlsCommand(ctx.db, {
      actorRef: actor.clerkUserId,
      operationKey: 'test:route-mandate:catalog-controls',
      correlationId: 'test:route-mandate:catalog-controls',
      reasonCode: 'test_route_mandate_catalog_setup',
      evidenceRefs: ['test:route-mandate:catalog'],
    }, 2_000)

    for (const [index, variant] of TEST_ROUTE_VARIANTS.entries()) {
      const correlationId = `test:route-mandate:catalog:${variant.suffix}`
      const claim = await claimBusinessCommand(ctx.db, {
        actor,
        facts: {
          name: `Route mandate test ${variant.suffix}`,
          category: 'Data capability provider',
          suburb: 'Perth',
          stateTerritory: 'WA',
          requestedSlug: variant.slug,
          ownerMessage: 'Test-only business for RouteMandate lifecycle coverage.',
          sourceRefs: [{
            label: 'Route mandate test catalog',
            evidenceRef: correlationId,
          }],
        },
        operationKey: `test:route-mandate:catalog-claim:${variant.suffix}`,
        correlationId,
      }, 2_010 + index)
      if (claim.kind !== 'ok') {
        throw new Error(`route_mandate_test_claim_${claim.code}`)
      }

      const published = await publishBusinessCatalogCommand(ctx.db, {
        actor,
        claimId: claim.claim.claimId,
        operationKey: `test:route-mandate:catalog-publish:${variant.suffix}`,
        correlationId,
        services: [{
          name: `Frankfurter reference rate ${variant.suffix}`,
          category: 'Data capability provider',
          summary: 'Test-only catalog source for RouteMandate lifecycle coverage.',
          serviceArea: 'Online',
          hoursOrUnknown: 'Always available for tests',
          firstRequest: {
            mode: 'inquiry_available',
            publicChannel: 'ae_status_only',
            publicDisclosure: 'Test-only catalog source; no production service is supplied.',
          },
        }],
      }, 2_020 + index)
      if (published.kind !== 'ok') {
        throw new Error(`route_mandate_test_catalog_${published.code}`)
      }
    }
  })
}

async function seedRouteMandateTestSupply(backend: RouteMandateBackend): Promise<void> {
  const normalized = await normalizeCapabilityPublication(frankfurterSingleRatePublicationImport)
  if (normalized.kind !== 'normalized') {
    throw new Error(`route_mandate_test_curated_publication_${normalized.reason}`)
  }
  const curatedDraft = normalized.draft
  await backend.run(async (ctx) => {
    const registered = await registerCapabilityContractDocument(ctx.db, curatedDraft.documentJson, 2_090)
    if (registered.kind !== 'registered') {
      throw new Error(`route_mandate_test_contract_registration_${registered.reason}`)
    }
    const actor = { kind: 'system' as const, ref: 'system:test-route-mandate' }
    for (const [index, variant] of TEST_ROUTE_VARIANTS.entries()) {
      const business = await ctx.db.query('businesses')
        .withIndex('by_slug', (query) => query.eq('slug', variant.slug))
        .unique()
      if (business === null) throw new Error(`route_mandate_test_business_missing:${variant.slug}`)
      const catalogOfferings = await ctx.db.query('businessOfferings')
        .withIndex('by_businessId_and_status', (query) => (
          query.eq('businessId', business._id).eq('status', 'published')
        ))
        .take(2)
      if (catalogOfferings.length !== 1) {
        throw new Error(`route_mandate_test_catalog_offering_missing:${variant.slug}`)
      }
      const catalogOffering = catalogOfferings[0]
      if (catalogOffering === undefined) {
        throw new Error(`route_mandate_test_catalog_offering_missing:${variant.slug}`)
      }
      const catalogRevision = await ctx.db.query('businessOfferingRevisions')
        .withIndex('by_offeringRef_and_revision', (query) => (
          query.eq('offeringRef', catalogOffering.offeringRef)
            .eq('revision', catalogOffering.currentRevision)
        ))
        .unique()
      if (catalogRevision === null) {
        throw new Error(`route_mandate_test_catalog_revision_missing:${variant.slug}`)
      }
      const origin = {
        kind: 'catalog_offering' as const,
        offeringRef: catalogOffering.offeringRef,
        offeringRevision: catalogOffering.currentRevision,
        offeringSourceHash: catalogRevision.sourceHash,
      }
      const correlationId = `test:route-mandate:${variant.suffix}`
      const evidenceRefs = ['test:route-mandate-provider-supply']
      const context = {
        correlationId,
        operationKey: `test:route-mandate:offering:${variant.suffix}`,
        reasonCode: 'test_route_mandate_provider_supply',
        evidenceRefs,
      }
      const presentation = {
        label: `Route mandate test option ${variant.suffix}`,
        summary: 'Test-labelled keyless provider option for RouteMandate lifecycle coverage.',
        price: { kind: 'fixed' as const, amount: variant.price },
        materialTerms: [{
          termId: 'test_only',
          label: 'Environment',
          value: 'Test-only provider option; no production service is supplied.',
        }],
        commercialRelationship: {
          kind: 'none' as const,
          summary: 'Test-only option with no payment, sponsorship, rebate, or ownership relationship.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs,
        },
      }
      const offering = await registerCapabilityOfferingCommand(ctx.db, {
        actor,
        context,
        registration: {
          offeringId: variant.offeringId,
          businessId: business._id,
          networkId: curatedDraft.offering.networkId,
          contractRef: registered.ref,
          origin,
          presentation,
          searchTerms: ['route mandate test', 'frankfurter reference rate'],
          registrationEvidenceRefs: evidenceRefs,
        },
      }, 2_100 + index)
      if (offering.kind !== 'registered') {
        throw new Error(`route_mandate_test_offering_registration_${offering.reason}`)
      }
      const binding = await registerCapabilityBindingCommand(ctx.db, {
        actor,
        context: {
          ...context,
          operationKey: `test:route-mandate:binding:${variant.suffix}`,
        },
        registration: {
          bindingId: variant.bindingId,
          offeringId: offering.offeringId,
          networkId: curatedDraft.offering.networkId,
          contractRef: registered.ref,
          endpointUrl: curatedDraft.binding.endpointUrl,
          authority: curatedDraft.binding.authority,
          continuation: curatedDraft.binding.continuation,
          cancellation: curatedDraft.binding.cancellation,
          adapter: curatedDraft.binding.adapter,
          registrationEvidenceRefs: evidenceRefs,
        },
      }, 2_110 + index)
      if (binding.kind !== 'registered') {
        throw new Error(`route_mandate_test_binding_registration_${binding.reason}`)
      }
      const eligibility = await setCapabilitySupplyEligibility(ctx.db, {
        offeringId: offering.offeringId,
        bindingId: binding.bindingId,
        contractRef: registered.ref,
        decision: 'admit',
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: evidenceRefs,
        conformanceEvidenceRefs: evidenceRefs,
      }, 2_120 + index)
      if (eligibility.kind !== 'eligible') {
        throw new Error(`route_mandate_test_eligibility_${eligibility.kind}`)
      }
      const persistedBinding = await ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', binding.bindingId))
        .unique()
      if (persistedBinding === null) {
        throw new Error(`route_mandate_test_binding_missing:${variant.suffix}`)
      }
      const published = await publishCapabilityForSeed(ctx, {
        businessId: String(business._id),
        source: { kind: 'ae_envelope', documentJson: curatedDraft.documentJson },
        offering: {
          offeringId: offering.offeringId,
          networkId: curatedDraft.offering.networkId,
          origin,
          presentation,
          searchTerms: ['route mandate test', 'frankfurter reference rate'],
          registrationEvidenceRefs: evidenceRefs,
        },
        binding: {
          bindingId: persistedBinding.bindingId,
          endpointUrl: persistedBinding.endpointUrl,
          authority: persistedBinding.authority,
          continuation: persistedBinding.continuation,
          cancellation: persistedBinding.cancellation,
          adapter: { adapterId: persistedBinding.adapterId, config: JSON.parse(persistedBinding.configJson) },
          registrationEvidenceRefs: persistedBinding.registrationEvidenceRefs,
        },
        operationKey: `test:route-mandate:publication:${variant.suffix}`,
        correlationId,
        reasonCode: 'test_route_mandate_provider_publication',
        evidenceRefs,
        origin,
        now: 2_130 + index,
      })
      if (published.kind !== 'published') {
        throw new Error(`route_mandate_test_publication_${published.reason}`)
      }
    }
  })
}

async function committedRequest(
  backend: RouteMandateBackend,
  principalId = identity.tokenIdentifier,
  options: Readonly<{ includeFallback?: boolean }> = {},
) {
  await seedRouteMandateTestCatalog(backend)
  await seedRouteMandateTestSupply(backend)
  await backend.run(async (ctx) => {
    const offerings = await ctx.db.query('capabilityOfferings').take(64)
    const bindings = await ctx.db.query('capabilityTransportBindings').take(64)
    for (const binding of bindings) {
      if (binding.bindingId.startsWith(TEST_ROUTE_BINDING_PREFIX)) continue
      const offering = offerings.find((candidate) => candidate.offeringId === binding.offeringId)
      if (offering === undefined) throw new Error('route mandate offering missing')
      const result = await setCapabilitySupplyEligibility(ctx.db, {
        offeringId: offering.offeringId,
        bindingId: binding.bindingId,
        contractRef: {
          capabilityId: binding.capabilityId,
          version: binding.version,
          contractDigest: binding.contractDigest,
        },
        decision: 'admit',
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: ['test:business-reviewed'],
        conformanceEvidenceRefs: ['test:adapter-reviewed'],
      }, 2_000)
      if (result.kind !== 'eligible') {
        throw new Error(`sandbox admission failed: ${result.kind === 'refused' ? result.reason : result.kind}`)
      }
    }
  })
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await backend.finishInProgressScheduledFunctions()
  await observeAllReady(backend, 'before-compile')
  const compiled = await compileFixture(backend, {
    expectedRevision: 0,
    expectedRouteGeneration: 0,
    intent: 'Find a governed result',
    now: 1_000,
    principalId,
    ...(options.includeFallback === undefined ? {} : { includeFallback: options.includeFallback }),
  })
  const committed = await backend.mutation(internal.customerRequestV2.commitAggregate, {
    commandKey: 'command:route-mandate-base',
    commandDigest: 'sha256:' + '1'.repeat(64),
    expectedRevision: 0,
    expectedRouteGeneration: 0,
    aggregate: compiled.aggregate,
    routeGeneration: compiled.routeGeneration,
  })
  if (committed.kind !== 'stored') throw new Error(`request commit failed: ${committed.kind}`)
  await observeAllReady(backend, 'after-commit')
  return compiled
}

async function observeAllReady(backend: RouteMandateBackend, phase: string) {
  const publications = await backend.run(async (ctx) => (
    ctx.db.query('capabilityPublications').collect()
  ))
  if (publications.length === 0) throw new Error('sandbox publications missing')
  for (const publication of publications) {
    const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
      publicationRef: publication.publicationRef,
      expectedRevision: publication.revision,
      credentialState: 'ready',
      healthState: 'healthy',
      validUntil: Date.now() + 300_000,
      operationKey: `test:route-mandate-readiness:${phase}:${publication.publicationRef}`,
      correlationId: 'test:route-mandate-readiness',
      reasonCode: 'test_readiness',
      evidenceRefs: ['test:readiness'],
    })
    if (observed.kind !== 'observed') throw new Error(`sandbox readiness failed: ${observed.reason}`)
  }
}


async function compileFixture(
  backend: RouteMandateBackend,
  input: Readonly<{
    expectedRevision: number
    expectedRouteGeneration: number
    intent: string
    now: number
    principalId?: string
    includeFallback?: boolean
  }>,
) {
  const supply = await backend.run(async (ctx) => (
    await listRouteableCapabilitySupply(ctx.db, {
      networkId: 'ae:public', limit: 64, now: input.now,
    })
  ))
  if (supply.kind !== 'available') throw new Error(`eligible supply unavailable: ${supply.reason}`)
  const contractRow = await backend.run(async (ctx) => {
    const row = await ctx.db.query('capabilityContractDocuments')
      .withIndex('by_status_and_capabilityId_and_version', (query) => (
        query.eq('status', 'active').eq('capabilityId', 'frankfurter.single-rate')
      ))
      .order('desc')
      .first()
    if (row === null) throw new Error('route_mandate_curated_contract_missing')
    const { _id: _rowId, _creationTime: _rowCreationTime, ...result } = row
    return result
  })
  const decoded = decodeDurableCapabilityContract({
    ref: {
      capabilityId: contractRow.capabilityId,
      version: contractRow.version,
      contractDigest: contractRow.contractDigest,
    },
    documentJson: contractRow.documentJson,
    status: contractRow.status,
    registeredAt: contractRow.registeredAt,
  })
  if (decoded.kind !== 'found') throw new Error('route_mandate_curated_contract_unavailable')
  const model = openCapabilityDecisionModel(decoded.contract)
  const publication = supply.supplies.find(({ binding }) => (
    binding.capabilityId === model.contractRef.capabilityId
  ))?.publication
  if (publication === undefined) throw new Error('route mandate publication lineage missing')
  const result = compileCustomerRequest({
    requestId: 'request:route-mandate',
    expectedRevision: input.expectedRevision,
    expectedRouteGeneration: input.expectedRouteGeneration,
    principalId: input.principalId ?? identity.tokenIdentifier,
    delegatedAgentId: 'agent:external',
    intent: input.intent,
    networkId: 'ae:public',
    proposal: {
      kind: 'capability_candidates',
      selections: [{
        operationRef: publication.operationRef,
        selectionKey: model.selectionKey,
        contractRef: model.contractRef,
        facts: model.inputs.map((modelInput, index) => ({
          contractRef: model.contractRef,
          selectionKey: model.selectionKey,
          inputKey: modelInput.key,
          inputPointer: modelInput.inputPointer,
          schemaIdentity: modelInput.schemaIdentity,
          value: index === 0 ? 'EUR' : 'USD',
          source: { kind: 'customer', assertionRef: 'assertion:route-mandate' },
        })),
      }],
    },
    mappings: [],
    interpreterId: 'interpreter:route-mandate-test',
    bindings: supply.supplies.flatMap(({ offering, binding, publication: livePublication }) => (
      livePublication === undefined ? [] : [{
        operationRef: livePublication.operationRef,
        admittedOperation: livePublication.admittedOperation,
        businessId: String(offering.businessId),
        offeringId: offering.offeringId,
        bindingId: binding.bindingId,
        contractRef: {
          capabilityId: binding.capabilityId,
          version: binding.version,
          contractDigest: binding.contractDigest,
        },
        offeringRegistrationHash: offering.registrationHash,
        bindingRegistrationHash: binding.registrationHash,
        price: offering.presentation.price,
        commercialRelationship: offering.presentation.commercialRelationship,
        cancellation: binding.cancellation,
        publicationRef: livePublication.publicationRef,
        publicationRevision: livePublication.revision,
        readinessValidUntil: livePublication.readinessValidUntil,
      }]
    )),
    models: [model],
    now: input.now,
  })
  if (result.kind !== 'compiled' || result.routeGeneration === undefined) {
    throw new Error(`route compile failed: ${result.kind === 'compiled' ? 'generation_missing' : result.reason}`)
  }
  const routeGeneration = input.includeFallback === true && result.routeGeneration.routes.length < 2
    ? routeGenerationWithFallback(result.routeGeneration, supply.supplies)
    : result.routeGeneration
  return {
    aggregate: writableCustomerRequestV2Aggregate(result.aggregate),
    routeGeneration: writableCustomerRequestRoutePlanGeneration(routeGeneration),
  }
}

type RoutePlanStep = CustomerRequestRoutePlan['steps'][number]
type RouteableSupplyEntry = Readonly<{
  offering: Readonly<{
    businessId: string
    offeringId: string
    registrationHash: string
    presentation: Readonly<{
      price: RoutePlanStep['price']
      commercialRelationship: NonNullable<RoutePlanStep['commercialRelationship']>
    }>
  }>
  binding: Readonly<{
    bindingId: string
    capabilityId: string
    version: number
    contractDigest: string
    registrationHash: string
    cancellation: RoutePlanStep['cancellation']
  }>
  publication: Readonly<{
    operationRef: RoutePlanStep['operationRef']
    admittedOperation: RoutePlanStep['admittedOperation']
    publicationRef: string
    revision: number
    readinessValidUntil: number
  }>
}>
type RouteableSupply = readonly RouteableSupplyEntry[]

function routeGenerationWithFallback(
  generation: CustomerRequestRoutePlanGeneration,
  supplies: RouteableSupply,
) {
  const primary = generation.routes[0]
  if (primary === undefined || primary.steps.length !== 1) {
    throw new Error('single-step fallback fixture missing')
  }
  const primaryStep = primary.steps[0]
  if (primaryStep === undefined) throw new Error('primary fallback step missing')
  const alternativeSupply = supplies.find(({ offering, binding, publication }) => (
    publication !== undefined
      && publication.operationRef !== primaryStep.operationRef
      && String(offering.businessId) !== primaryStep.businessId
      && binding.bindingId !== primaryStep.bindingId
      && binding.capabilityId === primaryStep.contractRef.capabilityId
      && binding.version === primaryStep.contractRef.version
      && binding.contractDigest === primaryStep.contractRef.contractDigest
  ))
  if (alternativeSupply?.publication === undefined) {
    throw new Error('route mandate fallback publication lineage missing')
  }
  const { offering, binding, publication } = alternativeSupply
  const alternativeStep = {
    ...primaryStep,
    operationRef: publication.operationRef,
    admittedOperation: publication.admittedOperation,
    candidateRef: `candidate:${canonicalDigest({
      operationRef: publication.operationRef,
      businessId: String(offering.businessId),
      offeringId: offering.offeringId,
      bindingId: binding.bindingId,
      contractRef: primaryStep.contractRef,
    })}`,
    businessId: String(offering.businessId),
    offeringId: offering.offeringId,
    bindingId: binding.bindingId,
    offeringRegistrationHash: offering.registrationHash,
    bindingRegistrationHash: binding.registrationHash,
    price: offering.presentation.price,
    commercialRelationship: {
      ...offering.presentation.commercialRelationship,
      evidenceRefs: [...offering.presentation.commercialRelationship.evidenceRefs],
    },
    cancellation: { ...binding.cancellation, evidenceRefs: [...binding.cancellation.evidenceRefs] },
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
  }
  const alternative = rekeySingleStepRoute(primary, alternativeStep, publication.readinessValidUntil)
  if (alternative.routePlanId === primary.routePlanId) {
    throw new Error('route mandate fallback route did not change')
  }
  const routes = [
    routeWithFallback(primary, alternative.routePlanId),
    routeWithFallback(alternative, primary.routePlanId),
  ]
  const decisionSnapshot = generation.decisionSnapshot
  if (decisionSnapshot === undefined) throw new Error('route mandate decision snapshot missing')
  return createCustomerRequestRoutePlanGeneration({
    generation: generation.generation,
    requestId: generation.requestId,
    requestRevision: generation.requestRevision,
    compiler: generation.compiler,
    registrySnapshotDigest: generation.registrySnapshotDigest,
    decisionSnapshot,
    routes,
    createdAt: generation.createdAt,
  })
}

function rekeySingleStepRoute(
  route: CustomerRequestRoutePlan,
  step: RoutePlanStep,
  expiresAt: number,
) {
  const { routePlanId: _routePlanId, routeDigest: _routeDigest, fallbacks: _fallbacks, ...routeBase } = route
  const comparison = {
    ...routeBase.comparison,
    freshnessValidUntil: expiresAt,
  }
  const { ordering: _ordering, ...comparisonCore } = comparison
  const routePlanId = `route:${canonicalDigest({
    ...routeBase,
    steps: [step],
    maximumTotalCost: maximumCostForPrice(step.price),
    expiresAt,
    comparison: comparisonCore,
  })}`
  const material = {
    ...routeBase,
    routePlanId,
    steps: [step],
    maximumTotalCost: maximumCostForPrice(step.price),
    expiresAt,
    fallbacks: { ordering: 'unranked' as const, alternatives: [] },
    comparison,
  }
  return { ...material, routeDigest: canonicalDigest(material) }
}

function routeWithFallback(
  route: CustomerRequestRoutePlan,
  alternativeRoutePlanId: string,
) {
  const { routeDigest: _routeDigest, ...routeWithoutDigest } = route
  const material = {
    ...routeWithoutDigest,
    fallbacks: {
      ordering: 'unranked' as const,
      alternatives: [{
        alternativeRouteRef: alternativeRoutePlanId,
        when: 'route_unavailable_before_approval' as const,
      }],
    },
  }
  return { ...material, routeDigest: canonicalDigest(material) }
}

function scaleExactAmount(amount: ExactAmount, count: number): ExactAmount {
  return { ...amount, units: (BigInt(amount.units) * BigInt(count)).toString() }
}

function offsetExactAmount(amount: ExactAmount, delta: bigint): ExactAmount {
  return { ...amount, units: (BigInt(amount.units) + delta).toString() }
}

function maximumCostForPrice(price: RoutePlanStep['price']) {
  if (price.kind === 'fixed') {
    return { kind: 'known' as const, amount: { ...price.amount } }
  }
  if (price.kind === 'range') {
    return { kind: 'known' as const, amount: { ...price.maximum } }
  }
  throw new Error('fallback route requires known price')
}
