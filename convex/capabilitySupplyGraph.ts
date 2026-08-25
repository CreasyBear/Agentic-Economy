import { v, type Infer } from 'convex/values'
import {
  queryCapabilityGraph as queryCapabilityGraphFromModule,
  bindingObservedRowDigest,
} from '@/modules/capability-supply/public'

import { resolveAdminAuthority } from './authz'
import { capabilitySupplyGraphPorts } from './capabilitySupplyGraphPorts'
import type { QueryCtx } from './_generated/server'
import {
  commercialRelationshipValue,
  contractRefValue,
  priceValue,
} from './capabilitySupplyShared'

export const bindingControlStateValue = v.union(
  v.object({
    kind: v.literal('available'),
    bindingId: v.string(),
    observedRowDigest: v.string(),
    admission: v.union(v.literal('admitted'), v.literal('not_admitted')),
    conformance: v.union(v.literal('conformant'), v.literal('not_conformant')),
  }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.literal('binding_not_found'),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.literal('authorization_denied'),
  }),
)
const capabilityGraphNodeValue = v.object({
  publicationRef: v.string(),
  revision: v.number(),
  businessId: v.id('businesses'),
  contractRef: contractRefValue,
  offeringId: v.string(),
  bindingId: v.string(),
  source: v.object({
    kind: v.union(
      v.literal('ae_envelope'),
      v.literal('openapi_http'),
      v.literal('mcp'),
      v.literal('agent_plugin_mcp'),
      v.literal('x402'),
    ),
    digest: v.string(),
  }),
  semantic: v.object({
    capabilityId: v.string(),
    name: v.string(),
    description: v.string(),
    inputSchemaDigest: v.string(),
    outputSchemaDigest: v.string(),
    customerAnnotations: v.array(
      v.object({
        annotationId: v.string(),
        semanticIdentity: v.optional(v.string()),
        document: v.union(v.literal('input'), v.literal('output')),
        pointer: v.string(),
        label: v.string(),
        role: v.union(
          v.literal('request'),
          v.literal('constraint'),
          v.literal('comparison'),
          v.literal('commitment'),
          v.literal('result'),
          v.literal('completion_evidence'),
          v.literal('recovery'),
        ),
        inference: v.optional(
          v.union(v.literal('allowed'), v.literal('customer_required')),
        ),
      }),
    ),
    searchTerms: v.array(v.string()),
  }),
  policy: v.object({
    effects: v.array(
      v.object({
        effectId: v.string(),
        class: v.union(
          v.literal('data_release'),
          v.literal('financial_exposure'),
          v.literal('external_state_change'),
        ),
        authority: v.union(
          v.literal('none'),
          v.literal('explicit'),
          v.literal('mandate_or_explicit'),
        ),
        reversibility: v.union(
          v.literal('not_applicable'),
          v.literal('reversible'),
          v.literal('conditional'),
          v.literal('irreversible'),
        ),
      }),
    ),
    dataUse: v.array(
      v.object({
        effectId: v.string(),
        inputPointer: v.string(),
        classification: v.union(
          v.literal('public'),
          v.literal('personal'),
          v.literal('sensitive'),
          v.literal('credential'),
        ),
        phase: v.union(v.literal('preparation'), v.literal('execution')),
        recipient: v.union(
          v.object({ kind: v.literal('candidate_binding') }),
          v.object({ kind: v.literal('selected_binding') }),
          v.object({
            kind: v.literal('named_recipient'),
            recipientId: v.string(),
          }),
        ),
        purposes: v.array(v.string()),
      }),
    ),
    lifecycle: v.object({
      idempotency: v.union(v.literal('not_applicable'), v.literal('required')),
      recovery: v.union(
        v.literal('retry_safe'),
        v.literal('reconcile_required'),
      ),
    }),
  }),
  cost: v.object({
    price: priceValue,
    commercialRelationship: commercialRelationshipValue,
  }),
  trust: v.object({
    tier: v.string(),
    publicStatus: v.literal('published'),
    suppressed: v.literal(false),
    currentlyPublished: v.literal(true),
  }),
  liveness: v.object({
    credentialState: v.union(
      v.literal('unobserved'),
      v.literal('ready'),
      v.literal('unavailable'),
    ),
    healthState: v.union(
      v.literal('unobserved'),
      v.literal('healthy'),
      v.literal('unhealthy'),
    ),
    observedAt: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    stale: v.boolean(),
  }),
  routability: v.object({
    eligible: v.boolean(),
    reasons: v.array(v.string()),
  }),
  evidenceRefs: v.array(v.string()),
})
export const capabilityGraphResultValue = v.union(
  v.object({
    kind: v.literal('available'),
    nodes: v.array(capabilityGraphNodeValue),
    edges: v.array(
      v.object({
        kind: v.union(
          v.literal('published_by'),
          v.literal('bound_to'),
          v.literal('schema_compatible'),
        ),
        from: v.string(),
        to: v.string(),
      }),
    ),
  }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('query_invalid'),
      v.literal('authorization_denied'),
      v.literal('graph_limit_exceeded'),
      v.literal('graph_integrity_failure'),
    ),
  }),
)

export const queryCapabilityGraphArgs = {
  networkId: v.string(),
  includeInactive: v.boolean(),
  limit: v.number(),
} as const
export const inspectBindingControlStateArgs = {
  bindingId: v.string(),
} as const

export async function queryCapabilityGraphHandler(
  ctx: QueryCtx,
  args: { networkId: string; includeInactive: boolean; limit: number },
) {
  if (args.includeInactive) {
    const authority = await resolveAdminAuthority(
      { db: ctx.db, auth: ctx.auth },
      'register_capability_supply',
    )
    if (authority.kind !== 'allowed') {
      return {
        kind: 'unavailable' as const,
        reason: 'authorization_denied' as const,
      }
    }
  }
  return (await queryCapabilityGraphFromModule(
    capabilitySupplyGraphPorts(ctx.db),
    args,
  )) as Infer<typeof capabilityGraphResultValue>
}

export async function inspectBindingControlStateHandler(
  ctx: QueryCtx,
  args: { bindingId: string },
) {
  const authority = await resolveAdminAuthority(
    { db: ctx.db, auth: ctx.auth },
    'register_capability_supply',
  )
  if (authority.kind !== 'allowed')
    return {
      kind: 'refused' as const,
      reason: 'authorization_denied' as const,
    }
  const binding = await ctx.db
    .query('capabilityTransportBindings')
    .withIndex('by_bindingId', (index) =>
      index.eq('bindingId', args.bindingId),
    )
    .unique()
  if (binding === null)
    return {
      kind: 'unavailable' as const,
      reason: 'binding_not_found' as const,
    }
  return {
    kind: 'available' as const,
    bindingId: binding.bindingId,
    observedRowDigest: bindingObservedRowDigest(binding),
    admission: binding.admission,
    conformance: binding.conformance,
  }
}
