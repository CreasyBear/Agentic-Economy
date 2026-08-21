import { actor, input, origins } from './durable-action-invocation-harness'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { requireDurableWriteFixtureAction } from '../../helpers/durable-write-fixture-action'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDurableActionInvocationTracer,
  readCompletedResultIdentity,
  type PreparedInvocation,
} from '@/modules/action-invocation'
import { describe, expect, it, vi } from 'vitest'

describe('durable Action Invocation cancel', () => {
  it.each(origins)('persists, cold-resumes and cancels before release for $kind', async (origin) => {
    const action = requireDurableWriteFixtureAction()
    const durableState = createDevelopmentDurableState()
    const port = createDevelopmentDurablePort(durableState)
    const source = {
      input,
      context: { developmentOnlyDurableWriteAdapter: vi.fn() },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    let invocationSequence = 0
    const create = (selectedPort = port) => createDurableActionInvocationTracer({
      action,
      port: selectedPort,
      now: () => '2026-07-19T09:00:00.000Z',
      nextInvocationRef: () => `dev:durable:${origin.kind}:${++invocationSequence}`,
      nextAuthorityRef: () => `opaque:durable:${origin.kind}`,
      nextAttemptRef: () => `dev:attempt:${origin.kind}:1`,
      resolveSourceState: () => source,
    })
    const tracer = create()
    const prepared = await tracer.prepare({
      origin,
      actor,
      input,
      context: source.context,
      freshnessMs: 60_000,
    })
    source.prepared = prepared.prepared!
    const decided = await tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = await tracer.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      materialInput: input,
      leaseOwner: 'mock:worker:one',
      leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted') throw new Error(acquired.code)
    expect(prepared.prepared?.materialInputDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(acquired.view.attempts[0]?.idempotency.effectIdentity).toMatch(/^sha256:[0-9a-f]{64}$/)
    if (acquired.view.control.state !== 'leased') throw new Error('Expected lease')
    const noRelease = await tracer.publishObservation({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
      release: 'not_released',
    })
    if (noRelease.kind !== 'accepted') throw new Error(noRelease.code)

    const freshProcess = await tracer.coldResume(prepared.invocationRef)
    expect(freshProcess.inspect(prepared.invocationRef)).toMatchObject({
      origin,
      control: { state: 'retryable', reason: 'pre_release_failure' },
    })
    const cancelled = await freshProcess.cancel({
      invocationRef: prepared.invocationRef,
      idempotencyKey: `cancel:${prepared.invocationRef}:pre-release`,
      expectedInvocationVersion: noRelease.view.invocationVersion,
      actor,
      origin,
    })
    expect(cancelled).toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'cancelled', effect: 'not_released' } },
    })

    const replayedProcess = await freshProcess.coldResume(prepared.invocationRef)
    await expect(replayedProcess.cancel({
      invocationRef: prepared.invocationRef,
      idempotencyKey: `cancel:${prepared.invocationRef}:pre-release`,
      expectedInvocationVersion: cancelled.kind === 'accepted' ? cancelled.view.invocationVersion : 0,
      actor,
      origin,
    })).resolves.toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'cancelled', effect: 'not_released' } },
    })
    await expect(replayedProcess.cancel({
      invocationRef: prepared.invocationRef,
      idempotencyKey: `cancel:${prepared.invocationRef}:different`,
      expectedInvocationVersion: cancelled.kind === 'accepted' ? cancelled.view.invocationVersion : 0,
      actor,
      origin,
    })).resolves.toMatchObject({
      kind: 'refused',
      code: 'command_identity_conflict',
      view: { control: { state: 'cancelled', effect: 'not_released' } },
    })

    const persisted = JSON.stringify({
      control: await port.readControl(prepared.invocationRef),
      attempts: await port.readAttempts(prepared.invocationRef, 10),
      history: await port.readHistory(prepared.invocationRef, 0, 20),
    })
    expect(persisted).not.toContain(input.body)
    expect(persisted).not.toContain(input.contact.email)
    expect(persisted).toContain(input.operationKey)
    for (const row of await port.readHistory(prepared.invocationRef, 0, 20)) {
      expect(row.commandDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    }
    const cancellationHistory = (await port.readHistory(prepared.invocationRef, 0, 20))
      .find((history) => history.kind === 'cancel')
    expect(cancellationHistory?.commandId).toBe(`${prepared.invocationRef}:cancel`)
    expect(cancellationHistory?.commandDigest).toBe(canonicalDigest({
      format: 'action-invocation-cancel:v1',
      invocationRef: prepared.invocationRef,
      idempotencyKey: `cancel:${prepared.invocationRef}:pre-release`,
    }))
    if (origin.kind === 'request_owned') {
      expect(await readCompletedResultIdentity(port, prepared.invocationRef, actor, () => ({})))
        .toEqual({ kind: 'refused', code: 'request_owned_refused' })
    }
  })
})
