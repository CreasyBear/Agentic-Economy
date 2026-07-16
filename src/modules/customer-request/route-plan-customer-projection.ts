import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type {
  CustomerRoutePlan,
  CustomerRoutePlanDecision,
} from './agent-contract'
import { routePlanGraphIsValid } from './route-plan-generation'

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
      inputPointer: string
      classification: 'public' | 'personal' | 'sensitive' | 'credential'
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
    commercialRelationship?: Readonly<{
      kind: 'none' | 'direct' | 'affiliate' | 'ownership'
      summary: string
      influencesEligibility: boolean
      influencesInclusion: boolean
      influencesOrder: boolean
      evidenceRefs: readonly string[]
    }>
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
    outcomeSignature?: string
    hardConstraints?: 'satisfied'
    duration?: 'not_declared'
    recovery?: 'retry_safe' | 'reconcile_required'
    freshnessValidUntil?: number
    ordering:
      | Readonly<{ kind: 'unranked' }>
      | Readonly<{
          kind: 'ranked'
          objective: 'lowest_maximum_price'
          position: number
          evidenceRef?: string
        }>
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
  if (!input.current.routes.every(routePlanGraphIsValid)
    || (input.previous !== undefined && !input.previous.routes.every(routePlanGraphIsValid))) {
    throw new Error('customer_route_plan_graph_invalid')
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
    comparison: projectDecisionComparison(input.current.routes, routes),
    actions: Object.freeze({
      review: Object.freeze({
        kind: 'inspect_current_option' as const, createsAuthority: false as const, startsWork: false as const,
        summary: 'Reviewing shows every important limit. It does not confirm or start anything.',
      }),
      confirm: Object.freeze({
        kind: 'confirm_current_option' as const, createsAuthority: true as const, startsWork: false as const,
        summary: 'Confirming creates permission for this exact choice. It does not contact a business or start work.',
      }),
      start: Object.freeze({
        kind: 'start_confirmed_option' as const, availableAfter: 'confirmation' as const, startsWork: true as const,
        summary: 'Starting uses that confirmation to contact the listed businesses and begin the work.',
      }),
      change: Object.freeze({
        kind: 'revise_request' as const, createsAuthority: false as const, startsWork: false as const,
        preservesRequest: true as const,
        summary: 'Changing preserves the Request and returns to its details. The current choice remains unconfirmed.',
      }),
      decline: Object.freeze({
        kind: 'leave_unconfirmed' as const, createsAuthority: false as const, startsWork: false as const,
        preservesRequest: true as const,
        summary: 'Declining leaves this choice unconfirmed and starts nothing.',
      }),
    }),
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
  const routeRef = customerRouteRef(generationRef, route.routePlanId)
  const outcomeRef = routeOutcomeRef(route, capabilitySemantics)
  const outcomeFit = new Set(generationRoutes.map((candidate) => routeOutcomeRef(candidate, capabilitySemantics))).size === 1
    ? 'same_promised_result' as const
    : 'different_promised_result' as const
  const commercialInfluence = projectRouteCommercialInfluence(route)
  const freshnessValidUntil = Math.min(route.comparison.freshnessValidUntil ?? route.expiresAt, route.expiresAt)
  const quoteDigest = canonicalDigest({
    contract: 'ae.customer-route-quote:v1',
    generationRef,
    routeRef,
    maximumTotalCost: route.maximumTotalCost,
    recipients,
    effects,
    evidence,
    recovery: route.steps.map(({ businessId, recovery }) => ({ businessId, recovery })),
    cancellation,
    validUntil: freshnessValidUntil,
    fallbacks: route.fallbacks,
  } as StableHashValue)
  return Object.freeze({
    routeRef,
    quoteDigest,
    result: routeResult(route, capabilitySemantics),
    availability: freshnessValidUntil <= now ? 'expired' as const : 'current' as const,
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
    validUntil: freshnessValidUntil,
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
    comparison: Object.freeze({
      outcomeRef,
      outcomeFit,
      completeness: 'complete' as const,
      hardConstraints: route.comparison.hardConstraints ?? 'satisfied' as const,
      maximumCost: Object.freeze({ ...route.maximumTotalCost }),
      dataExposureCount: recipients.length,
      irreversibleEffectCount: effects.filter(({ reversibility }) => reversibility === 'irreversible').length,
      uncertaintyCount: route.uncertainty.length,
      duration: route.comparison.duration ?? 'not_declared' as const,
      recovery: route.comparison.recovery
        ?? (route.steps.some(({ recovery }) => recovery.recovery === 'reconcile_required')
          ? 'reconcile_required' as const
          : 'retry_safe' as const),
      trust: 'registered_current_option' as const,
      evidenceCount: evidence.length,
      freshness: Object.freeze({
        state: freshnessValidUntil <= now ? 'expired' as const : 'current' as const,
        validUntil: freshnessValidUntil,
      }),
      commercialInfluence,
    }),
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

function projectDecisionComparison(
  sourceRoutes: readonly Route[],
  routes: readonly CustomerRoutePlan[],
): CustomerRoutePlanDecision['comparison'] {
  const currentRoutes = routes.filter(({ availability }) => availability === 'current')
  if (routes.length === 1 && currentRoutes.length === 1) {
    return Object.freeze({
      kind: 'single' as const,
      summary: 'One current way forward is available. This is not a comparison or recommendation.',
    })
  }
  const groups = new Map<string, string[]>()
  for (const route of routes) {
    const group = groups.get(route.comparison.outcomeRef) ?? []
    group.push(route.routeRef)
    groups.set(route.comparison.outcomeRef, group)
  }
  if (groups.size > 1) {
    return Object.freeze({
      kind: 'incomparable' as const,
      summary: 'These ways forward promise different results, so AE has not ranked them against each other.',
      groups: Object.freeze([...groups].map(([outcomeRef, routeRefs]) => Object.freeze({
        outcomeRef,
        routeRefs: Object.freeze([...routeRefs].sort()),
      })).sort((left, right) => left.outcomeRef.localeCompare(right.outcomeRef))),
    })
  }
  if (currentRoutes.length !== routes.length) {
    return unrankedComparison('stale_evidence', 'At least one way forward has expired, so AE has not ranked this set.')
  }
  const commercial = routes.map(({ comparison }) => comparison.commercialInfluence)
  if (commercial.some(({ status }) => status === 'unknown')) {
    return unrankedComparison(
      'comparison_evidence_missing',
      'AE is missing evidence needed for a trustworthy comparison, so these ways forward are not ranked.',
    )
  }
  if (commercial.some((influence) => influence.status === 'disclosed' && influence.affectsDecision)) {
    return unrankedComparison(
      'commercial_influence',
      'A commercial relationship could affect this decision, so AE has not ranked these ways forward.',
    )
  }
  const ranked = sourceRoutes.map(({ comparison }) => comparison.ordering)
  if (!ranked.every((ordering) => ordering.kind === 'ranked' && ordering.evidenceRef !== undefined)) {
    return unrankedComparison(
      'customer_preference_absent',
      'These ways forward are comparable, but AE has no customer priority that justifies recommending one.',
    )
  }
  const evidenceRefs = new Set(ranked.flatMap((ordering) => ordering.kind === 'ranked' && ordering.evidenceRef !== undefined
    ? [ordering.evidenceRef]
    : []))
  const positions = ranked.flatMap((ordering) => ordering.kind === 'ranked' ? [ordering.position] : [])
  const expectedPositions = routes.map((_, index) => index + 1)
  if (positions.length !== routes.length
    || [...positions].sort((left, right) => left - right).some((position, index) => position !== expectedPositions[index])) {
    return unrankedComparison(
      'ranking_evidence_invalid',
      'The ranking evidence is inconsistent, so AE has not recommended a way forward.',
    )
  }
  const selectedIndex = ranked.findIndex((ordering) => ordering.kind === 'ranked' && ordering.position === 1)
  const selected = routes[selectedIndex]
  const orderedByCost = [...routes].sort((left, right) => {
    const leftAmount = left.maximumTotalCost.kind === 'known' ? left.maximumTotalCost.amountMinor : Number.MAX_SAFE_INTEGER
    const rightAmount = right.maximumTotalCost.kind === 'known' ? right.maximumTotalCost.amountMinor : Number.MAX_SAFE_INTEGER
    return leftAmount - rightAmount || left.routeRef.localeCompare(right.routeRef)
  })
  const rankedPositionByRouteRef = new Map(routes.map((route, index) => [route.routeRef, positions[index]]))
  if (orderedByCost.some((route, index) => rankedPositionByRouteRef.get(route.routeRef) !== index + 1)) {
    return unrankedComparison(
      'ranking_evidence_invalid',
      'The ranking evidence is inconsistent, so AE has not recommended a way forward.',
    )
  }
  const next = orderedByCost[1]
  const evidenceRef = [...evidenceRefs][0]
  if (evidenceRefs.size !== 1 || selected === undefined || next === undefined || evidenceRef === undefined
    || selected.routeRef !== orderedByCost[0]?.routeRef
    || selected.maximumTotalCost.kind !== 'known' || next.maximumTotalCost.kind !== 'known'
    || selected.maximumTotalCost.currency !== next.maximumTotalCost.currency
    || selected.maximumTotalCost.amountMinor === next.maximumTotalCost.amountMinor) {
    return unrankedComparison('tie', 'No current way forward has a unique evidence-backed lead, so AE has not recommended one.')
  }
  const currency = selected.maximumTotalCost.currency
  const difference = next.maximumTotalCost.amountMinor - selected.maximumTotalCost.amountMinor
  return Object.freeze({
    kind: 'recommended' as const,
    summary: 'One way forward best matches the price priority in this Request.',
    routeRef: selected.routeRef,
    objective: 'lowest_maximum_price' as const,
    evidenceRef,
    commercialInfluence: commercial.some(({ status }) => status === 'disclosed')
      ? 'disclosed' as const
      : 'none' as const,
    reasons: Object.freeze([
      `Lowest maximum cost: ${formatCustomerMoney(currency, selected.maximumTotalCost.amountMinor)}.`,
      `${formatCustomerMoney(currency, difference)} below the next current way forward.`,
    ]),
    tradeoffs: Object.freeze(comparisonTradeoffs(selected, next)),
  })
}

function unrankedComparison(
  reason: Extract<CustomerRoutePlanDecision['comparison'], { kind: 'unranked' }>['reason'],
  summary: string,
): Extract<CustomerRoutePlanDecision['comparison'], { kind: 'unranked' }> {
  return Object.freeze({ kind: 'unranked' as const, reason, summary })
}

function comparisonTradeoffs(selected: CustomerRoutePlan, next: CustomerRoutePlan): readonly string[] {
  const tradeoffs: string[] = []
  if (selected.comparison.dataExposureCount !== next.comparison.dataExposureCount) {
    tradeoffs.push(`${selected.comparison.dataExposureCount} information recipient${selected.comparison.dataExposureCount === 1 ? '' : 's'} versus ${next.comparison.dataExposureCount}.`)
  }
  if (selected.comparison.irreversibleEffectCount !== next.comparison.irreversibleEffectCount) {
    tradeoffs.push(`${selected.comparison.irreversibleEffectCount} irreversible effect${selected.comparison.irreversibleEffectCount === 1 ? '' : 's'} versus ${next.comparison.irreversibleEffectCount}.`)
  }
  if (selected.comparison.uncertaintyCount !== next.comparison.uncertaintyCount) {
    tradeoffs.push(`${selected.comparison.uncertaintyCount} declared uncertaint${selected.comparison.uncertaintyCount === 1 ? 'y' : 'ies'} versus ${next.comparison.uncertaintyCount}.`)
  }
  if (selected.comparison.evidenceCount !== next.comparison.evidenceCount) {
    tradeoffs.push(`${selected.comparison.evidenceCount} evidence requirement${selected.comparison.evidenceCount === 1 ? '' : 's'} versus ${next.comparison.evidenceCount}.`)
  }
  if (selected.comparison.recovery !== next.comparison.recovery) {
    tradeoffs.push(`Recovery is ${comparisonRecoveryLabel(selected.comparison.recovery)} versus ${comparisonRecoveryLabel(next.comparison.recovery)}.`)
  }
  return tradeoffs.length === 0
    ? Object.freeze(['No other declared comparison dimension separates the two leading ways forward.'])
    : Object.freeze(tradeoffs)
}

function projectRouteCommercialInfluence(route: Route): CustomerRoutePlan['comparison']['commercialInfluence'] {
  if (route.comparison.outcomeSignature === undefined
    || route.comparison.hardConstraints === undefined
    || route.comparison.duration === undefined
    || route.comparison.recovery === undefined
    || route.comparison.freshnessValidUntil === undefined) {
    return Object.freeze({ status: 'unknown' as const })
  }
  const relationships = route.steps.map(({ commercialRelationship }) => commercialRelationship)
  if (relationships.some((relationship) => relationship === undefined)) return Object.freeze({ status: 'unknown' as const })
  const present = relationships.filter((relationship): relationship is NonNullable<typeof relationship> => relationship !== undefined)
  const evidenceRefs = [...new Set(present.flatMap(({ evidenceRefs: refs }) => refs))].sort()
  if (present.every(({ kind }) => kind === 'none')) {
    return Object.freeze({ status: 'none' as const, evidenceRefs: Object.freeze(evidenceRefs) })
  }
  return Object.freeze({
    status: 'disclosed' as const,
    summaries: Object.freeze([...new Set(present.filter(({ kind }) => kind !== 'none').map(({ summary }) => summary))]),
    evidenceRefs: Object.freeze(evidenceRefs),
    affectsDecision: present.some(({ influencesEligibility, influencesInclusion, influencesOrder }) => (
      influencesEligibility || influencesInclusion || influencesOrder
    )),
  })
}

function routeOutcomeRef(route: Route, capabilitySemantics: CustomerRouteCapabilitySemantics): string {
  return route.comparison.outcomeSignature ?? `outcome:${canonicalDigest(routeResult(route, capabilitySemantics) as StableHashValue)}`
}

function formatCustomerMoney(currency: string, amountMinor: number): string {
  return `${currency} ${(amountMinor / 100).toFixed(2)}`
}

function comparisonRecoveryLabel(value: 'retry_safe' | 'reconcile_required'): string {
  return value === 'retry_safe' ? 'safe to retry after confirmed failure' : 'check required before retry'
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
  const recipients = new Map<string, {
    name: string
    purposes: Set<string>
    fields: Map<string, { fieldRef: string; label: string; classification: 'public' | 'personal' | 'sensitive' | 'credential' }>
  }>()
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
        fields: new Map(),
      }
      for (const purpose of use.purposes) existing.purposes.add(purpose)
      existing.fields.set(`${use.inputPointer}:${use.classification}`, {
        fieldRef: `field:${canonicalDigest({ inputPointer: use.inputPointer, classification: use.classification })}`,
        label: readableName(use.inputPointer.replace(/^\/+|\/+$/gu, '')),
        classification: use.classification,
      })
      recipients.set(identity, existing)
    }
  }
  return [...recipients].map(([identity, recipient]) => ({
    recipientRef: `recipient:${canonicalDigest({ identity })}`,
    name: recipient.name,
    purposes: [...recipient.purposes].sort(),
    fields: [...recipient.fields.values()].sort((left, right) => left.fieldRef.localeCompare(right.fieldRef)),
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
