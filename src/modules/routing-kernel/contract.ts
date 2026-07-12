export const ROUTING_PROTOCOL_VERSION = 'ae-routing:v1' as const
export const ROUTING_MCP_PROTOCOL_VERSION = '2025-06-18' as const
export const ROUTING_OPERATIONS = ['route', 'authorize', 'execute', 'reconcile', 'inspect', 'cancel'] as const
export const ROUTING_MCP_TOOLS = ['ae.route', 'ae.authorize', 'ae.execute', 'ae.reconcile', 'ae.inspect', 'ae.cancel'] as const

export type RoutingOperation = (typeof ROUTING_OPERATIONS)[number]
