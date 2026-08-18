/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

describe('project spine after table unlist', () => {
  it('does not start Workflow instances or persist spine rows', async () => {
    const t = convexTest(schema, modules)
    await expect(t.mutation(internal.projectSpine.startProject, {
      projectId: 'cr:unlisted',
      now: 1_000,
    })).rejects.toThrow('project_spine_tables_unlisted')
    await expect(t.query(internal.projectSpine.readProjectSpine, { projectId: 'cr:unlisted' }))
      .resolves.toBeNull()
  })
})
