import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'

describe('V2 Request registration-only business substitution after table unlist', () => {
  it('refuses Customer Request preview without tables', async () => {
    const backend = convexTest(schema, modules)
    await expect(backend.action(api.customerRequestApplication.preview, {
      customerJob: 'Unlisted',
      network: 'ae:public',
    })).rejects.toThrow('customer_request_tables_unlisted')
  })
})
