export const CUSTOMER_REQUEST_AGENT_SCOPE = 'customer_requests:create' as const

export const CUSTOMER_REQUEST_AGENT_ENTRYPOINT = Object.freeze({
  contract: 'Customer Request V2' as const,
  method: 'POST' as const,
  path: '/api/v1/requests' as const,
  authentication: 'clerk_api_key' as const,
  requiredScope: CUSTOMER_REQUEST_AGENT_SCOPE,
})
