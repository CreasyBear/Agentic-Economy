import type { ActionCtx } from '../../_generated/server'
import { internal } from '../../_generated/api'
import type { CallResult } from '@/modules/capability-execution/call-contracts'
import type { DurableActionExecutionPort, CanonicalClaimSnapshot } from '@/modules/capability-execution/convex'
import type { CanonicalPort } from '@/modules/capability-execution/convex'

export function canonicalPort(ctx: ActionCtx): CanonicalPort {
  return {
    transact: async (command: Parameters<DurableActionExecutionPort<CallResult>['transact']>[0]) => {
      const { commandId, commandDigest, expectedExecutionVersion, expectedEffectGeneration, row, currentAttemptWrite, history } = command
      const mutableRow = {
        ...row,
        control: {
          ...row.control,
          control: row.control.control.state === 'gathering_information'
            ? { ...row.control.control, missingFields: [...row.control.control.missingFields] }
            : row.control.control,
        },
      }
      return await ctx.runMutation(internal.actionExecutionControl.transact, {
        commandId,
        commandDigest,
        expectedExecutionVersion,
        ...(expectedEffectGeneration === undefined ? {} : { expectedEffectGeneration }),
        row: mutableRow,
        ...(currentAttemptWrite === undefined ? {} : { currentAttemptWrite }),
        history,
      })
    },
    readControl: async (executionRef) => await ctx.runQuery(internal.actionExecutionControl.readControl, { executionRef }) ?? undefined,
    readAttempt: async (executionRef, attemptRef) => await ctx.runQuery(internal.actionExecutionControl.readAttempt, { executionRef, attemptRef }) ?? undefined,
    readAttempts: async (executionRef, limit) => await ctx.runQuery(internal.actionExecutionControl.readAttempts, { executionRef, limit }),
    readHistory: async (executionRef, afterVersion, limit) => await ctx.runQuery(internal.actionExecutionControl.readHistory, { executionRef, afterVersion, limit }),
    readHistoryCommand: async (executionRef, commandId) => await ctx.runQuery(internal.actionExecutionControl.readHistoryCommand, { executionRef, commandId }) ?? undefined,
    recordLateObservation: async (input) => await ctx.runMutation(internal.actionExecutionControl.recordLateObservation, { ...input, recordedAt: new Date().toISOString() }),
  }
}

export async function readCanonicalSnapshot(port: CanonicalPort, callRef: string, attemptRef: string): Promise<CanonicalClaimSnapshot | undefined> {
  const control = await port.readControl(callRef)
  if (control === undefined || control.currentAttemptRef !== attemptRef) return undefined
  const attempt = await port.readAttempt(callRef, attemptRef)
  return attempt === undefined ? undefined : { control, attempt }
}
