import { describe, expect, it, vi } from 'vitest'

import { findAction } from '@/modules/actions'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDurableActionInvocationTracer,
  readCompletedResultIdentity,
  type DurableActionInvocationPort,
  type PreparedInvocation,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { ActionResult } from '@/modules/common/action'
import {
  attachCompletedTaskReference,
  persistCompletedTaskReference,
  type AttachCompletedTaskReferencePorts,
  type PersistCompletedTaskReferencePorts,
} from '@/modules/customer-request/application/public'
import {
  compileCustomerRequest,
  type CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'
import {
  aggregateIsInternallyConsistent,
  commitAggregate,
  type CustomerRequestV2WritePorts,
} from '@/modules/customer-request/v2-write'

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
    terminalResultReferenceable: true,
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
      terminalResultReferenceable: false,
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

  it('commits one canonical revision, supersedes prior route authority, and cold-replays without another effect', async () => {
    const invocationActor = {
      principalRef: 'principal:development:one',
      callerRef: 'agent:development:one',
    }
    const invocationOrigin = { kind: 'standalone' as const, ...invocationActor }
    const invocationInput = {
      target: {
        businessId: 'mock:business:development',
        serviceId: 'mock:service:development',
        capabilityKind: 'quote_request' as const,
      },
      body: 'MOCK/DEVELOPMENT ONLY completed inquiry',
      contact: { email: 'development@example.test' },
      expectedDigest: `sha256:${'b'.repeat(64)}`,
      operationKey: 'mock:source:completed-task-reference',
    }
    const invocationResult = {
      kind: 'ok' as const,
      code: 'inquiry_submitted' as const,
      receipt: {
        threadId: 'mock:thread:completed-task-reference',
        businessId: invocationInput.target.businessId,
        serviceId: invocationInput.target.serviceId,
        status: 'open' as const,
        version: 1,
        notificationId: 'mock:notification:completed-task-reference',
        notificationStatus: 'queued' as const,
        accessKey: 'SOURCE-OWNED-DEVELOPMENT-SECRET',
      },
    }
    const runner = vi.fn().mockResolvedValue(invocationResult)
    const invocationState = createDevelopmentDurableState()
    const invocationPort = createDevelopmentDurablePort(invocationState)
    const invocationSource = {
      input: invocationInput,
      context: { developmentOnlyInquirySubmitAdapter: runner },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
      resultIdentity: {
        sourceResultRef: 'mock:inquiry-result:completed-task-reference',
        resultDigest: canonicalDigest(invocationResult),
      },
    }
    const invocation = createDurableActionInvocationTracer({
      action: findAction('inquiry.submit')!,
      port: invocationPort,
      now: () => new Date(NOW).toISOString(),
      nextInvocationRef: () => 'invocation:development:one',
      nextAuthorityRef: () => 'opaque:authority:completed-task-reference',
      nextAttemptRef: () => 'attempt:development:one',
      resolveSourceState: () => invocationSource,
    })
    const prepared = invocation.prepare({
      origin: invocationOrigin,
      actor: invocationActor,
      input: invocationInput,
      context: invocationSource.context,
      freshnessMs: 60_000,
    })
    invocationSource.prepared = prepared.prepared!
    const decided = invocation.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor: invocationActor,
      origin: invocationOrigin,
      accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const completed = await invocation.execute({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor: invocationActor,
      origin: invocationOrigin,
      materialInput: invocationInput,
    })
    expect(completed).toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'terminal' } },
    })
    expect(runner).toHaveBeenCalledTimes(1)
    const attemptCountAfterEffect = invocationPort.readAttempts(prepared.invocationRef, 10).length
    const historyCountAfterEffect = invocationPort.readHistory(prepared.invocationRef, 0, 20).length
    expect(attemptCountAfterEffect).toBe(1)

    const initial = aggregate()
    const revisions = new Map([[1, initial]])
    const commands = new Map<string, {
      commandDigest: string
      aggregateDigest: string
      requestId: string
      expectedRouteGeneration: number
      resultingRevision: number
      resultingRouteGenerationRef?: string
    }>()
    let head = {
      id: 'head:development:one',
      requestId: initial.snapshot.requestId,
      principalId: initial.snapshot.principalId,
      delegatedAgentId: initial.snapshot.delegatedAgentId,
      currentRevision: 1,
      currentAggregateDigest: initial.aggregateDigest,
    }
    let superseded = 0
    const writePorts = {
      loadCommitCommand: async (key: string) => commands.get(key) ?? null,
      verifyCommitCommandReplay: async (command: { resultingRevision: number }) => ({
        kind: 'current' as const,
        aggregate: revisions.get(command.resultingRevision)!,
      }),
      validateAggregateAgainstCurrentCapabilityGraph: async () => 'current' as const,
      loadRequestHead: async () => head,
      loadRoutePlanHead: async () => null,
      loadRevision: async (_requestId: string, revision: number) => {
        const stored = revisions.get(revision)
        return stored === undefined ? null : {
          requestId: initial.snapshot.requestId,
          requestRevision: revision,
          aggregate: stored,
        }
      },
      loadGenerationByNumber: async () => null,
      supersedeCurrentRouteMandate: async () => { superseded += 1 },
      insertRevision: async (stored: { requestRevision: number; aggregate: CustomerRequestV2Aggregate }) => {
        revisions.set(stored.requestRevision, structuredClone(stored.aggregate))
      },
      patchRequestHead: async (patch: {
        currentRevision: number
        currentAggregateDigest: string
      }) => {
        head = { ...head, ...patch }
      },
      insertCommitCommand: async (command: {
        commandKey: string
        commandDigest: string
        aggregateDigest: string
        requestId: string
        expectedRouteGeneration: number
        resultingRevision: number
        resultingRouteGenerationRef?: string
      }) => {
        commands.set(command.commandKey, command)
      },
      loadExactRoutePlanGeneration: async () => ({ kind: 'not_found' as const }),
      insertRoutePlanGeneration: async () => {},
      insertRoutePlanHead: async () => {},
      patchRoutePlanHead: async () => {},
      insertRequestHead: async () => {},
      loadGenerationCommand: async () => null,
      readGenerationRefreshCommandResult: async () => ({ kind: 'request_conflict' as const }),
      insertGenerationCommand: async () => {},
    } as unknown as CustomerRequestV2WritePorts
    const identityPorts: AttachCompletedTaskReferencePorts = {
      readCompletedResultIdentity: ({ invocationRef, actor }) =>
        readCompletedResultIdentity(invocationPort, invocationRef, actor, () => ({
          sourceResultRef: invocationSource.resultIdentity.sourceResultRef,
          result: invocationResult,
        })),
    }
    const applicationPorts: PersistCompletedTaskReferencePorts = {
      ...identityPorts,
      replayCommittedAttachment: async ({ commandKey, commandDigest }) => {
        const command = commands.get(commandKey)
        if (command === undefined) return { kind: 'not_found' }
        if (command.commandDigest !== commandDigest) return { kind: 'conflict' }
        return { kind: 'found', aggregate: revisions.get(command.resultingRevision)! }
      },
      loadCurrent: async () => ({
        kind: 'current',
        aggregate: revisions.get(head.currentRevision)!,
        routeGenerationNumber: 0,
      }),
      loadRequestGraph: async () => ({
        kind: 'available',
        models: [],
        descriptors: [],
        bindings: [],
        registrySnapshotDigest: initial.evaluation.registrySnapshotDigest,
      }),
      commitAggregate: async (candidate) => commitAggregate(candidate, writePorts),
      loadPersistedRevision: async ({ revision }) => revisions.get(revision) ?? null,
    }
    const command = {
      requestRef: initial.snapshot.requestId,
      expectedRevision: 1,
      expectedRouteGeneration: 0,
      principalRef: initial.snapshot.principalId,
      callerRef: 'agent:development:one',
      invocationRef: 'invocation:development:one',
      commandKey: 'attach:development:one',
      referencedAt: NOW + 2,
    }
    const stored = await persistCompletedTaskReference(command, applicationPorts)
    expect(stored).toMatchObject({
      kind: 'stored',
      revision: 2,
      noEffect: true,
      matchingEffect: 'provenance_only',
      aggregate: {
        snapshot: { revision: 2 },
        plan: { actions: [] },
        completedTaskReferences: [{ invocationRef: command.invocationRef }],
      },
    })
    expect(head.currentRevision).toBe(2)
    expect(revisions.size).toBe(2)
    expect(superseded).toBe(1)
    expect(stored.kind === 'stored' && stored.routeGeneration).toBeUndefined()
    expect(stored.kind === 'stored' && stored.aggregate.outcome).toBe('unsupported')
    expect(stored.kind === 'stored' && stored.aggregate.snapshot.facts).toEqual([])

    const replayed = await persistCompletedTaskReference(command, applicationPorts)
    expect(replayed).toMatchObject({ kind: 'replayed', revision: 2, noEffect: true })
    expect(revisions.size).toBe(2)
    expect(superseded).toBe(1)
    const cold = structuredClone(revisions.get(2)!)
    expect(cold.completedTaskReferences).toHaveLength(1)
    expect(aggregateIsInternallyConsistent(cold, 1)).toBe(true)
    expect(runner).toHaveBeenCalledTimes(1)
    expect(invocationPort.readAttempts(prepared.invocationRef, 10)).toHaveLength(
      attemptCountAfterEffect,
    )
    expect(invocationPort.readHistory(prepared.invocationRef, 0, 20)).toHaveLength(
      historyCountAfterEffect,
    )
    expect(JSON.stringify(cold)).not.toContain(invocationResult.receipt.accessKey)

    await expect(persistCompletedTaskReference({
      ...command,
      invocationRef: 'invocation:development:other',
    }, applicationPorts)).resolves.toEqual({
      kind: 'refused',
      reason: 'invocation_not_found',
    })
    await expect(persistCompletedTaskReference({
      ...command,
      referencedAt: command.referencedAt + 1,
    }, applicationPorts)).resolves.toEqual({
      kind: 'conflict',
      reason: 'idempotency_key_reused',
    })
    await expect(persistCompletedTaskReference({
      ...command,
      commandKey: 'attach:stale',
      expectedRevision: 1,
    }, applicationPorts)).resolves.toEqual({
      kind: 'conflict',
      reason: 'revision_changed',
    })

    const exact = revisions.get(2)!
    revisions.set(2, { ...exact, completedTaskReferences: [] })
    await expect(persistCompletedTaskReference(command, applicationPorts)).resolves.toEqual({
      kind: 'refused',
      reason: 'replay_integrity_failure',
    })
    revisions.set(2, {
      ...exact,
      completedTaskReferences: (exact.completedTaskReferences ?? []).map((reference) => ({
        ...reference,
        invocationRef: 'invocation:tampered',
      })),
    })
    await expect(persistCompletedTaskReference(command, applicationPorts)).resolves.toEqual({
      kind: 'refused',
      reason: 'replay_integrity_failure',
    })
  })
})
