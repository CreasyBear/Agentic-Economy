import type {
  ListRouteProblemsForSupportInput,
  ProblemRoutePorts,
  SupportProblemListResult,
} from './types'

export async function listRouteProblemsForSupport(
  input: ListRouteProblemsForSupportInput,
  ports: ProblemRoutePorts,
): Promise<SupportProblemListResult> {
  return ports.listProblemsForSupport(input)
}
