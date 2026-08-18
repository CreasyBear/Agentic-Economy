import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'

describe('atomic V2 Customer Request aggregate persistence after table unlist', () => {
  it('refuses submission shells and aggregate writes', async () => {
    const backend = convexTest(schema, modules)
    const command = {
      commandKey: 'principal:one:submit:request:shell:command:one',
      commandDigest: canonicalDigest({ request: 'Coordinate an accessible office relocation.' }),
      principalId: 'principal:one',
      delegatedAgentId: 'agent:one',
      requestId: 'request:shell',
      intent: 'Coordinate an accessible office relocation.',
      networkId: 'ae:public',
      createdAt: 1_700_000_000_000,
    }
    await expect(backend.mutation(internal.customerRequestV2.reserveSubmission, command))
      .rejects.toThrow('customer_request_tables_unlisted')
    await expect(backend.query(internal.customerRequestV2.getSubmissionShell, {
      requestId: 'request:shell',
      principalId: 'principal:one',
    })).rejects.toThrow('customer_request_tables_unlisted')
  })
})
