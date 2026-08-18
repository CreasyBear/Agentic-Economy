/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

describe('durable RouteMandate lifecycle after table unlist', () => {
  it('refuses mandate reads without Customer Request tables', async () => {
    const backend = convexTest(schema, modules)
    await expect(backend.query(internal.customerRequestRouteMandate.getCurrent, {
      requestId: 'request:unlisted',
    })).rejects.toThrow('customer_request_tables_unlisted')
  })
})
