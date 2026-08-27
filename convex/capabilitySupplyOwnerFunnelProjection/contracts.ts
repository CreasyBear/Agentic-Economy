import { v, type Infer } from 'convex/values'
import {
  capabilityPublicationSourceSelectorValue,
  pricingConfigValue,
  readinessOutcomeValue,
} from '@/modules/capability-supply/public'
import { ownerSupplyAccessPathDescriptorValue } from '@/modules/capability-supply/owner-supply-validators'

const ownerSupplyLifecycleReasonValue = v.union(
  v.literal('admission_unproven'),
  v.literal('conformance_unproven'),
  v.literal('credential_readiness_unobserved'),
  v.literal('health_unobserved'),
  v.literal('credential_unavailable'),
  v.literal('health_unhealthy'),
  v.literal('health_stale'),
  v.literal('withdrawn'),
  v.literal('incompatible_revision'),
  v.literal('eligibility_integrity_failure'),
)
const ownerSupplyAuthorityValue = v.union(
  v.object({ kind: v.literal('public_upstream') }),
  v.object({ kind: v.literal('provider_connection'), providerRef: v.string() }),
)
const ownerSupplyAuthoritySnapshotValue = v.object({
  providerRef: v.string(),
  authorityGeneration: v.number(),
  authorityDigest: v.string(),
})
const ownerSupplyPublicationValue = v.object({
  state: v.union(
    v.literal('current'),
    v.literal('withdrawn'),
    v.literal('superseded'),
    v.literal('incompatible'),
  ),
  publicationRef: v.string(),
  publicationRevision: v.number(),
  operationRef: v.string(),
  authorityMode: v.union(
    v.literal('provider_owned'),
    v.literal('ae_curated_external'),
    v.literal('third_party_gateway'),
    v.literal('observed_external'),
  ),
  contractRef: v.object({
    capabilityId: v.string(),
    version: v.number(),
    contractDigest: v.string(),
  }),
  source: v.object({
    kind: v.union(
      v.literal('ae_envelope'),
      v.literal('openapi_http'),
      v.literal('mcp'),
      v.literal('agent_plugin_mcp'),
      v.literal('x402'),
    ),
    selector: capabilityPublicationSourceSelectorValue,
    revision: v.string(),
    digest: v.string(),
  }),
  pricing: v.optional(
    v.object({ config: pricingConfigValue, priceDigest: v.string() }),
  ),
  binding: v.object({
    bindingId: v.string(),
    bindingDigest: v.string(),
    endpointUrl: v.string(),
    adapterId: v.string(),
    admission: v.union(v.literal('not_admitted'), v.literal('admitted')),
    conformance: v.union(v.literal('not_conformant'), v.literal('conformant')),
    authority: ownerSupplyAuthorityValue,
    authoritySnapshot: v.optional(ownerSupplyAuthoritySnapshotValue),
  }),
  lifecycle: v.object({
    state: v.union(
      v.literal('inactive'),
      v.literal('active'),
      v.literal('withdrawn'),
      v.literal('incompatible'),
    ),
    reasons: v.array(ownerSupplyLifecycleReasonValue),
  }),
  readiness: v.object({
    outcome: v.union(v.literal('unobserved'), readinessOutcomeValue),
    observedAt: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    targetDigest: v.optional(v.string()),
    requestDigest: v.optional(v.string()),
    responseStatus: v.optional(v.number()),
    responseContentType: v.optional(v.string()),
    responseDigest: v.optional(v.string()),
    evidenceRefs: v.array(v.string()),
  }),
})

/** Bounded owner readback for the admitted source and single-player panel. */
export const ownerSupplyFunnelResultValue = v.union(
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('incomplete') }),
  v.object({
    kind: v.literal('available'),
    businessId: v.string(),
    business: v.object({ name: v.string(), slug: v.string() }),
    offerings: v.array(
      v.object({
        offeringRef: v.string(),
        revision: v.number(),
        name: v.string(),
        summary: v.string(),
        status: v.union(
          v.literal('draft'),
          v.literal('published'),
          v.literal('paused'),
          v.literal('retired'),
        ),
        sourceHash: v.optional(v.string()),
        source: v.optional(
          v.object({
            kind: v.union(
              v.literal('ae_envelope'),
              v.literal('openapi_http'),
              v.literal('mcp'),
              v.literal('agent_plugin_mcp'),
              v.literal('x402'),
            ),
            selector: capabilityPublicationSourceSelectorValue,
            revision: v.string(),
            digest: v.string(),
          }),
        ),
        endpointUrl: v.optional(v.string()),
        pricing: v.optional(
          v.object({ config: pricingConfigValue, priceDigest: v.string() }),
        ),
        authority: v.optional(
          v.object({
            mode: v.union(
              v.literal('provider_owned'),
              v.literal('ae_curated_external'),
              v.literal('third_party_gateway'),
              v.literal('observed_external'),
            ),
            kind: v.union(
              v.literal('public_upstream'),
              v.literal('provider_connection'),
            ),
            providerRef: v.optional(v.string()),
            authorityGeneration: v.optional(v.number()),
            authorityDigest: v.optional(v.string()),
          }),
        ),
        admission: v.object({
          state: v.union(v.literal('not_admitted'), v.literal('admitted')),
          reason: v.optional(v.string()),
        }),
        operationRef: v.optional(v.string()),
        publicationRef: v.optional(v.string()),
        publication: v.optional(ownerSupplyPublicationValue),
        lifecycle: v.object({
          state: v.union(
            v.literal('inactive'),
            v.literal('active'),
            v.literal('withdrawn'),
            v.literal('incompatible'),
          ),
          reasons: v.array(v.string()),
        }),
        readiness: v.object({
          outcome: v.union(v.literal('unobserved'), readinessOutcomeValue),
          observedAt: v.optional(v.number()),
          validUntil: v.optional(v.number()),
          evidenceRefs: v.array(v.string()),
        }),
        live: v.object({
          available: v.boolean(),
          reason: v.optional(v.string()),
        }),
        currentStep: v.union(
          v.literal('describe'),
          v.literal('admission'),
          v.literal('readiness'),
          v.literal('test'),
        ),
        stepStates: v.object({
          describe: v.union(
            v.literal('not_started'),
            v.literal('in_progress'),
            v.literal('completed'),
            v.literal('refused'),
            v.literal('stale'),
          ),
          admission: v.union(
            v.literal('not_started'),
            v.literal('in_progress'),
            v.literal('completed'),
            v.literal('refused'),
            v.literal('stale'),
          ),
          readiness: v.union(
            v.literal('not_started'),
            v.literal('in_progress'),
            v.literal('completed'),
            v.literal('refused'),
            v.literal('stale'),
          ),
          test: v.union(
            v.literal('not_started'),
            v.literal('in_progress'),
            v.literal('completed'),
            v.literal('refused'),
            v.literal('stale'),
          ),
        }),
        actionableReason: v.optional(v.string()),
        accessPaths: v.array(
          v.object({
            accessPathRef: v.string(),
            offeringSourceHash: v.string(),
            sourceHash: v.string(),
            status: v.union(
              v.literal('draft'),
              v.literal('published'),
              v.literal('withdrawn'),
            ),
            descriptor: ownerSupplyAccessPathDescriptorValue,
          }),
        ),
      }),
    ),
    callLog: v.array(
      v.object({
        eventRef: v.string(),
        offeringRef: v.string(),
        publicationRef: v.optional(v.string()),
        observedAt: v.number(),
        outcome: v.union(v.literal('filled'), v.literal('zero')),
        zeroReason: v.optional(
          v.union(
            v.literal('no_routeable_supply'),
            v.literal('readiness_unavailable'),
            v.literal('provider_refused'),
            v.literal('credential_unavailable'),
            v.literal('price_unavailable'),
            v.literal('insufficient_credit'),
            v.literal('input_invalid'),
            v.literal('outcome_unknown'),
          ),
        ),
        durationMs: v.optional(v.number()),
        evidenceRefs: v.array(v.string()),
        environment: v.union(
          v.literal('local'),
          v.literal('development'),
          v.literal('sandbox'),
          v.literal('production'),
        ),
      }),
    ),
    activityTruncated: v.boolean(),
    liquidity: v.object({
      fillCount: v.number(),
      zeroCount: v.number(),
      firstSuccessP50Ms: v.optional(v.number()),
      firstSuccessP95Ms: v.optional(v.number()),
      depthSamples: v.number(),
      environment: v.literal('development'),
    }),
  }),
)
export type OwnerSupplyFunnelResult = Infer<typeof ownerSupplyFunnelResultValue>
