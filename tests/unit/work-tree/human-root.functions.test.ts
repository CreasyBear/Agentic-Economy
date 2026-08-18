import { beforeEach, describe, expect, it, vi } from 'vitest'

const serverMocks = vi.hoisted(() => ({
  createServerFn: vi.fn(() => ({
    validator: () => ({ handler: (handler: unknown) => handler }),
    handler: (handler: unknown) => handler,
  })),
  cookie: undefined as string | undefined,
  setCookie: vi.fn(),
  auth: vi.fn(),
  claim: vi.fn(),
  create: vi.fn(),
  inspect: vi.fn(),
  decide: vi.fn(),
}))

vi.mock('@tanstack/react-start', () => ({ createServerFn: serverMocks.createServerFn }))
vi.mock('@tanstack/react-start/server', () => ({
  getCookie: () => serverMocks.cookie,
  setCookie: serverMocks.setCookie,
  getRequest: () => new Request('http://localhost/'),
}))
vi.mock('@clerk/tanstack-react-start/server', () => ({ auth: serverMocks.auth }))
vi.mock('@/modules/work-tree/work-tree-approval.functions', () => ({
  issueWorkTreeApprovalThroughSource: vi.fn(),
}))
vi.mock('@/modules/work-tree/work-tree.functions', () => ({
  claimWorkTreeThroughSource: serverMocks.claim,
  createWorkTreeThroughSource: serverMocks.create,
  inspectWorkTreeThroughSource: serverMocks.inspect,
  applyWorkTreeThroughSource: vi.fn(),
  decideWorkTreeThroughSource: serverMocks.decide,
}))

import { mintBrowserGuestAssertion } from '@/lib/server/browser-guest-assertion'
import { QUARANTINE_WRITES_FROZEN_CODE } from '@/modules/product-frontier/quarantine-write-admission'
import {
  claimRootWorkTreeServer,
  decideRootWorkTreeServer,
  issueRootWorkTreeApprovalServer,
  readRootWorkTreeServer,
  startRootWorkTreeServer,
} from '@/modules/work-tree/human-root.functions'

const signingKey = 'human-root-claim-host-signing-key-that-is-at-least-32-bytes'
const projectId = 'project:host-claim'
const guestSessionId = '123e4567-e89b-42d3-a456-426614174010'
const tree = {
  format: 'ae.work-tree:v1' as const,
  treeId: 'tree:host-claim',
  projectId,
  generation: 1,
  revision: 1,
  charterText: 'Prepare a bounded BAS path.',
  nodes: [{
    format: 'ae.work-node:v1' as const,
    nodeId: 'root',
    kind: 'package' as const,
    title: 'Prepare a bounded BAS path.',
    status: 'fog' as const,
    dependsOn: [] as string[],
    priority: 0,
    evidenceRefs: [] as string[],
    createdAt: 1,
    updatedAt: 1,
  }],
}
const startedTree = {
  ...tree,
  nodes: [{ ...tree.nodes[0], status: 'ready' as const }],
}
const readback = {
  kind: 'accepted' as const,
  projectId,
  treeId: tree.treeId,
  generation: tree.generation,
  revision: tree.revision,
  tree,
  events: [],
  hasMoreEvents: false,
}
const sourceReadback = {
  ...readback,
  lineage: { kind: 'standalone' as const },
}

beforeEach(async () => {
  process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = signingKey
  serverMocks.cookie = await mintBrowserGuestAssertion(signingKey, {
    sessionId: guestSessionId,
    issuedAt: Date.now(),
  })
  serverMocks.setCookie.mockReset()
  serverMocks.setCookie.mockImplementation((_name, value) => {
    serverMocks.cookie = value.length === 0 ? undefined : value
  })
  serverMocks.claim.mockReset()
  serverMocks.create.mockReset()
  serverMocks.inspect.mockReset()
  serverMocks.decide.mockReset()
  serverMocks.auth.mockReset()
  serverMocks.auth.mockResolvedValue({ isAuthenticated: true })
  serverMocks.claim.mockResolvedValue({
    kind: 'accepted',
    code: 'work_tree_claimed',
    replayed: false,
    readback: sourceReadback,
    receipt: {
      receiptRef: 'work-tree-claim:receipt',
      projectId,
      treeId: tree.treeId,
      operationKey: 't45:claim',
      event: { kind: 'claimed', operationKey: 'work-tree:claim:op', seq: 2 },
      actor: { source: 'human_source' },
      generation: 1,
      revision: 1,
      payloadDigest: 'digest:claim',
    },
  })
  serverMocks.create.mockResolvedValue({
    kind: 'accepted',
    code: 'work_tree_created',
    replayed: false,
    readback: { ...sourceReadback, tree: startedTree },
    receipt: {
      receiptRef: 'work-tree-create:receipt',
      projectId,
      treeId: startedTree.treeId,
      operationKey: 'work-tree:create',
      event: { kind: 'created', operationKey: 'work-tree:create', seq: 1 },
      actor: { source: 'human_source' },
      generation: 1,
      revision: 1,
      payloadDigest: 'digest:create',
      lineage: { kind: 'standalone' as const },
    },
  })
  serverMocks.inspect.mockResolvedValue({ kind: 'accepted', readback: { ...sourceReadback, receipts: [] } })
  serverMocks.decide.mockResolvedValue({
    kind: 'accepted',
    decision: 'lock',
    projectId,
    nodeId: 'decision:one',
    receiptId: 'receipt:decision',
    generation: 1,
    revision: 2,
    disposition: 'locked',
    occurredAt: 1_754_000_000_000,
    readback: { projectId, revision: 2 },
  })
})

describe('human WorkTree claim host seam', () => {
  it('freezes start, claim, decide, and approval writes without HTTP 410', async () => {
    const started = await startRootWorkTreeServer({
      data: { outcome: 'Prepare a bounded BAS path.' },
    })
    expect(started).toEqual({ kind: 'refused', reason: QUARANTINE_WRITES_FROZEN_CODE })
    expect(serverMocks.create).not.toHaveBeenCalled()

    const claim = await claimRootWorkTreeServer({ data: { projectId, idempotencyKey: 't45:claim' } })
    expect(claim).toEqual({ kind: 'refused', code: QUARANTINE_WRITES_FROZEN_CODE, replayed: false })
    expect(serverMocks.claim).not.toHaveBeenCalled()

    const decided = await decideRootWorkTreeServer({
      data: {
        projectId,
        nodeId: 'decision:one',
        kind: 'lock',
        expectedGeneration: 1,
        expectedRevision: 1,
      },
    })
    expect(decided).toEqual({
      receipt: { kind: 'refused', code: QUARANTINE_WRITES_FROZEN_CODE, replayed: false },
      readback: { kind: 'refused', reason: QUARANTINE_WRITES_FROZEN_CODE },
    })
    expect(serverMocks.decide).not.toHaveBeenCalled()

    const issued = await issueRootWorkTreeApprovalServer({
      data: {
        projectId,
        nodeId: 'decision:one',
        kind: 'lock',
        expectedGeneration: 1,
        expectedRevision: 1,
        proposalDigest: 'sha256:approval',
        credentialId: 'cred:1',
        authority: { kind: 'per_item' },
        expiresAt: Date.now() + 60_000,
        idempotencyKey: 'approval:1',
        acknowledgedConsequence: true,
        approvalKind: 'per_item',
      },
    })
    expect(issued).toEqual({ kind: 'refused', code: QUARANTINE_WRITES_FROZEN_CODE })
  })

  it('keeps authenticated readback off the freeze path', async () => {
    await readRootWorkTreeServer({ data: { projectId } })
    expect(serverMocks.inspect).toHaveBeenCalledWith({ projectId })
    expect(serverMocks.inspect).not.toHaveBeenCalledWith(expect.objectContaining({ guestAssertion: expect.any(String) }))
    expect(serverMocks.claim).not.toHaveBeenCalled()
  })
})
