import type { GoalPredicate } from './plan-contract'

export type PlanEventKind =
  | 'plan_authored'
  | 'plan_revised'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'goal_evaluated'
  | 'outcome_recorded'

export type PlanEvent = Readonly<{
  planId: string
  revision?: number
  seq: number
  kind: PlanEventKind
  stepId?: string
  toolCallId?: string
  payloadJson: string
  costUsd?: number
  at: number
}>

export type PlanMetrics = Readonly<{
  stepsCompleted: number
  stepsTotal: number
  optionsCompared: number
  quotesReceived: number
  recommendationDelivered: boolean
  costUsd: number
  wallMs: number
  actionsUsed: number
}>

type EventPayload = Readonly<{
  actionId?: string
  resultKind?: string
  stepsTotal?: number
  recommendationDelivered?: boolean
}>

export function derivePlanMetrics(events: readonly PlanEvent[]): PlanMetrics {
  let stepsTotal = 0
  let stepsCompleted = 0
  const seenStepIds = new Set<string>()
  let optionsCompared = 0
  let quotesReceived = 0
  let recommendationDelivered = false
  let costUsd = 0
  let actionsUsed = 0
  let firstAt = Number.POSITIVE_INFINITY
  let lastAt = Number.NEGATIVE_INFINITY

  for (const event of events) {
    if (event.stepId !== undefined) seenStepIds.add(event.stepId)
    const payload = parsePayload(event.payloadJson)
    stepsTotal = Math.max(stepsTotal, payload.stepsTotal ?? 0)
    costUsd += event.costUsd ?? 0
    firstAt = Math.min(firstAt, event.at)
    lastAt = Math.max(lastAt, event.at)
    if (event.kind === 'step_started') actionsUsed += 1
    if (event.kind === 'step_completed') {
      stepsCompleted += 1
      if (payload.resultKind === 'quoted') quotesReceived += 1
      if (payload.actionId !== undefined && /(?:search|detail)/iu.test(payload.actionId)) {
        optionsCompared += 1
      }
    }
    if ((event.kind === 'goal_evaluated' || event.kind === 'outcome_recorded')
      && payload.recommendationDelivered === true) {
      recommendationDelivered = true
    }
  }

  return {
    stepsCompleted,
    stepsTotal: Math.max(stepsTotal, seenStepIds.size),
    optionsCompared,
    quotesReceived,
    recommendationDelivered,
    costUsd,
    wallMs: events.length === 0 ? 0 : Math.max(0, lastAt - firstAt),
    actionsUsed,
  }
}

export function evaluateGoalPredicate(predicate: GoalPredicate, metrics: PlanMetrics): boolean {
  if (predicate.kind === 'quotes_received') return metrics.quotesReceived >= predicate.minCount
  if (predicate.kind === 'options_compared') return metrics.optionsCompared >= predicate.minCount
  return metrics.recommendationDelivered
}

function parsePayload(value: string): EventPayload {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null ? parsed as EventPayload : {}
  } catch {
    return {}
  }
}
