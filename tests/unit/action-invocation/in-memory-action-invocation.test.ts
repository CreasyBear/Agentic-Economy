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
  createDevelopmentReleaseSignal,
  createInMemoryActionInvocationTracer,
  roundTripControlSnapshot,
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

  it.each([
    ['Request-owned', requestOrigin],
    ['standalone', standaloneOrigin],
  ])('records attributable pre-release retry and post-release uncertainty for %s origin', async (_label, origin) => {
    const action = findAction('inquiry.submit')!
    const release = createDevelopmentReleaseSignal()
    const developmentAdapter = vi.fn()
      .mockRejectedValueOnce(new Error('MOCK pre-release connection refusal'))
      .mockImplementationOnce(async () => {
        release.markReleased()
        throw new Error('MOCK response lost after possible release')
      })
    const tracer = createInMemoryActionInvocationTracer({
      action,
      now: () => '2026-07-19T07:00:00.000Z',
      nextInvocationRef: () => `dev:action-invocation:attempts:${origin.kind}`,
      nextAuthorityRef: () => `opaque:authority:attempts:${origin.kind}`,
      nextAttemptRef: (() => {
        let sequence = 0
        return () => `dev:attempt:${origin.kind}:${++sequence}`
      })(),
      developmentReleaseSignal: release,
    })
    const prepared = tracer.prepare({
      origin,
      actor,
      input: inquiryInput,
      context: { developmentOnlyInquirySubmitAdapter: developmentAdapter },
      freshnessMs: 60_000,
    })
    const decision = tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      accept: true,
    })
    if (decision.kind !== 'accepted') throw new Error('Expected accepted authority')

    const preRelease = await tracer.execute({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decision.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      materialInput: inquiryInput,
    })
    if (preRelease.kind !== 'accepted') throw new Error('Expected attributable failed attempt')
    expect(preRelease.view).toMatchObject({
      control: { state: 'retryable', reason: 'pre_release_failure' },
      attempts: [{
        attemptRef: `dev:attempt:${origin.kind}:1`,
        attemptNumber: 1,
        actor,
        idempotency: {
          operationKey: inquiryInput.operationKey,
          materialInputDigest: preRelease.view.prepared!.materialInputDigest,
          effectIdentity: expect.any(String),
        },
        release: { state: 'not_released' },
        outcome: { state: 'failed', retry: 'safe_before_release' },
      }],
    })

    const uncertain = await tracer.execute({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: preRelease.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      materialInput: inquiryInput,
    })
    if (uncertain.kind !== 'accepted') throw new Error('Expected attributable uncertain attempt')
    expect(uncertain.view).toMatchObject({
      control: {
        state: 'reconciliation_required',
        attemptRef: `dev:attempt:${origin.kind}:2`,
      },
      attempts: [
        { attemptRef: `dev:attempt:${origin.kind}:1`, release: { state: 'not_released' } },
        {
          attemptRef: `dev:attempt:${origin.kind}:2`,
          attemptNumber: 2,
          release: { state: 'possibly_released' },
          outcome: { state: 'uncertain', retry: 'reconcile_before_retry' },
        },
      ],
    })

    const refusedReplay = await tracer.execute({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: uncertain.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      materialInput: inquiryInput,
    })
    expect(refusedReplay).toMatchObject({
      kind: 'refused',
      code: 'reconciliation_required',
    })
    expect(developmentAdapter).toHaveBeenCalledTimes(2)
    const reconciled = tracer.reconcile({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: uncertain.view.invocationVersion,
      attemptRef: `dev:attempt:${origin.kind}:2`,
      actor,
      origin,
      resolution: 'released',
    })
    expect(reconciled).toMatchObject({
      kind: 'accepted',
      view: {
        control: { state: 'terminal' },
        attempts: [
          {},
          {
            release: { state: 'released', observedAt: '2026-07-19T07:00:00.000Z' },
            outcome: {
              state: 'reconciled_released',
              externalOutcome: 'unknown',
              observedAt: '2026-07-19T07:00:00.000Z',
            },
          },
        ],
      },
    })

    console.log(JSON.stringify({
      label: 'MOCK/DEVELOPMENT ONLY - in-memory attempt and uncertainty transitions',
      origin: origin.kind,
      preRelease: preRelease.view,
      postRelease: uncertain.view,
      refusedReplay,
      reconciled,
    }, null, 2))
  })

  it('fails closed when no release observer can prove a runner throw happened before release', async () => {
    const action = findAction('inquiry.submit')!
    const developmentAdapter = vi.fn().mockRejectedValue(new Error('MOCK unobserved interruption'))
    const tracer = createInMemoryActionInvocationTracer({
      action,
      now: () => '2026-07-19T08:00:00.000Z',
      nextInvocationRef: () => 'dev:action-invocation:missing-observer',
      nextAuthorityRef: () => 'opaque:authority:missing-observer',
      nextAttemptRef: () => 'dev:attempt:missing-observer:1',
    })
    const prepared = tracer.prepare({
      origin: standaloneOrigin,
      actor,
      input: inquiryInput,
      context: { developmentOnlyInquirySubmitAdapter: developmentAdapter },
      freshnessMs: 60_000,
    })
    const decision = tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin: standaloneOrigin,
      accept: true,
    })
    if (decision.kind !== 'accepted') throw new Error('Expected accepted authority')
    const uncertain = await tracer.execute({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decision.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin: standaloneOrigin,
      materialInput: inquiryInput,
    })
    expect(uncertain).toMatchObject({
      kind: 'accepted',
      view: {
        control: { state: 'reconciliation_required', attemptRef: 'dev:attempt:missing-observer:1' },
        attempts: [{
          release: { state: 'possibly_released' },
          outcome: { state: 'uncertain', retry: 'reconcile_before_retry' },
        }],
      },
    })
    if (uncertain.kind !== 'accepted') throw new Error('Expected uncertain attempt')
    expect(tracer.reconcile({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: uncertain.view.invocationVersion,
      attemptRef: 'dev:attempt:missing-observer:1',
      actor,
      origin: standaloneOrigin,
      resolution: 'not_released',
    })).toMatchObject({
      kind: 'accepted',
      view: {
        control: { state: 'retryable', reason: 'pre_release_failure' },
        attempts: [{
          release: { state: 'not_released' },
          outcome: {
            state: 'reconciled_not_released',
            retry: 'safe_after_reconciliation',
            observedAt: '2026-07-19T08:00:00.000Z',
          },
        }],
      },
    })
  })

  it.each([
    ['Request-owned', requestOrigin],
    ['standalone', standaloneOrigin],
  ])('fences takeover, cancellation, late observation, and restart for %s origin', async (_label, origin) => {
    let now = '2026-07-19T09:00:00.000Z'
    let attempt = 0
    const developmentAdapter = vi.fn().mockResolvedValue({ kind: 'error', code: 'mock', retryable: false, reason: 'mock' })
    const options = {
      action: findAction('inquiry.submit')!,
      now: () => now,
      nextInvocationRef: () => `dev:action-invocation:fence:${origin.kind}`,
      nextAuthorityRef: () => `opaque:authority:fence:${origin.kind}`,
      nextAttemptRef: () => `dev:attempt:fence:${origin.kind}:${++attempt}`,
    }
    const tracer = createInMemoryActionInvocationTracer(options)
    const prepared = tracer.prepare({
      origin,
      actor,
      input: inquiryInput,
      context: { developmentOnlyInquirySubmitAdapter: developmentAdapter },
      freshnessMs: 300_000,
    })
    const authority = tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      accept: true,
    })
    if (authority.kind !== 'accepted') throw new Error('Expected accepted authority')

    const first = tracer.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: authority.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      materialInput: inquiryInput,
      leaseOwner: 'mock:worker:one',
      leaseMs: 1_000,
    })
    if (first.kind !== 'accepted' || first.view.control.state !== 'leased') {
      throw new Error('Expected first lease')
    }
    const firstToken = {
      attemptRef: first.view.control.attemptRef,
      leaseOwner: first.view.control.leaseOwner,
      effectGeneration: first.view.control.effectGeneration,
    }
    expect(tracer.publishObservation({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: first.view.invocationVersion - 1,
      ...firstToken,
      release: 'released',
    })).toMatchObject({ kind: 'refused', code: 'stale_invocation_version' })

    await expect(tracer.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: first.view.invocationVersion - 1,
      ...firstToken,
    })).resolves.toMatchObject({ kind: 'refused', code: 'stale_invocation_version' })
    expect(developmentAdapter).not.toHaveBeenCalled()

    const provenNotReleased = tracer.publishObservation({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: first.view.invocationVersion,
      ...firstToken,
      release: 'not_released',
    })
    if (provenNotReleased.kind !== 'accepted') throw new Error('Expected proven non-release')
    now = '2026-07-19T09:00:02.000Z'
    const takeover = tracer.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: provenNotReleased.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      materialInput: inquiryInput,
      leaseOwner: 'mock:worker:two',
      leaseMs: 1_000,
    })
    if (takeover.kind !== 'accepted' || takeover.view.control.state !== 'leased') {
      throw new Error('Expected takeover lease')
    }
    expect(takeover.view.control.effectGeneration).toBe(2)
    expect(tracer.publishObservation({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: takeover.view.invocationVersion,
      ...firstToken,
      release: 'released',
    })).toMatchObject({ kind: 'refused', code: 'effect_generation_stale' })
    expect(tracer.inspect(prepared.invocationRef)).toEqual(takeover.view)

    const snapshot = roundTripControlSnapshot(tracer.exportSnapshot())
    expect(JSON.stringify(snapshot)).not.toContain(inquiryInput.body)
    expect(JSON.stringify(snapshot)).not.toContain(inquiryInput.contact.email)
    const restored = createInMemoryActionInvocationTracer({
      ...options,
      initialSnapshot: snapshot,
      resolveSourceState: () => ({
        input: inquiryInput,
        context: { developmentOnlyInquirySubmitAdapter: developmentAdapter },
        prepared: takeover.view.prepared!,
        observedResolution: takeover.view.observedResolution,
      }),
    })
    expect(restored.inspect(prepared.invocationRef)).toEqual(takeover.view)

    const possibleRelease = restored.publishObservation({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: takeover.view.invocationVersion,
      attemptRef: takeover.view.control.attemptRef,
      leaseOwner: takeover.view.control.leaseOwner,
      effectGeneration: takeover.view.control.effectGeneration,
      release: 'possibly_released',
    })
    if (possibleRelease.kind !== 'accepted') throw new Error('Expected uncertain observation')
    const cancelAfterRelease = restored.cancel({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: possibleRelease.view.invocationVersion,
      actor,
      origin,
    })
    expect(cancelAfterRelease).toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'reconciliation_required' } },
    })

    const unknownTracer = createInMemoryActionInvocationTracer({
      ...options,
      nextInvocationRef: () => `dev:action-invocation:unknown:${origin.kind}`,
    })
    const unknownPrepared = unknownTracer.prepare({
      origin,
      actor,
      input: inquiryInput,
      context: {},
      freshnessMs: 300_000,
    })
    const unknownAuthority = unknownTracer.decide({
      invocationRef: unknownPrepared.invocationRef,
      expectedInvocationVersion: unknownPrepared.invocationVersion,
      authorityRef: unknownPrepared.authority!.reference,
      actor,
      origin,
      accept: true,
    })
    if (unknownAuthority.kind !== 'accepted') throw new Error('Expected accepted authority')
    const unknownLease = unknownTracer.acquire({
      invocationRef: unknownPrepared.invocationRef,
      expectedInvocationVersion: unknownAuthority.view.invocationVersion,
      authorityRef: unknownPrepared.authority!.reference,
      actor,
      origin,
      materialInput: inquiryInput,
      leaseOwner: 'mock:worker:unknown',
      leaseMs: 1,
    })
    if (unknownLease.kind !== 'accepted') throw new Error('Expected unknown lease')
    now = '2026-07-19T09:00:03.000Z'
    expect(unknownTracer.acquire({
      invocationRef: unknownPrepared.invocationRef,
      expectedInvocationVersion: unknownLease.view.invocationVersion,
      authorityRef: unknownPrepared.authority!.reference,
      actor,
      origin,
      materialInput: inquiryInput,
      leaseOwner: 'mock:worker:takeover-refused',
      leaseMs: 1_000,
    })).toMatchObject({
      kind: 'refused',
      code: 'reconciliation_required',
      view: { control: { state: 'reconciliation_required' } },
    })

    const cancellationTracer = createInMemoryActionInvocationTracer({
      ...options,
      nextInvocationRef: () => `dev:action-invocation:cancel:${origin.kind}`,
    })
    const cancelPrepared = cancellationTracer.prepare({
      origin,
      actor,
      input: inquiryInput,
      context: {},
      freshnessMs: 300_000,
    })
    const cancelAuthority = cancellationTracer.decide({
      invocationRef: cancelPrepared.invocationRef,
      expectedInvocationVersion: cancelPrepared.invocationVersion,
      authorityRef: cancelPrepared.authority!.reference,
      actor,
      origin,
      accept: true,
    })
    if (cancelAuthority.kind !== 'accepted') throw new Error('Expected accepted authority')
    expect(cancellationTracer.cancel({
      invocationRef: cancelPrepared.invocationRef,
      expectedInvocationVersion: cancelAuthority.view.invocationVersion,
      actor,
      origin,
    })).toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'cancelled', effect: 'not_released' }, attempts: [] },
    })

    console.log(JSON.stringify({
      label: 'MOCK/DEVELOPMENT ONLY - lease fencing, cancellation, and JSON snapshot reconstruction',
      origin: origin.kind,
      takeover: takeover.view.control,
      staleObservation: 'refused',
      restoredByteEquivalent: true,
      cancellationBeforeRelease: 'cancelled_no_effect',
      cancellationAfterPossibleRelease: 'reconciliation_required',
    }, null, 2))
  })

  it('refuses a runner completion that arrives after cancellation advanced control', async () => {
    let resolveRunner!: (result: {
      kind: 'error'
      code: string
      retryable: boolean
      reason: string
    }) => void
    const pendingRunner = new Promise<{
      kind: 'error'
      code: string
      retryable: boolean
      reason: string
    }>((resolve) => { resolveRunner = resolve })
    const developmentAdapter = vi.fn(() => pendingRunner)
    const tracer = createInMemoryActionInvocationTracer({
      action: findAction('inquiry.submit')!,
      now: () => '2026-07-19T10:00:00.000Z',
      nextInvocationRef: () => 'dev:action-invocation:late-completion',
      nextAuthorityRef: () => 'opaque:authority:late-completion',
      nextAttemptRef: () => 'dev:attempt:late-completion:1',
    })
    const prepared = tracer.prepare({
      origin: standaloneOrigin,
      actor,
      input: inquiryInput,
      context: { developmentOnlyInquirySubmitAdapter: developmentAdapter },
      freshnessMs: 60_000,
    })
    const authority = tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin: standaloneOrigin,
      accept: true,
    })
    if (authority.kind !== 'accepted') throw new Error('Expected accepted authority')
    const acquired = tracer.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: authority.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin: standaloneOrigin,
      materialInput: inquiryInput,
      leaseOwner: 'mock:worker:pending',
      leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
      throw new Error('Expected acquired attempt')
    }
    const pendingCompletion = tracer.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    expect(developmentAdapter).toHaveBeenCalledTimes(1)
    const releaseStarted = tracer.inspect(prepared.invocationRef)!
    expect(releaseStarted.control).toMatchObject({
      state: 'leased',
      release: 'possibly_released',
    })
    const cancelled = tracer.cancel({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: releaseStarted.invocationVersion,
      actor,
      origin: standaloneOrigin,
    })
    expect(cancelled).toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'reconciliation_required' } },
    })
    resolveRunner({
      kind: 'error',
      code: 'mock_late_return',
      retryable: false,
      reason: 'MOCK late runner result',
    })
    await expect(pendingCompletion).resolves.toMatchObject({
      kind: 'refused',
      code: 'stale_invocation_version',
      view: { control: { state: 'reconciliation_required' } },
    })
    expect(tracer.inspect(prepared.invocationRef)).toEqual(
      cancelled.kind === 'accepted' ? cancelled.view : undefined,
    )
  })
})
