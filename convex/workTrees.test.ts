/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const workTreesApi = anyApi.workTrees
if (workTreesApi === undefined) throw new Error('work_tree_api_missing')

describe('WorkTree Convex seam after table unlist', () => {
  it('refuses create and inspect without workTrees tables', async () => {
    const backend = convexTest(schema, modules)
    await expect(backend.mutation(workTreesApi.create, {
      idempotencyKey: 'work-tree:unlisted',
      charterText: 'Unlisted',
      lineage: { kind: 'standalone' },
    })).resolves.toMatchObject({ kind: 'refused', code: 'work_tree_tables_unlisted' })
    await expect(backend.query(workTreesApi.inspect, { projectId: 'project:unlisted' }))
      .resolves.toMatchObject({ kind: 'refused', code: 'not_found' })
  })
})
