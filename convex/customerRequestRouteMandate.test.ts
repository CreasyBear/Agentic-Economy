import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { defineCapabilityContract, openCapabilityDecisionModel } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { compileCustomerRequest, writableCustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import { deriveRouteStepAuthority } from '@/modules/customer-request/route-mandate-admission'
import { writableCustomerRequestRoutePlanGeneration } from '@/modules/customer-request/route-plan-generation'
import { SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT } from '@/modules/sandbox-supply/public'
import { internal } from './_generated/api'
import schema from './schema'
import { setCapabilitySupplyEligibility } from './capabilitySupply'

const modules = import.meta.glob('./**/*.ts')
const identity = {
  subject: 'customer-route-mandate',
  issuer: 'https://identity.test',
  tokenIdentifier: 'https://identity.test|customer-route-mandate',
}

describe('durable RouteMandate lifecycle', () => {
  afterEach(() => vi.restoreAllMocks())

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
      maximumTotalSpend: {
        currency: route.maximumTotalCost.currency,
        amountMinor: route.maximumTotalCost.amountMinor,
      },
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
      maximumTotalSpend: {
        currency: route.maximumTotalCost.currency,
        amountMinor: route.maximumTotalCost.amountMinor,
      },
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
      maximumTotalSpend: {
        currency: route.maximumTotalCost.currency,
        amountMinor: route.maximumTotalCost.amountMinor,
      },
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
      maximumTotalSpend: {
        currency: route.maximumTotalCost.currency,
        amountMinor: route.maximumTotalCost.amountMinor,
      },
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
        amountMinor: command.maximumTotalSpend.amountMinor - 1,
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
          price: {
            kind: 'fixed',
            currency: routeCost.currency,
            amountMinor: routeCost.amountMinor + 1,
          },
        },
      })
    })
    vi.spyOn(Date, 'now').mockReturnValue(1_000)

    await expect(backend.withIdentity(identity).mutation(internal.customerRequestRouteMandate.issue, {
      requestId: current.aggregate.snapshot.requestId,
      expectedRequestRevision: current.aggregate.snapshot.revision,
      expectedGenerationRef: current.routeGeneration.generationRef,
      selectedRoutePlanId: route.routePlanId,
      maximumTotalSpend: {
        currency: routeCost.currency,
        amountMinor: routeCost.amountMinor,
      },
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
      maximumTotalSpend: {
        currency: firstRoute.maximumTotalCost.currency,
        amountMinor: firstRoute.maximumTotalCost.amountMinor,
      },
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
      maximumTotalSpend: {
        currency: nextRoute.maximumTotalCost.currency,
        amountMinor: nextRoute.maximumTotalCost.amountMinor,
      },
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
      maximumTotalSpend: {
        currency: route.maximumTotalCost.currency,
        amountMinor: route.maximumTotalCost.amountMinor,
      },
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
      maximumTotalSpend: {
        currency: route.maximumTotalCost.currency,
        amountMinor: route.maximumTotalCost.amountMinor,
      },
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
    expect(results.map(({ kind }) => kind).sort()).toEqual(['conflict', 'issued'])
    expect(results.find(({ kind }) => kind === 'conflict')).toEqual({
      kind: 'conflict', reason: 'active_mandate_exists',
    })
    const winner = results.find((result) => result.kind === 'issued')
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
      maximumTotalSpend: { currency: routeCost.currency, amountMinor: routeCost.amountMinor },
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
          price: { kind: 'fixed', currency: routeCost.currency, amountMinor: routeCost.amountMinor + 1 },
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
      maximumTotalSpend: {
        currency: route.maximumTotalCost.currency,
        amountMinor: route.maximumTotalCost.amountMinor,
      },
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
      maximumTotalSpend: {
        currency: route.maximumTotalCost.currency,
        amountMinor: route.maximumTotalCost.amountMinor,
      },
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
          maximumSpend: { currency: 'AUD', amountMinor: 900 },
          dataScope: [{
            effectId: 'request_release',
            inputPointer: '/requestContext',
            classification: 'public',
            phase: 'preparation',
            purposes: ['return_sandbox_result'],
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
      expect(await ctx.db.query('customerRequestRouteDataReservations').collect()).toHaveLength(1)
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
      expect(await ctx.db.query('customerRequestRouteDataReservations').collect()).toHaveLength(1)
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
    expect(results.map((entry) => entry.kind).sort()).toEqual(['admitted', 'refused'])
    expect(results.find((entry) => entry.kind === 'refused')).toEqual({
      kind: 'refused', reason: 'step_already_reserved',
    })
    await backend.run(async (ctx) => {
      expect(await ctx.db.query('customerRequestRouteStepReservations').collect()).toHaveLength(1)
      expect(await ctx.db.query('customerRequestRouteDataReservations').collect()).toHaveLength(1)
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
    const derived = deriveRouteStepAuthority({
      mandate: fixture.issued.mandate,
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

async function issuedAdmissionFixture(
  backend: ReturnType<typeof convexTest>,
  suffix: string,
) {
  const current = await committedRequest(backend)
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
    maximumTotalSpend: {
      currency: route.maximumTotalCost.currency,
      amountMinor: route.maximumTotalCost.amountMinor,
    },
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

async function committedRequest(
  backend: ReturnType<typeof convexTest>,
  principalId = identity.tokenIdentifier,
) {
  await backend.mutation(internal.devSeed.seedDevCatalog, {})
  await backend.run(async (ctx) => {
    const offerings = await ctx.db.query('capabilityOfferings').take(64)
    const bindings = await ctx.db.query('capabilityTransportBindings').take(64)
    for (const binding of bindings) {
      const offering = offerings.find((candidate) => candidate.offeringId === binding.offeringId)
      if (offering === undefined) throw new Error('sandbox offering missing')
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
      if (result.kind !== 'eligible') throw new Error(`sandbox admission failed: ${result.reason}`)
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

async function observeAllReady(backend: ReturnType<typeof convexTest>, phase: string) {
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
  backend: ReturnType<typeof convexTest>,
  input: Readonly<{
    expectedRevision: number
    expectedRouteGeneration: number
    intent: string
    now: number
    principalId?: string
  }>,
) {
  const supply = await backend.query(internal.capabilitySupply.listEligible, {
    networkId: 'ae:public', limit: 64,
  })
  if (supply.kind !== 'available') throw new Error(`eligible supply unavailable: ${supply.reason}`)
  const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
  const modelInput = model.inputs[0]
  if (modelInput === undefined) throw new Error('sandbox input missing')
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
        selectionKey: model.selectionKey,
        contractRef: model.contractRef,
        facts: [{
          contractRef: model.contractRef,
          selectionKey: model.selectionKey,
          inputKey: modelInput.key,
          inputPointer: modelInput.inputPointer,
          schemaIdentity: modelInput.schemaIdentity,
          value: input.intent,
          source: { kind: 'customer', assertionRef: 'assertion:route-mandate' },
        }],
      }],
    },
    interpreterId: 'interpreter:route-mandate-test',
    bindings: supply.supplies.map(({ offering, binding, publication: livePublication }) => ({
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
      ...(livePublication === undefined ? {} : {
        publicationRef: livePublication.publicationRef,
        publicationRevision: livePublication.revision,
        readinessValidUntil: livePublication.readinessValidUntil,
      }),
    })),
    models: [model],
    now: input.now,
  })
  if (result.kind !== 'compiled' || result.routeGeneration === undefined) {
    throw new Error(`route compile failed: ${result.kind === 'compiled' ? 'generation_missing' : result.reason}`)
  }
  return {
    aggregate: writableCustomerRequestV2Aggregate(result.aggregate),
    routeGeneration: writableCustomerRequestRoutePlanGeneration(result.routeGeneration),
  }
}
