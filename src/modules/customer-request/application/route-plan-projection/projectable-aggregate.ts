import type { JsonValue } from '@/modules/capability-contract/public'
import type { CustomerCriterion } from '@/modules/customer-request/customer-projection'

/**
 * Structural aggregate for projections — accepts domain aggregates and Convex
 * Infer aggregates without `as unknown as` at each call site.
 */
export type ProjectableCustomerRequestAggregate = Readonly<{
  snapshot: Readonly<{
    requestId: string
    revision: number
    intent: string
    routeExclusions?: readonly unknown[]
  }>
  evaluation: Readonly<{
    criteria: readonly Readonly<{
      inputKey?: string
      label: string
      value: JsonValue
      basis: 'customer_provided' | 'extracted_from_request'
      impact?: CustomerCriterion['impact']
    }>[]
    posture: 'needs_information' | 'progress_available' | 'unsupported'
    nextRequirement?: Readonly<
      | { kind: 'intent_direction'; prompt: string }
      | { kind: 'contract_fact'; requirementKey: string; customerLabel: string; customerPrompt?: string }
    >
    preparationDisclosure?: Readonly<{
      maximumRecipients: number
      purposes: readonly string[]
      categories: readonly Readonly<{
        label: string
        classification: 'personal' | 'sensitive' | 'credential'
      }>[]
    }>
  }>
  outcome: 'plan_ready' | 'needs_information' | 'unsupported'
  plan: Readonly<{ actions: readonly unknown[]; interpreterId?: string }>
}>
