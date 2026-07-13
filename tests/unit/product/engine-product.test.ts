import { describe, expect, it } from 'vitest'

import { CUSTOMER_REQUEST_OPERATIONS, ENGINE_LIFECYCLE } from '@/modules/product/engine-product'

describe('engine product contract', () => {
  it('projects the current Request lifecycle without retired routing operations', () => {
    expect(ENGINE_LIFECYCLE.map((step) => step.id)).toEqual(['request', 'clarify', 'compare', 'resume'])
    expect(CUSTOMER_REQUEST_OPERATIONS.map((operation) => operation.id)).toEqual(['submit', 'message', 'facts', 'options', 'resume'])
  })

})
