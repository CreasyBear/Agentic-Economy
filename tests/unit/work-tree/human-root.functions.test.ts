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
import {
  claimRootWorkTreeServer,
  decideRootWorkTreeServer,
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
  principalId: 'https://identity.example|clerk-owner-t45',
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
    readback: { ...readback, principalId: 'https://identity.example|clerk-owner-t45' },
    receipt: {
      receiptRef: 'work-tree-claim:receipt',
      projectId,
      treeId: tree.treeId,
      operationKey: 't45:claim',
      event: { kind: 'claimed', operationKey: 'work-tree:claim:op', seq: 2 },
      actor: { principalId: 'https://identity.example|clerk-owner-t45', ownerId: 'clerk-owner-t45' },
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
      actor: { principalId: sourceReadback.principalId, ownerId: 'clerk-owner-t45', source: 'human_source' },
      generation: 1,
      revision: 1,
      payloadDigest: 'digest:create',
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
  it('claims, clears guest transport, then uses authenticated owner source calls', async () => {
    const claim = await claimRootWorkTreeServer({ data: { projectId, idempotencyKey: 't45:claim' } })
    expect(claim).toMatchObject({ kind: 'accepted', code: 'work_tree_claimed' })
    expect(serverMocks.claim).toHaveBeenCalledWith({
      projectId,
      idempotencyKey: 't45:claim',
      guestAssertion: expect.any(String),
    })
    expect(serverMocks.setCookie).toHaveBeenCalledWith('ae_guest_session', '', expect.objectContaining({ maxAge: 0 }))

    await readRootWorkTreeServer({ data: { projectId } })
    expect(serverMocks.inspect).toHaveBeenCalledWith({ projectId })
    expect(serverMocks.inspect).not.toHaveBeenCalledWith(expect.objectContaining({ guestAssertion: expect.any(String) }))

    await decideRootWorkTreeServer({
      data: {
        projectId,
        nodeId: 'decision:one',
        kind: 'lock',
        expectedGeneration: 1,
        expectedRevision: 1,
      },
    })
    expect(serverMocks.decide).toHaveBeenCalledWith(expect.not.objectContaining({ guestAssertion: expect.any(String) }))
  })
  it('keeps an authenticated start on the owner source path', async () => {
    serverMocks.auth.mockResolvedValue({ isAuthenticated: true })

    const started = await startRootWorkTreeServer({ data: { outcome: 'Prepare a bounded BAS path.' } })

    expect(started).toEqual({ kind: 'started', projectId })
    expect(serverMocks.create).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: expect.any(String),
      charterText: 'Prepare a bounded BAS path.',
    }))
    expect(serverMocks.create).not.toHaveBeenCalledWith(expect.objectContaining({ guestAssertion: expect.any(String) }))
    await readRootWorkTreeServer({ data: { projectId } })
    expect(serverMocks.inspect).toHaveBeenCalledWith({ projectId })
  })

  it('claims an anonymous start when sign-in returns to its project URL', async () => {
    serverMocks.auth.mockResolvedValue({ isAuthenticated: false })
    serverMocks.cookie = undefined

    const started = await startRootWorkTreeServer({ data: { outcome: 'Prepare a bounded BAS path.' } })
    expect(started).toEqual({ kind: 'started', projectId })
    expect(serverMocks.create).toHaveBeenCalledWith(expect.objectContaining({ guestAssertion: expect.any(String) }))
    const guestAssertion = serverMocks.cookie

    serverMocks.auth.mockResolvedValue({ isAuthenticated: true })
    await readRootWorkTreeServer({ data: { projectId } })

    expect(serverMocks.claim).toHaveBeenCalledWith({
      projectId,
      idempotencyKey: `work-tree:claim:${projectId}`,
      guestAssertion,
    })
    expect(serverMocks.inspect).toHaveBeenCalledWith({ projectId })
  })
})
