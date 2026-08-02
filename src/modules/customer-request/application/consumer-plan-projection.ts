import type { OfferingPrice } from '@/modules/catalog/public'

import type { CustomerRequestView } from '../customer-projection'
import type { PreviewCustomerRequestResult, PreviewCustomerRequestStep } from './interpret-compile/preview'

const MAX_STEPS = 32
const MAX_OPTIONS_PER_STEP = 3
const MAX_PLAN_BYTES = 120_000

export type ConsumerDestination = Readonly<{
  label: string
  request: string
}>

export type ConsumerNextAction = Readonly<{
  kind: 'inspect' | 'compare' | 'quote' | 'start_request' | 'revise' | 'wait'
  label: string
  href?: string
}>

export type ConsumerDecisionRecord = Readonly<{
  step: number
  optionRef?: string
  action: 'inspected' | 'compared' | 'quoted' | 'approved' | 'started' | 'completed' | 'refused' | 'needs_attention'
  authority: 'inspect_only' | 'approve_each' | 'bounded_mandate' | 'full_yolo'
  summary: string
  observedAt: number
  evidenceRefs: readonly string[]
  nextAction: ConsumerNextAction
}>

export type ConsumerPlanOption = Readonly<{
  optionRef: string
  business: Readonly<{
    slug: string
    name: string
    location?: string
  }>
  offering: Readonly<{
    name: string
    summary: string
  }>
  price:
    | Readonly<{ kind: 'published'; published: OfferingPrice; summary?: string }>
    | Readonly<{ kind: 'not_published'; summary?: string }>
  availability:
    | Readonly<{ kind: 'published'; summary?: string; validUntil?: number }>
    | Readonly<{ kind: 'needs_confirmation'; summary?: string }>
  nextAction: ConsumerNextAction
  evidence: Readonly<{
    observedAt?: number
    source: 'business_published' | 'ae_sandbox'
  }>
}>

export type ConsumerPlanStep = Readonly<{
  step: number
  title: string
  purpose: string
  state: 'frontier' | 'queued' | 'running' | 'completed' | 'needs_attention' | 'blocked'
  dependsOn: readonly number[]
  options: readonly ConsumerPlanOption[]
  nextAction: ConsumerNextAction
  record?: ConsumerDecisionRecord
}>

export type ConsumerPlanFrontier = Readonly<{
  step: number
  availableActions: readonly ConsumerNextAction[]
}>

export type ConsumerPlan = Readonly<{
  kind: 'plan'
  destination: ConsumerDestination
  steps: readonly ConsumerPlanStep[]
  frontier: ConsumerPlanFrontier
  decisions: readonly ConsumerDecisionRecord[]
  authority: 'inspect_only' | 'approve_each' | 'bounded_mandate' | 'full_yolo'
}>

export type ConsumerSupplyOption = Readonly<{
  optionRef: string
  business: Readonly<{
    slug: string
    name: string
    location?: string
  }>
  offering: Readonly<{
    name: string
    summary: string
  }>
  price:
    | Readonly<{ kind: 'published'; published: OfferingPrice; summary?: string }>
    | Readonly<{ kind: 'not_published'; summary?: string }>
  availability:
    | Readonly<{ kind: 'published'; summary?: string; validUntil?: number }>
    | Readonly<{ kind: 'needs_confirmation'; summary?: string }>
  nextAction: ConsumerNextAction
  evidence: Readonly<{
    observedAt?: number
    source: 'business_published' | 'ae_sandbox'
  }>
}>

export type ConsumerPlanResult = Readonly<
  | ConsumerPlan
  | Readonly<{
      kind: 'needs_information'
      prompt: string
      destination: ConsumerDestination
      decisions: readonly ConsumerDecisionRecord[]
    }>
  | Readonly<{
      kind: 'unavailable'
      reason: 'no_current_supply' | 'preview_unavailable' | 'options_changed' | 'rate_limited'
      destination: ConsumerDestination
      decisions: readonly ConsumerDecisionRecord[]
    }>
>

export function projectCustomerRequestDecisionRecords(
  view: CustomerRequestView,
  evidenceRefs: readonly string[] = [],
): readonly ConsumerDecisionRecord[] {
  if (view.action === undefined && view.progress === undefined && view.activity === undefined
    && view.decision === undefined && view.confirmation === undefined) return []
  const action = view.action?.state === 'completed'
    ? 'completed'
    : view.action?.state === 'failed'
      ? 'refused'
      : view.activity?.certainty === 'unknown'
        ? 'needs_attention'
        : view.decision === undefined ? 'inspected' : 'compared'
  const summary = action === 'completed'
    ? 'The observed step completed.'
    : action === 'refused'
      ? 'The observed step needs attention.'
      : action === 'compared'
        ? 'The current options were compared.'
        : 'The current Request state was reviewed.'
  return [{
    step: view.progress?.current.step ?? 1,
    action,
    authority: view.confirmation === undefined ? 'inspect_only' : 'approve_each',
    summary,
    observedAt: view.action?.observedAt ?? view.activity?.updatedAt ?? 0,
    evidenceRefs,
    nextAction: nextActionForView(view.nextAction),
  }]
}

export function projectConsumerPlan(
  preview: PreviewCustomerRequestResult,
  supplies: readonly ConsumerSupplyOption[],
  now = Date.now(),
): ConsumerPlanResult {
  if (preview.kind === 'needs_information') {
    return {
      kind: 'needs_information',
      prompt: preview.prompt,
      destination: preview.destination,
      decisions: [],
    }
  }
  if (preview.kind === 'unavailable') {
    return {
      kind: 'unavailable',
      reason: preview.reason,
      destination: preview.destination,
      decisions: [],
    }
  }
  if (preview.steps.length === 0 || preview.steps.length > MAX_STEPS || preview.expiresAt <= now) {
    return unavailable(preview.destination, 'options_changed')
  }

  const byRef = new Map(supplies.map((supply) => [supply.optionRef, supply]))
  const steps = preview.steps.toSorted((left, right) => left.step - right.step)
  if (!validStepOrder(steps)) return unavailable(preview.destination, 'preview_unavailable')
  const stepOptions = steps.map((step) => step.offeringRefs
    .map((ref) => byRef.get(ref))
    .filter((supply): supply is ConsumerSupplyOption => supply !== undefined)
    .slice(0, MAX_OPTIONS_PER_STEP)
    .map(toPlanOption))
  const hasCandidateRefs = steps.some((step) => step.offeringRefs.length > 0)
  if (hasCandidateRefs && stepOptions.every((options) => options.length === 0)) {
    return unavailable(preview.destination, 'options_changed')
  }

  const frontierStep = findFrontierStep(steps, stepOptions)
  const projectedSteps = steps.map((step, index) => projectStep(step, stepOptions[index] ?? [], frontierStep, steps, stepOptions))
  if (frontierStep === undefined) return unavailable(preview.destination, 'options_changed')
  const frontier = projectedSteps.find((step) => step.step === frontierStep)
  if (frontier === undefined) return unavailable(preview.destination, 'preview_unavailable')
  const result: ConsumerPlan = {
    kind: 'plan',
    destination: preview.destination,
    steps: projectedSteps,
    frontier: {
      step: frontier.step,
      availableActions: uniqueActions([
        { kind: 'compare', label: 'Compare these options' },
        ...frontier.options.map((option) => option.nextAction),
      ]),
    },
    decisions: [],
    authority: preview.authority,
  }
  return JSON.stringify(result).length > MAX_PLAN_BYTES
    ? unavailable(preview.destination, 'preview_unavailable')
    : result
}

function projectStep(
  source: PreviewCustomerRequestStep,
  options: readonly ConsumerPlanOption[],
  frontierStep: number | undefined,
  allSteps: readonly PreviewCustomerRequestStep[],
  allOptions: readonly (readonly ConsumerPlanOption[])[],
): ConsumerPlanStep {
  const dependenciesReady = source.dependsOn.every((dependency) => {
    const index = allSteps.findIndex((step) => step.step === dependency)
    return index >= 0 && (allOptions[index]?.length ?? 0) > 0
  })
  const state = options.length === 0
    ? 'needs_attention'
    : source.step === frontierStep
      ? 'frontier'
      : dependenciesReady ? 'queued' : 'blocked'
  const nextAction = options.length === 0
    ? { kind: 'revise' as const, label: 'Refine the ask' }
    : state === 'frontier'
      ? { kind: 'compare' as const, label: 'Compare these options' }
      : { kind: 'wait' as const, label: 'Waiting for the earlier step' }
  return {
    step: source.step,
    title: source.title,
    purpose: source.purpose,
    state,
    dependsOn: source.dependsOn,
    options,
    nextAction,
  }
}

function findFrontierStep(
  steps: readonly PreviewCustomerRequestStep[],
  options: readonly (readonly ConsumerPlanOption[])[],
): number | undefined {
  return steps.find((step, index) => options[index] !== undefined
    && options[index]?.length !== 0
    && step.dependsOn.every((dependency) => {
      const dependencyIndex = steps.findIndex((candidate) => candidate.step === dependency)
      return dependencyIndex >= 0 && options[dependencyIndex]?.length !== 0
    }))?.step
}

function validStepOrder(steps: readonly PreviewCustomerRequestStep[]): boolean {
  return steps.every((step, index) => step.step === index + 1
    && step.dependsOn.every((dependency) => dependency >= 1 && dependency < step.step))
}

function toPlanOption(supply: ConsumerSupplyOption): ConsumerPlanOption {
  return {
    optionRef: supply.optionRef,
    business: supply.business,
    offering: supply.offering,
    price: supply.price,
    availability: supply.availability,
    nextAction: supply.nextAction,
    evidence: supply.evidence,
  }
}

function uniqueActions(actions: readonly ConsumerNextAction[]): readonly ConsumerNextAction[] {
  const seen = new Set<string>()
  return actions.filter((action) => {
    const key = `${action.kind}:${action.href ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function unavailable(
  destination: ConsumerDestination,
  reason: 'no_current_supply' | 'preview_unavailable' | 'options_changed' | 'rate_limited',
): ConsumerPlanResult {
  return { kind: 'unavailable', reason, destination, decisions: [] }
}

function nextActionForView(nextAction: CustomerRequestView['nextAction']): ConsumerNextAction {
  if (nextAction === 'inspect_routes' || nextAction === 'inspect_options') {
    return { kind: 'compare', label: 'Compare the current options' }
  }
  if (nextAction === 'inspect_confirmation' || nextAction === 'review_disclosure') {
    return { kind: 'inspect', label: 'Review this decision' }
  }
  if (nextAction === 'provide_information') return { kind: 'revise', label: 'Add the missing information' }
  if (nextAction === 'retry') return { kind: 'revise', label: 'Refresh the current options' }
  if (nextAction === 'wait') return { kind: 'wait', label: 'Wait for the next update' }
  return { kind: 'revise', label: 'Refine the ask' }
}
