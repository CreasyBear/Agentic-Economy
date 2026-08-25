import { actor, input, origins } from './durable-action-invocation-harness'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { requireDurableWriteFixtureAction } from '../../helpers/durable-write-fixture-action'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDurableActionInvocationTracer,
  type PreparedInvocation,
} from '@/modules/action-invocation'
import { describe, expect, it, vi } from 'vitest'

describe('durable Action Invocation release', () => {
  it('fences the sync release transaction to the stale worker token and rehydrates the winner', async () => {
    const origin = origins[1]!
    const action = requireDurableWriteFixtureAction()
    const state = createDevelopmentDurableState()
    const base = createDevelopmentDurablePort(state)
    const adapter = vi.fn()
    const racingPort = {
      ...base,
      async transact(command: Parameters<typeof base.transact>[0]) {
        if (command.history.kind === 'begin_release') {
          const current = await base.readControl(command.row.invocationRef)
          if (current === undefined) throw new Error('Missing sync race row.')
          const winnerVersion = current.invocationVersion + 1
          const winnerDigest = canonicalDigest({ winner: command.commandDigest })
          expect(await base.transact({
            ...command,
            commandId: `${command.commandId}:sync-winner`,
            commandDigest: winnerDigest,
            expectedInvocationVersion: current.invocationVersion,
            ...(current.currentEffectGeneration === undefined ? {} : {
              expectedEffectGeneration: current.currentEffectGeneration,
            }),
            row: {
              ...current,
              invocationVersion: winnerVersion,
              control: {
                ...current.control,
                invocationVersion: winnerVersion,
                control: { state: 'cancelled', effect: 'not_released' },
              },
              updatedAt: '2026-07-19T12:40:00.000Z',
            },
            history: {
              invocationRef: command.row.invocationRef,
              commandId: `${command.commandId}:sync-winner`,
              commandDigest: winnerDigest,
              commandResult: 'applied',
              kind: 'forced_sync_cas_winner',
            },
          })).toMatchObject({ kind: 'applied' })
        }
        return base.transact(command)
      },
    }
    const source = {
      input,
      context: { developmentOnlyDurableWriteAdapter: adapter },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const tracer = createDurableActionInvocationTracer({
      action, port: racingPort,
      now: () => '2026-07-19T12:40:00.000Z',
      nextInvocationRef: () => 'dev:durable:sync-cas-race',
      nextAuthorityRef: () => 'opaque:durable:sync-cas-race',
      nextAttemptRef: () => 'dev:attempt:sync-cas-race',
      resolveSourceState: () => source,
    })
    const prepared = await tracer.prepare({
      origin, actor, input, context: source.context, freshnessMs: 300_000,
    })
    source.prepared = prepared.prepared!
    const decided = await tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = await tracer.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, materialInput: input,
      leaseOwner: 'mock:sync:cas-loser',
      leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
      throw new Error('Expected sync race lease.')
    }
    const refused = await tracer.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    expect(refused).toMatchObject({
      kind: 'refused',
      code: 'stale_invocation_version',
      view: { control: { state: 'cancelled', effect: 'not_released' } },
    })
    expect(adapter).not.toHaveBeenCalled()
    expect(tracer.inspect(prepared.invocationRef)).toEqual(refused.view)
  })

  it.each(origins)('persists pre-release refusal without inventing a begin_release version for $kind', async (origin) => {
    const baseAction = requireDurableWriteFixtureAction()
    const runner = vi.fn()
    const action = {
      ...baseAction,
      preReleaseCheck: vi.fn().mockResolvedValue({
        kind: 'error' as const,
        code: 'mock_pre_release_refusal',
        retryable: false,
        reason: 'MOCK refusal before release',
      }),
      run: runner,
    }
    const state = createDevelopmentDurableState()
    const source = {
      input, context: {},
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const tracer = createDurableActionInvocationTracer({
      action,
      port: createDevelopmentDurablePort(state),
      now: () => '2026-07-19T12:45:00.000Z',
      nextInvocationRef: () => `dev:durable:pre-release-refusal:${origin.kind}`,
      nextAuthorityRef: () => `opaque:durable:pre-release-refusal:${origin.kind}`,
      nextAttemptRef: () => `dev:attempt:pre-release-refusal:${origin.kind}`,
      resolveSourceState: () => source,
    })
    const prepared = await tracer.prepare({
      origin, actor, input, context: source.context, freshnessMs: 300_000,
    })
    source.prepared = prepared.prepared!
    const decided = await tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const refused = await tracer.execute({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, materialInput: input,
    })
    expect(refused).toMatchObject({
      kind: 'accepted',
      view: {
        observedResolution: { execution: 'pre_release_refused' },
        control: { state: 'terminal' },
      },
    })
    expect(runner).not.toHaveBeenCalled()
    const cold = await createDurableActionInvocationTracer({
      action,
      port: createDevelopmentDurablePort(state),
      now: () => '2026-07-19T12:45:00.000Z',
      nextInvocationRef: () => 'unused',
      resolveSourceState: () => source,
    }).coldResume(prepared.invocationRef)
    expect(cold.inspect(prepared.invocationRef)).toMatchObject({
      control: { state: 'terminal' },
      attempts: [{ release: { state: 'not_released' } }],
    })
    expect((await createDevelopmentDurablePort(state).readHistory(prepared.invocationRef, 0, 20))
      .map(({ kind }) => kind)).not.toContain('begin_release')
  })

  it.each(origins)('persists the release fence before running and rejects late completion for $kind', async (origin) => {
    let resolveRunner!: (value: { kind: 'error'; code: string; retryable: false; reason: string }) => void
    const runner = new Promise<{ kind: 'error'; code: string; retryable: false; reason: string }>(
      (resolve) => { resolveRunner = resolve },
    )
    const action = requireDurableWriteFixtureAction()
    const state = createDevelopmentDurableState()
    const source = {
      input,
      context: { developmentOnlyDurableWriteAdapter: vi.fn(() => runner) },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const create = () => createDurableActionInvocationTracer({
      action,
      port: createDevelopmentDurablePort(state),
      now: () => '2026-07-19T11:30:00.000Z',
      nextInvocationRef: () => `dev:durable:release-fence:${origin.kind}`,
      nextAuthorityRef: () => `opaque:durable:release-fence:${origin.kind}`,
      nextAttemptRef: () => `dev:attempt:release-fence:${origin.kind}`,
      resolveSourceState: () => source,
    })
    const tracer = create()
    const prepared = await tracer.prepare({
      origin, actor, input, context: source.context, freshnessMs: 300_000,
    })
    source.prepared = prepared.prepared!
    const decided = await tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = await tracer.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, materialInput: input,
      leaseOwner: 'mock:worker:release-fence',
      leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
      throw new Error('Expected release-fence lease.')
    }
    const pending = tracer.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    await vi.waitFor(() => expect(source.context.developmentOnlyDurableWriteAdapter).toHaveBeenCalledTimes(1))
    const cold = await tracer.coldResume(prepared.invocationRef)
    const releaseStarted = cold.inspect(prepared.invocationRef)
    expect(releaseStarted).toMatchObject({
      control: { state: 'leased', release: 'possibly_released' },
    })
    if (releaseStarted === undefined) throw new Error('Expected persisted release fence.')
    const cancelled = await cold.cancel({
      invocationRef: prepared.invocationRef,
      idempotencyKey: `cancel:${prepared.invocationRef}:release-fence`,
      expectedInvocationVersion: releaseStarted.invocationVersion,
      actor, origin,
    })
    resolveRunner({
      kind: 'error',
      code: 'mock_late_completion',
      retryable: false,
      reason: 'MOCK late completion after cancellation',
    })
    await expect(pending).resolves.toMatchObject({
      kind: 'refused',
      code: 'stale_invocation_version',
      view: { control: { state: 'reconciliation_required' } },
    })
    expect((await tracer.coldResume(prepared.invocationRef)).inspect(prepared.invocationRef)?.control)
      .toEqual(cancelled.kind === 'accepted' ? cancelled.view.control : undefined)
  })

  it('never persists raw adapter failure text', async () => {
    const secretFailure = `${input.body} ${input.contact.email} accessKey=SECRET-FAILURE-KEY`
    const action = requireDurableWriteFixtureAction()
    const port = createDevelopmentDurablePort()
    const source = {
      input,
      context: {
        developmentOnlyDurableWriteAdapter: vi.fn().mockRejectedValue(new Error(secretFailure)),
      },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const tracer = createDurableActionInvocationTracer({
      action, port,
      now: () => '2026-07-19T10:30:00.000Z',
      nextInvocationRef: () => 'dev:durable:secret-failure',
      nextAuthorityRef: () => 'opaque:durable:secret-failure',
      nextAttemptRef: () => 'dev:attempt:secret-failure',
      resolveSourceState: () => source,
    })
    const prepared = await tracer.prepare({
      origin: origins[1]!, actor, input, context: source.context, freshnessMs: 60_000,
    })
    source.prepared = prepared.prepared!
    const decided = await tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin: origins[1]!, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const failed = await tracer.execute({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin: origins[1]!, materialInput: input,
    })
    expect(failed).toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'reconciliation_required' } },
    })
    const persisted = JSON.stringify({
      control: await port.readControl(prepared.invocationRef),
      attempts: await port.readAttempts(prepared.invocationRef, 10),
      history: await port.readHistory(prepared.invocationRef, 0, 20),
    })
    expect(persisted).not.toContain(input.body)
    expect(persisted).not.toContain(input.contact.email)
    expect(persisted).not.toContain('SECRET-FAILURE-KEY')
    expect(persisted).not.toContain(secretFailure)
  })
})
