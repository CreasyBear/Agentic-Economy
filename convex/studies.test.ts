/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const studiesApi = anyApi.studies
if (studiesApi === undefined) throw new Error('study_api_missing')

function requireApiBinding<T>(binding: T | undefined, errorMessage: string): T {
  if (binding === undefined) throw new Error(errorMessage)
  return binding
}

const createStudy = requireApiBinding(studiesApi.create, 'study_create_missing')
const inspectStudy = requireApiBinding(studiesApi.getById, 'study_get_by_id_missing')

describe('Study Convex seam after table unlist', () => {
  it('refuses writes and inspects as not found without studies tables', async () => {
    const backend = convexTest(schema, modules)
    await expect(backend.query(inspectStudy, {
      studyId: 'study:unlisted',
      ownerSessionId: 'owner-session:unlisted',
    })).resolves.toEqual({ kind: 'not_found' })
    await expect(backend.mutation(createStudy, {
      studyId: 'study:unlisted',
      projectId: 'project:unlisted',
      nodeId: 'node:unlisted',
      operationKey: 'study:unlisted:create',
      correlationId: 'study:unlisted:create',
      artifactJson: '{}',
    })).resolves.toEqual({ kind: 'refused', reason: 'study_tables_unlisted' })
  })
})
