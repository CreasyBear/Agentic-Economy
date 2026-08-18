import { createFileRoute } from '@tanstack/react-router'

import { retiredCustomerRequestResponse } from '@/lib/server/customer-request-gone'

function schemaGone(): Response {
  return retiredCustomerRequestResponse('customerRequest.planPreview')
}

export const Route = createFileRoute('/api/v1/requests/schema')({
  server: {
    handlers: {
      GET: () => schemaGone(),
      POST: () => schemaGone(),
      PUT: () => schemaGone(),
      PATCH: () => schemaGone(),
      DELETE: () => schemaGone(),
      HEAD: () => schemaGone(),
      OPTIONS: () => schemaGone(),
      TRACE: () => schemaGone(),
      CONNECT: () => schemaGone(),
    },
  },
})

export function handleCustomerRequestContractSchemaGet(): Response {
  return schemaGone()
}
