/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const workTreeApprovalsApi = anyApi.workTreeApprovals
if (workTreeApprovalsApi === undefined) throw new Error('work_tree_approvals_api_missing')
const issueApproval = workTreeApprovalsApi.issue
if (issueApproval === undefined) throw new Error('work_tree_approvals_api_missing')

describe('WorkTree approval seam after table unlist', () => {
  it('refuses issue without workTreeApprovals tables', async () => {
    const backend = convexTest(schema, modules)
    await expect(backend.mutation(issueApproval, {
      projectId: 'project:unlisted',
      nodeId: 'node:unlisted',
      kind: 'lock',
      expectedGeneration: 1,
      expectedRevision: 1,
      proposalDigest: 'digest:unlisted',
      credentialId: 'credential:unlisted',
      authority: { kind: 'per_item' },
      expiresAt: 1,
      idempotencyKey: 'approval:unlisted',
    })).resolves.toMatchObject({ kind: 'refused', code: 'work_tree_tables_unlisted' })
  })
})
