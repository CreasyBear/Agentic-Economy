import { problem } from '@/lib/server/problem'
import {
  isQuarantineWrite,
  quarantineWriteProblemInput,
} from '@/modules/product-frontier/quarantine-write-admission'

export function quarantineWriteResponse(
  actionId: string,
  readOnly = false,
): Response | undefined {
  if (!isQuarantineWrite(actionId, readOnly)) return undefined
  return problem(quarantineWriteProblemInput(actionId))
}

export function quarantineFamilyWriteResponse(actionId: string): Response {
  return problem(quarantineWriteProblemInput(actionId))
}
