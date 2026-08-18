import { problem } from '@/lib/server/problem'
import {
  isQuarantineSurfaceRetired,
  quarantineSurfaceRetiredProblemInput,
} from '@/modules/product-frontier/quarantine-write-admission'

export function quarantineWriteResponse(
  actionId: string,
  _readOnly = false,
): Response | undefined {
  if (!isQuarantineSurfaceRetired(actionId)) return undefined
  return problem(quarantineSurfaceRetiredProblemInput(actionId))
}

export function quarantineFamilyWriteResponse(actionId: string): Response {
  return problem(quarantineSurfaceRetiredProblemInput(actionId))
}
