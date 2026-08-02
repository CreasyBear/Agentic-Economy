import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import { loadRootRoute, type RootRouteDeps } from '@/routes/index'
import {
  decideRootWorkTree,
  isBasDevelopmentAsk,
  readRootWorkTree,
  ROOT_WORK_TREE_MOCK_REF,
  startRootWorkTree,
  type RootWorkTreeReadback,
  type RootWorkTreeView,
  type WorkTreeDecisionKind,
  type WorkTreeDecisionReceipt,
  type WorkTreeSourcePort,
} from '@/modules/work-tree/internal/root-loop'

import { createFakeWorkTreeSource, type FakeWorkTreeSource } from './home-work-tree-loop.fixtures'

/**
 * T46 tracers, driven at the public route boundary (`loadRootRoute`) against a
 * kernel-backed source double. Nothing here asserts component state or a raw
 * table: the person's journey is whatever the source readback says it is.
 */

const BAS_ASK = 'My BAS is overdue and my books are a mess'
const NOW_MS = 1_700_000_100_000

function depsFor(source: WorkTreeSourcePort): RootRouteDeps {
  return {
    startWorkTree: (outcome) => startRootWorkTree({ outcome }, source),
    readWorkTree: (projectId) => readRootWorkTree({ projectId, nowMs: NOW_MS }, source),
    loadServices: () => { throw new Error('a WorkTree ask must never fall through to the service list') },
    isWorkTreeAsk: isBasDevelopmentAsk,
  }
}

async function submitBasAsk(source: FakeWorkTreeSource): Promise<string> {
  let thrown: unknown
  try {
    await loadRootRoute({ q: BAS_ASK }, depsFor(source))
  } catch (error) {
    thrown = error
  }
  if (!isRedirect(thrown)) throw new Error('the root submit did not move the person onto a project reference')
  const projectId = (thrown.options.search as { project?: string } | undefined)?.project
  if (typeof projectId !== 'string' || projectId.length === 0) throw new Error('the redirect carried no project reference')
  return projectId
}

async function readView(source: FakeWorkTreeSource, projectId: string): Promise<RootWorkTreeView> {
  const loaded = await loadRootRoute({ project: projectId }, depsFor(source))
  if (loaded?.kind !== 'work-tree') throw new Error('the project reference did not render the WorkTree loop')
  const readback: RootWorkTreeReadback = loaded.readback
  if (readback.kind !== 'ready') throw new Error(`readback refused: ${readback.reason}`)
  return readback
}

async function readyView(source: FakeWorkTreeSource): Promise<RootWorkTreeView> {
  return readView(source, await submitBasAsk(source))
}

function decisionNodeId(view: RootWorkTreeView): string {
  const nodeId = view.inbox.items[0]?.nodeId
  if (nodeId === undefined) throw new Error('the inbox surfaced no decision to take')
  return nodeId
}

function decide(
  source: FakeWorkTreeSource,
  view: RootWorkTreeView,
  kind: WorkTreeDecisionKind,
  fence: { generation?: number; revision?: number } = {},
): Promise<Readonly<{ receipt: WorkTreeDecisionReceipt; readback: RootWorkTreeReadback }>> {
  return decideRootWorkTree({
    projectId: view.projectId,
    nodeId: decisionNodeId(view),
    kind,
    expectedGeneration: fence.generation ?? view.generation,
    expectedRevision: fence.revision ?? view.revision,
    nowMs: NOW_MS,
  }, source)
}

describe('root WorkTree loop', () => {
  it('creates the durable project and root before any elaboration, then moves the person onto it', async () => {
    const source = createFakeWorkTreeSource()

    const projectId = await submitBasAsk(source)

    // Durability first: the very first source call is the create, so someone who
    // leaves mid-elaboration still owns the project when they come back.
    expect(source.ops()[0]).toBe('create')
    expect(projectId.toLowerCase()).not.toContain('bas')
    expect(source.tree(projectId).nodes.find((node) => node.parentId === undefined))
      .toMatchObject({ nodeId: 'root', kind: 'package' })
  })

  it('resumes the same project when the same ask is submitted again', async () => {
    const source = createFakeWorkTreeSource()

    expect(await submitBasAsk(source)).toBe(await submitBasAsk(source))
  })

  it('applies the labelled BAS elaboration through workTree.apply and surfaces one decision', async () => {
    const source = createFakeWorkTreeSource()

    const view = await readyView(source)

    // Only the gardener seam was used: no plan store, no decision map, no second
    // authority. create, apply and inspect are the whole surface.
    expect([...new Set(source.ops())].sort()).toEqual(['apply', 'create', 'inspect'])
    expect(view.tree.nodes.filter((node) => node.evidenceRefs.includes(ROOT_WORK_TREE_MOCK_REF))).toHaveLength(4)
    expect(view.mockLabel).toBeDefined()
    expect(view.inbox.items).toHaveLength(1)
    expect(view.inbox.items[0]).toMatchObject({
      status: 'ready',
      title: 'Choose how your BAS gets brought up to date',
    })
  })

  it('returns a durable receipt for Lock and reads the locked transition back', async () => {
    const source = createFakeWorkTreeSource()
    const view = await readyView(source)
    const nodeId = decisionNodeId(view)

    const { receipt, readback } = await decide(source, view, 'lock')

    expect(receipt).toMatchObject({ kind: 'accepted', decision: 'lock', disposition: 'locked', nodeId })
    if (readback.kind !== 'ready') throw new Error('readback refused after Lock')
    expect(readback.tree.nodes.find((node) => node.nodeId === nodeId)?.status).toBe('locked')
    expect(readback.receipts.at(-1)).toEqual(receipt)
    expect(readback.revision).toBeGreaterThan(view.revision)
  })

  it('refuses a stale Adjust and leaves the tree exactly as it was', async () => {
    const source = createFakeWorkTreeSource()
    const view = await readyView(source)

    const { receipt, readback } = await decide(source, view, 'adjust', { revision: view.revision - 1 })

    expect(receipt).toMatchObject({ kind: 'refused', decision: 'adjust', refusalCode: 'stale_fence', disposition: 'unchanged' })
    if (readback.kind !== 'ready') throw new Error('readback refused after the stale Adjust')
    expect(readback.tree).toEqual(view.tree)
    expect(readback.revision).toBe(view.revision)
  })

  it('records the parked disposition for Park', async () => {
    const source = createFakeWorkTreeSource()
    const view = await readyView(source)
    const nodeId = decisionNodeId(view)

    const { receipt, readback } = await decide(source, view, 'park')

    expect(receipt).toMatchObject({ kind: 'accepted', decision: 'park', disposition: 'queued' })
    if (readback.kind !== 'ready') throw new Error('readback refused after Park')
    expect(readback.tree.nodes.find((node) => node.nodeId === nodeId)?.status).toBe('queued')
  })

  it('restores the same revision, inbox and receipt on a cold reload without replaying anything', async () => {
    const source = createFakeWorkTreeSource()
    const view = await readyView(source)
    const decided = await decide(source, view, 'park')
    if (decided.readback.kind !== 'ready') throw new Error('readback refused after Park')

    source.markReloadBoundary()
    const reloaded = await readView(source, view.projectId)

    // A cold reload is one inspect: no create, no apply, no decide, and no
    expect(source.opsSinceReload()).toEqual(['inspect'])
    if (!('readback' in decided.receipt)) throw new Error('decision receipt readback missing after Park')
    expect(reloaded.revision).toBe(decided.receipt.readback.revision)
    expect(reloaded.receipts.at(-1)).toEqual(decided.receipt)
    expect(reloaded.inbox.items.map((item) => item.nodeId))
      .toEqual(decided.readback.inbox.items.map((item) => item.nodeId))
  })

  it('refuses an unknown project reference without creating anything', async () => {
    const source = createFakeWorkTreeSource()

    const loaded = await loadRootRoute({ project: 'project_opaque_missing' }, depsFor(source))

    expect(loaded).toEqual({ kind: 'work-tree', readback: { kind: 'refused', reason: 'not_found' } })
    expect(source.ops()).toEqual(['inspect'])
  })

  it('keeps a non-WorkTree ask on the service list and never touches the WorkTree source', async () => {
    const source = createFakeWorkTreeSource()
    const page = { services: [], plan: { kind: 'unavailable' } } as never

    const loaded = await loadRootRoute({ q: 'dentist near Adelaide' }, {
      ...depsFor(source),
      loadServices: async () => page,
    })

    expect(loaded).toEqual({ kind: 'services', page })
    expect(source.ops()).toEqual([])
  })
})
