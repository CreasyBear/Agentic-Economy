import { describe, expect, it, vi } from 'vitest'

const sourceMocks = vi.hoisted(() => ({
  createAuthenticatedSourceTransport: vi.fn(),
  sourceMutation: vi.fn((name: string) => ({ name })),
  sourceQuery: vi.fn((name: string) => ({ name })),
}))

vi.mock('@/lib/server/convex-source', () => sourceMocks)

import { transactSource } from '../../../convex/actionInvocationControl'
import {
  createConvexActionInvocationDurablePort,
} from '@/modules/action-invocation/convex-durable-port'
import type {
  DurableAttemptRow,
  DurableControlRow,
  DurableHistoryRow,
} from '@/modules/action-invocation/internal/durable-contracts'
import {
  createSourceWriteAdmission,
  sourceWriteBodyDigest,
  sourceWriteCommandDigest,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'
import type { ConvexSourceTransport } from '@/lib/server/convex-source'

const env = { AE_SOURCE_WRITE_SECRET: 'test-source-write-secret-that-is-long-enough' }
const request: SourceWriteAdmissionRequest = {
  method: 'POST',
  initiatorOrigin: 'https://app.example.test',
  targetOrigin: 'https://app.example.test',
  targetPath: '/internal/action-invocation',
  targetQuery: '',
  bodyDigest: sourceWriteBodyDigest('durable-port-request'),
}
const owner = { callerRef: 'caller:one', principalRef: 'principal:one' }


type DurableState = {
  control?: DurableControlRow
  attempt?: DurableAttemptRow
  history?: DurableHistoryRow
  sourceWrites: Array<Record<string, unknown>>
  readInputs: Array<Record<string, unknown>>
}
function createState(): DurableState {
  return { sourceWrites: [], readInputs: [] }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`expected_record:${label}`)
  return Object.fromEntries(Object.entries(value))
}

function referenceName(value: unknown): string {
  const reference = asRecord(value, 'function_reference')
  if (typeof reference.name !== 'string') throw new Error('missing_function_reference_name')
  return reference.name
}

function asDurableControl(value: unknown): DurableControlRow {
  return value as DurableControlRow
}

function asDurableAttempt(value: unknown): DurableAttemptRow {
  return value as DurableAttemptRow
}


function fakeTransport(state: DurableState): ConvexSourceTransport {
  return {
    query: async (reference, args) => {
      const name = referenceName(reference)
      state.readInputs.push(asRecord(args, 'query_args'))
      if (name.endsWith('readControlSource')) return state.control ?? null
      if (name.endsWith('readAttemptsSource')) return state.attempt === undefined ? [] : [state.attempt]
      if (name.endsWith('readAttemptSource')) return state.attempt ?? null
      if (name.endsWith('readHistorySource')) return state.history === undefined ? [] : [state.history]
      if (name.endsWith('readHistoryCommandSource')) return state.history ?? null
      throw new Error(`unexpected_query:${name}:${JSON.stringify(args)}`)
    },
    mutation: async (reference, args) => {
      const name = referenceName(reference)
      const input = asRecord(args, 'mutation_args')
      const sourceWrite = input.sourceWrite
      if (sourceWrite !== undefined) state.sourceWrites.push(asRecord(sourceWrite, 'source_write'))
      if (name.endsWith('transactSource')) {
        const nextControl = asDurableControl(input.row)
        state.control = nextControl
        const nextAttempt = input.currentAttemptWrite
        if (nextAttempt === undefined) {
          delete state.attempt
        } else {
          state.attempt = asDurableAttempt(nextAttempt)
        }
        const history = asRecord(input.history, 'history')
        state.history = {
          ...history,
          commandResult: 'applied',
          invocationVersion: nextControl.invocationVersion,
          current: true,
          recordedAt: nextControl.updatedAt,
        } as DurableHistoryRow
        return { kind: 'applied', invocationVersion: nextControl.invocationVersion }
      }
      throw new Error(`unexpected_mutation:${name}`)
    },
    action: async () => {
      throw new Error('unexpected_action')
    },
  }
}

function control(): DurableControlRow {
  return {
    invocationRef: 'invocation:one',
    invocationVersion: 1,
    sourceRef: 'source:one',
    control: {} as DurableControlRow['control'],
    updatedAt: '2026-08-09T00:00:00.000Z',
  }
}

function attempt(): DurableAttemptRow {
  return {
    invocationRef: 'invocation:one',
    attemptRef: 'attempt:one',
    attemptNumber: 1,
    actor: {} as DurableAttemptRow['actor'],
    effectGeneration: 1,
    lease: { owner: 'worker:one', expiresAt: '2026-08-09T00:01:00.000Z' },
    idempotency: {
      operationKey: 'operation:one',
      materialInputDigest: 'sha256:' + '2'.repeat(64),
      effectIdentity: 'effect:one',
    },
    release: {} as DurableAttemptRow['release'],
    outcome: { state: 'running' },
    recordedAt: '2026-08-09T00:00:00.000Z',
  }
}

function history(): Omit<DurableHistoryRow, 'invocationVersion' | 'recordedAt' | 'current'> {
  return {
    invocationRef: 'invocation:one',
    commandId: 'command:one',
    commandDigest: 'sha256:' + '3'.repeat(64),
    commandResult: 'applied',
    kind: 'claim',
  }
}

describe('Convex action invocation durable adapter', () => {
  it('reconstructs durable control, attempt, and history through a fresh adapter instance', async () => {
    const state = createState()
    const transport = fakeTransport(state)
    const command = {
      commandId: 'command:one',
      commandDigest: 'sha256:' + '3'.repeat(64),
      expectedInvocationVersion: null,
      row: control(),
      currentAttemptWrite: attempt(),
      history: history(),
    }

    const first = await createConvexActionInvocationDurablePort({
      owner,
      request,
      env,
      transport,
    })
    await expect(first.transact(command)).resolves.toEqual({ kind: 'applied', invocationVersion: 1 })

    const second = await createConvexActionInvocationDurablePort({
      owner,
      request,
      env,
      transport,
    })
    await expect(second.readControl('invocation:one')).resolves.toEqual(state.control)
    await expect(second.readAttempts('invocation:one', 10)).resolves.toEqual([state.attempt])
    await expect(second.readAttempt('invocation:one', 'attempt:one')).resolves.toEqual(state.attempt)
    await expect(second.readHistory('invocation:one', 0, 10)).resolves.toEqual([state.history])
    await expect(second.readHistoryCommand('invocation:one', 'command:one')).resolves.toEqual(state.history)
    expect(state.sourceWrites).toHaveLength(1)
    expect(state.sourceWrites[0]).toMatchObject({
      scope: 'protected_action',
      method: request.method,
      initiatorOrigin: request.initiatorOrigin,
      targetOrigin: request.targetOrigin,
      targetPath: request.targetPath,
      targetQuery: request.targetQuery,
      bodyDigest: request.bodyDigest,
    })
    expect(state.sourceWrites[0]?.signature).toEqual(expect.any(String))
    expect(state.readInputs).toHaveLength(5)
    for (const input of state.readInputs) {
      expect(input).toMatchObject({
        callerRef: owner.callerRef,
        principalRef: owner.principalRef,
      })
      expect(asRecord(input.sourceWrite, 'read_source_write')).toMatchObject({
        scope: 'protected_action',
        method: request.method,
        initiatorOrigin: request.initiatorOrigin,
        targetOrigin: request.targetOrigin,
        targetPath: request.targetPath,
        targetQuery: request.targetQuery,
        bodyDigest: request.bodyDigest,
      })
    }
  })

  it('binds every source write to the caller, request, and protected authority family', async () => {
    const state = createState()
    const transport = fakeTransport(state)
    const first = await createConvexActionInvocationDurablePort({ owner, request, env, transport })
    await first.transact({
      commandId: 'command:one',
      commandDigest: 'sha256:' + '3'.repeat(64),
      expectedInvocationVersion: null,
      row: control(),
      history: history(),
    })
    expect(state.control).toBeDefined()
  })
})

describe('Convex action invocation source authority', () => {
  const transactSourceReference = transactSource as unknown as {
    _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>
  }
  const handler = transactSourceReference._handler

  it('refuses a missing source-write authority before touching durable state', async () => {
    const db = { query: vi.fn(), insert: vi.fn() }
    await expect(handler({ db }, {
      operationKey: 'action-invocation:transact:command:one',
      correlationId: 'action-invocation:invocation:one',
    })).rejects.toThrow('action_invocation_source_write_rejected:missing_source_write_admission')
    expect(db.query).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('refuses source authority from the wrong scope before durable state access', async () => {
    const db = { query: vi.fn(), insert: vi.fn() }
    const command = {
      operationKey: 'action-invocation:transact:command:one',
      correlationId: 'action-invocation:invocation:one',
    }
    const wrongScope = await createSourceWriteAdmission({
      env,
      request,
      scope: 'billing',
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      commandDigest: sourceWriteCommandDigest(command),
    })
    await expect(handler({ db }, {
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      sourceWriteRequest: request,
      sourceWrite: wrongScope,
    })).rejects.toThrow('action_invocation_source_write_rejected:source_write_scope_mismatch')
    expect(db.query).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })
})
