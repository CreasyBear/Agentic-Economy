import { describe, expect, it } from 'vitest'

import {
  readCompletedResultIdentity,
  type DurableActionInvocationPort,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { ActionResult } from '@/modules/common/action'
import {
  attachCompletedTaskReference,
  type AttachCompletedTaskReferencePorts,
} from '@/modules/customer-request/application/public'
import {
  compileCustomerRequest,
  type CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'
import { aggregateIsInternallyConsistent } from '@/modules/customer-request/v2-write'

const NOW = 1_753_000_000_000
const result: ActionResult = { kind: 'inquiry_queued', inquiryRef: 'mock:inquiry:completed' }
const sourceResultRef = 'mock:inquiry-result:completed'
const resultDigest = canonicalDigest(result as never)

function aggregate(): CustomerRequestV2Aggregate {
  const compiled = compileCustomerRequest({
    requestId: 'request:development:one',
    expectedRevision: 0,
    principalId: 'principal:development:one',
    delegatedAgentId: 'agent:development:one',
    intent: 'Keep this completed inquiry with my broader request.',
    networkId: 'network:development',
    proposal: {
      kind: 'unsupported_request',
      reason: 'requested_result_not_available',
    },
    interpreterId: 'interpreter:development',
    bindings: [],
    models: [],
    now: NOW,
  })
  if (compiled.kind !== 'compiled') throw new Error('development aggregate did not compile')
  return compiled.aggregate
}

function control(
  overrides: Record<string, unknown> = {},
) {
  return {
    invocationRef: 'invocation:development:one',
    invocationVersion: 4,
    sourceRef: 'mock:inquiry-source:one',
    sourceResultRef,
    sourceResultDigest: resultDigest,
    terminalBusinessOutcome: 'completed',
    control: {
      invocationRef: 'invocation:development:one',
      invocationVersion: 4,
      environment: 'MOCK/DEVELOPMENT ONLY',
      persistence: 'durable_control',
      origin: {
        kind: 'standalone',
        callerRef: 'agent:development:one',
        principalRef: 'principal:development:one',
      },
      owner: {
        callerRef: 'agent:development:one',
        principalRef: 'principal:development:one',
      },
      action: { id: 'business.inquiry.send', contractVersion: 'business.inquiry.send:v1' },
      desired: { state: 'invoke' },
      freshness: { state: 'current', observedAt: new Date(NOW).toISOString() },
      control: { state: 'terminal' },
    },
    updatedAt: new Date(NOW).toISOString(),
    ...overrides,
  }
}

function ports(
  row: ReturnType<typeof control> | undefined = control(),
  source = { sourceResultRef, result },
): AttachCompletedTaskReferencePorts {
  const durable = {
    readControl: () => row,
  } as unknown as DurableActionInvocationPort<ActionResult>
  return {
    readCompletedResultIdentity: ({ invocationRef, actor }) =>
      readCompletedResultIdentity(durable, invocationRef, actor, () => source),
  }
}

const input = (candidateAggregate = aggregate()) => ({
  principalRef: 'principal:development:one',
  callerRef: 'agent:development:one',
  invocationRef: 'invocation:development:one',
  referencedAt: NOW + 1,
  candidateAggregate,
})

describe('completed standalone result reference in Customer Request V2', () => {
  it('attaches one source-verified identity, replays idempotently, and never reruns the action', () => {
    const attached = attachCompletedTaskReference(input(), ports())
    expect(attached).toMatchObject({
      kind: 'attached',
      noEffect: true,
      reference: {
        role: 'prior_completed_task',
        invocationRef: 'invocation:development:one',
        actionId: 'business.inquiry.send',
        actionVersion: 'business.inquiry.send:v1',
        sourceResultRef,
        resultDigest,
        businessOutcome: 'completed',
        referencedAt: NOW + 1,
      },
    })
    if (attached.kind !== 'attached') throw new Error('reference was not attached')
    const replay = attachCompletedTaskReference(input(attached.aggregate), ports())
    expect(replay).toMatchObject({
      kind: 'replayed',
      noEffect: true,
      reference: { referenceRef: attached.reference.referenceRef },
    })
    expect(attached.reference).not.toHaveProperty('authority')
    expect(attached.reference).not.toHaveProperty('attempts')
    expect(attached.reference).not.toHaveProperty('control')
    expect(attached.reference).not.toHaveProperty('result')
    expect(attached.reference).not.toHaveProperty('body')
    expect(attached.reference).not.toHaveProperty('contact')
    expect(attached.reference).not.toHaveProperty('accessKey')
    expect(attached.aggregate.snapshot.facts).toEqual([])
    expect(attached.aggregate.plan.actions).toEqual([])
  })

  it('survives labelled cold reconstruction and remains a valid canonical V2 aggregate', () => {
    const attached = attachCompletedTaskReference(input(), ports())
    if (attached.kind !== 'attached') throw new Error('reference was not attached')
    const reconstructed = structuredClone(
      JSON.parse(JSON.stringify(attached.aggregate)) as CustomerRequestV2Aggregate,
    )
    expect(reconstructed.completedTaskReferences).toEqual([attached.reference])
    expect(aggregateIsInternallyConsistent(reconstructed, 0)).toBe(true)
  })

  it.each([
    ['cross-principal', control(), {
      principalRef: 'principal:other',
      candidateAggregate: {
        ...aggregate(),
        snapshot: { ...aggregate().snapshot, principalId: 'principal:other' },
      },
    }, 'cross_principal_refused'],
    ['request-owned', control({
      control: {
        ...control().control,
        origin: { kind: 'request_owned', requestRef: 'request:other', revision: 1 },
      },
    }), {}, 'request_owned_refused'],
    ['nonterminal', control({
      control: { ...control().control, control: { state: 'in_progress' } },
    }), {}, 'invocation_not_terminal'],
    ['disallowed outcome', control({
      terminalBusinessOutcome: 'refused',
    }), {}, 'outcome_not_referenceable'],
  ])('refuses %s identity', (_label, row, overrides, reason) => {
    const candidate = input()
    expect(attachCompletedTaskReference({ ...candidate, ...overrides }, ports(row))).toEqual({
      kind: 'refused',
      reason,
    })
  })

  it.each([
    ['source reference', { sourceResultRef: 'mock:tampered', result }],
    ['result digest', { sourceResultRef, result: { kind: 'inquiry_queued', tampered: true } }],
  ])('refuses a tampered %s', (_label, source) => {
    expect(attachCompletedTaskReference(input(), ports(control(), source))).toEqual({
      kind: 'refused',
      reason: 'source_result_mismatch',
    })
  })

  it('refuses a tampered persisted result digest', () => {
    expect(attachCompletedTaskReference(input(), ports(control({
      sourceResultDigest: `sha256:${'0'.repeat(64)}`,
    })))).toEqual({
      kind: 'refused',
      reason: 'source_result_mismatch',
    })
  })

  it('leaves historical Request aggregates and their replay digest unchanged', () => {
    const historical = aggregate()
    const reconstructed = structuredClone(
      JSON.parse(JSON.stringify(historical)) as CustomerRequestV2Aggregate,
    )
    expect(reconstructed).toEqual(historical)
    expect(reconstructed.completedTaskReferences).toBeUndefined()
    expect(aggregateIsInternallyConsistent(reconstructed, 0)).toBe(true)
  })
})
