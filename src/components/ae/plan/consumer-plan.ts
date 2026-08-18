import type { OfferingPrice } from '@/modules/catalog/public'
import type { ServiceDto, ServicePriceSummaryDto } from '@/modules/registry/public'

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
    source: 'business_published'
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

export type ConsumerSupplyOption = ConsumerPlanOption

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

export function toConsumerSupplyOption(service: ServiceDto): ConsumerSupplyOption {
  const location = service.ae.businessContext.kind === 'local_human'
    ? [service.ae.businessContext.suburb, service.ae.businessContext.stateTerritory]
      .filter((part): part is string => part.length > 0)
      .join(', ')
    : ''
  const firstOffer = service.ae.offerings[0]
  const firstPricedOffering = service.ae.offerings.find((offering) => offering.price !== undefined)
  const nextAction = { kind: 'inspect' as const, label: 'See business details', href: `/${service.id}` }
  const priceSummary = catalogPriceSummaryText(service.priceSummary)
  const price = firstPricedOffering?.price === undefined
    ? {
        kind: 'not_published' as const,
        ...(priceSummary === undefined ? {} : { summary: priceSummary }),
      }
    : {
        kind: 'published' as const,
        published: firstPricedOffering.price,
        ...(priceSummary === undefined ? {} : { summary: priceSummary }),
      }
  const availability = firstOffer?.availabilitySummary === undefined
    ? { kind: 'needs_confirmation' as const }
    : { kind: 'published' as const, summary: firstOffer.availabilitySummary }
  return {
    optionRef: service.id,
    business: {
      slug: service.id,
      name: service.name,
      ...(location.length === 0 ? {} : { location }),
    },
    offering: { name: service.name, summary: firstOffer?.summary ?? service.category },
    price,
    availability,
    nextAction,
    evidence: {
      observedAt: service.ae.observedAt,
      source: service.ae.source,
    },
  }
}

function catalogPriceSummaryText(summary: ServicePriceSummaryDto | undefined): string | undefined {
  if (summary === undefined) return undefined
  return `${summary.minAmount} - ${summary.maxAmount} ${summary.currency}`
}
