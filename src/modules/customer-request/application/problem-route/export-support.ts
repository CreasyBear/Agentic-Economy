import type {
  ExportRouteProblemForSupportInput,
  ProblemRoutePorts,
  SupportProblemExportResult,
} from './types'

export async function exportRouteProblemForSupport(
  input: ExportRouteProblemForSupportInput,
  ports: ProblemRoutePorts,
): Promise<SupportProblemExportResult> {
  return ports.exportProblemForSupport(input)
}
