import {
  writableCustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'
import {
  writableCustomerRequestRoutePlanGeneration,
} from '@/modules/customer-request/route-plan-generation'
import { projectNeedsAttention } from '@/modules/customer-request/customer-projection'
import {
  createConfiguredRequestInterpreter,
  loadRequestGraph as loadRequestGraphApplication,
  projectRoutePlansFromMaterial,
  type CompareResumePorts,
  type EligibleSupplyResult,
  type ExactContractResult,
  type PreparationEgressPorts,
  type RoutePlanProjectionMaterial,
} from '@/modules/customer-request/application/public'

import { internal } from './_generated/api'
import { env, type ActionCtx } from './_generated/server'
import { unlistedCustomerRequestTables } from './customerRequestUnlisted'

const MAX_INTERPRETER_DESCRIPTOR_BYTES = 512_000
const MAX_CONTRACT_PROJECTED_INPUT_SCHEMA_BYTES = 256_000

export function preparationEgressPorts(ctx: ActionCtx): PreparationEgressPorts {
  return {
    runEgress: (input) => ctx.runAction(internal.customerRequestV2PreparationEgress.run, input),
    resumeEgress: (input) => ctx.runAction(internal.customerRequestV2PreparationEgress.resume, input),
    resumeRequestEgress: (input) => ctx.runAction(
      internal.customerRequestV2PreparationEgress.resumeRequest, input,
    ),
    preparationMaterialDigest: (input) => ctx.runQuery(
      internal.customerRequestV2PreparedAction.preparationMaterialDigest, input,
    ),
    preparePreparedAction: (input) => ctx.runMutation(
      internal.customerRequestV2PreparedAction.prepare, input,
    ),
  }
}

export function compareResumePorts(ctx: ActionCtx): CompareResumePorts {
  const now = Date.now()
  return {
    ...preparationEgressPorts(ctx),
    loadCurrent: (requestId) => ctx.runQuery(
      internal.customerRequestV2.getCurrentAggregate, { requestId },
    ),
    getSubmissionShell: (input) => ctx.runQuery(internal.customerRequestV2.getSubmissionShell, input),
    getCurrentRouteRun: async (input) => {
      void ctx.runQuery(internal.customerRequestRouteExecution.getCurrent, input)
      return unlistedCustomerRequestTables()
    },
    getCurrentMandate: async (input) => {
      void ctx.runQuery(internal.customerRequestRouteMandate.getCurrentForPrincipal, input)
      return unlistedCustomerRequestTables()
    },
    getCurrentRoutePlanGeneration: (input) => ctx.runQuery(
      internal.customerRequestV2.getCurrentRoutePlanGeneration, input,
    ),
    projectCurrentRoutePlans: async (aggregate) => {
      try {
        const material = await ctx.runQuery(
          internal.customerRequestV2.getCurrentRoutePlanProjectionMaterial,
          { requestId: aggregate.snapshot.requestId },
        ) as RoutePlanProjectionMaterial
        return projectRoutePlansFromMaterial(
          aggregate as never,
          material,
          Date.now(),
          (error) => {
            console.error('customer_request_route_plan_projection_invalid', error)
          },
        )
      } catch (error) {
        console.error('customer_request_route_plan_projection_failed', error)
        return projectNeedsAttention({
          requestRef: aggregate.snapshot.requestId,
          revision: aggregate.snapshot.revision,
          summary: 'AE could not verify the current ways forward. Try this request again.',
        })
      }
    },
    resumePreparation: (input) => ctx.runQuery(internal.customerRequestV2Preparation.resume, input),
    egressStatus: (input) => ctx.runQuery(
      internal.customerRequestV2PreparationEgressState.status, input,
    ),
    prepareAction: (input) => ctx.runMutation(internal.customerRequestV2Preparation.prepare, input),
    loadRequestGraph: (networkId) => loadRequestGraphApplication(networkId, {
      listRouteable: async (id) => await ctx.runQuery(
        internal.capabilitySupply.listRouteable, { networkId: id, limit: 64, now },
      ) as EligibleSupplyResult,
      listMappings: async (id) => await ctx.runQuery(
        internal.capabilitySupply.listMappings, { networkId: id, limit: 128 },
      ),
      getActiveExact: async (contractRef) => await ctx.runQuery(
        internal.capabilityContractDocuments.getActiveExactInternal, contractRef,
      ) as ExactContractResult,
    }, {
      maximumDescriptorBytes: MAX_INTERPRETER_DESCRIPTOR_BYTES,
      maximumContractProjectedInputSchemaBytes: MAX_CONTRACT_PROJECTED_INPUT_SCHEMA_BYTES,
    }),
    getRoutePlanGenerationRefreshReplay: (input) => ctx.runQuery(
      internal.customerRequestV2.getRoutePlanGenerationRefreshReplay, input,
    ),
    refreshRoutePlanGeneration: async ({
      candidateAggregate, candidateRouteGeneration, ...rest
    }) => await ctx.runMutation(
      internal.customerRequestV2.refreshRoutePlanGeneration,
      {
        ...rest,
        candidateAggregate: writableCustomerRequestV2Aggregate(candidateAggregate),
        ...(candidateRouteGeneration === undefined ? {} : {
          candidateRouteGeneration: writableCustomerRequestRoutePlanGeneration(
            candidateRouteGeneration,
          ),
        }),
      },
    ),
    recordRoutePlanGenerationRetry: (input) => ctx.runMutation(
      internal.customerRequestV2.recordRoutePlanGenerationRetry, input,
    ),
    createInterpreter: () => createConfiguredRequestInterpreter({
      maximumDescriptorBytes: MAX_INTERPRETER_DESCRIPTOR_BYTES,
      ...(env.OPENROUTER_API_KEY === undefined ? {} : { openRouterApiKey: env.OPENROUTER_API_KEY }),
      ...(env.AE_CUSTOMER_REQUEST_MODEL === undefined ? {} : { modelName: env.AE_CUSTOMER_REQUEST_MODEL }),
      ...(env.AE_SITE_URL === undefined ? {} : { siteUrl: env.AE_SITE_URL }),
    }),
  }
}
