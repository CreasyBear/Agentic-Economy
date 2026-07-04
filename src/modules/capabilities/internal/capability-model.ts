import type {
  ActionCardCapabilityDescriptor,
  BusinessEndpointCapabilityDescriptor,
  CapabilityTrustState,
  InformationalPageCapabilityDescriptor,
  InquiryIntakeCapabilityDescriptor,
} from '@/modules/capabilities/public'
import type { CapabilityCheckFacetResults } from './check-standard'

export type ComputeCapabilityTrustStateInput =
  | Readonly<{ kind: 'never_checked' }>
  | Readonly<{
      kind: 'checked'
      previousState: CapabilityTrustState
      facets: CapabilityCheckFacetResults
    }>

export function createInformationalPageDescriptor(
  input: Omit<InformationalPageCapabilityDescriptor, 'kind'>
): InformationalPageCapabilityDescriptor {
  return { kind: 'informational_page', publicUrl: input.publicUrl }
}

export function createInquiryIntakeDescriptor(
  input: Omit<InquiryIntakeCapabilityDescriptor, 'kind'>
): InquiryIntakeCapabilityDescriptor {
  return {
    kind: 'inquiry_intake',
    ...(input.serviceId === undefined ? {} : { serviceId: input.serviceId }),
    firstRequestMode: input.firstRequestMode,
    publicChannel: input.publicChannel,
  }
}

export function createBusinessEndpointDescriptor(
  input: Omit<BusinessEndpointCapabilityDescriptor, 'kind'>
): BusinessEndpointCapabilityDescriptor {
  return {
    kind: 'business_endpoint',
    originUrl: input.originUrl,
    manifestUrl: input.manifestUrl,
    schemaRef: input.schemaRef,
  }
}

export function createActionCardDescriptor(
  input: Omit<ActionCardCapabilityDescriptor, 'kind'>
): ActionCardCapabilityDescriptor {
  return { kind: 'action_card', actionSlug: input.actionSlug, cardRef: input.cardRef }
}

export function computeCapabilityTrustState(input: ComputeCapabilityTrustStateInput): CapabilityTrustState {
  if (input.kind === 'never_checked') {
    return 'business_supplied'
  }

  if (input.facets.contradiction.outcome === 'contradicted') {
    return 'contradicted'
  }

  if (input.facets.freshness.outcome === 'stale') {
    return 'stale'
  }

  if (
    (input.facets.reachability.outcome === 'fail' && input.facets.reachability.exhausted) ||
    (input.facets.schema.outcome === 'fail' && input.facets.schema.exhausted)
  ) {
    return 'unsupported'
  }

  if (input.facets.reachability.outcome === 'fail' || input.facets.schema.outcome === 'fail') {
    return input.previousState
  }

  return 'checked'
}
