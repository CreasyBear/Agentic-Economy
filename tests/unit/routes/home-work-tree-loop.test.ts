import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import {
  loadRootRoute,
  validateRootSearch,
} from '@/modules/market/home-catalogue'
import { Route } from '@/routes/index'

const BAS_ASK = 'My BAS is overdue and my books are a mess'
const ORDINARY_ASK = 'dentist near Adelaide'

describe('root route readback', () => {
  it.each([
    ['a BAS ask', BAS_ASK],
    ['an ordinary ask', ORDINARY_ASK],
  ])('does not execute a hidden homepage pipeline for %s', async (_label, query) => {
    await expect(loadRootRoute({ q: query })).resolves.toBeUndefined()
  })

  it('redirects a query to the market even when a project param is present', () => {
    const beforeLoad = Route.options.beforeLoad
    if (beforeLoad === undefined) throw new Error('root query redirect is unavailable')

    let thrown: unknown
    try {
      beforeLoad({ search: { q: BAS_ASK, project: 'project_opaque' } } as never)
    } catch (error) {
      thrown = error
    }

    expect(isRedirect(thrown)).toBe(true)
    if (!isRedirect(thrown)) return
    expect(thrown.options).toMatchObject({ to: '/t/new', search: { q: BAS_ASK } })
  })

  it('redirects a query without a project to the market', () => {
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

  it('preserves a 173-character query through home and market navigation', () => {
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
  })

  it('ignores an explicit project reference without reading WorkTree', async () => {
    await expect(loadRootRoute({
      q: BAS_ASK,
      project: 'project_opaque_missing',
    })).resolves.toBeUndefined()
  })
})
