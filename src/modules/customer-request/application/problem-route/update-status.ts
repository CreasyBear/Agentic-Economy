import { projectProblemStatusChange } from './project'
import type {
  ProblemRoutePorts,
  UpdateRouteProblemStatusInput,
  UpdateRouteProblemStatusResult,
} from './types'

export async function updateRouteProblemStatus(
  input: UpdateRouteProblemStatusInput,
  ports: ProblemRoutePorts,
): Promise<UpdateRouteProblemStatusResult> {
  const result = await ports.updateProblemStatus(input)
  if (result.kind === 'conflict') {
    return { kind: 'conflict', reportRef: input.reportRef, reason: result.reason }
  }
  if (result.kind === 'refused') return result
  return projectProblemStatusChange('problem_status_updated', {
    reportRef: result.reportRef,
    version: result.version,
    state: result.state,
    recordedAt: result.recordedAt,
  })
}
