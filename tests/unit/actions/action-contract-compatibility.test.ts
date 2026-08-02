import { describe, expect, it } from 'vitest'

import {
  defineAction,
  resolveActionContract,
  type ActionInvocationContract,
} from '@/modules/common/action'
import { z } from 'zod'
import {
  createInMemoryActionInvocationTracer,
  type ActionInvocationOrigin,
  type InvocationActor,
} from '@/modules/action-invocation'
import { workTreeApplyAction } from '@/modules/work-tree/work-tree-agent.actions'
import type { WorkTreeApplyInput } from '@/modules/work-tree/work-tree.functions'

const workTreeApplyActor: InvocationActor = {
  callerRef: 'caller:action-contract',
  principalRef: 'principal:action-contract',
}
const workTreeApplyOrigin: ActionInvocationOrigin = {
  kind: 'standalone',
  ...workTreeApplyActor,
}
const workTreeApplyInput = (operationKey: string): WorkTreeApplyInput => ({
  projectId: 'project:action-contract',
  operationKey,
  correlationId: 'correlation:action-contract',
  verb: {
    kind: 'elaborate',
    expectedGeneration: 1,
    expectedRevision: 1,
    targetNodeId: 'root',
      children: [{
        format: 'ae.work-node:v1',
        kind: 'task',
        title: 'Contract test child',
        status: 'fog',
        dependsOn: [],
        priority: 0,
        evidenceRefs: [],
      }],
    proposalDigest: 'proposal:action-contract',
  },
})

const workTreeApplyActionForInvocationTest = {
  ...workTreeApplyAction,
  invocationContract: {
    ...workTreeApplyAction.invocationContract,
    developmentAttemptTimeoutMs: 1_000,
  },
}

const declaredContract = {
  version: '2026-07-19',
  consequenceClass: 'read_only',
  materialInputPaths: ['slug'],
  authorityRequirement: 'none',
  retryClass: 'replayable',
  expectedEvidence: ['action_result'],
  safeContinuations: ['inspect_result'],
  invalidationConditions: ['action_contract_version_changed'],
} as const satisfies ActionInvocationContract

describe('registered action invocation contract', () => {
  it('requires and preserves the exact declared metadata', () => {
    const classifiedAction = defineAction({
      id: 'test.classifiedRead',
      name: 'Classified read',
      summary: 'Test-only classified action.',
      boundaries: [],
      schema: z.object({ slug: z.string() }),
      outputSchema: z.object({ kind: z.literal('ok') }),
      parameters: [],
      readOnly: true,
      effect: {
        class: 'observation', reversible: true, recipientKind: 'none',
        dataClasses: [], spendExposure: 'none', approval: 'none',
      },
      surfaces: [],
      invocationContract: declaredContract,
      run: async () => ({ kind: 'ok' as const }),
    })

    const runtimeContract: ActionInvocationContract = classifiedAction.invocationContract
    expect(runtimeContract).toBe(declaredContract)
    expect(resolveActionContract(classifiedAction)).toBe(declaredContract)
    expect(resolveActionContract(classifiedAction)).toEqual(declaredContract)
  })
  it('binds a prepared WorkTree apply to its durable operation key', () => {
    let invocationSequence = 0
    let authoritySequence = 0
    const tracer = createInMemoryActionInvocationTracer({
      action: workTreeApplyActionForInvocationTest,
      now: () => '2026-07-19T06:00:00.000Z',
      nextInvocationRef: () => `invocation:action-contract:${++invocationSequence}`,
      nextAuthorityRef: () => `authority:action-contract:${++authoritySequence}`,
    })
    const input = workTreeApplyInput('operation:action-contract:one')
    const prepared = tracer.prepare({
      origin: workTreeApplyOrigin,
      actor: workTreeApplyActor,
      input,
      context: {},
      freshnessMs: 60_000,
    })
    const decision = tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor: workTreeApplyActor,
      origin: workTreeApplyOrigin,
      accept: true,
    })
    expect(decision.kind).toBe('accepted')
    if (decision.kind !== 'accepted') throw new Error('Expected WorkTree apply authority')

    const replay = tracer.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decision.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor: workTreeApplyActor,
      origin: workTreeApplyOrigin,
      materialInput: input,
      leaseOwner: 'test:action-contract',
      leaseMs: 30_000,
    })
    expect(replay).toMatchObject({
      kind: 'accepted',
      view: { attempts: [{ idempotency: { operationKey: input.operationKey } }] },
    })

    const secondPrepared = tracer.prepare({
      origin: workTreeApplyOrigin,
      actor: workTreeApplyActor,
      input,
      context: {},
      freshnessMs: 60_000,
    })
    const secondDecision = tracer.decide({
      invocationRef: secondPrepared.invocationRef,
      expectedInvocationVersion: secondPrepared.invocationVersion,
      authorityRef: secondPrepared.authority!.reference,
      actor: workTreeApplyActor,
      origin: workTreeApplyOrigin,
      accept: true,
    })
    expect(secondDecision.kind).toBe('accepted')
    if (secondDecision.kind !== 'accepted') throw new Error('Expected second WorkTree apply authority')

    expect(tracer.acquire({
      invocationRef: secondPrepared.invocationRef,
      expectedInvocationVersion: secondDecision.view.invocationVersion,
      authorityRef: secondPrepared.authority!.reference,
      actor: workTreeApplyActor,
      origin: workTreeApplyOrigin,
      materialInput: { ...input, operationKey: 'operation:action-contract:two' },
      leaseOwner: 'test:action-contract',
      leaseMs: 30_000,
    })).toMatchObject({
      kind: 'refused',
      code: 'material_input_changed',
    })
  })
})
