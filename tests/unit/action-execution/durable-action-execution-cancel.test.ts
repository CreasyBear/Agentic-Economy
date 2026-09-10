import { actor, input, origins } from './durable-action-execution-harness'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { requireDurableWriteFixtureAction } from '../../helpers/durable-write-fixture-action'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDurableActionExecutionTracer,
  readCompletedResultIdentity,
  type PreparedExecution,
} from '@/modules/action-execution/runtime'
import { describe, expect, it, vi } from 'vitest'

const cancellationDigestByOrigin = {
  request_owned: 'sha256:09ba17db947c1214c75f8640a84b34f8abb349a1eed3dd1d76f3490ead70850f',
  standalone: 'sha256:7ba3abd910f196cc348d2640480f31ca8ece24c4201a0044c42b57b74394762d',
} as const

describe('durable Action Execution cancel', () => {
  it.each(origins)('persists, cold-resumes and cancels before release for $kind', async (origin) => {
    const action = requireDurableWriteFixtureAction()
    const durableState = createDevelopmentDurableState()
    const port = createDevelopmentDurablePort(durableState)
    const source = {
      input,
      context: { developmentOnlyDurableWriteAdapter: vi.fn() },
      prepared: undefined as PreparedExecution | undefined,
      observedResolution: { state: 'pending' as const },
    }
    let executionSequence = 0
    const create = (selectedPort = port) => createDurableActionExecutionTracer({
      action,
      port: selectedPort,
      now: () => '2026-07-19T09:00:00.000Z',
      nextExecutionRef: () => `dev:durable:${origin.kind}:${++executionSequence}`,
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
      executionRef: prepared.executionRef,
      expectedExecutionVersion: prepared.executionVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = await tracer.acquire({
      executionRef: prepared.executionRef,
      expectedExecutionVersion: decided.view.executionVersion,
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
      executionRef: prepared.executionRef,
      expectedExecutionVersion: acquired.view.executionVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
      release: 'not_released',
    })
    if (noRelease.kind !== 'accepted') throw new Error(noRelease.code)

    const freshProcess = await tracer.coldResume(prepared.executionRef)
    expect(freshProcess.inspect(prepared.executionRef)).toMatchObject({
      origin,
      control: { state: 'retryable', reason: 'pre_release_failure' },
    })
    const cancelled = await freshProcess.cancel({
      executionRef: prepared.executionRef,
      idempotencyKey: `cancel:${prepared.executionRef}:pre-release`,
      expectedExecutionVersion: noRelease.view.executionVersion,
      actor,
      origin,
    })
    expect(cancelled).toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'cancelled', effect: 'not_released' } },
    })

    const replayedProcess = await freshProcess.coldResume(prepared.executionRef)
    await expect(replayedProcess.cancel({
      executionRef: prepared.executionRef,
      idempotencyKey: `cancel:${prepared.executionRef}:pre-release`,
      expectedExecutionVersion: cancelled.kind === 'accepted' ? cancelled.view.executionVersion : 0,
      actor,
      origin,
    })).resolves.toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'cancelled', effect: 'not_released' } },
    })
    await expect(replayedProcess.cancel({
      executionRef: prepared.executionRef,
      idempotencyKey: `cancel:${prepared.executionRef}:different`,
      expectedExecutionVersion: cancelled.kind === 'accepted' ? cancelled.view.executionVersion : 0,
      actor,
      origin,
    })).resolves.toMatchObject({
      kind: 'refused',
      code: 'command_identity_conflict',
      view: { control: { state: 'cancelled', effect: 'not_released' } },
    })

    const persisted = JSON.stringify({
      control: await port.readControl(prepared.executionRef),
      attempts: await port.readAttempts(prepared.executionRef, 10),
      history: await port.readHistory(prepared.executionRef, 0, 20),
    })
    expect(persisted).not.toContain(input.body)
    expect(persisted).not.toContain(input.contact.email)
    expect(persisted).toContain(input.operationKey)
    for (const row of await port.readHistory(prepared.executionRef, 0, 20)) {
      expect(row.commandDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    }
    const cancellationHistory = (await port.readHistory(prepared.executionRef, 0, 20))
      .find((history) => history.kind === 'cancel')
    expect(cancellationHistory?.commandId).toBe(`${prepared.executionRef}:cancel`)
    expect(cancellationHistory?.commandDigest).toBe(canonicalDigest({
      format: 'action-invocation-cancel:v1',
      invocationRef: prepared.executionRef,
      idempotencyKey: `cancel:${prepared.executionRef}:pre-release`,
    }))
    expect(cancellationHistory?.commandDigest).toBe(cancellationDigestByOrigin[origin.kind])
    if (origin.kind === 'request_owned') {
      expect(await readCompletedResultIdentity(port, prepared.executionRef, actor, () => ({})))
        .toEqual({ kind: 'refused', code: 'request_owned_refused' })
    }
  })
})
