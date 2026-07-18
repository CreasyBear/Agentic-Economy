import type { CustomerRequestV2ReadPorts } from './ports'
import type {
  GetRoutePlanGenerationRefreshReplayArgs,
  GetRoutePlanGenerationRefreshReplayResult,
} from './types'

export async function getRoutePlanGenerationRefreshReplay(
  args: GetRoutePlanGenerationRefreshReplayArgs,
  ports: CustomerRequestV2ReadPorts,
): Promise<GetRoutePlanGenerationRefreshReplayResult> {
  const command = await ports.loadGenerationCommand(args.commandKey)
  if (command === null) return { kind: 'not_found' as const }
  if (command.commandDigest !== args.commandDigest || command.principalId !== args.principalId
    || command.requestId !== args.requestId) {
    return { kind: 'command_conflict' as const }
  }
  return await ports.readGenerationRefreshCommandResult(command)
}
