import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type {
  CustomerRoutePlan,
  CustomerRoutePlanDecision,
} from './agent-contract'

type BusinessNames = Readonly<Record<string, string>>
export type CustomerRouteCapabilitySemantics = Readonly<Record<string, Readonly<{
  name: string
  description: string
  resultLabels: readonly string[]
}>>>
type ProjectionEffectClass = 'data_release' | 'financial_exposure' | 'external_state_change'
type ProjectionRoute = Readonly<{
  routePlanId: string
  steps: readonly Readonly<{
    actionId: string
    businessId: string
    offeringId: string
    bindingId: string
    publicationRef: string
    contractRef: Readonly<{ capabilityId: string; version: number; contractDigest: string }>
    dataUse: readonly Readonly<{
      recipient:
        | Readonly<{ kind: 'candidate_binding' | 'selected_binding' }>
        | Readonly<{ kind: 'named_recipient'; recipientId: string }>
      purposes: readonly string[]
    }>[]
    effects: readonly Readonly<{
      class: ProjectionEffectClass
      reversibility: 'not_applicable' | 'reversible' | 'conditional' | 'irreversible'
    }>[]
    evidence: readonly Readonly<{ label: string; purpose: 'comparison' | 'completion' | 'recovery' }>[]
    cancellation?: Readonly<{ kind: 'unsupported' | 'adapter_managed'; evidenceRefs: readonly string[] }>
    recovery: Readonly<{ recovery: 'retry_safe' | 'reconcile_required' }>
  }>[]
  edges: readonly Readonly<{ fromStep: string; toStep: string }>[]
  maximumTotalCost:
    | Readonly<{ kind: 'known'; currency: string; amountMinor: number }>
    | Readonly<{ kind: 'requires_preparation' }>
  expiresAt: number
  uncertainty: readonly unknown[]
  fallbacks: Readonly<{ alternatives: readonly Readonly<{ alternativeRouteRef: string }>[] }>
  comparison: Readonly<{
    ordering:
      | Readonly<{ kind: 'unranked' }>
      | Readonly<{ kind: 'ranked'; objective: 'lowest_maximum_price'; position: number }>
  }>
}>
export type CustomerRoutePlanProjectionGeneration = Readonly<{
  generationRef: string
  requestRevision: number
  routes: readonly ProjectionRoute[]
}>
type Route = ProjectionRoute
type Change = Extract<CustomerRoutePlanDecision['changes'], { kind: 'changed' }>['items'][number]
const MAX_CUSTOMER_ROUTE_PLAN_PROJECTION_BYTES = 700_000

export function projectCustomerRoutePlanDecision(input: Readonly<{
  current: CustomerRoutePlanProjectionGeneration
  previous?: CustomerRoutePlanProjectionGeneration
  businessNames: BusinessNames
  capabilitySemantics: CustomerRouteCapabilitySemantics
  now: number
}>): CustomerRoutePlanDecision {
  if (!customerRoutePlanProjectionInputsAreBounded(input)) {
    throw new Error('customer_route_plan_projection_limit_exceeded')
  }
  const routes = input.current.routes.map((route) => projectRoute(
    route, input.current.generationRef, input.current.routes,
    input.businessNames, input.capabilitySemantics, input.now,
  ))
  const expired = routes.every(({ availability }) => availability === 'expired')
  const expiredCount = routes.filter(({ availability }) => availability === 'expired').length
  const currentCount = routes.length - expiredCount
  const decision: CustomerRoutePlanDecision = Object.freeze({
    generationRef: input.current.generationRef,
    requestRevision: input.current.requestRevision,
    outcome: Object.freeze({
      kind: expired ? 'routes_expired' as const : 'routes_available' as const,
      routeCount: routes.length,
      summary: expired
        ? 'These ways forward have expired.'
        : expiredCount > 0
        ? `${currentCount} current ${currentCount === 1 ? 'way' : 'ways'} forward and ${expiredCount} expired.`
        : routes.length === 1
        ? 'One way forward is available.'
        : `${routes.length} ways forward are available.`,
    }),
    routes: Object.freeze(routes),
    changes: projectChanges(
      input.current, input.previous, input.businessNames, input.capabilitySemantics,
    ),
    nextBoundary: Object.freeze({ kind: 'confirmation' as const, authorityCreated: false as const }),
  })
  if (new TextEncoder().encode(JSON.stringify(decision)).byteLength > MAX_CUSTOMER_ROUTE_PLAN_PROJECTION_BYTES) {
    throw new Error('customer_route_plan_projection_limit_exceeded')
  }
  return decision
}

function projectRoute(
  route: Route,
  generationRef: string,
  generationRoutes: readonly Route[],
  businessNames: BusinessNames,
  capabilitySemantics: CustomerRouteCapabilitySemantics,
  now: number,
): CustomerRoutePlan {
  const businesses = uniqueBy(
    route.steps.map((step) => customerBusiness(step.businessId, businessNames)),
    ({ businessRef }) => businessRef,
  )
  const recipients = routeRecipients(route, businessNames)
  const effects = uniqueBy(route.steps.flatMap(({ effects }) => effects.map((effect) => ({
    kind: customerEffectKind(effect.class),
    reversibility: effect.reversibility,
  }))), (effect) => JSON.stringify(effect))
  const evidence = uniqueBy(route.steps.flatMap((step) => step.evidence.map((requirement) => ({
    label: requirement.label,
    purpose: requirement.purpose,
  }))), (requirement) => JSON.stringify(requirement))
  const actionPosition = new Map(route.steps.map((step, index) => [step.actionId, index + 1]))
  const cancellation = routeCancellation(route)
  return Object.freeze({
    routeRef: customerRouteRef(generationRef, route.routePlanId),
    result: routeResult(route, capabilitySemantics),
    availability: route.expiresAt <= now ? 'expired' as const : 'current' as const,
    stepCount: route.steps.length,
    businesses: Object.freeze(businesses),
    maximumTotalCost: Object.freeze({ ...route.maximumTotalCost }),
    dataUse: Object.freeze({
      recipientCount: recipients.length,
      recipients: Object.freeze(recipients),
      purposes: Object.freeze([...new Set(recipients.flatMap(({ purposes }) => purposes))].sort()),
    }),
    effects: Object.freeze(effects),
    evidence: Object.freeze(evidence),
    recovery: Object.freeze(route.steps.map((step, index) => Object.freeze({
      step: index + 1,
      businessName: businessName(step.businessId, businessNames),
      posture: step.recovery.recovery,
    }))),
    cancellation: Object.freeze(cancellation),
    validUntil: route.expiresAt,
    fallback: Object.freeze({
      available: route.fallbacks.alternatives.length > 0,
      alternatives: Object.freeze(route.fallbacks.alternatives.map(({ alternativeRouteRef }) => {
        const alternative = generationRoutes.find(({ routePlanId }) => routePlanId === alternativeRouteRef)
        return Object.freeze({
          routeRef: customerRouteRef(generationRef, alternativeRouteRef),
          when: 'route_unavailable_before_confirmation' as const,
        })
      })),
    }),
    uncertainty: Object.freeze(route.uncertainty.map(() => 'price_needs_confirmation' as const)),
    steps: Object.freeze(route.steps.map((step, index) => Object.freeze({
      step: index + 1,
      business: customerBusiness(step.businessId, businessNames),
      after: Object.freeze(route.edges
        .filter(({ toStep }) => toStep === step.actionId)
        .flatMap(({ fromStep }) => {
          const position = actionPosition.get(fromStep)
          return position === undefined ? [] : [position]
        })
        .sort((left, right) => left - right)),
    }))),
  })
}

export function customerRouteRef(generationRef: string, routePlanId: string): string {
  return `route-choice:${canonicalDigest({ generationRef, routePlanId })}`
}

function projectChanges(
  current: CustomerRoutePlanProjectionGeneration,
  previous: CustomerRoutePlanProjectionGeneration | undefined,
  businessNames: BusinessNames,
  capabilitySemantics: CustomerRouteCapabilitySemantics,
): CustomerRoutePlanDecision['changes'] {
  if (previous === undefined) return Object.freeze({ kind: 'initial' as const })
  const items: Change[] = []
  addChanged(
    items,
    'route_result',
    routeResultSnapshot(previous.routes, capabilitySemantics),
    routeResultSnapshot(current.routes, capabilitySemantics),
    () => ({
      kind: 'route_result',
      before: {
        routeCount: previous.routes.length,
        results: routeResultSnapshot(previous.routes, capabilitySemantics),
      },
      after: {
        routeCount: current.routes.length,
        results: routeResultSnapshot(current.routes, capabilitySemantics),
      },
    }),
  )
  addChanged(
    items,
    'cancellation',
    cancellationSnapshot(previous.routes),
    cancellationSnapshot(current.routes),
    () => ({
      kind: 'cancellation',
      before: cancellationSnapshot(previous.routes),
      after: cancellationSnapshot(current.routes),
    }),
  )

  addChanged(
    items,
    'businesses',
    businessSnapshot(previous.routes, businessNames),
    businessSnapshot(current.routes, businessNames),
    () => ({
      kind: 'businesses',
      before: businessSnapshot(previous.routes, businessNames),
      after: businessSnapshot(current.routes, businessNames),
    }),
  )

  addChanged(items, 'step_shape', stepShape(previous.routes), stepShape(current.routes), () => ({
    kind: 'step_shape', before: stepShape(previous.routes), after: stepShape(current.routes),
  }))
  addChanged(items, 'maximum_cost', maximumCosts(previous.routes), maximumCosts(current.routes), () => ({
    kind: 'maximum_cost', before: maximumCosts(previous.routes), after: maximumCosts(current.routes),
  }))
  addChanged(items, 'data_use', recipientSnapshot(previous.routes, businessNames), recipientSnapshot(current.routes, businessNames), () => ({
    kind: 'data_use', before: recipientSnapshot(previous.routes, businessNames), after: recipientSnapshot(current.routes, businessNames),
  }))
  addChanged(items, 'effects', effectSnapshot(previous.routes), effectSnapshot(current.routes), () => ({
    kind: 'effects', before: effectSnapshot(previous.routes), after: effectSnapshot(current.routes),
  }))
  addChanged(items, 'evidence', evidenceSnapshot(previous.routes), evidenceSnapshot(current.routes), () => ({
    kind: 'evidence', before: evidenceSnapshot(previous.routes), after: evidenceSnapshot(current.routes),
  }))
  addChanged(items, 'uncertainty', uncertaintySnapshot(previous.routes), uncertaintySnapshot(current.routes), () => ({
    kind: 'uncertainty', before: uncertaintySnapshot(previous.routes), after: uncertaintySnapshot(current.routes),
  }))
  addChanged(items, 'expiry', expirySnapshot(previous.routes), expirySnapshot(current.routes), () => ({
    kind: 'expiry', before: expirySnapshot(previous.routes), after: expirySnapshot(current.routes),
  }))
  addChanged(
    items,
    'fallback',
    fallbackSnapshot(previous.routes, capabilitySemantics),
    fallbackSnapshot(current.routes, capabilitySemantics),
    () => ({
    kind: 'fallback',
    before: fallbackSnapshot(previous.routes, capabilitySemantics),
    after: fallbackSnapshot(current.routes, capabilitySemantics),
  }))
  addChanged(
    items,
    'recovery',
    recoverySnapshot(previous.routes, businessNames),
    recoverySnapshot(current.routes, businessNames),
    () => ({
    kind: 'recovery',
    before: recoverySnapshot(previous.routes, businessNames),
    after: recoverySnapshot(current.routes, businessNames),
  }))

  return items.length === 0
    ? Object.freeze({ kind: 'unchanged' as const, previousGenerationRef: previous.generationRef })
    : Object.freeze({
        kind: 'changed' as const,
        previousGenerationRef: previous.generationRef,
        items: Object.freeze(items),
      })
}

function routeResultSnapshot(
  routes: readonly Route[],
  capabilitySemantics: CustomerRouteCapabilitySemantics,
) {
  return routes.map((route) => ({
    ...routeResult(route, capabilitySemantics),
    ...(route.comparison.ordering.kind === 'ranked'
      ? { position: route.comparison.ordering.position }
      : {}),
  })).sort((left, right) => left.resultRef.localeCompare(right.resultRef))
}

function businessSnapshot(routes: readonly Route[], businessNames: BusinessNames) {
  return keyedByResult(routes, (route) => ({
    businesses: uniqueBy(
      route.steps.map(({ businessId }) => customerBusiness(businessId, businessNames)),
      ({ businessRef }) => businessRef,
    ).sort((left, right) => left.businessRef.localeCompare(right.businessRef)),
  }))
}

function stepShape(routes: readonly Route[]) {
  return keyedByResult(routes, (route) => ({
    steps: route.steps.length,
    dependencies: route.edges.length,
  }))
}

function maximumCosts(routes: readonly Route[]) {
  return keyedByResult(routes, ({ maximumTotalCost }) => ({ cost: { ...maximumTotalCost } }))
}

function recipientSnapshot(routes: readonly Route[], businessNames: BusinessNames) {
  return keyedByResult(routes, (route) => ({ recipients: routeRecipients(route, businessNames) }))
}

function effectSnapshot(routes: readonly Route[]) {
  return keyedByResult(routes, (route) => ({
    effects: sortCanonical(uniqueBy(route.steps.flatMap(({ effects }) => effects.map((effect) => ({
      kind: customerEffectKind(effect.class), reversibility: effect.reversibility,
    }))), (effect) => JSON.stringify(effect))),
  }))
}

function evidenceSnapshot(routes: readonly Route[]) {
  return keyedByResult(routes, (route) => ({
    evidence: sortCanonical(uniqueBy(route.steps.flatMap((step) => step.evidence.map((evidence) => ({
      label: evidence.label, purpose: evidence.purpose,
    }))), (evidence) => JSON.stringify(evidence))),
  }))
}

function uncertaintySnapshot(routes: readonly Route[]) {
  return keyedByResult(routes, (route) => ({
    uncertainty: route.uncertainty.map(() => 'price_needs_confirmation' as const),
  }))
}

function expirySnapshot(routes: readonly Route[]) {
  return keyedByResult(routes, ({ expiresAt }) => ({ validUntil: expiresAt }))
}

function fallbackSnapshot(
  routes: readonly Route[],
  capabilitySemantics: CustomerRouteCapabilitySemantics,
) {
  const byPlanId = new Map(routes.map((route) => [route.routePlanId, route]))
  return routes.map((route) => ({
    resultRef: semanticChoiceRef(route),
    alternatives: route.fallbacks.alternatives.map(({ alternativeRouteRef }) => {
      const alternative = byPlanId.get(alternativeRouteRef)
      if (alternative === undefined) {
        return Object.freeze({
          resultRef: `missing:${canonicalDigest({ alternativeRouteRef })}`,
          summary: 'A previously available alternative is no longer resolvable.',
          deliverables: Object.freeze([]),
        })
      }
      return routeResult(alternative, capabilitySemantics)
    }).sort((left, right) => left.resultRef.localeCompare(right.resultRef)),
  })).sort((left, right) => left.resultRef.localeCompare(right.resultRef))
}

function recoverySnapshot(routes: readonly Route[], businessNames: BusinessNames) {
  return keyedByResult(routes, (route) => ({
    steps: route.steps.map((step, index) => ({
      step: index + 1,
      businessName: businessName(step.businessId, businessNames),
      posture: step.recovery.recovery,
    })),
  }))
}

function cancellationSnapshot(routes: readonly Route[]) {
  return keyedByResult(routes, (route) => ({ cancellation: routeCancellation(route) }))
}

function routeCancellation(route: Route): CustomerRoutePlan['cancellation'] {
  const cancellableSteps = route.steps.filter(({ cancellation }) => cancellation?.kind === 'adapter_managed').length
  return cancellableSteps === route.steps.length
    ? { kind: 'available', summary: 'Every business step publishes a cancellation path.' }
    : cancellableSteps === 0
      ? { kind: 'unavailable', summary: 'The businesses do not publish a cancellation path for this option.' }
      : { kind: 'partially_available', summary: 'Only some business steps publish a cancellation path.' }
}

function keyedByResult<Value extends object>(
  routes: readonly Route[],
  value: (route: Route) => Value,
): Array<Value & { resultRef: string }> {
  return routes.map((route) => ({
    resultRef: semanticChoiceRef(route),
    ...value(route),
  })).sort((left, right) => left.resultRef.localeCompare(right.resultRef))
}

function routeRecipients(route: Route, businessNames: BusinessNames) {
  const recipients = new Map<string, { name: string; purposes: Set<string> }>()
  for (const step of route.steps) {
    for (const use of step.dataUse) {
      const identity = use.recipient.kind === 'named_recipient'
        ? `named:${use.recipient.recipientId}`
        : `business:${step.businessId}`
      const existing = recipients.get(identity) ?? {
        name: use.recipient.kind === 'named_recipient'
          ? readableName(use.recipient.recipientId)
          : businessName(step.businessId, businessNames),
        purposes: new Set<string>(),
      }
      for (const purpose of use.purposes) existing.purposes.add(purpose)
      recipients.set(identity, existing)
    }
  }
  return [...recipients].map(([identity, recipient]) => ({
    recipientRef: `recipient:${canonicalDigest({ identity })}`,
    name: recipient.name,
    purposes: [...recipient.purposes].sort(),
  })).sort((left, right) => left.recipientRef.localeCompare(right.recipientRef))
}

function routeResult(
  route: Route,
  capabilitySemantics: CustomerRouteCapabilitySemantics,
): CustomerRoutePlan['result'] {
  const outgoing = new Set(route.edges.map(({ fromStep }) => fromStep))
  const terminalSteps = route.steps.filter(({ actionId }) => !outgoing.has(actionId))
  const terminalSemantics = terminalSteps.map(({ contractRef }) => {
    const semantics = capabilitySemantics[capabilitySemanticsKey(contractRef)]
    if (semantics === undefined) throw new Error('customer_route_plan_capability_semantics_missing')
    return semantics
  })
  const summaries = [...new Set(terminalSemantics.map(({ description }) => description))]
  const deliverables = [...new Set(terminalSemantics.flatMap(({ resultLabels }) => resultLabels))].sort()
  return Object.freeze({
    resultRef: semanticChoiceRef(route),
    summary: summaries.join(' '),
    deliverables: Object.freeze(deliverables),
  })
}

function semanticChoiceRef(route: Route): string {
  return `result:${canonicalDigest({
    steps: route.steps.map(({ publicationRef, contractRef }) => ({
      publicationRef, contractRef,
    })),
    edges: route.edges.map(({ fromStep, toStep }) => ({
      from: route.steps.findIndex(({ actionId }) => actionId === fromStep),
      to: route.steps.findIndex(({ actionId }) => actionId === toStep),
    })),
  } as StableHashValue)}`
}

export function capabilitySemanticsKey(
  ref: Readonly<{ capabilityId: string; version: number; contractDigest: string }>,
): string {
  return `${ref.capabilityId}@${ref.version}:${ref.contractDigest}`
}

function customerBusiness(businessId: string, businessNames: BusinessNames) {
  return Object.freeze({
    businessRef: `business:${canonicalDigest({ businessId })}`,
    name: businessName(businessId, businessNames),
  })
}

function businessName(businessId: string, businessNames: BusinessNames): string {
  const name = businessNames[businessId]?.trim()
  if (name === undefined || name.length === 0) throw new Error('customer_route_plan_business_name_missing')
  return name
}

function readableName(value: string): string {
  const words = value.replace(/[._-]+/gu, ' ').trim()
  return words.length === 0 ? 'Named recipient' : `${words[0]?.toUpperCase() ?? ''}${words.slice(1)}`
}

function customerEffectKind(value: Route['steps'][number]['effects'][number]['class']) {
  if (value === 'data_release') return 'information_shared' as const
  if (value === 'financial_exposure') return 'financial_commitment' as const
  return 'external_change' as const
}

function addChanged<Before, After>(
  items: Change[],
  _kind: Change['kind'],
  before: Before,
  after: After,
  change: () => Change,
): void {
  if (!same(before, after)) items.push(Object.freeze(change()))
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function uniqueBy<Value>(values: readonly Value[], key: (value: Value) => string): Value[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const identity = key(value)
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

function sortCanonical<Value>(values: readonly Value[]): Value[] {
  return [...values].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

export function customerRoutePlanProjectionInputsAreBounded(input: Readonly<{
  current: CustomerRoutePlanProjectionGeneration
  previous?: CustomerRoutePlanProjectionGeneration
}>): boolean {
  const generations = input.previous === undefined ? [input.current] : [input.previous, input.current]
  return generations.every((generation) => generation.routes.length <= 256
    && generation.routes.every((route) => route.steps.length <= 64))
}
