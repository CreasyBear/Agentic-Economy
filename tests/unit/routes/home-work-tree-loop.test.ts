import { describe, expect, it } from 'vitest'

import {
  loadRootRoute,
  type RootRouteDeps,
  type ServicesRouteReadback,
} from '@/routes/index'
import {
  readRootWorkTree,
  type WorkTreeSourcePort,
} from '@/modules/work-tree/internal/root-loop'

import { createFakeWorkTreeSource } from './home-work-tree-loop.fixtures'

const BAS_ASK = 'My BAS is overdue and my books are a mess'
const ORDINARY_ASK = 'dentist near Adelaide'
const NOW_MS = 1_700_000_100_000

const SERVICES_PAGE = {
  services: [],
  plan: {
    kind: 'unavailable',
    reason: 'preview_unavailable',
    destination: { label: 'services', request: 'service search' },
    decisions: [],
  },
} satisfies ServicesRouteReadback

function depsFor(
  source: WorkTreeSourcePort,
  loadServices: RootRouteDeps['loadServices'] = async () => SERVICES_PAGE,
): RootRouteDeps {
  return {
    readWorkTree: (projectId) => readRootWorkTree({ projectId, nowMs: NOW_MS }, source),
    loadServices,
  }
}

describe('root route readback', () => {
  it.each([
    ['a BAS ask', BAS_ASK],
    ['an ordinary ask', ORDINARY_ASK],
  ])('loads services for %s without starting a WorkTree', async (_label, query) => {
    const source = createFakeWorkTreeSource()
    const loadedSearches: Array<Parameters<RootRouteDeps['loadServices']>[0]> = []

    const loaded = await loadRootRoute({
      q: query,
    }, depsFor(source, async (search) => {
      loadedSearches.push(search)
      return SERVICES_PAGE
    }))

    expect(loaded).toEqual({ kind: 'services', page: SERVICES_PAGE })
    expect(loadedSearches).toEqual([{ q: query }])
    expect(source.ops()).toEqual([])
  })

  it('reads an explicit project reference from the WorkTree source', async () => {
    const source = createFakeWorkTreeSource()
    const created = await source.create({
      idempotencyKey: 'route-project-readback',
      charterText: 'an explicit project readback',
      lineage: { kind: 'standalone' },
    })
    if (created.kind === 'refused') throw new Error(`project creation refused: ${created.reason}`)

    const loaded = await loadRootRoute({
      project: created.projectId,
    }, depsFor(source))

    expect(loaded).toMatchObject({
      kind: 'work-tree',
      readback: {
        kind: 'ready',
        projectId: created.projectId,
      },
    })
    expect(source.ops()).toEqual(['create', 'inspect'])
  })

  it('refuses an unknown project reference without creating anything', async () => {
    const source = createFakeWorkTreeSource()

    const loaded = await loadRootRoute({
      project: 'project_opaque_missing',
    }, depsFor(source, async () => {
      throw new Error('an explicit project must not load services')
    }))

    expect(loaded).toEqual({
      kind: 'work-tree',
      readback: { kind: 'refused', reason: 'not_found' },
    })
    expect(source.ops()).toEqual(['inspect'])
  })
})
