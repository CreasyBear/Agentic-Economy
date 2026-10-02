import { v, type Infer } from 'convex/values'

import { jsonObject } from '@/modules/capability-execution/convex'

import { sourceWriteArgs } from '../../security/sourceWrite/contracts'

const ownerSupplyCompletedValue = v.object({
  step: v.union(v.literal('readiness'), v.literal('test')),
  state: v.literal('completed'),
  offeringRef: v.string(),
  revision: v.number(),
  message: v.string(),
  publicationRef: v.optional(v.string()),
  toolRef: v.optional(v.string()),
})

export const ownerSupplyActionResultValue = v.union(
  ownerSupplyCompletedValue,
  v.object({
    step: v.union(v.literal('readiness'), v.literal('test')),
    state: v.literal('refused'),
    refusal: v.union(
      v.literal('authorization_denied'),
      v.literal('publication_missing'), v.literal('publication_stale'),
      v.literal('offering_invalid'), v.literal('binding_invalid'),
      v.literal('contract_missing'), v.literal('input_unrepresentable'),
      v.literal('effectful_probe_unsupported'),
      v.literal('mcp_tool_missing'), v.literal('authority_stale'),
      v.literal('target_not_public'), v.literal('transport_unreachable'),
      v.literal('http_redirect'), v.literal('http_4xx'), v.literal('http_5xx'),
      v.literal('response_content_type_invalid'), v.literal('response_too_large'),
      v.literal('response_invalid'), v.literal('credential_unavailable'),
      v.literal('credential_rejected'), v.literal('target_changed'),
      v.literal('revision_changed'), v.literal('tool_not_found'),
      v.literal('tool_not_keyless'), v.literal('tool_not_executable'),
      v.literal('input_invalid'),
      v.literal('admission_unproven'), v.literal('conformance_unproven'),
      v.literal('credential_readiness_unobserved'), v.literal('health_unobserved'),
      v.literal('health_unhealthy'), v.literal('health_stale'),
      v.literal('eligibility_integrity_failure'), v.literal('provider_authority_unverified'), v.literal('withdrawn'),
      v.literal('incompatible_revision'),
    ),
  }),
)

export type OwnerSupplyActionResult = Infer<typeof ownerSupplyActionResultValue>

export const ownerSupplyInput = {
  businessId: v.id('businesses'),
  offeringRef: v.string(),
  offeringRevision: v.number(),
  offeringSourceHash: v.string(),
  publicationRef: v.string(),
  publicationRevision: v.number(),
  operationKey: v.string(),
  correlationId: v.optional(v.string()),
  input: v.optional(jsonObject),
  ...sourceWriteArgs,
}

export const ownerSupplyArgsValue = v.object(ownerSupplyInput)

export type OwnerSupplyArgs = Infer<typeof ownerSupplyArgsValue>

export function ownerSupplyRefusalFromProbe(reason: 'revision_changed' | 'target_changed'): Extract<OwnerSupplyActionResult, { state: 'refused' }>['refusal'] {
  return reason
}
