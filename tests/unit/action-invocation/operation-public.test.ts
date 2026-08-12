import { describe, expect, it, vi } from 'vitest'

import {
  readAgentUsage,
  readPublicInvocationStatus,
} from '@/modules/action-invocation'
import type { ActionResult } from '@/modules/common/action'
import type {
  DurableActionInvocationPort,
  DurableAttemptRow,
  DurableControlRow,
  DurableHistoryRow,
} from '@/modules/action-invocation/internal/durable-contracts'
import type { KeyUsageView, MoneyQueryPort } from '@/modules/money/public'

const actor = { callerRef: 'caller:one', principalRef: 'principal:one' } as const
const otherActor = { callerRef: 'caller:two', principalRef: 'principal:two' } as const

type Result = ActionResult

const attempt: DurableAttemptRow = {
  invocationRef: 'invocation:one',
  attemptRef: 'attempt:one',
  attemptNumber: 1,
  actor,
  effectGeneration: 1,
  lease: { owner: 'lease:one', expiresAt: '2026-08-09T01:00:00.000Z' },
  idempotency: { operationKey: 'operation-key:one', materialInputDigest: 'digest:input', effectIdentity: 'effect:one' },
  release: { state: 'released', observedAt: '2026-08-09T00:00:00.000Z' },
  outcome: { state: 'returned', businessOutcome: 'completed' },
  recordedAt: '2026-08-09T00:00:00.000Z',
}

const history: DurableHistoryRow = {
  invocationRef: 'invocation:one',
  commandId: 'command:one',
  commandDigest: 'digest:command',
  commandResult: 'applied',
  invocationVersion: 2,
  kind: 'terminal',
  current: true,
  recordedAt: '2026-08-09T00:00:00.000Z',
}

const row: DurableControlRow<Result> = {
  invocationRef: 'invocation:one',
  invocationVersion: 2,
  sourceRef: 'source:private',
  control: {
    invocationRef: 'invocation:one',
    invocationVersion: 2,
    origin: { kind: 'standalone', callerRef: actor.callerRef, principalRef: actor.principalRef },
    owner: actor,
    action: { id: 'operation.invoke', contractVersion: 'operation.invoke:v1' },
    desired: { state: 'invoke' },
    acceptedAuthority: {
      kind: 'public_capability_use',
      publicationRef: 'publication:one',
      publicationRevision: 3,
      operationRef: 'operation:one',
      bindingId: 'binding:one',
      bindingRegistrationHash: 'digest:binding',
    },
    freshness: { state: 'current', observedAt: '2026-08-09T00:00:00.000Z' },
    control: { state: 'terminal' },
  },
  updatedAt: '2026-08-09T00:00:00.000Z',
}

function durablePort(control: DurableControlRow<Result> = row): DurableActionInvocationPort<Result> {
  return {
    transact: async () => ({ kind: 'applied', invocationVersion: control.invocationVersion }),
    readControl: async () => control,
    readAttempts: async () => [attempt],
    readAttempt: async () => attempt,
    readHistory: async () => [history],
    readHistoryCommand: async () => history,
    recordLateObservation: async () => ({ kind: 'applied', invocationVersion: control.invocationVersion }),
  }
}

describe('public invocation projections', () => {
  it('authorizes durable status before projecting bounded attempts/history', async () => {
    const result = await readPublicInvocationStatus({
      port: durablePort(),
      invocationRef: 'invocation:one',
      actor,
    })

    expect(result).toMatchObject({
      kind: 'ok',
      invocationRef: 'invocation:one',
      operationRef: 'operation:one',
      control: 'terminal',
      attempts: [{ attemptRef: 'attempt:one', release: 'released', outcome: 'returned' }],
      history: [{ commandId: 'command:one', kind: 'terminal' }],
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('source:private')
    expect(serialized).not.toContain('digest:input')
  })

  it('refuses a cross-principal durable read before loading attempts or history', async () => {
    const readAttempts = vi.fn(async () => [attempt])
    const readHistory = vi.fn(async () => [history])
    const port = { ...durablePort(), readAttempts, readHistory }
    const result = await readPublicInvocationStatus({
      port,
      invocationRef: 'invocation:one',
      actor: otherActor,
    })

    expect(result).toEqual({ kind: 'refused', code: 'cross_principal_refused' })
    expect(readAttempts).not.toHaveBeenCalled()
    expect(readHistory).not.toHaveBeenCalled()
  })

  it('delegates usage to the canonical money query port', async () => {
    const usage: KeyUsageView = {
      credentialId: 'credential:one',
      callCount: 2,
      paidCallCount: 1,
      freeCallCount: 1,
      grossSpend: { currency: 'USD', units: '1.00', exponent: 2 },
      states: ['paid', 'free_tier'],
    }
    const readKeyUsageQuery = vi.fn(async () => usage)
    const port: MoneyQueryPort = {
      readCreditAccount: async () => { throw new Error('unused') },
      listCreditActivity: async () => { throw new Error('unused') },
      readKeyUsage: readKeyUsageQuery,
      readProviderEarnings: async () => { throw new Error('unused') },
      readPayoutStatus: async () => { throw new Error('unused') },
    }

    await expect(readAgentUsage({
      port,
      principalId: 'principal:one',
      credentialId: 'credential:one',
      currency: 'USD',
    })).resolves.toEqual(usage)
    expect(readKeyUsageQuery).toHaveBeenCalledWith({ principalId: 'principal:one', credentialId: 'credential:one', currency: 'USD' })
  })
})
