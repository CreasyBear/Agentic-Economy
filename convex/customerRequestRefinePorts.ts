import {
  compileCommit as compileCommitApplication,
  interpretCompileCommit as interpretCompileCommitApplication,
  recoverUnresolvedEgress,
  replayCommittedCommand as replayCommittedCommandApplication,
  resumeCustomerRequest,
  type CommandReplayResult,
  type CompileCommitInput,
  type InterpretCompileCommitInput,
  type RefineCustomerRequestPorts,
} from '@/modules/customer-request/application/public'

import { internal } from './_generated/api'
import { env, type ActionCtx } from './_generated/server'
import {
  compareResumePorts,
  preparationEgressPorts,
} from './customerRequestCompareResumePorts'

const MAX_INTERPRETER_DESCRIPTOR_BYTES = 512_000

export function refinePorts(ctx: ActionCtx): RefineCustomerRequestPorts {
  const compare = compareResumePorts(ctx)
  return {
    loadCurrent: compare.loadCurrent as RefineCustomerRequestPorts['loadCurrent'],
    recoverUnresolvedEgress: (aggregate) => recoverUnresolvedEgress(
      aggregate, preparationEgressPorts(ctx),
    ),
    resumeRequest: (input) => resumeCustomerRequest(input, compare),
    replayCommittedCommand: async (input) => await replayCommittedCommandApplication(input, {
      getCommandReplay: async (replayInput) => await ctx.runQuery(
        internal.customerRequestV2.getCommandReplay,
        replayInput,
      ) as CommandReplayResult,
    }),
    recordNoopCommand: (input) => ctx.runMutation(
      internal.customerRequestV2.recordNoopCommand, input,
    ),
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
    loadCurrentRouteGeneration: async (current) => {
      if (current.routeGenerationRef === undefined) return undefined
      const result: Readonly<
        | { kind: 'found'; routeGeneration: NonNullable<
            Awaited<ReturnType<RefineCustomerRequestPorts['loadCurrentRouteGeneration']>>
          > }
        | { kind: 'not_found' }
      > = await ctx.runQuery(internal.customerRequestV2.getRoutePlanGeneration, {
        requestId: current.aggregate.snapshot.requestId,
        generationRef: current.routeGenerationRef,
      })
      return result.kind === 'found' ? result.routeGeneration : undefined
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
    interpretCompileCommit: async (input: InterpretCompileCommitInput) => (
      await interpretCompileCommitApplication(input, {
        replayCommittedCommand: async (replayInput) => await replayCommittedCommandApplication(
          replayInput,
          {
            getCommandReplay: async (queryInput) => await ctx.runQuery(
              internal.customerRequestV2.getCommandReplay,
              queryInput,
            ) as CommandReplayResult,
          },
        ),
        loadRequestGraph: compare.loadRequestGraph,
        commitAggregate: async (commitInput) => await ctx.runMutation(
          internal.customerRequestV2.commitAggregate,
          commitInput,
        ),
        logInterpretationFailure: (code) => {
          console.error('customer_request_semantic_interpretation_failed', code)
        },
      }, {
        maximumDescriptorBytes: MAX_INTERPRETER_DESCRIPTOR_BYTES,
        ...(env.OPENROUTER_API_KEY === undefined ? {} : { openRouterApiKey: env.OPENROUTER_API_KEY }),
        ...(env.AE_CUSTOMER_REQUEST_MODEL === undefined
          ? {}
          : { modelName: env.AE_CUSTOMER_REQUEST_MODEL }),
        ...(env.AE_SITE_URL === undefined ? {} : { siteUrl: env.AE_SITE_URL }),
      })
    ),
  }
}
