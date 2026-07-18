import type { CustomerRequestV2ReadPorts } from './ports'
import type {
  GetRoutePlanGenerationArgs,
  GetRoutePlanGenerationResult,
} from './types'

export async function getRoutePlanGeneration(
  args: GetRoutePlanGenerationArgs,
  ports: CustomerRequestV2ReadPorts,
): Promise<GetRoutePlanGenerationResult> {
  return await ports.loadExactRoutePlanGeneration(args.requestId, args.generationRef)
}
