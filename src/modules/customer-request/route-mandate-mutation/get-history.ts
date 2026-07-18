import type { RouteMandateMutationPorts } from './ports'
import type { GetHistoryArgs, HistoryResult } from './types'

export async function getHistory(
  args: GetHistoryArgs,
  ports: RouteMandateMutationPorts,
): Promise<HistoryResult> {
  const authenticated = await ports.authenticateOwner(args.requestId)
  if (authenticated.kind !== 'authenticated') return { kind: 'not_found' as const }
  return await ports.loadHistory(args.requestId, authenticated.principalId)
}
