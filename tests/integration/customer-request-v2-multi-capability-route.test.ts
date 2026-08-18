import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'

describe('Customer Request multi-capability route after table unlist', () => {
  it('refuses route execution reads without Customer Request tables', async () => {
    const backend = convexTest(schema, modules)
    await expect(backend.query(internal.customerRequestRouteExecution.getCurrent, {
      requestId: 'request:unlisted',
    })).rejects.toThrow('customer_request_tables_unlisted')
  })
})
