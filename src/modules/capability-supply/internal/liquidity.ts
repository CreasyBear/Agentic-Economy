import { canonicalDigest } from '@/modules/common/canonical-digest'

export const capabilityCallEventKinds = [
  'supply_liquidity_fill_observed',
  'supply_liquidity_first_success_observed',
  'supply_liquidity_depth_observed',
] as const
export type CapabilityCallEventKind = typeof capabilityCallEventKinds[number]
export const liquidityZeroReasons = [
  'no_routeable_supply', 'readiness_unavailable', 'provider_refused', 'credential_unavailable',
  'price_unavailable', 'insufficient_credit', 'input_invalid', 'outcome_unknown',
] as const
export type LiquidityZeroReason = typeof liquidityZeroReasons[number]
export type LiquidityOutcome = 'filled' | 'zero'
export type LiquidityEnvironment = 'local' | 'development' | 'sandbox' | 'production'

export type CapabilityCallEvent = Readonly<{
  eventRef: string
  businessId: string
  offeringRef: string
  publicationRef?: string
  taskDigest: string
  eventKind: CapabilityCallEventKind
  outcome: LiquidityOutcome
  zeroReason?: LiquidityZeroReason
  taskStartedAt?: number
  successfulAt?: number
  durationMs?: number
  eligibleDepth?: number
  observedAt: number
  evidenceRefs: readonly string[]
  environment: LiquidityEnvironment
}>

export type CapabilityLiquidityWritePort = Readonly<{
  append: (event: CapabilityCallEvent) => Promise<void>
  has: (eventRef: string) => Promise<boolean>
}>

export type CapabilityCallObservationInput = Readonly<{
  businessId: string
  offeringRef: string
  publicationRef?: string
  taskDigest: string
  outcome: LiquidityOutcome
  zeroReason?: LiquidityZeroReason
  taskStartedAt?: number
  successfulAt?: number
  observedAt: number
  evidenceRefs: readonly string[]
  environment: LiquidityEnvironment
}>

type EventBuildInput = Readonly<{
  businessId: string
  offeringRef: string
  publicationRef?: string
  taskDigest: string
  outcome: LiquidityOutcome
  zeroReason?: LiquidityZeroReason
  taskStartedAt?: number
  successfulAt?: number
  eligibleDepth?: number
  observedAt: number
  evidenceRefs: readonly string[]
  environment: LiquidityEnvironment
}>

export async function recordCapabilityCallObservation(input: CapabilityCallObservationInput, port: CapabilityLiquidityWritePort): Promise<Readonly<{ fillEvent: CapabilityCallEvent; firstSuccessEvent?: CapabilityCallEvent }>> {
  const fillEvent = buildEvent(input, 'supply_liquidity_fill_observed')
  if (!await port.has(fillEvent.eventRef)) await port.append(fillEvent)
  if (input.outcome !== 'filled' || input.taskStartedAt === undefined || input.successfulAt === undefined) return { fillEvent }
  const durationMs = Math.max(0, input.successfulAt - input.taskStartedAt)
  const firstSuccessEvent = buildEvent({ ...input, taskStartedAt: input.taskStartedAt, successfulAt: input.successfulAt }, 'supply_liquidity_first_success_observed', durationMs)
  if (!await port.has(firstSuccessEvent.eventRef)) await port.append(firstSuccessEvent)
  return { fillEvent, firstSuccessEvent }
}

export type CapabilityDepthObservationInput = Readonly<{
  businessId: string
  offeringRef: string
  publicationRef?: string
  taskDigest: string
  eligibleDepth: number
  zeroReason?: LiquidityZeroReason
  observedAt: number
  evidenceRefs: readonly string[]
  environment: LiquidityEnvironment
}>

export async function recordCapabilityDepthObservation(input: CapabilityDepthObservationInput, port: CapabilityLiquidityWritePort): Promise<CapabilityCallEvent> {
  if (!Number.isSafeInteger(input.eligibleDepth) || input.eligibleDepth < 0) throw new Error('eligible_depth_invalid')
  const event = buildEvent({
    ...input,
    outcome: input.eligibleDepth > 0 ? 'filled' : 'zero',
    ...(input.eligibleDepth === 0 && input.zeroReason === undefined ? { zeroReason: 'no_routeable_supply' as const } : {}),
  }, 'supply_liquidity_depth_observed')
  if (!await port.has(event.eventRef)) await port.append(event)
  return event
}

function buildEvent(input: EventBuildInput, eventKind: CapabilityCallEventKind, durationMs?: number): CapabilityCallEvent {
  const eventRef = `capability-call-event:${canonicalDigest({
    eventKind, businessId: input.businessId, offeringRef: input.offeringRef, publicationRef: input.publicationRef ?? null,
    taskDigest: input.taskDigest, observedAt: input.observedAt, taskStartedAt: input.taskStartedAt ?? null,
    successfulAt: input.successfulAt ?? null, eligibleDepth: input.eligibleDepth ?? null,
  })}`
  const event: CapabilityCallEvent = {
    eventRef, businessId: input.businessId, offeringRef: input.offeringRef,
    ...(input.publicationRef === undefined ? {} : { publicationRef: input.publicationRef }),
    taskDigest: input.taskDigest, eventKind, outcome: input.outcome,
    ...(input.zeroReason === undefined ? {} : { zeroReason: input.zeroReason }),
    ...(input.taskStartedAt === undefined ? {} : { taskStartedAt: input.taskStartedAt }),
    ...(input.successfulAt === undefined ? {} : { successfulAt: input.successfulAt }),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(input.eligibleDepth === undefined ? {} : { eligibleDepth: input.eligibleDepth }),
    observedAt: input.observedAt, evidenceRefs: [...input.evidenceRefs], environment: input.environment,
  }
  return event
}

export function createMemoryCapabilityLiquidityPort(): CapabilityLiquidityWritePort & Readonly<{ events: readonly CapabilityCallEvent[] }> {
  const events: CapabilityCallEvent[] = []
  return {
    events,
    async append(event) { events.push(event) },
    async has(eventRef) { return events.some((event) => event.eventRef === eventRef) },
  }
}
