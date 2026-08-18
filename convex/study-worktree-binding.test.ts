/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const workTreesApi = anyApi.workTrees
if (workTreesApi === undefined) throw new Error('work_tree_api_missing')
const inspectWorkTree = workTreesApi.inspect
if (inspectWorkTree === undefined) throw new Error('work_tree_api_missing')

describe('WorkTree Study binding after table unlist', () => {
  it('refuses inspect without workTrees tables', async () => {
    const backend = convexTest(schema, modules)
    await expect(backend.query(inspectWorkTree, { projectId: 'project:study-binding' }))
      .resolves.toMatchObject({ kind: 'refused', code: 'not_found' })
  })
})
