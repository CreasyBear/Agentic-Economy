import {
  compileCommit as compileCommitApplication,
  recoverUnresolvedEgress,
  replayCommittedCommand as replayCommittedCommandApplication,
  type CommandReplayResult,
  type CompileCommitInput,
  type ProvideFactsPorts,
} from '@/modules/customer-request/application/public'

import { internal } from './_generated/api'
import type { ActionCtx } from './_generated/server'
import {
  compareResumePorts,
  preparationEgressPorts,
} from './customerRequestCompareResumePorts'

export function provideFactsPorts(ctx: ActionCtx): ProvideFactsPorts {
  const compare = compareResumePorts(ctx)
  return {
    loadCurrent: compare.loadCurrent as ProvideFactsPorts['loadCurrent'],
    recoverUnresolvedEgress: (aggregate) => recoverUnresolvedEgress(
      aggregate, preparationEgressPorts(ctx),
    ),
    replayCommittedCommand: async (input) => await replayCommittedCommandApplication(input, {
      getCommandReplay: async (replayInput) => await ctx.runQuery(
        internal.customerRequestV2.getCommandReplay,
        replayInput,
      ) as CommandReplayResult,
    }),
    loadCurrentRouteGenerationNumber: async (current) => {
      if (current.routeGenerationRef === undefined) return current.routeGenerationNumber
      const result: Readonly<
        | { kind: 'found'; routeGeneration: { generation: number } }
        | { kind: 'not_found' }
      > = await ctx.runQuery(internal.customerRequestV2.getRoutePlanGeneration, {
        requestId: current.aggregate.snapshot.requestId,
        generationRef: current.routeGenerationRef,
      })
      return result.kind === 'found' ? result.routeGeneration.generation : undefined
    },
    loadRequestGraph: compare.loadRequestGraph,
    compileCommit: async (input: CompileCommitInput) => await compileCommitApplication(input, {
      replayCommittedCommand: async (replayInput) => await replayCommittedCommandApplication(
        replayInput,
        {
          getCommandReplay: async (queryInput) => await ctx.runQuery(
            internal.customerRequestV2.getCommandReplay,
            queryInput,
          ) as CommandReplayResult,
        },
      ),
      commitAggregate: async (commitInput) => await ctx.runMutation(
        internal.customerRequestV2.commitAggregate,
        commitInput,
      ),
    }),
  }
}
