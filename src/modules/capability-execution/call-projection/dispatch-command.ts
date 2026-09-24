import type { DurableActionExecutionPort } from '@/modules/action-execution/runtime'
import type { CallResult } from '@/modules/capability-execution/call-contracts'

export function toCallDispatchCommand(
  command: Parameters<DurableActionExecutionPort<CallResult>['transact']>[0],
) {
  const { commandId, commandDigest, expectedExecutionVersion, expectedEffectGeneration, row, currentAttemptWrite, history } = command
  return {
    commandId,
    commandDigest,
    expectedExecutionVersion,
    ...(expectedEffectGeneration === undefined ? {} : { expectedEffectGeneration }),
    row: {
      ...row,
      control: {
        ...row.control,
        control: row.control.control.state === 'gathering_information'
          ? { ...row.control.control, missingFields: [...row.control.control.missingFields] }
          : row.control.control,
      },
    },
    ...(currentAttemptWrite === undefined ? {} : { currentAttemptWrite }),
    history,
  }
}
