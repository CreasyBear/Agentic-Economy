import type {
  BusinessProblemViewResult,
  ProblemRoutePorts,
  ReadRouteProblemForBusinessInput,
} from './types'

export async function readRouteProblemForBusiness(
  input: ReadRouteProblemForBusinessInput,
  ports: ProblemRoutePorts,
): Promise<BusinessProblemViewResult> {
  return ports.readProblemForBusiness(input)
}
