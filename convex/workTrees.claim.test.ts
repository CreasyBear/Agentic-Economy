/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const workTreesApi = anyApi.workTrees
if (workTreesApi === undefined) throw new Error('work_tree_api_missing')

describe('WorkTree claim seam after table unlist', () => {
  it('refuses claim without workTrees tables', async () => {
    const backend = convexTest(schema, modules)
    await expect(backend.mutation(workTreesApi.claim, {
      projectId: 'project:unlisted',
      idempotencyKey: 'claim:unlisted',
      guestAssertion: 'guest:unlisted',
    })).resolves.toMatchObject({ kind: 'refused', code: 'work_tree_tables_unlisted' })
  })
})
