import type { CustomerRequestCompilationStore } from '@/modules/customer-request/compiler'
import { customerRequestValue } from '@/modules/customer-request/runtime'
import type { CompileCustomerRequestResult } from '@/modules/customer-request/compiler'
import type { CustomerRequest, PlanRevision } from '@/modules/customer-request/public'
import type { Infer } from 'convex/values'

import { internal } from './_generated/api'
import type { ActionCtx } from './_generated/server'

type Context = Pick<ActionCtx, 'runMutation' | 'runQuery'>

export function createConvexCustomerRequestCompilationStore(ctx: Context): CustomerRequestCompilationStore {
  return {
    lookup: async (compilationKey, commandDigest) => await ctx.runQuery(
      internal.customerRequests.lookupCompilation, { compilationKey, commandDigest },
    ) ?? undefined,
    commit: async (input) => await ctx.runMutation(internal.customerRequests.commitCompilation, {
      compilationKey: input.compilationKey,
      commandDigest: input.commandDigest,
      expectedRevision: input.expectedRevision,
      request: writableRequest(input.request),
      outcome: writableOutcome(input.outcome),
      ...(input.planRevision === undefined ? {} : { planRevision: writablePlan(input.planRevision) }),
    }),
    getRequest: async (requestId) => normalizeRequest(await ctx.runQuery(internal.customerRequests.getRequest, { requestId })),
    getRequestRevision: async (requestId, revision) => normalizeRequest(await ctx.runQuery(
      internal.customerRequests.getRequestRevision, { requestId, revision },
    )),
  }
}

export function writableRequest(request: CustomerRequest) {
  return {
      ...request,
    understanding: {
      ...request.understanding,
      hardConstraints: request.understanding.hardConstraints.map((requirement) => ({ ...requirement })),
      preferences: request.understanding.preferences.map((preference) => ({ ...preference })),
      substitutions: { ...request.understanding.substitutions, boundaries: [...request.understanding.substitutions.boundaries] },
    },
    knownFacts: { ...request.knownFacts },
    routing: { ...request.routing },
  }
}

export function writablePlan(plan: PlanRevision) {
  return {
    ...plan,
    completionEvidence: plan.completionEvidence.map((evidence) => ({ ...evidence })),
    actions: plan.actions.map((action) => ({
      ...action,
      dependsOn: [...action.dependsOn],
      input: Object.fromEntries(Object.entries(action.input).map(([field, value]) => [field, { ...value }])),
      ...(action.providerAffinity === undefined ? {} : { providerAffinity: { ...action.providerAffinity } }),
    })),
  }
}

export function writableCompilationResult(result: CompileCustomerRequestResult) {
  if (result.kind === 'plan_ready') return {
    kind: result.kind,
    request: writableRequest(result.request),
    understanding: writableUnderstanding(result.understanding),
    planRevision: writablePlan(result.planRevision),
  }
  if (result.kind === 'needs_information') return {
    kind: result.kind,
    request: writableRequest(result.request),
    understanding: writableUnderstanding(result.understanding),
    missingInformation: result.missingInformation.map((item) => ({
      field: item.field, customerLabel: item.customerLabel, reason: item.reason,
      ...(item.candidateCapabilityContractIds === undefined ? {} : { candidateCapabilityContractIds: [...item.candidateCapabilityContractIds] }),
    })),
  }
  if (result.kind === 'unsupported') return { kind: result.kind, request: writableRequest(result.request), reason: result.reason }
  if (result.kind === 'revision_conflict') return { kind: result.kind, requestId: result.requestId, expectedRevision: result.expectedRevision }
  if (result.kind === 'identity_conflict') return { kind: result.kind, requestId: result.requestId }
  return { kind: 'compilation_conflict' as const, requestId: result.requestId }
}

function writableUnderstanding(understanding: CustomerRequest['understanding']) {
  return {
    ...understanding,
    hardConstraints: understanding.hardConstraints.map((item) => ({ ...item })),
    preferences: understanding.preferences.map((item) => ({ ...item })),
    substitutions: { ...understanding.substitutions, boundaries: [...understanding.substitutions.boundaries] },
    completionRequirement: { ...understanding.completionRequirement },
  }
}

function normalizeRequest(request: Infer<typeof customerRequestValue> | null): CustomerRequest | undefined {
  if (request === null) return undefined
  return request
}

function writableOutcome(outcome: Parameters<CustomerRequestCompilationStore['commit']>[0]['outcome']) {
  if (outcome.kind !== 'needs_information') return outcome
  return {
    kind: outcome.kind,
    missingInformation: outcome.missingInformation.map((item) => ({
      field: item.field, customerLabel: item.customerLabel, reason: item.reason,
      ...(item.candidateCapabilityContractIds === undefined
        ? {}
        : { candidateCapabilityContractIds: [...item.candidateCapabilityContractIds] }),
    })),
  }
}
