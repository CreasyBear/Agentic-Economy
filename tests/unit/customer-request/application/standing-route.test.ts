import { describe, expect, it, vi } from 'vitest'

import {
  allowStandingRoute,
  inspectStandingRoute,
  listStandingRouteAssistants,
  projectRepeatPermission,
  repeatPermissionRef,
  resolveSelectableCurrentRoute,
  revokeStandingRoute,
  applyStandingRoute,
  type StandingRoutePorts,
} from '@/modules/customer-request/application/public'
import type {
  StandingRouteAggregate,
  StandingRouteGeneration,
} from '@/modules/customer-request/application/standing-route'
import { customerRouteRef } from '@/modules/customer-request/route-plan-customer-projection'
import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'

const NOW = Date.now()
const FUTURE = NOW + 60_000
const routePlanId = 'route:1'
const generationRef = 'gen:1'
const routeRef = customerRouteRef(generationRef, routePlanId)

const aggregate = {
  snapshot: {
    requestId: 'req:1',
    revision: 3,
    intent: 'Find a wheelchair-accessible ride',
    principalId: 'principal:1',
    networkId: 'net:1',
    delegatedAgentId: 'agent:1',
    facts: [],
    snapshotDigest: 'snap:1',
  },
  evaluation: {
    criteria: [{
      label: 'Destination',
      value: 'Perth',
      basis: 'customer_provided' as const,
      inputKey: 'destination',
    }],
    posture: 'progress_available' as const,
    factsDigest: 'facts:1',
    evaluationDigest: 'eval:1',
  },
  outcome: 'plan_ready' as const,
  plan: {
    actions: [{ actionId: 'action:1' }],
    planRevisionId: 'plan:1',
    planDigest: 'digest:plan:1',
    createdAt: NOW,
    registrySnapshotDigest: 'registry:1',
    compilerVersion: 'v1',
    interpreterId: 'interp:1',
    proposalDigest: 'prop:1',
  },
} satisfies StandingRouteAggregate

const generation = {
  generationRef,
  routes: [{
    routePlanId,
    steps: [{ dataUse: [{ field: 'pickup' }] }],
  }],
} satisfies StandingRouteGeneration

const displayedRoute = {
  routeRef,
  availability: 'current' as const,
  maximumTotalCost: { kind: 'known' as const, currency: 'AUD', amountMinor: 2_500 },
  validUntil: FUTURE,
}

const policy = {
  policyRef: 'standing-route-policy:v1:digest',
  policyDigest: 'digest',
  delegatedCredentialId: 'credential:1',
  generationRef,
  routes: [{ routePlanId }],
  limits: {
    perUseSpend: { currency: 'AUD', amountMinor: 2_500 },
    cumulativeSpend: { currency: 'AUD', amountMinor: 5_000 },
    perUseDataAllocations: 1,
    cumulativeDataAllocations: 2,
    occurrences: 2,
  },
  validFrom: NOW,
  validUntil: FUTURE,
}

const routesReadyPreview: CustomerRequestView = {
  kind: 'request',
  requestRef: 'req:1',
  revision: 3,
  state: 'routes_ready',
  summary: 'Options ready',
  nextAction: 'inspect_routes',
  missingFields: [],
  criteria: [],
  options: [],
  decision: {
    generationRef,
    requestRevision: 3,
    outcome: { kind: 'routes_available', routeCount: 1, summary: 'One option' },
    routes: [displayedRoute as never],
    comparison: { kind: 'single', summary: 'One option' },
    actions: {
      review: { kind: 'inspect_current_option', createsAuthority: false, startsWork: false, summary: 'Review' },
      confirm: { kind: 'confirm_current_option', createsAuthority: true, startsWork: false, summary: 'Confirm' },
      start: { kind: 'start_confirmed_option', availableAfter: 'confirmation', startsWork: true, summary: 'Start' },
      change: { kind: 'revise_request', createsAuthority: false, startsWork: false, preservesRequest: true, summary: 'Change' },
      decline: { kind: 'leave_unconfirmed', createsAuthority: false, startsWork: false, preservesRequest: true, summary: 'Decline' },
    },
    changes: { kind: 'initial' },
    nextBoundary: { kind: 'confirmation', authorityCreated: false },
  },
}

function basePorts(overrides: Partial<StandingRoutePorts> = {}): StandingRoutePorts {
  return {
    loadCurrent: vi.fn(async () => ({
      kind: 'current' as const,
      aggregate,
      routeGenerationNumber: 2,
      routeGenerationRef: generationRef,
    })),
    projectCurrentRoutePlans: vi.fn(async () => routesReadyPreview),
    getCurrentRoutePlanGeneration: vi.fn(async () => ({
      kind: 'found' as const,
      routeGeneration: generation,
    })),
    listStandingCredentials: vi.fn(async () => [{
      credentialId: 'credential:1',
      lastSeenAt: NOW,
    }]),
    listPermissions: vi.fn(async () => ({
      kind: 'found' as const,
      permissions: [{ requestRevision: 3, policy }],
    })),
    resolvePermission: vi.fn(async () => ({
      kind: 'found' as const,
      requestRevision: 3,
      policy,
    })),
    issueStandingPolicy: vi.fn(async () => ({
      kind: 'issued' as const,
      policy,
    })),
    issueMandate: vi.fn(async () => ({
      kind: 'issued' as const,
      mandate: {
        mandateRef: 'mandate:1',
        route: { generationRef, routePlanId },
        request: { requestRevision: 3 },
        issuedAt: NOW,
        expiresAt: FUTURE,
      },
    })),
    revokeStandingPolicy: vi.fn(async () => ({
      kind: 'revoked' as const,
      policy: { ...policy, revokedAt: NOW + 1 },
    })),
    ...overrides,
  }
}

describe('customer-request standing-route', () => {
  it('projects a stable repeat-permission ref from the policy ref', () => {
    expect(repeatPermissionRef(policy.policyRef)).toMatch(/^repeat-permission:/)
    expect(projectRepeatPermission('req:1', 3, routeRef, policy)).toMatchObject({
      kind: 'repeat_permission',
      status: 'active',
      requestRef: 'req:1',
      routeRef,
      delegatedCredentialId: 'credential:1',
    })
  })

  it('lists connected assistants and projected permissions', async () => {
    const result = await listStandingRouteAssistants({
      requestRef: 'req:1',
      principalId: 'principal:1',
      ownerId: 'owner:1',
    }, basePorts())
    expect(result).toMatchObject({
      kind: 'connected_assistants',
      assistants: [{ assistantRef: 'credential:1', label: 'Connected assistant 1' }],
      permissions: [{ kind: 'repeat_permission', status: 'active', routeRef }],
    })
  })

  it('allows a current route through the standing-policy port', async () => {
    const ports = basePorts()
    const result = await allowStandingRoute({
      requestRef: 'req:1',
      revision: 3,
      routeRef,
      delegatedCredentialId: 'credential:1',
      occurrences: 2,
      cumulativeSpend: { currency: 'AUD', amountMinor: 5_000 },
      validUntil: FUTURE,
      idempotencyKey: 'allow:1',
      principalId: 'principal:1',
    }, ports)
    expect(result).toMatchObject({ kind: 'repeat_permission', status: 'active' })
    expect(ports.issueStandingPolicy).toHaveBeenCalledWith(expect.objectContaining({
      selectedRoutePlanId: routePlanId,
      perUseDataAllocations: 1,
      cumulativeDataAllocations: 2,
    }))
  })

  it('uses a standing permission by issuing a mandate through the port only', async () => {
    const ports = basePorts()
    const result = await applyStandingRoute({
      requestRef: 'req:1',
      revision: 3,
      routeRef,
      permissionRef: repeatPermissionRef(policy.policyRef),
      delegatedCredentialId: 'credential:1',
      idempotencyKey: 'use:1',
      principalId: 'principal:1',
    }, ports)
    expect(result).toMatchObject({ kind: 'request', state: 'route_confirmed' })
    expect(ports.issueMandate).toHaveBeenCalledOnce()
  })

  it('inspects and revokes a standing permission', async () => {
    const ports = basePorts()
    const permissionRef = repeatPermissionRef(policy.policyRef)
    const inspected = await inspectStandingRoute({
      requestRef: 'req:1',
      permissionRef,
      routeRef,
      principalId: 'principal:1',
    }, ports)
    expect(inspected).toMatchObject({ kind: 'repeat_permission', status: 'active' })

    const revoked = await revokeStandingRoute({
      requestRef: 'req:1',
      permissionRef,
      routeRef,
      idempotencyKey: 'revoke:1',
      principalId: 'principal:1',
    }, ports)
    expect(revoked).toMatchObject({ kind: 'repeat_permission', status: 'withdrawn' })
  })

  it('resolves the selectable current route shared by allow/use', async () => {
    const selected = await resolveSelectableCurrentRoute({
      requestRef: 'req:1',
      routeRef,
      aggregate,
      requireKnownMaximumTotalCost: true,
    }, basePorts())
    expect(selected).toMatchObject({
      kind: 'selected',
      selectedRoute: { routePlanId },
      generationRef,
    })
  })

  it('refuses allow when the principal does not own the request', async () => {
    const result = await allowStandingRoute({
      requestRef: 'req:1',
      revision: 3,
      routeRef,
      delegatedCredentialId: 'credential:1',
      occurrences: 2,
      cumulativeSpend: { currency: 'AUD', amountMinor: 5_000 },
      validUntil: FUTURE,
      idempotencyKey: 'allow:other',
      principalId: 'principal:other',
    }, basePorts())
    expect(result).toEqual({ kind: 'refused', reason: 'request_not_found' })
  })
})
