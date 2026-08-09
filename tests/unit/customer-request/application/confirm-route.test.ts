import { describe, expect, it, vi } from 'vitest'

import {
  confirmCustomerRoute,
  type ConfirmRoutePorts,
} from '@/modules/customer-request/application/public'
import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'
import { customerRouteRef } from '@/modules/customer-request/route-plan-customer-projection'

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
}

const displayedRoute = {
  routeRef,
  availability: 'current' as const,
  maximumTotalCost: { kind: 'known' as const, amount: { currency: 'AUD', units: '2500', exponent: 2 } },
  validUntil: FUTURE,
}

const mandate = {
  mandateRef: 'mandate:1',
  route: { generationRef, routePlanId },
  request: { requestRevision: 3 },
  issuedAt: NOW,
  expiresAt: FUTURE,
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

function basePorts(overrides: Partial<ConfirmRoutePorts> = {}): ConfirmRoutePorts {
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
      routeGeneration: {
        generationRef,
        routes: [{ routePlanId, steps: [{ dataUse: [] }] }],
      },
    })),
    issueConfirmMandate: vi.fn(async () => ({
      kind: 'issued' as const,
      mandate,
    })),
    ...overrides,
  }
}

describe('customer-request confirm-route', () => {
  it('issues a confirm mandate through the port and projects confirmation', async () => {
    const ports = basePorts()
    const result = await confirmCustomerRoute({
      requestRef: 'req:1',
      revision: 3,
      routeRef,
      idempotencyKey: 'confirm:1',
      principalId: 'principal:1',
    }, ports)
    expect(result).toMatchObject({ kind: 'request', state: 'route_confirmed' })
    expect(ports.issueConfirmMandate).toHaveBeenCalledOnce()
    expect(ports.issueConfirmMandate).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'req:1',
      expectedRequestRevision: 3,
      expectedGenerationRef: generationRef,
      selectedRoutePlanId: routePlanId,
      maximumTotalSpend: { currency: 'AUD', units: '2500', exponent: 2 },
      expiresAt: FUTURE,
      idempotencyKey: 'confirm:1',
    }))
  })

  it('replays an issued confirm mandate', async () => {
    const ports = basePorts({
      issueConfirmMandate: vi.fn(async () => ({
        kind: 'replayed' as const,
        mandate,
      })),
    })
    const result = await confirmCustomerRoute({
      requestRef: 'req:1',
      revision: 3,
      routeRef,
      idempotencyKey: 'confirm:replay',
      principalId: 'principal:1',
    }, ports)
    expect(result).toMatchObject({ kind: 'request', state: 'route_confirmed' })
  })

  it('returns the preview when the route is not selectable', async () => {
    const preview = {
      kind: 'request' as const,
      requestRef: 'req:1',
      revision: 3,
      state: 'needs_attention' as const,
      summary: 'No current options',
      nextAction: 'retry' as const,
      missingFields: [],
      criteria: [],
      options: [],
    }
    const ports = basePorts({
      projectCurrentRoutePlans: vi.fn(async () => preview),
    })
    const result = await confirmCustomerRoute({
      requestRef: 'req:1',
      revision: 3,
      routeRef,
      idempotencyKey: 'confirm:missing',
      principalId: 'principal:1',
    }, ports)
    expect(result).toEqual(preview)
    expect(ports.issueConfirmMandate).not.toHaveBeenCalled()
  })

  it('returns the preview when the selected route is missing from generation', async () => {
    const ports = basePorts({
      getCurrentRoutePlanGeneration: vi.fn(async () => ({
        kind: 'found' as const,
        routeGeneration: {
          generationRef,
          routes: [{ routePlanId: 'route:other', steps: [{ dataUse: [] }] }],
        },
      })),
    })
    const result = await confirmCustomerRoute({
      requestRef: 'req:1',
      revision: 3,
      routeRef,
      idempotencyKey: 'confirm:gone',
      principalId: 'principal:1',
    }, ports)
    expect(result).toEqual(routesReadyPreview)
    expect(ports.issueConfirmMandate).not.toHaveBeenCalled()
  })

  it('maps command_changed to idempotency_key_reused', async () => {
    const ports = basePorts({
      issueConfirmMandate: vi.fn(async () => ({
        kind: 'conflict' as const,
        reason: 'command_changed' as const,
      })),
    })
    const result = await confirmCustomerRoute({
      requestRef: 'req:1',
      revision: 3,
      routeRef,
      idempotencyKey: 'confirm:conflict',
      principalId: 'principal:1',
    }, ports)
    expect(result).toEqual({
      kind: 'conflict',
      requestRef: 'req:1',
      reason: 'idempotency_key_reused',
    })
  })

  it('maps request_revision_changed to revision_changed', async () => {
    const ports = basePorts({
      issueConfirmMandate: vi.fn(async () => ({
        kind: 'conflict' as const,
        reason: 'request_revision_changed' as const,
      })),
    })
    const result = await confirmCustomerRoute({
      requestRef: 'req:1',
      revision: 3,
      routeRef,
      idempotencyKey: 'confirm:rev',
      principalId: 'principal:1',
    }, ports)
    expect(result).toEqual({
      kind: 'conflict',
      requestRef: 'req:1',
      reason: 'revision_changed',
    })
  })

  it('re-projects current routes when route generation changed', async () => {
    const refreshed = {
      ...routesReadyPreview,
      summary: 'Options refreshed',
    }
    const ports = basePorts({
      issueConfirmMandate: vi.fn(async () => ({
        kind: 'conflict' as const,
        reason: 'route_generation_changed' as const,
      })),
      projectCurrentRoutePlans: vi.fn()
        .mockResolvedValueOnce(routesReadyPreview)
        .mockResolvedValueOnce(refreshed),
    })
    const result = await confirmCustomerRoute({
      requestRef: 'req:1',
      revision: 3,
      routeRef,
      idempotencyKey: 'confirm:gen',
      principalId: 'principal:1',
    }, ports)
    expect(result).toEqual(refreshed)
    expect(ports.projectCurrentRoutePlans).toHaveBeenCalledTimes(2)
  })

  it('maps other conflicts to options_changed', async () => {
    const ports = basePorts({
      issueConfirmMandate: vi.fn(async () => ({
        kind: 'conflict' as const,
        reason: 'active_mandate_exists' as const,
      })),
    })
    const result = await confirmCustomerRoute({
      requestRef: 'req:1',
      revision: 3,
      routeRef,
      idempotencyKey: 'confirm:active',
      principalId: 'principal:1',
    }, ports)
    expect(result).toEqual({
      kind: 'conflict',
      requestRef: 'req:1',
      reason: 'options_changed',
    })
  })

  it('projects needs-attention summaries for refusals', async () => {
    const authPorts = basePorts({
      issueConfirmMandate: vi.fn(async () => ({
        kind: 'refused' as const,
        reason: 'authentication_required' as const,
      })),
    })
    await expect(confirmCustomerRoute({
      requestRef: 'req:1',
      revision: 3,
      routeRef,
      idempotencyKey: 'confirm:auth',
      principalId: 'principal:1',
    }, authPorts)).resolves.toMatchObject({
      kind: 'request',
      state: 'needs_attention',
      summary: 'Sign in again before confirming this choice.',
    })

    const scopePorts = basePorts({
      issueConfirmMandate: vi.fn(async () => ({
        kind: 'refused' as const,
        reason: 'mandate_scope_invalid' as const,
      })),
    })
    await expect(confirmCustomerRoute({
      requestRef: 'req:1',
      revision: 3,
      routeRef,
      idempotencyKey: 'confirm:scope',
      principalId: 'principal:1',
    }, scopePorts)).resolves.toMatchObject({
      kind: 'request',
      state: 'needs_attention',
      summary: 'This choice can no longer be confirmed. Review the current options.',
    })
  })

  it('refuses when the principal does not own the request', async () => {
    const result = await confirmCustomerRoute({
      requestRef: 'req:1',
      revision: 3,
      routeRef,
      idempotencyKey: 'confirm:other',
      principalId: 'principal:other',
    }, basePorts())
    expect(result).toEqual({ kind: 'refused', reason: 'request_not_found' })
  })

  it('conflicts when the request revision changed before selection', async () => {
    const result = await confirmCustomerRoute({
      requestRef: 'req:1',
      revision: 2,
      routeRef,
      idempotencyKey: 'confirm:stale',
      principalId: 'principal:1',
    }, basePorts())
    expect(result).toEqual({
      kind: 'conflict',
      requestRef: 'req:1',
      reason: 'revision_changed',
    })
  })
})
