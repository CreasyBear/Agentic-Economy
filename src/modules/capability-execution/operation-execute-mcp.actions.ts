import { defineAction } from '@/modules/common/action'
import {
  operationExecuteContract,
  type OperationExecuteInput,
  type OperationExecuteResult,
} from './operation-execute-contract'

export { operationExecuteResultSchema } from './operation-execute-contract'

export const operationExecuteAction = defineAction<OperationExecuteInput, OperationExecuteResult>({
  ...operationExecuteContract,
  run: async ({ data }) => {
    const { executeKeylessOperation } = await import('./operation-execute.server')
    return executeKeylessOperation(data)
  },
})
