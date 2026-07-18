import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'

import type { CustomerRequestActionResult } from '../action-result'

type DeepWritable<Value> = Value extends string | number | boolean | bigint | null | undefined
  ? Value
  : Value extends readonly (infer Item)[]
    ? DeepWritable<Item>[]
    : Value extends object
      ? { -readonly [Key in keyof Value]: DeepWritable<Exclude<Value[Key], undefined>> }
      : Value

export function toActionResult(result: CustomerRequestActionResult): DeepWritable<CustomerRequestActionResult> {
  if (result.kind === 'request') return writableView(result)
  return result as DeepWritable<CustomerRequestActionResult>
}

export function writableView(view: CustomerRequestView): DeepWritable<CustomerRequestView> {
  const {
    disclosureReview, dataHandling, unsupportedRecovery, optionSet, clarification, preparedAction,
    businesses, action, progress, activity, recovery, decision, confirmation,
  } = view
  return {
    kind: view.kind, requestRef: view.requestRef, revision: view.revision,
    ...(view.routeGenerationRef === undefined ? {} : { routeGenerationRef: view.routeGenerationRef }),
    state: view.state, summary: view.summary, nextAction: view.nextAction,
    missingFields: view.missingFields.map((field) => ({ ...field })),
    criteria: (view.criteria ?? []).map((criterion) => ({ ...criterion })),
    ...(view.preparationRef === undefined ? {} : { preparationRef: view.preparationRef }),
    ...(disclosureReview === undefined ? {} : {
      disclosureReview: {
        ...disclosureReview,
        categories: disclosureReview.categories.map((category) => ({ ...category })),
      },
    }),
    ...(dataHandling === undefined ? {} : { dataHandling: { ...dataHandling } }),
    ...(unsupportedRecovery === undefined ? {} : {
      unsupportedRecovery: {
        ...unsupportedRecovery,
        nextStep: { ...unsupportedRecovery.nextStep },
      },
    }),
    ...(clarification === undefined ? {} : { clarification: { ...clarification } }),
    ...(preparedAction === undefined ? {} : { preparedAction: {
      ...preparedAction,
      price: { ...preparedAction.price },
      materialTerms: preparedAction.materialTerms.map((term) => ({ ...term })),
      cancellation: { ...preparedAction.cancellation },
      selection: { ...preparedAction.selection },
      dataUse: {
        categories: preparedAction.dataUse.categories.map((category) => ({ ...category })),
        purposes: [...preparedAction.dataUse.purposes],
      },
      effects: preparedAction.effects.map((effect) => ({ ...effect })),
      alternatives: preparedAction.alternatives.map((alternative) => ({
        ...alternative, price: { ...alternative.price },
      })),
    } }),
    ...(businesses === undefined ? {} : {
      businesses: businesses.map((business) => ({ ...business })),
    }),
    ...(action === undefined ? {} : { action: {
      state: action.state, resolution: action.resolution, automaticRetry: action.automaticRetry,
      observedAt: action.observedAt,
      ...(action.result === undefined ? {} : { result: structuredClone(action.result) }),
    } }),
    ...(progress === undefined ? {} : { progress: {
      completed: progress.completed, total: progress.total, current: { ...progress.current },
      ...(progress.dependencies === undefined ? {} : {
        dependencies: {
          completed: progress.dependencies.completed.map((step) => ({ ...step })),
          blocked: progress.dependencies.blocked.map((step) => ({ ...step })),
        },
      }),
    } }),
    ...(activity === undefined ? {} : { activity: {
      actor: activity.actor, certainty: activity.certainty, updatedAt: activity.updatedAt,
      retry: activity.retry,
      cancellation: writableActivityCancellation(activity.cancellation, activity.updatedAt),
      safeNextAction: activity.safeNextAction,
      ...(activity.nextCheckAt === undefined ? {} : { nextCheckAt: activity.nextCheckAt }),
    } }),
    ...(recovery === undefined ? {} : { recovery: {
      state: recovery.state,
      restoredAt: recovery.restoredAt,
      workRestarted: recovery.workRestarted,
      ...(recovery.reason === undefined ? {} : { reason: recovery.reason }),
    } }),
    ...(decision === undefined ? {} : {
      decision: writableClone(decision),
    }),
    ...(confirmation === undefined ? {} : {
      confirmation: writableClone(confirmation),
    }),
    options: view.options.map(writableOption),
    ...(optionSet === undefined ? {} : { optionSet: {
      ...optionSet,
      ordering: optionSet.ordering.kind === 'recommended'
        ? { ...optionSet.ordering, reasons: [...optionSet.ordering.reasons], tradeoffs: [...optionSet.ordering.tradeoffs] }
        : { ...optionSet.ordering },
      coverage: {
        ...optionSet.coverage,
        businesses: optionSet.coverage.businesses.map((business) => ({ ...business })),
      },
      options: optionSet.options.map(writableOption),
    } }),
  }
}

export function withRestoredRequest(
  result: CustomerRequestActionResult,
  restoredAt: number,
): DeepWritable<CustomerRequestActionResult> {
  if (result.kind !== 'request') return result as DeepWritable<CustomerRequestActionResult>
  return {
    ...result,
    recovery: {
      state: 'restored',
      reason: result.decision?.outcome.kind === 'routes_expired'
        ? 'choice_expired'
        : 'request_restored',
      restoredAt,
      workRestarted: false,
    },
  } as DeepWritable<CustomerRequestActionResult>
}

function writableClone<Value>(value: Value): DeepWritable<Value> {
  return structuredClone(value) as DeepWritable<Value>
}

function writableActivityCancellation(
  cancellation: NonNullable<CustomerRequestView['activity']>['cancellation'],
  updatedAt: number,
) {
  if (typeof cancellation !== 'string') {
    if (cancellation.state !== 'not_available') return { ...cancellation }
    return {
      state: cancellation.state,
      reason: cancellation.reason,
      changedAt: cancellation.changedAt,
      ...(cancellation.requestedAt === undefined ? {} : { requestedAt: cancellation.requestedAt }),
    }
  }
  if (cancellation === 'available_before_next_step') {
    return {
      state: 'available' as const,
      until: 'before_next_step_release' as const,
      releaseMayStartAt: updatedAt,
    }
  }
  return {
    state: 'not_available' as const,
    reason: cancellation === 'complete' ? 'request_finished' as const : 'business_step_released' as const,
    changedAt: updatedAt,
  }
}

function writableOption(option: CustomerRequestView['options'][number]) {
  return {
    ...option, business: { ...option.business }, expectedCost: { ...option.expectedCost }, maximumCost: { ...option.maximumCost },
    priceComponents: option.priceComponents.map((component) => ({ ...component })),
    comparableOutputs: option.comparableOutputs.map((output) => ({ ...output })), materialTerms: [...option.materialTerms],
    cancellation: { ...option.cancellation },
    provenance: {
      kind: option.provenance.kind, validUntil: option.provenance.validUntil,
      ...(option.provenance.observedAt === undefined ? {} : { observedAt: option.provenance.observedAt }),
    },
    commercialInfluence: { ...option.commercialInfluence },
  }
}
