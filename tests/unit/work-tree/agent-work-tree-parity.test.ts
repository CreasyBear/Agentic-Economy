import { z } from 'zod'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { describeActionForAgent, findAction } from '@/modules/actions'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { handleWorkTreeAgentAction, type WorkTreeAgentOperation } from '@/lib/server/work-tree-agent-api'
import type { AgentAccessPrincipal } from '@/lib/server/agent-access-auth'
import {
  decideRootWorkTree,
  readRootWorkTree,
  type WorkTreeDecisionReceipt as RootWorkTreeDecisionReceipt,
  type WorkTreeInspectResult,
  type WorkTreeSourcePort,
} from '@/modules/work-tree/internal/root-loop'
type UnsignedGardenerVerb = z.input<typeof gardenerVerbSchema> extends infer Verb
  ? Verb extends { proposalDigest: string } ? Omit<Verb, 'proposalDigest'> : never
  : never

type AuthenticatedPrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  scopes: readonly string[]
  authorityMode: 'approve_each'
}>
import {
  gardenerVerbDigest,
  gardenerVerbSchema,
  type GardenerVerb,
} from '@/modules/work-tree/public'
import type { WorkTreeDecisionReceipt } from '@/modules/work-tree/work-tree.functions'
import { createFakeWorkTreeSource, type FakeWorkTreeSource } from '../routes/home-work-tree-loop.fixtures'

const sourceMocks = vi.hoisted(() => {
  class MockConvexSourceError extends Error {
    readonly code: string

    constructor(code: string) {
      super(code)
      this.code = code
    }
  }

  return {
    authenticateAgentAccess: vi.fn(),
    resolveAgentAccessPrincipal: vi.fn(),
    callSourceMutation: vi.fn(),
    callSourceQuery: vi.fn(),
    callPublicSourceMutation: vi.fn(),
    callPublicSourceQuery: vi.fn(),
    sourceMutation: vi.fn((name: string) => ({ name })),
    sourceQuery: vi.fn((name: string) => ({ name })),
    ConvexSourceError: MockConvexSourceError,
  }
})

vi.mock('@/lib/server/agent-access-auth', () => ({
  authenticateAgentAccess: sourceMocks.authenticateAgentAccess,
  resolveAgentAccessPrincipal: sourceMocks.resolveAgentAccessPrincipal,
}))
vi.mock('@/lib/server/convex-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/convex-source')>()
  return {
    ...actual,
    callSourceMutation: sourceMocks.callSourceMutation,
    callSourceQuery: sourceMocks.callSourceQuery,
    callPublicSourceMutation: sourceMocks.callPublicSourceMutation,
    callPublicSourceQuery: sourceMocks.callPublicSourceQuery,
    sourceMutation: sourceMocks.sourceMutation,
    sourceQuery: sourceMocks.sourceQuery,
    ConvexSourceError: sourceMocks.ConvexSourceError,
  }
})
const PRINCIPAL = Object.freeze({
  principalId: 'clerk_api_key:ak_parity',
  ownerId: 'user:parity',
  credentialId: 'ak_parity',
  scopes: Object.freeze([
    'customer_requests:approve_each',
    'work_trees:apply',
    'work_trees:create',
    'work_trees:decide',
    'work_trees:inspect',
  ]),
  authorityMode: 'approve_each' as const,
})

const createInput = {
  idempotencyKey: 'create:parity',
  charterText: 'Keep the project decision moving.',
  lineage: { kind: 'standalone' as const },
}

type SourceDescriptor = Readonly<{ name: string }>
type SourceState = FakeWorkTreeSource

let source: SourceState
let sourceApplyPayloads: Map<string, string>
let sourceApplyReceipts: Map<string, unknown>
let sourceDecisionPayloads: Map<string, string>
let sourceDecisionReceipts: Map<string, RootWorkTreeDecisionReceipt>
let authScopes: Set<string>
let authenticatedPrincipal: AuthenticatedPrincipal

const resolvePrincipal = async (principal: AgentAccessPrincipal): Promise<AgentAccessPrincipal> => principal

beforeEach(() => {
  source = createFakeWorkTreeSource()
  sourceApplyPayloads = new Map()
  sourceApplyReceipts = new Map()
  sourceDecisionPayloads = new Map()
  sourceDecisionReceipts = new Map()
  authScopes = new Set(PRINCIPAL.scopes)
  authenticatedPrincipal = PRINCIPAL

  sourceMocks.sourceMutation.mockReset()
  sourceMocks.sourceMutation.mockImplementation((name: string) => ({ name }))
  sourceMocks.sourceQuery.mockReset()
  sourceMocks.sourceQuery.mockImplementation((name: string) => ({ name }))
  sourceMocks.callSourceMutation.mockReset()
  sourceMocks.callSourceMutation.mockImplementation(async (descriptor: SourceDescriptor, input: unknown) =>
    await dispatchMutation(descriptor.name, input))
  sourceMocks.callSourceQuery.mockReset()
  sourceMocks.callSourceQuery.mockImplementation(async (descriptor: SourceDescriptor, input: unknown) =>
    await dispatchQuery(descriptor.name, input))
  sourceMocks.callPublicSourceMutation.mockReset()
  sourceMocks.callPublicSourceQuery.mockReset()
  sourceMocks.resolveAgentAccessPrincipal.mockReset()
  sourceMocks.resolveAgentAccessPrincipal.mockImplementation(() => async (principal: unknown) => principal)
  sourceMocks.authenticateAgentAccess.mockReset()
  sourceMocks.authenticateAgentAccess.mockImplementation(async (options?: Readonly<{
    requiredScope?: string
    resolvePrincipal?: (principal: unknown) => Promise<unknown>
  }>) => {
    if (options?.requiredScope !== undefined && !authScopes.has(options.requiredScope)) {
      return { kind: 'refused' as const, status: 403 as const, reason: 'scope_required' as const }
    }
    const stored = options?.resolvePrincipal === undefined
      ? authenticatedPrincipal
      : await options.resolvePrincipal(authenticatedPrincipal)
    if (stored === null) return { kind: 'refused' as const, status: 403 as const, reason: 'scope_required' as const }
    return { kind: 'authenticated' as const, principal: stored as AuthenticatedPrincipal }
  })
})

describe('T47 registered WorkTree action and human readback parity', () => {
  it('keeps descriptors, runtime schemas, effects, and write boundaries aligned', () => {
    const ids = ['workTree.create', 'workTree.inspect', 'workTree.apply', 'workTree.decide'] as const

    for (const id of ids) {
      const action = findAction(id)
      expect(action).toBeDefined()
      if (action === undefined) continue

      const descriptor = describeActionForAgent(action)
      expect(descriptor.id).toBe(id)
      expect(descriptor.readOnly).toBe(action.readOnly)
      expect(descriptor.effect).toEqual(action.effect)
      expect(descriptor.inputJsonSchema).toEqual(expect.objectContaining({ type: 'object' }))
      expect(descriptor.outputJsonSchema).toBeDefined()
      expect(action.surfaces).toContain('http')
      expect(action.surfaces).not.toContain('mcp')
      expect(action.invocationContract.authorityRequirement).toBe('principal')
      expect(action.effect.spendExposure).toBe('none')
      expect(action.effect.class).toBe(action.readOnly ? 'observation' : 'external_state_change')
      expect(action.effect.approval).toBe(action.readOnly ? 'none' : 'approve_each')
    }

    const apply = findAction('workTree.apply')
    const decide = findAction('workTree.decide')
    if (apply === undefined || decide === undefined) throw new Error('WorkTree actions are not registered')
    expect(apply.invocationContract.materialInputPaths).toEqual(['projectId', 'operationKey', 'verb'])
    expect(apply.parameters.find((parameter) => parameter.name === 'correlationId')).toMatchObject({
      description: 'correlationId is trace metadata only; it does not participate in the replay digest.',
    })
    expect(decide.parameters.find((parameter) => parameter.name === 'idempotencyKey')).toMatchObject({
      type: 'string',
      required: true,
    })

    const unsignedVerbs: readonly UnsignedGardenerVerb[] = [
      {
        kind: 'elaborate',
        expectedGeneration: 1,
        expectedRevision: 1,
        targetNodeId: 'root',
        children: [{ kind: 'task', title: 'Draft the next project step' }],
      },
      {
        kind: 'study',
        expectedGeneration: 1,
        expectedRevision: 1,
        targetNodeId: 'decision:project',
        studyBrief: 'Check the current project evidence.',
        criteriaFromCharter: ['same project'],
      },
      {
        kind: 'propose_decision',
        expectedGeneration: 1,
        expectedRevision: 1,
        targetNodeId: 'decision:project',
        options: [{ optionId: 'keep', label: 'Keep moving', summary: 'Continue the bounded plan.' }],
        recommendation: 'keep',
      },
    ]

    for (const unsigned of unsignedVerbs) {
      const verb = { ...unsigned, proposalDigest: canonicalDigest(unsigned) }
      expect(apply.schema.safeParse({
        projectId: 'project:parity', operationKey: `op:${unsigned.kind}`, correlationId: 'corr:parity', verb,
      }).success).toBe(true)
    }
    expect(apply.schema.safeParse({
      projectId: 'project:parity', operationKey: 'op:invalid', correlationId: 'corr:parity',
      verb: { kind: 'patch', targetNodeId: 'decision:project' },
    }).success).toBe(false)

    for (const kind of ['lock', 'adjust', 'park'] as const) {
      expect(decide.schema.safeParse({
        projectId: 'project:parity', nodeId: 'decision:project', kind,
        expectedGeneration: 1, expectedRevision: 1,
        proposalDigest: 'digest:decision', idempotencyKey: `decision:${kind}`,
      }).success).toBe(true)
    }
    expect(decide.schema.safeParse({
      projectId: 'project:parity', nodeId: 'decision:project', kind: 'release',
      expectedGeneration: 1, expectedRevision: 1,
      proposalDigest: 'digest:decision', idempotencyKey: 'decision:invalid',
    }).success).toBe(false)
    expect(decide.outputSchema.safeParse({
      kind: 'unknown',
      decision: 'lock',
      projectId: 'project:parity',
      nodeId: 'decision:project',
      receiptId: 'unknown:legacy',
      generation: 1,
      revision: 1,
      disposition: 'unchanged',
      occurredAt: 1,
      readback: { projectId: 'project:parity', revision: 1 },
    }).success).toBe(false)
    expect(decide.outputSchema.safeParse({ kind: 'unknown' }).success).toBe(true)
  })
  it('rejects agent guest assertions before creating a service assertion or calling source', async () => {
    const response = await handleWorkTreeAgentAction(
      new Request('https://ae.test/api/v1/work-tree/decide', {
        method: 'POST',
        headers: { Authorization: 'Bearer ak_parity', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'project:guest',
          nodeId: 'decision:guest',
          kind: 'park',
          expectedGeneration: 1,
          expectedRevision: 1,
          proposalDigest: 'digest:guest',
          idempotencyKey: 'agent:guest',
          guestAssertion: 'guest:borrowed',
        }),
      }),
      'decide',
      { resolvePrincipal, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: 's'.repeat(32) } },
    )

    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    await expect(response.json()).resolves.toMatchObject({
      type: 'about:blank',
      title: 'Invalid argument',
      status: 400,
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_request',
    })
    expect(sourceMocks.callPublicSourceMutation).not.toHaveBeenCalled()
    expect(sourceMocks.callPublicSourceQuery).not.toHaveBeenCalled()
    expect(sourceMocks.callSourceMutation).not.toHaveBeenCalled()
    expect(sourceMocks.callSourceQuery).not.toHaveBeenCalled()
  })
  it('refuses a live Clerk key without a current durable grant before operation dispatch', async () => {
    const callOperation = vi.fn()
    const response = await handleWorkTreeAgentAction(
      new Request('https://ae.test/api/v1/work-tree/inspect', {
        method: 'POST',
        headers: { Authorization: 'Bearer ak_parity', 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'project:grant-refused' }),
      }),
      'inspect',
      { resolvePrincipal: async () => null, callOperation },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: 'scope_required' })
    expect(callOperation).not.toHaveBeenCalled()
  })
  it('projects typed source refusals and keeps malformed or transport outcomes unknown', async () => {
    const request = () => new Request('https://ae.test/api/v1/work-tree/inspect', {
      method: 'POST',
      headers: { Authorization: 'Bearer ak_parity', 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'project:typed-refusal' }),
    })
    const invoke = async (callOperation: () => Promise<Record<string, unknown>>): Promise<Response> =>
      await handleWorkTreeAgentAction(request(), 'inspect', {
        resolvePrincipal,
        callOperation: async () => await callOperation(),
      })

    const authentication = await invoke(async () => ({ kind: 'refused', code: 'authentication_required' }))
    expect(authentication.status).toBe(401)
    await expect(authentication.json()).resolves.toMatchObject({
      type: 'about:blank',
      title: 'Unauthenticated',
      status: 401,
      kind: 'UNAUTHENTICATED',
      code: 'authentication_required',
      replayed: false,
    })

    const forbidden = await invoke(async () => ({ kind: 'refused', code: 'forbidden' }))
    expect(forbidden.status).toBe(403)
    await expect(forbidden.json()).resolves.toMatchObject({
      type: 'about:blank',
      title: 'Permission denied',
      status: 403,
      kind: 'PERMISSION_DENIED',
      code: 'forbidden',
      replayed: false,
    })

    const malformed = await invoke(async () => ({ kind: 'refused', code: 'forbidden', replayed: true }))
    expect(malformed.status).toBe(200)
    await expect(malformed.json()).resolves.toMatchObject({ kind: 'unknown' })

    const unrecognized = await invoke(async () => ({ kind: 'refused', code: 'unrecognized_source_code' }))
    expect(unrecognized.status).toBe(200)
    await expect(unrecognized.json()).resolves.toEqual({ kind: 'unknown', reason: 'unrecognized_source_code' })

    const transport = await invoke(async () => { throw new Error('transport_down') })
    expect(transport.status).toBe(200)
    await expect(transport.json()).resolves.toEqual({ kind: 'unknown', reason: 'transport_down' })
    const decideUnknown = await handleWorkTreeAgentAction(
      new Request('https://ae.test/api/v1/work-tree/decide', {
        method: 'POST',
        headers: { Authorization: 'Bearer ak_parity', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'project:typed-decision',
          nodeId: 'node:typed-decision',
          kind: 'lock',
          expectedGeneration: 1,
          expectedRevision: 1,
          proposalDigest: 'digest:typed-decision',
          idempotencyKey: 'decision:typed-unknown',
        }),
      }),
      'decide',
      { resolvePrincipal, callOperation: async () => ({
        kind: 'unknown',
        decision: 'lock',
        projectId: 'project:typed-decision',
        nodeId: 'node:typed-decision',
        receiptId: 'unknown:legacy',
        generation: 1,
        revision: 1,
        disposition: 'unchanged',
        occurredAt: 1,
        readback: { projectId: 'project:typed-decision', revision: 1 },
      }) },
    )
    expect(decideUnknown.status).toBe(200)
    await expect(decideUnknown.json()).resolves.toEqual({ kind: 'unknown' })

    authScopes.add('work_trees:repeat_reconcile')
    const repeatInvalidRequest = await handleWorkTreeAgentAction(
      new Request('https://ae.test/api/v1/work-tree/reconcileRepeatUse', {
        method: 'POST',
        headers: { Authorization: 'Bearer ak_parity', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          useRef: 'repeat-use:typed',
          operationKey: 'reconcile:typed',
          actualOccurrences: 0,
          outcome: 'not_settled',
        }),
      }),
      'reconcileRepeatUse',
      { resolvePrincipal, callOperation: async () => ({ kind: 'refused', reason: 'invalid_request', useRef: 'repeat-use:typed' }) },
    )
    expect(repeatInvalidRequest.status).toBe(400)
    await expect(repeatInvalidRequest.json()).resolves.toMatchObject({
      type: 'about:blank',
      title: 'Invalid argument',
      status: 400,
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_request',
      replayed: false,
    })
  })

  it('lets an agent create and a person inspect the same project and revision', async () => {
    const started = await source.create(createInput)
    expect(started.kind).toBe('accepted')
    if (started.kind === 'refused') throw new Error('initial create refused')

    const createResponse = await handleAgentWorkTree('create', createInput)
    expect(createResponse.status).toBe(200)
    const agentCreated = await createResponse.json() as {
      kind: string
      readback?: { projectId: string; revision: number; tree: unknown }
    }
    expect(agentCreated.kind).toBe('replayed')
    expect(agentCreated.readback).toMatchObject({
      projectId: started.projectId,
      revision: started.revision,
    })

    const human = await readRootWorkTree({ projectId: started.projectId, nowMs: 1_754_000_000_000 }, humanSourcePort())
    expect(human).toMatchObject({
      kind: 'ready',
      projectId: started.projectId,
      revision: started.revision,
      treeId: started.treeId,
    })
    expect(agentCreated.readback?.tree).toEqual(human.kind === 'ready' ? human.tree : undefined)
  })

  it('projects an agent proposal into the person inbox with the same decision identity', async () => {
    const started = await createReadyProject()
    const before = await readRootWorkTree({ projectId: started.projectId, nowMs: 1_754_000_000_000 }, humanSourcePort())
    expect(before.kind).toBe('ready')
    if (before.kind !== 'ready') throw new Error('project readback refused')

    const decisionNode = before.inbox.items[0]
    expect(decisionNode).toBeDefined()
    if (decisionNode === undefined) throw new Error('project has no decision item')

    const inspected = await source.inspect({ projectId: started.projectId })
    if (inspected.kind !== 'accepted') throw new Error('project source inspect refused')
    const unsigned = {
      kind: 'propose_decision' as const,
      expectedGeneration: inspected.generation,
      expectedRevision: inspected.revision,
      targetNodeId: decisionNode.nodeId,
      options: [{ optionId: 'keep', label: 'Keep moving', summary: 'Continue the bounded plan.' }],
      recommendation: 'keep',
    }
    const verb = { ...unsigned, proposalDigest: gardenerVerbDigest({ ...unsigned, proposalDigest: 'ignored' }) }

    const response = await handleAgentWorkTree('apply', {
      projectId: started.projectId,
      operationKey: 'agent:proposal:parity',
      correlationId: 'agent:correlation:parity',
      verb,
    })
    expect(response.status).toBe(200)
    const proposalBody = await response.json()
    expect(proposalBody).toMatchObject({ kind: 'accepted', readback: { projectId: started.projectId } })
    const after = await readRootWorkTree({ projectId: started.projectId, nowMs: 1_754_000_000_000 }, humanSourcePort())
    expect(after.kind).toBe('ready')
    if (after.kind !== 'ready') throw new Error('proposal readback refused')
    const projected = after.inbox.items.find((item) => item.nodeId === decisionNode.nodeId)
    expect(projected).toMatchObject({ projectId: started.projectId, nodeId: decisionNode.nodeId })
    expect(projected?.exits.lock.proposalDigest).toBe(
      canonicalDigest({
        projectId: started.projectId,
        nodeId: decisionNode.nodeId,
        kind: 'lock',
        expectedGeneration: after.generation,
        expectedRevision: after.revision,
      }),
    )
  })

  it('returns the human Lock receipt through agent inspect after the person decides', async () => {
    const started = await createReadyProject()
    const humanBefore = await readRootWorkTree({ projectId: started.projectId, nowMs: 1_754_000_000_000 }, humanSourcePort())
    expect(humanBefore.kind).toBe('ready')
    if (humanBefore.kind !== 'ready') throw new Error('project readback refused')
    const item = humanBefore.inbox.items[0]
    if (item === undefined) throw new Error('project has no decision item')

    const humanDecision = await decideRootWorkTree({
      projectId: item.projectId,
      nodeId: item.nodeId,
      kind: 'lock',
      expectedGeneration: item.exits.lock.expectedGeneration,
      expectedRevision: item.exits.lock.expectedRevision,
      nowMs: 1_754_000_000_000,
    }, humanSourcePort())
    expect(humanDecision.receipt.kind).toBe('accepted')

    const response = await handleAgentWorkTree('inspect', { projectId: started.projectId })
    expect(response.status).toBe(200)
    const agentInspect = await response.json() as {
      kind: string
      readback?: { receipts: readonly WorkTreeDecisionReceipt[]; tree: { nodes: readonly { nodeId: string; status: string }[] } }
    }
    expect(agentInspect.kind).toBe('accepted')
    expect(agentInspect.readback?.receipts).toContainEqual(humanDecision.receipt)
    expect(agentInspect.readback?.tree.nodes).toContainEqual(expect.objectContaining({ nodeId: item.nodeId, status: 'locked' }))
  })

  it('replays identical idempotency keys byte-stably and refuses changed payloads without state change', async () => {
    const started = await createReadyProject()
    const inspected = await source.inspect({ projectId: started.projectId })
    if (inspected.kind !== 'accepted') throw new Error('project source inspect refused')
    const node = inspected.tree.nodes.find((candidate) => candidate.kind === 'decision' && candidate.status === 'ready')
    if (node === undefined) throw new Error('project has no ready decision')
    const proposal = {
      projectId: started.projectId,
      nodeId: node.nodeId,
      kind: 'lock' as const,
      expectedGeneration: inspected.generation,
      expectedRevision: inspected.revision,
      proposalDigest: canonicalDigest({
        projectId: started.projectId,
        nodeId: node.nodeId,
        kind: 'lock',
        expectedGeneration: inspected.generation,
        expectedRevision: inspected.revision,
      }),
      idempotencyKey: 'agent:lock:stable',
    }

    const first = await handleAgentWorkTree('decide', proposal)
    const firstText = await first.text()
    const retry = await handleAgentWorkTree('decide', proposal)
    const retryText = await retry.text()
    expect(first.status).toBe(200)
    expect(retry.status).toBe(200)
    expect(retryText).toBe(firstText)

    const afterReplay = await source.inspect({ projectId: started.projectId })
    if (afterReplay.kind !== 'accepted') throw new Error('project source inspect refused')
    const revisionAfterReplay = afterReplay.revision
    const changed = await handleAgentWorkTree('decide', {
      ...proposal,
      kind: 'park',
    })
    expect(changed.status).toBe(409)
    await expect(changed.json()).resolves.toMatchObject({
      type: 'about:blank',
      title: 'Already exists',
      status: 409,
      kind: 'ALREADY_EXISTS',
      code: 'digest_mismatch',
      replayed: false,
    })
    const afterConflict = await source.inspect({ projectId: started.projectId })
    expect(afterConflict.kind === 'accepted' ? afterConflict.revision : undefined).toBe(revisionAfterReplay)
  })

  it('refuses stale fences, missing scopes, and wrong principals before state changes', async () => {
    const started = await createReadyProject()
    const before = await source.inspect({ projectId: started.projectId })
    if (before.kind !== 'accepted') throw new Error('project source inspect refused')
    const node = before.tree.nodes.find((candidate) => candidate.kind === 'decision' && candidate.status === 'ready')
    if (node === undefined) throw new Error('project has no ready decision')
    const proposal = {
      projectId: started.projectId,
      nodeId: node.nodeId,
      kind: 'lock' as const,
      expectedGeneration: before.generation,
      expectedRevision: before.revision - 1,
      proposalDigest: 'stale:digest',
      idempotencyKey: 'agent:stale',
    }
    const currentProposal = {
      ...proposal,
      expectedRevision: before.revision,
      proposalDigest: canonicalDigest({
        projectId: started.projectId,
        nodeId: node.nodeId,
        kind: 'lock' as const,
        expectedGeneration: before.generation,
        expectedRevision: before.revision,
      }),
      idempotencyKey: 'agent:wrong-principal',
    }

    const stale = await handleAgentWorkTree('decide', proposal)
    expect(stale.status).toBe(409)
    await expect(stale.json()).resolves.toMatchObject({
      type: 'about:blank',
      title: 'Already exists',
      status: 409,
      kind: 'ALREADY_EXISTS',
      code: 'stale_fence',
      replayed: false,
    })
    const afterStale = await source.inspect({ projectId: started.projectId })
    expect(afterStale.kind === 'accepted' ? afterStale.revision : undefined).toBe(before.revision)

    authScopes.delete('work_trees:inspect')
    const missingScope = await handleAgentWorkTree('inspect', { projectId: started.projectId })
    expect(missingScope.status).toBe(403)
    expect(missingScope.headers.get('content-type')).toBe('application/problem+json')
    await expect(missingScope.json()).resolves.toMatchObject({
      type: 'about:blank',
      title: 'Permission denied',
      status: 403,
      kind: 'PERMISSION_DENIED',
      code: 'scope_required',
      detail: 'scope_required',
    })

    authScopes.add('work_trees:inspect')
    authenticatedPrincipal = Object.freeze({ ...PRINCIPAL, principalId: 'clerk_api_key:other' })
    const wrongPrincipal = await handleAgentWorkTree('decide', currentProposal)
    expect(wrongPrincipal.status).toBe(403)
    await expect(wrongPrincipal.json()).resolves.toMatchObject({
      type: 'about:blank',
      title: 'Permission denied',
      status: 403,
      kind: 'PERMISSION_DENIED',
      code: 'forbidden',
      replayed: false,
    })
    const afterPrincipal = await source.inspect({ projectId: started.projectId })
    expect(afterPrincipal.kind === 'accepted' ? afterPrincipal.revision : undefined).toBe(before.revision)
  })
})

async function createReadyProject(): Promise<{ projectId: string }> {
  const created = await source.create(createInput)
  if (created.kind === 'refused') throw new Error(`project create refused: ${created.reason}`)

  const root = created.tree.nodes.find((candidate) => candidate.parentId === undefined)
  if (root === undefined) throw new Error('project has no root node')
  const rootVerb = signGardenerVerb({
    kind: 'elaborate',
    expectedGeneration: created.generation,
    expectedRevision: created.revision,
    targetNodeId: root.nodeId,
    children: [{ kind: 'decision', title: 'Choose the next project step' }],
  })
  const rootApplied = await source.apply({
    projectId: created.projectId,
    operationKey: `${created.projectId}:elaborate-root`,
    correlationId: `${created.projectId}:parity`,
    verb: rootVerb,
  })
  if (rootApplied.kind === 'refused' || rootApplied.kind === 'unknown') {
    throw new Error(`root elaboration refused: ${rootApplied.reason}`)
  }

  const decision = rootApplied.receipt.tree.nodes.find((candidate) => candidate.kind === 'decision')
  if (decision === undefined) throw new Error('project has no decision node')
  const decisionVerb = signGardenerVerb({
    kind: 'elaborate',
    expectedGeneration: rootApplied.receipt.tree.generation,
    expectedRevision: rootApplied.receipt.tree.revision,
    targetNodeId: decision.nodeId,
    children: [{ kind: 'task', title: 'Complete the chosen project step' }],
  })
  const decisionApplied = await source.apply({
    projectId: created.projectId,
    operationKey: `${created.projectId}:elaborate-decision`,
    correlationId: `${created.projectId}:parity`,
    verb: decisionVerb,
  })
  if (decisionApplied.kind === 'refused' || decisionApplied.kind === 'unknown') {
    throw new Error(`decision elaboration refused: ${decisionApplied.reason}`)
  }
  return { projectId: created.projectId }
}

function signGardenerVerb(unsigned: UnsignedGardenerVerb): GardenerVerb {
  const parsed = gardenerVerbSchema.parse({ ...unsigned, proposalDigest: 'unsigned' })
  return { ...parsed, proposalDigest: gardenerVerbDigest(parsed) }
}

function humanSourcePort(): WorkTreeSourcePort {
  return source
}
async function handleAgentWorkTree(operation: 'create' | 'inspect' | 'apply' | 'decide', body: unknown): Promise<Response> {
  const callOperation = async ({ operation: calledOperation, command, principal }: Readonly<{
    operation: WorkTreeAgentOperation
    command: Record<string, unknown>
    principal: Readonly<{ principalId: string }>
  }>): Promise<Record<string, unknown>> => {
    if (calledOperation === 'decide' && principal.principalId !== PRINCIPAL.principalId) {
      const current = await source.inspect({ projectId: String(command.projectId) })
      return refusedDecision(command, 'forbidden', current.kind === 'accepted' ? current.revision : Number(command.expectedRevision))
    }
    if (calledOperation === 'create') return await dispatchMutation('workTrees:create', command) as Record<string, unknown>
    if (calledOperation === 'inspect') return await dispatchQuery('workTrees:inspect', command) as Record<string, unknown>
    return await dispatchMutation(`workTrees:${calledOperation}`, command) as Record<string, unknown>
  }

  return handleWorkTreeAgentAction(
    new Request(`https://ae.test/api/v1/work-tree/${operation}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ak_parity', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    operation,
    { resolvePrincipal, callOperation },
  )
}

async function runRegistered(id: string, data: Record<string, unknown>): Promise<unknown> {
  const action = findAction(id)
  if (action === undefined) throw new Error(`Action not registered: ${id}`)
  return await action.run({ data, context: { caller: 'http' } })
}

async function dispatchMutation(name: string, input: unknown): Promise<unknown> {
  if (name === 'workTrees:create') {
    const command = input as typeof createInput
    const result = await source.create(command)
    if (result.kind === 'refused') return { kind: 'refused', code: 'source_unavailable', replayed: false }
    const readback = await source.inspect({ projectId: result.projectId })
    if (readback.kind !== 'accepted') throw new Error('work_tree_create_readback_unavailable')
    return {
      kind: result.kind,
      code: result.kind === 'replayed' ? 'work_tree_resumed' : 'work_tree_created',
      replayed: result.kind === 'replayed',
      readback: toAgentReadback(readback),
      receipt: {
        receiptRef: `receipt:create:${result.projectId}`,
        projectId: result.projectId,
        treeId: result.treeId,
        operationKey: command.idempotencyKey,
        event: { kind: 'created', operationKey: `${result.projectId}:created`, seq: 1 },
        lineage: createInput.lineage,
        generation: 1,
        revision: 1,
        payloadDigest: canonicalDigest(command),
      },
    }
  }

  if (name === 'workTrees:apply') {
    const command = input as Record<string, unknown>
    const operationKey = String(command.operationKey)
    const payload = JSON.stringify(command)
    const priorPayload = sourceApplyPayloads.get(operationKey)
    if (priorPayload !== undefined) {
      if (priorPayload !== payload) throw new Error('work_tree_operation_conflict')
      return sourceApplyReceipts.get(operationKey)
    }
    const result = await source.apply(command as never)
    if (result.kind === 'refused' || result.kind === 'unknown') throw new Error(result.reason)
    const events = await source.inspect({ projectId: String(command.projectId) })
    if (events.kind !== 'accepted') throw new Error('work_tree_apply_readback_unavailable')
    const event = events.events.at(-1)
    if (event === undefined) throw new Error('work_tree_apply_event_unavailable')
    const raw = {
      kind: result.kind === 'replayed' ? 'replayed' : 'applied',
      replayed: result.kind === 'replayed',
      projectId: String(command.projectId),
      tree: result.receipt.tree,
      operationKey,
      seq: event.seq,
      event: { kind: event.kind, operationKey: event.operationKey, seq: event.seq },
    }
    sourceApplyPayloads.set(operationKey, payload)
    sourceApplyReceipts.set(operationKey, raw)
    return raw
  }

  if (name === 'workTrees:decide') {
    const command = input as Record<string, unknown>
    const key = String(command.idempotencyKey)
    const payload = JSON.stringify(command)
    const priorPayload = sourceDecisionPayloads.get(key)
    if (priorPayload !== undefined) {
      if (priorPayload !== payload) {
        const current = await source.inspect({ projectId: String(command.projectId) })
        const revision = current.kind === 'accepted' ? current.revision : Number(command.expectedRevision)
        return refusedDecision(command, 'digest_mismatch', revision)
      }
      return sourceDecisionReceipts.get(key)
    }
    const result = await source.decide(command as never)
    if (!('decision' in result)) return result
    sourceDecisionPayloads.set(key, payload)
    sourceDecisionReceipts.set(key, result)
    return result
  }

  throw new Error(`unknown_source_mutation:${name}`)
}

async function dispatchQuery(name: string, input: unknown): Promise<unknown> {
  if (name !== 'workTrees:inspect') throw new Error(`unknown_source_query:${name}`)
  const result = await source.inspect(input as { projectId: string })
  if (result.kind === 'refused') return { kind: 'refused', code: 'not_found' }
  const output = { kind: 'accepted' as const, readback: toAgentReadback(result) }
  return output
}

function toAgentReadback(result: Extract<WorkTreeInspectResult, { kind: 'accepted' }>) {
  return {
    projectId: result.projectId,
    treeId: result.treeId,
    lineage: { kind: 'standalone' as const },
    generation: result.generation,
    revision: result.revision,
    tree: result.tree,
    events: result.events.map(({ payloadJson, ...event }) => ({
      ...event,
      payloadDigest: canonicalDigest(payloadJson),
    })),
    receipts: result.receipts,
    hasMoreEvents: result.hasMoreEvents,
  }
}

function refusedDecision(command: Record<string, unknown>, refusalCode: 'stale_fence' | 'forbidden' | 'not_found' | 'digest_mismatch', revision: number): RootWorkTreeDecisionReceipt {
  return {
    kind: 'refused',
    decision: command.kind as 'lock' | 'adjust' | 'park',
    projectId: String(command.projectId),
    nodeId: String(command.nodeId),
    receiptId: `receipt:refused:${String(command.idempotencyKey)}`,
    generation: Number(command.expectedGeneration),
    revision,
    disposition: 'unchanged',
    refusalCode,
    occurredAt: 1_754_000_000_000,
    readback: { projectId: String(command.projectId), revision },
  }
}
