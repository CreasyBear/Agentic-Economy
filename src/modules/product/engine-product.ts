export const ENGINE_LIFECYCLE = [
  { id: 'request', label: 'Request', description: 'Natural-language intent plus network and constraints.' },
  { id: 'quote', label: 'Quote', description: 'Ranked route graphs with cost, data use, and fallback order.' },
  { id: 'approve', label: 'Approve', description: 'Bounded authority tied to the exact quote digest.' },
  { id: 'run', label: 'Run', description: 'Idempotent execution across one or many capability calls.' },
  { id: 'inspect', label: 'Inspect', description: 'One Root Run with attempts, evidence, and final state.' },
] as const

export const ROUTING_OPERATIONS = [
  { id: 'route', method: 'POST', path: '/v1/route', purpose: 'Compile a request into ranked route graphs.' },
  { id: 'authorize', method: 'POST', path: '/v1/authorize', purpose: 'Approve one immutable quote within declared limits.' },
  { id: 'execute', method: 'POST', path: '/v1/execute', purpose: 'Execute an authorized quote exactly once.' },
  { id: 'inspect', method: 'POST', path: '/v1/inspect', purpose: 'Read the current Root Run and leaf attempts.' },
  { id: 'reconcile', method: 'POST', path: '/v1/reconcile', purpose: 'Attach a provider outcome to a run.' },
  { id: 'cancel', method: 'POST', path: '/v1/cancel', purpose: 'Request cancellation through the route graph.' },
] as const

export const DEFAULT_ROUTE_REQUEST = Object.freeze({
  protocolVersion: 'ae-routing:v1',
  operation: 'route',
  input: {
    networkId: 'network:au-first',
    query: 'Purchase one parcel label.',
    constraints: { currency: 'AUD', maximumSpendMinor: 1_500 },
  },
})

export function routeRequestJson(query: string, networkId: string, currency: string, maximumSpendMinor: number): string {
  return JSON.stringify({
    protocolVersion: 'ae-routing:v1',
    operation: 'route',
    input: { networkId, query, constraints: { currency, maximumSpendMinor } },
  }, null, 2)
}
