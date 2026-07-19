import { beforeEach, describe, expect, it, vi } from 'vitest'

const { readPublicRegistryBusinessDetail } = vi.hoisted(() => ({
  readPublicRegistryBusinessDetail: vi.fn(),
}))

vi.mock('@/modules/registry/registry.functions', () => ({
  readPublicRegistryBusinessDetail,
  readPublicRegistryCatalogPage: vi.fn(),
  readPublicRegistrySearchPage: vi.fn(),
}))

import { findAction } from '@/modules/actions'
import {
  createInMemoryActionInvocationTracer,
  type ActionInvocationOrigin,
  type InvocationActor,
} from '@/modules/action-invocation'

const actor: InvocationActor = {
  callerRef: 'mock:caller:external-agent',
  principalRef: 'mock:principal:joel',
}

const requestOrigin: ActionInvocationOrigin = {
  kind: 'request_owned',
  requestRef: 'mock:request:perth-plumber',
  revision: 3,
}

const standaloneOrigin: ActionInvocationOrigin = {
  kind: 'standalone',
  ...actor,
}

const inquiryInput = {
  target: {
    businessId: 'mock:business:plumber',
    serviceId: 'mock:service:callout',
    capabilityKind: 'quote_request' as const,
  },
  body: 'Please contact me about a leaking tap.',
  contact: { email: 'joel@example.test' },
  expectedDigest: `sha256:${'a'.repeat(64)}`,
  operationKey: 'mock:operation:inquiry:0001',
}

describe('in-memory Action Invocation tracer', () => {
  beforeEach(() => {
    readPublicRegistryBusinessDetail.mockReset()
    readPublicRegistryBusinessDetail.mockResolvedValue({
      kind: 'not_found',
      code: 'business_not_found',
      reason: 'No published business found for that slug.',
    })
  })

  it('keeps a returned not-found distinct from runner execution success', async () => {
    const action = findAction('registry.detail')!
    const tracer = createInMemoryActionInvocationTracer({
      action,
      now: () => '2026-07-19T06:00:00.000Z',
      nextInvocationRef: () => 'dev:action-invocation:read',
    })

    const view = await tracer.invoke({
      origin: standaloneOrigin,
      input: { slug: 'mock-development-listing' },
      context: {},
    })

    expect(view.observedResolution).toMatchObject({
      state: 'returned',
      execution: 'runner_returned',
      businessOutcome: 'not_found',
      result: { kind: 'not_found' },
    })
    expect(view.control).toEqual({ state: 'terminal' })
  })

  it.each([
    ['Request-owned', requestOrigin],
    ['standalone', standaloneOrigin],
  ])('prepares, exactly authorizes, and runs inquiry.submit for %s origin', async (_label, origin) => {
    const action = findAction('inquiry.submit')!
    const developmentAdapter = vi.fn().mockResolvedValue({
      kind: 'ok',
      code: 'inquiry_submitted',
      receipt: {
        threadId: 'mock:thread:0001',
        businessId: 'mock:business:plumber',
        serviceId: 'mock:service:callout',
        status: 'open',
        version: 1,
        notificationId: 'mock:notification:0001',
        notificationStatus: 'queued',
        accessKey: 'mock:access-key:development-only',
      },
    })
    const tracer = createInMemoryActionInvocationTracer({
      action,
      now: () => '2026-07-19T06:00:00.000Z',
      nextInvocationRef: () => `dev:action-invocation:${origin.kind}`,
      nextAuthorityRef: () => `opaque:authority:${origin.kind}:0001`,
    })

    const prepared = tracer.prepare({
      origin,
      actor,
      input: inquiryInput,
      context: { developmentOnlyInquirySubmitAdapter: developmentAdapter },
      freshnessMs: 60_000,
    })

    expect(developmentAdapter).not.toHaveBeenCalled()
    expect(prepared).toMatchObject({
      environment: 'MOCK/DEVELOPMENT ONLY',
      persistence: 'in_memory_only',
      action: { id: 'inquiry.submit', contractVersion: 'inquiry.submit:v1' },
      prepared: {
        target: inquiryInput.target,
        consequence: 'communication',
        freshUntil: '2026-07-19T06:01:00.000Z',
        dataUse: {
          fields: ['body', 'contact.email'],
          limits: { body: 2_000, 'contact.email': 254 },
        },
      },
      authority: { reference: `opaque:authority:${origin.kind}:0001` },
      observedResolution: { state: 'pending' },
      freshness: { state: 'not_observed' },
      control: { state: 'awaiting_authority' },
    })

    const decision = tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      accept: true,
    })
    expect(decision.kind).toBe('accepted')
    if (decision.kind !== 'accepted') throw new Error('Expected accepted authority')
    expect(decision.view.control).toEqual({
      state: 'authorized',
      decidedAt: '2026-07-19T06:00:00.000Z',
    })
    expect(developmentAdapter).not.toHaveBeenCalled()

    const executed = await tracer.execute({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decision.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      materialInput: inquiryInput,
    })
    expect(executed.kind).toBe('accepted')
    if (executed.kind !== 'accepted') throw new Error('Expected accepted execution')
    expect(developmentAdapter).toHaveBeenCalledTimes(1)
    expect(developmentAdapter).toHaveBeenCalledWith(inquiryInput)
    expect(executed.view.observedResolution).toMatchObject({
      state: 'returned',
      execution: 'runner_returned',
      businessOutcome: 'queued_communication',
      result: {
        kind: 'ok',
        receipt: { notificationStatus: 'queued' },
      },
    })
    expect(executed.view.control).toEqual({ state: 'terminal' })

    console.log(JSON.stringify({
      label: 'MOCK/DEVELOPMENT ONLY - no persistence, network send, or delivery claim',
      origin: origin.kind,
      prepared,
      authorized: decision.view,
      executed: executed.view,
    }, null, 2))
  })

  it('refuses cross-principal authority and invalidates changed material input without running', async () => {
    const action = findAction('inquiry.submit')!
    const developmentAdapter = vi.fn()
    const tracer = createInMemoryActionInvocationTracer({
      action,
      now: () => '2026-07-19T06:00:00.000Z',
      nextInvocationRef: () => 'dev:action-invocation:guard',
      nextAuthorityRef: () => 'opaque:authority:guard:0001',
    })
    const prepared = tracer.prepare({
      origin: standaloneOrigin,
      actor,
      input: inquiryInput,
      context: { developmentOnlyInquirySubmitAdapter: developmentAdapter },
      freshnessMs: 60_000,
    })

    expect(tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor: { ...actor, principalRef: 'mock:principal:someone-else' },
      origin: standaloneOrigin,
      accept: true,
    })).toMatchObject({ kind: 'refused', code: 'cross_principal_refused' })

    expect(tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin: requestOrigin,
      accept: true,
    })).toMatchObject({ kind: 'refused', code: 'cross_origin_refused' })

    const accepted = tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin: standaloneOrigin,
      accept: true,
    })
    expect(accepted.kind).toBe('accepted')
    if (accepted.kind !== 'accepted') throw new Error('Expected accepted authority')

    const changed = await tracer.execute({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin: standaloneOrigin,
      materialInput: { ...inquiryInput, body: 'A materially different request.' },
    })
    expect(changed).toMatchObject({
      kind: 'refused',
      code: 'material_input_changed',
      view: { control: { state: 'invalidated', reason: 'material_input_changed' } },
    })
    expect(developmentAdapter).not.toHaveBeenCalled()
  })
})
