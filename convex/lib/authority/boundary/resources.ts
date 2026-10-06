// Buyer transport authentication checks the live selected-Tool grant. The purchased
// Tool is separately admitted at its consequence boundary. Route IDs do not consume
// the 64 resources available for selected Tools.
export function isBuyerAuthenticationSurface(operationKey: string): boolean {
  const httpSurfaces = [
    'tools-call', 'account-self', 'account-balance', 'account-activity', 'feedback-submit',
    'market-request-create', 'market-request-list', 'market-request-status',
    'funding-handoff-config', 'funding-handoff-create', 'funding-handoff-status',
  ]
  const mcpSurfaces = [
    'tools-list', 'tool.quote', 'tool.call', 'call.list', 'call.status', 'call.cancel', 'call.reconcile',
    'agent-access.whoami', 'agent-access.balance', 'agent-access.activity',
    'market-demand.record', 'market-demand.list', 'market-demand.status',
    'funding.handoff.config', 'funding.handoff.create', 'funding.handoff.status',
  ]
  return [
    ...httpSurfaces.map((surface) => `surface:http:${surface}`),
    ...mcpSurfaces.map((surface) => `surface:mcp:${surface}`),
  ].includes(operationKey)
}
