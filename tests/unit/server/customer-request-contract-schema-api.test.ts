import { describe, expect, it } from 'vitest'

import {
  CUSTOMER_REQUEST_AGENT_ENTRYPOINT,
  CUSTOMER_REQUEST_NAVIGATION_RELATION_VALUES,
  CUSTOMER_REQUEST_STATE_VALUES,
} from '@/modules/customer-request/agent-contract'
import { handleCustomerRequestContractSchemaGet } from '@/routes/api.v1.requests.schema'

describe('customer Request contract schema API', () => {
  it('derives one executable public contract from the canonical Request schemas', async () => {
    const response = handleCustomerRequestContractSchemaGet()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(body).toMatchObject({
      kind: 'customer_request_contract',
      schemaVersion: 'customer-request-contract:v1',
      entrypoint: CUSTOMER_REQUEST_AGENT_ENTRYPOINT,
      lifecycleStates: CUSTOMER_REQUEST_STATE_VALUES,
      navigationRelations: CUSTOMER_REQUEST_NAVIGATION_RELATION_VALUES,
      continuation: {
        source: 'latest_response.navigation.actions',
        inputRule: 'replace_placeholders_only',
      },
    })
    expect(body.operations.submit).toMatchObject({
      method: 'POST', path: '/api/v1/requests',
      inputSchema: { type: 'object', additionalProperties: false },
    })
    expect(body.operations.prepareOptions).toMatchObject({
      method: 'POST', path: '/api/v1/requests/{requestRef}/options',
      inputSchema: { type: 'object', additionalProperties: false },
    })
    expect(body.resultSchema.anyOf).toBeInstanceOf(Array)
    expect(JSON.stringify(body)).not.toMatch(/shippo|easypost|accessible transfer|routeplan|convex/iu)
  })
})
