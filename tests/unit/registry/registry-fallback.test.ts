import { afterEach, describe, expect, it, vi } from 'vitest'

import { readPublicRegistrySearchPage } from '@/modules/registry/registry.functions'

vi.mock('@/lib/server/convex-source', () => ({
  callPublicSourceQuery: vi.fn(async () => {
    throw new Error('convex unavailable')
  }),
  sourceQuery: (name: string) => name,
}))

describe('registry convex fallback', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to the in-memory catalog when Convex queries fail outside production', async () => {
    const page = await readPublicRegistrySearchPage({
      query: 'emergency plumber parramatta',
      limit: 10,
    })

    expect(page.items.map((item) => item.slug)).toEqual(['parramatta-emergency-plumbing'])
  })

  it('returns an empty page for unmatched local queries instead of throwing', async () => {
    const page = await readPublicRegistrySearchPage({
      query: 'Emergency plumber Brunswick',
      limit: 10,
    })

    expect(page.items).toEqual([])
  })
})
