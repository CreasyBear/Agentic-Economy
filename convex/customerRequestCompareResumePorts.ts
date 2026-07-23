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
  return {
    ...preparationEgressPorts(ctx),
    loadCurrent: (requestId) => ctx.runQuery(
      internal.customerRequestV2.getCurrentAggregate, { requestId },
    ),
    getSubmissionShell: (input) => ctx.runQuery(internal.customerRequestV2.getSubmissionShell, input),
    getCurrentRouteRun: (input) => loadCurrentRouteRun(ctx, input),
    getCurrentMandate: (input) => loadCurrentMandate(ctx, input),
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
      listEligible: async (id) => await ctx.runQuery(
        internal.capabilitySupply.listEligible, { networkId: id, limit: 64 },
      ) as EligibleSupplyResult,
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
    refreshRoutePlanGeneration: async (input) => await ctx.runMutation(
      internal.customerRequestV2.refreshRoutePlanGeneration,
      {
        commandKey: input.commandKey,
        commandDigest: input.commandDigest,
        principalId: input.principalId,
        requestId: input.requestId,
        expectedRequestRevision: input.expectedRequestRevision,
        expectedGeneration: input.expectedGeneration,
        expectedGenerationRef: input.expectedGenerationRef,
        ...(input.expectedDecisionCommandKey === undefined ? {} : {
          expectedDecisionCommandKey: input.expectedDecisionCommandKey,
        }),
        candidateAggregate: writableCustomerRequestV2Aggregate(input.candidateAggregate),
        ...(input.candidateRouteGeneration === undefined ? {} : {
          candidateRouteGeneration: writableCustomerRequestRoutePlanGeneration(
            input.candidateRouteGeneration,
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

async function loadCurrentRouteRun(
  ctx: ActionCtx,
  input: Readonly<{ requestId: string }>,
): ReturnType<CompareResumePorts['getCurrentRouteRun']> {
  const result = await ctx.runQuery(
    internal.customerRequestRouteExecution.getCurrent,
    input,
  )
  if (result.kind === 'none') return { kind: 'not_found' }
  const run = result.run
  return {
    kind: 'found',
    run: {
      requestId: run.requestId,
      requestRevision: run.requestRevision,
      generationRef: run.generationRef,
      state: run.state,
      totalSteps: run.totalSteps,
      completedSteps: run.completedSteps,
      currentPosition: run.currentPosition,
      currentState: run.currentState,
      ...(run.businesses === undefined
        ? {}
        : { businesses: run.businesses.map((business) => ({ ...business })) }),
      ...(run.resultJson === undefined ? {} : { resultJson: run.resultJson }),
      ...(run.cancellationReleaseMayStartAt === undefined
        ? {}
        : { cancellationReleaseMayStartAt: run.cancellationReleaseMayStartAt }),
      ...(run.cancellationUnavailableSince === undefined
        ? {}
        : { cancellationUnavailableSince: run.cancellationUnavailableSince }),
      ...(run.cancellationRequestedAt === undefined
        ? {}
        : { cancellationRequestedAt: run.cancellationRequestedAt }),
      ...(run.cancellationAttempt === undefined
        ? {}
        : { cancellationAttempt: { ...run.cancellationAttempt } }),
      updatedAt: run.updatedAt,
    },
  }
}

async function loadCurrentMandate(
  ctx: ActionCtx,
  input: Readonly<{ requestId: string; principalId: string }>,
): ReturnType<CompareResumePorts['getCurrentMandate']> {
  const result = await ctx.runQuery(
    internal.customerRequestRouteMandate.getCurrentForPrincipal,
    input,
  )
  if (result.kind === 'expired') return { kind: 'expired' }
  if (result.kind === 'revoked' || result.kind === 'superseded') {
    return { kind: 'consumed' }
  }
  if (result.kind !== 'active') return { kind: 'not_found' }
  return {
    kind: 'active',
    mandate: {
      mandateRef: result.mandate.mandateRef,
      route: {
        generationRef: result.mandate.route.generationRef,
        routePlanId: result.mandate.route.routePlanId,
      },
      request: {
        requestRevision: result.mandate.request.requestRevision,
      },
      issuedAt: result.mandate.issuedAt,
      expiresAt: result.mandate.expiresAt,
    },
  }
}
