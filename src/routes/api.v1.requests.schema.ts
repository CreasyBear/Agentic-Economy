import { createFileRoute } from '@tanstack/react-router'

import {
  buildCustomerRequestContractSchema,
  CUSTOMER_REQUEST_CONTRACT_SCHEMA_VERSION,
} from '@/modules/customer-request/public-contract-schema'

export const Route = createFileRoute('/api/v1/requests/schema')({
  server: { handlers: { GET: () => handleCustomerRequestContractSchemaGet() } },
})

export function handleCustomerRequestContractSchemaGet(): Response {
  return Response.json(buildCustomerRequestContractSchema(), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      'X-AE-Customer-Request-Schema-Version': CUSTOMER_REQUEST_CONTRACT_SCHEMA_VERSION,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
