import { describe, expect, it, vi } from 'vitest'

import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDevelopmentDynamicPublishedSource,
  DevelopmentProcessInterruption,
  createInvocationApplication,
  createDynamicPublishedActionInvocationAdapter,
  type InvocationHost,
  type InvocationActor,
  type DynamicPublishedInvocationResult,
  type DevelopmentHostCommandEvent,
} from '@/modules/action-invocation'
import {
  buildDevelopmentPublishedOperationEvidence,
  createDevelopmentProviderLeaseIssuer,
} from '@/modules/capability-supply/development-published-operation-evidence'
import {
  developmentLostResponseRuntime,
  developmentSuccessRuntime,
} from '@/modules/capability-supply/development-host-scenario-runtime'
import { createInMemoryX402PaymentAttemptPort } from '../../helpers/x402-payment-attempt'
import { canonicalDigest } from '@/modules/common/canonical-digest'

describe('development invocation application observer containment', () => {
  it('records observer failure diagnostically without allowing either observer to change command truth', async () => {
    const failures: unknown[] = []
    const { host, restoreClock } = createHost(
      'standalone_external_agent',
      () => { throw new Error('telemetry_sink_unavailable') },
      'success',
      undefined,
      (failure) => {
        failures.push(failure)
        throw new Error('diagnostic_sink_unavailable')
      },
    )
    try {
      expect(await host.begin({ symbol: 'BTC' })).toMatchObject({ state: 'gathering_information' })
      expect(failures).toHaveLength(2)
      expect(failures[0]).toMatchObject({ event: { phase: 'before', command: 'begin' } })
    } finally {
      restoreClock()
    }
  })

  it.each(['request_owned_human', 'standalone_external_agent'] as const)(
    'keeps command truth independent of throwing telemetry for the %s host',
    async (hostKind) => {
      const { host, effects, restoreClock } = createHost(hostKind, () => {
        throw new Error('telemetry_sink_unavailable')
      })
      try {
        const gathering = await host.begin({ symbol: 'BTC' })
        const preparedFromAnswers = await host.answer(
          gathering.invocationRef,
          { convert: 'USD' },
          60_000,
        )
        expect('control' in preparedFromAnswers && preparedFromAnswers.control.state)
          .toBe('awaiting_authority')

        const corrected = await host.correct(
          gathering.invocationRef,
          { symbol: 'BTC' },
          60_000,
        )
        expect(corrected.kind).toBe('accepted')

        const decided = await host.decide(gathering.invocationRef, true)
        expect(decided.kind).toBe('accepted')

        const completed = await host.continue(gathering.invocationRef)
        expect(completed.kind).toBe('completed')
        expect(host.inspect(gathering.invocationRef)?.control.state).toBe('terminal')
        expect(effects).toEqual({ payment: 1, provider: 1 })

        const cancellation = await host.requestCancellation(gathering.invocationRef, `cancel:${gathering.invocationRef}:observer`)
        expect(cancellation).toMatchObject({ kind: 'refused', code: 'invalid_control_state' })
      } finally {
        restoreClock()
      }
    },
  )

  it.each(['request_owned_human', 'standalone_external_agent'] as const)(
    'does not turn a completed provider effect into failure when after-continue telemetry throws for the %s host',
    async (hostKind) => {
      const observed: DevelopmentHostCommandEvent[] = []
      const { host, effects, restoreClock } = createHost(hostKind, (event) => {
        observed.push(event)
        if (event.phase === 'after' && event.command === 'continue') {
          throw new Error('telemetry_failed_after_provider_completion')
        }
      })
      try {
        const prepared = await host.prepare({ symbol: 'BTC', convert: 'USD' }, 60_000)
        expect((await host.decide(prepared.invocationRef, true)).kind).toBe('accepted')

        await expect(host.continue(prepared.invocationRef)).resolves.toMatchObject({
          kind: 'completed',
          view: { control: { state: 'terminal' } },
        })
        expect(effects).toEqual({ payment: 1, provider: 1 })
        expect(observed.at(-1)).toMatchObject({ phase: 'after', command: 'continue' })
      } finally {
        restoreClock()
      }
    },
  )

  it.each(['request_owned_human', 'standalone_external_agent'] as const)(
    'keeps reconciliation truth independent of throwing telemetry for the %s host',
    async (hostKind) => {
      const { host, restoreClock } = createHost(hostKind, () => {
        throw new Error('telemetry_sink_unavailable')
      }, 'lost_response')
      try {
        const prepared = await host.prepare({ symbol: 'BTC', convert: 'USD' }, 60_000)
        expect((await host.decide(prepared.invocationRef, true)).kind).toBe('accepted')
        const uncertain = await host.continue(prepared.invocationRef)
        expect(uncertain).toMatchObject({
          kind: 'completed',
          view: { control: { state: 'reconciliation_required' } },
        })

        expect(await host.recover(prepared.invocationRef)).toMatchObject({
          kind: 'reconciled',
          view: { control: { state: 'terminal' } },
        })
      } finally {
        restoreClock()
      }
    },
  )

  it.each(['request_owned_human', 'standalone_external_agent'] as const)(
    'abandons a failed pre-release preparation without stranding the %s host lease',
    async (hostKind) => {
      let preparationAttempts = 0
      const { host, effects, restoreClock } = createHost(
        hostKind,
        () => undefined,
        'success',
        () => {
          preparationAttempts += 1
          if (preparationAttempts === 1) throw new Error('credential_preparation_failed')
        },
      )
      try {
        const prepared = await host.prepare({ symbol: 'BTC', convert: 'USD' }, 60_000)
        expect((await host.decide(prepared.invocationRef, true)).kind).toBe('accepted')

        await expect(host.continue(prepared.invocationRef)).resolves.toMatchObject({
          kind: 'refused',
          code: 'pre_execute_preparation_failed',
          view: { control: { state: 'retryable', reason: 'pre_release_failure' } },
        })
        expect(host.inspect(prepared.invocationRef)).toMatchObject({
          control: { state: 'retryable', reason: 'pre_release_failure' },
          attempts: [{
            release: { state: 'not_released' },
            outcome: { state: 'failed', retry: 'safe_before_release' },
          }],
        })
        expect(effects).toEqual({ payment: 0, provider: 0 })

        await expect(host.continue(prepared.invocationRef)).resolves.toMatchObject({
          kind: 'completed',
          view: { control: { state: 'terminal' } },
        })
        expect(effects).toEqual({ payment: 1, provider: 1 })
      } finally {
        restoreClock()
      }
    },
  )

  it('does not forge a not-released observation for a simulated process interruption', async () => {
    const { host, effects, restoreClock } = createHost(
      'standalone_external_agent',
      () => undefined,
      'success',
      () => {
        throw new DevelopmentProcessInterruption('simulated_process_loss')
      },
    )
    try {
      const prepared = await host.prepare({ symbol: 'BTC', convert: 'USD' }, 60_000)
      expect((await host.decide(prepared.invocationRef, true)).kind).toBe('accepted')

      await expect(host.continue(prepared.invocationRef))
        .rejects.toThrow('simulated_process_loss')
      expect(host.inspect(prepared.invocationRef)?.control.state).toBe('leased')
      expect(effects).toEqual({ payment: 0, provider: 0 })
    } finally {
      restoreClock()
    }
  })
})

function createHost(
  hostKind: 'request_owned_human' | 'standalone_external_agent',
  observer: (event: DevelopmentHostCommandEvent) => void,
  runtime: 'success' | 'lost_response' = 'success',
  beforeExecute?: () => void | Promise<void>,
  observerFailureSink?: (failure: unknown) => void,
): Readonly<{
  host: InvocationHost
  effects: { payment: number; provider: number }
  restoreClock(): void
}> {
  const fixture = buildDevelopmentPublishedOperationEvidence()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(
    fixture.operation.readiness.observedAt + 1_000,
  )
  const effects = { payment: 0, provider: 0 }
  const actor: InvocationActor = {
    callerRef: hostKind === 'request_owned_human'
      ? 'human:observer-containment'
      : 'agent:observer-containment',
    principalRef: 'principal:observer-containment',
  }
  const durableState = createDevelopmentDurableState<DynamicPublishedInvocationResult>()
  const adapter = createDynamicPublishedActionInvocationAdapter({
    operation: fixture.operation,
    issueProviderLease: createDevelopmentProviderLeaseIssuer(
      fixture.operation,
      fixture.operation.readiness.observedAt + 1_000,
    ),
    source: createDevelopmentDynamicPublishedSource([fixture.operation]),
    runtime: runtime === 'success'
      ? developmentSuccessRuntime(fixture.operation.binding.endpointUrl, effects)
      : developmentLostResponseRuntime(fixture.operation.binding.endpointUrl, effects),
    now: () => fixture.operation.readiness.observedAt + 1_000,
    nextInvocationRef: () => `host:${hostKind}:observer-containment`,
    nextAuthorityRef: () => `authority:${hostKind}:observer-containment`,
    nextAttemptRef: () => `attempt:${hostKind}:observer-containment`,
    paymentAttemptPort: createInMemoryX402PaymentAttemptPort(),
    durablePort: createDevelopmentDurablePort(durableState),
    developmentSnapshot: durableState,
  })
  const application = createInvocationApplication({
    adapter,
    observer,
    ...(observerFailureSink === undefined ? {} : { observerFailureSink }),
    sourceCommands: {
      leaseOwner: () => `worker:${hostKind}:observer-containment`,
      reconciliationEvidence: (view) => {
        if (view.control.state !== 'reconciliation_required') return undefined
        const currentAttemptRef = view.control.attemptRef
        const attempt = view.attempts.find(
          ({ attemptRef }) => attemptRef === currentAttemptRef,
        )
        if (attempt === undefined) return undefined
        const material = {
          kind: 'action_invocation_reconciliation' as const,
          version: 1 as const,
          evidenceRef: `evidence:${hostKind}:observer-containment`,
          source: `published-operation:${fixture.operation.operationId}`,
          invocationRef: view.invocationRef,
          attemptRef: attempt.attemptRef,
          effectGeneration: attempt.effectGeneration,
          resolution: 'released' as const,
          observedAt: new Date(fixture.operation.readiness.observedAt + 1_000).toISOString(),
        }
        return { ...material, digest: canonicalDigest(material) }
      },
      ...(beforeExecute === undefined ? {} : { beforeExecute }),
    },
  })
  return {
    effects,
    restoreClock: () => clock.mockRestore(),
    host: hostKind === 'request_owned_human'
      ? application.bindRequestOwned({
          actor,
          requestRef: 'request:observer-containment',
          revision: 1,
        })
      : application.bindStandalone({ actor }),
  }
}
