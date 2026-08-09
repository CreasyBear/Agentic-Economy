import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import {
  loadRootRoute,
  validateRootSearch,
  Route,
  type RootRouteDeps,
} from '@/routes/index'
import { validateNewThreadSearch } from '@/routes/t.new'
import {
  readRootWorkTree,
  type WorkTreeSourcePort,
} from '@/modules/work-tree/internal/root-loop'

import { createFakeWorkTreeSource } from './home-work-tree-loop.fixtures'
const BAS_ASK = 'My BAS is overdue and my books are a mess'
const ORDINARY_ASK = 'dentist near Adelaide'
const NOW_MS = 1_700_000_100_000



function depsFor(source: WorkTreeSourcePort): RootRouteDeps {
  return {
    readWorkTree: (projectId) => readRootWorkTree({ projectId, nowMs: NOW_MS }, source),
  }
}

describe('root route readback', () => {
  it.each([
    ['a BAS ask', BAS_ASK],
    ['an ordinary ask', ORDINARY_ASK],
  ])('does not execute a hidden homepage pipeline for %s', async (_label, query) => {
    const source = createFakeWorkTreeSource()

    await expect(loadRootRoute({ q: query }, depsFor(source))).resolves.toBeUndefined()
    expect(source.ops()).toEqual([])
  })

  it('redirects a query without a project to a new answer thread', () => {
    const beforeLoad = Route.options.beforeLoad
    if (beforeLoad === undefined) throw new Error('root query redirect is unavailable')

    let thrown: unknown
    try {
      beforeLoad({ search: { q: BAS_ASK } } as never)
    } catch (error) {
      thrown = error
    }

    expect(isRedirect(thrown)).toBe(true)
    if (!isRedirect(thrown)) return
    expect(thrown.options).toMatchObject({ to: '/t/new', search: { q: BAS_ASK } })
  })

  it('preserves a 173-character query through home and new-thread validation', () => {
    const query = 'x'.repeat(173)
    const beforeLoad = Route.options.beforeLoad
    if (beforeLoad === undefined) {
      throw new Error('answer query route contract is unavailable')
    }

    const homeSearch = validateRootSearch({ q: query })
    expect(homeSearch).toEqual({ q: query })

    let thrown: unknown
    try {
      beforeLoad({ search: homeSearch } as never)
    } catch (error) {
      thrown = error
    }

    expect(isRedirect(thrown)).toBe(true)
    if (!isRedirect(thrown)) return
    expect(thrown.options).toMatchObject({ to: '/t/new', search: { q: query } })
    expect(validateNewThreadSearch({ q: query })).toEqual({ q: query })
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
      q: BAS_ASK,
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
    }, depsFor(source))

    expect(loaded).toEqual({
      kind: 'work-tree',
      readback: { kind: 'refused', reason: 'not_found' },
    })
    expect(source.ops()).toEqual(['inspect'])
  })
})
