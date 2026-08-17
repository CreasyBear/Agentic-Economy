"use node"

import { v, type Infer } from 'convex/values'
import { canonicalDigest } from '@/modules/common/canonical-digest'


import { api, internal } from './_generated/api'
import { action, type ActionCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { resolveBusinessActor } from './authz'

const ownerSupplyCompletedValue = v.object({
  step: v.union(v.literal('readiness'), v.literal('test')),
  state: v.literal('completed'),
  offeringRef: v.string(),
  revision: v.number(),
  message: v.string(),
  publicationRef: v.optional(v.string()),
  operationRef: v.optional(v.string()),
})
const ownerSupplyActionResultValue = v.union(
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
      v.literal('revision_changed'), v.literal('operation_not_found'),
      v.literal('operation_not_keyless'), v.literal('operation_not_executable'),
      v.literal('input_invalid'),
      v.literal('admission_unproven'), v.literal('conformance_unproven'),
      v.literal('credential_readiness_unobserved'), v.literal('health_unobserved'),
      v.literal('health_unhealthy'), v.literal('health_stale'),
      v.literal('eligibility_integrity_failure'), v.literal('withdrawn'),
      v.literal('incompatible_revision'),
    ),
  }),
)
type OwnerSupplyActionResult = Infer<typeof ownerSupplyActionResultValue>
const ownerSupplyInput = {
  businessId: v.id('businesses'),
  offeringRef: v.string(),
  offeringRevision: v.number(),
  offeringSourceHash: v.string(),
  publicationRef: v.string(),
  publicationRevision: v.number(),
  operationKey: v.string(),
}

type OwnerSupplyOffering = Readonly<{
  offeringRef: string
  revision: number
  sourceHash?: string
  publicationRef?: string
  publicationRevision?: number
  operationRef?: string
  publisher?: string
  sourceKind?: string
  testCompleted?: boolean
}>
type OwnerSupplyFunnelCandidate = Readonly<{
  offeringRef: string
  revision: number
  sourceHash?: string
  publicationRef?: string
  operationRef?: string
  stepStates: Readonly<{ test: string }>
  publication?: Readonly<{
    publicationRevision: number
    authorityMode: string
    source: Readonly<{ kind: string }>
  }>
}>

async function ownerSupplyOffering(
  ctx: ActionCtx,
  businessId: Id<'businesses'>,
  offeringRef: string,
  offeringRevision: number,
  offeringSourceHash: string,
  publicationRef: string,
  publicationRevision: number,
): Promise<OwnerSupplyOffering | undefined> {
  const readback = await ctx.runQuery(api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel, { businessId })
  if (readback.kind !== 'available' || readback.businessId !== String(businessId)) return undefined
  const offering = readback.offerings.find((candidate) => (
    candidate.offeringRef === offeringRef
    && candidate.revision === offeringRevision
    && candidate.sourceHash === offeringSourceHash
    && candidate.publicationRef === publicationRef
    && candidate.publication?.publicationRevision === publicationRevision
  ))
  if (offering === undefined) return undefined
  return {
    offeringRef: offering.offeringRef,
    revision: offering.revision,
    ...(offering.sourceHash === undefined ? {} : { sourceHash: offering.sourceHash }),
    ...(offering.publicationRef === undefined ? {} : { publicationRef: offering.publicationRef }),
    ...(offering.publication?.publicationRevision === undefined
      ? {}
      : { publicationRevision: offering.publication.publicationRevision }),
    ...(offering.operationRef === undefined ? {} : { operationRef: offering.operationRef }),
    testCompleted: offering.stepStates.test === 'completed',
    ...(offering.publication === undefined ? {} : {
      publisher: offering.publication.authorityMode,
      sourceKind: offering.publication.source.kind,
    }),
  }
}

async function isOwnerSupplyActionAuthorized(ctx: ActionCtx, businessId: Id<'businesses'>): Promise<boolean> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return false
  return await ctx.runQuery(internal.capabilitySupply.authorizeOwnerSupplyAction, { businessId })
}

function ownerSupplyRefusalFromProbe(reason: 'revision_changed' | 'target_changed'): Extract<OwnerSupplyActionResult, { state: 'refused' }>['refusal'] {
  return reason
}


export const runOwnerSupplyReadiness = action({
  args: ownerSupplyInput,
  returns: ownerSupplyActionResultValue,
  handler: async (ctx, args): Promise<OwnerSupplyActionResult> => {
    if (!await isOwnerSupplyActionAuthorized(ctx, args.businessId)) {
      return { step: 'readiness', state: 'refused', refusal: 'authorization_denied' }
    }
    const offering = await ownerSupplyOffering(
      ctx,
      args.businessId,
      args.offeringRef,
      args.offeringRevision,
      args.offeringSourceHash,
      args.publicationRef,
      args.publicationRevision,
    )
    if (offering === undefined) return { step: 'readiness', state: 'refused', refusal: 'revision_changed' }
    const result = await ctx.runAction(internal.capabilitySupplyReadiness.probe, {
      publicationRef: args.publicationRef,
      expectedRevision: args.publicationRevision,
    })
    if (result.kind === 'refused') {
      return { step: 'readiness', state: 'refused', refusal: ownerSupplyRefusalFromProbe(result.reason) }
    }
    if (result.kind === 'unavailable') {
      return { step: 'readiness', state: 'refused', refusal: result.reason }
    }
    if (result.lifecycle.state !== 'active') {
      const reason = result.lifecycle.reasons[0] ?? 'health_unhealthy'
      return { step: 'readiness', state: 'refused', refusal: reason }
    }
    return {
      step: 'readiness',
      state: 'completed',
      offeringRef: args.offeringRef,
      revision: args.offeringRevision,
      publicationRef: args.publicationRef,
      ...(offering.operationRef === undefined ? {} : { operationRef: offering.operationRef }),
      message: 'The admitted public operation is ready.',
    }
  },
})
export const runOwnerSupplyTest = action({
  args: ownerSupplyInput,
  returns: ownerSupplyActionResultValue,
  handler: async (ctx, args): Promise<OwnerSupplyActionResult> => {
    if (!await isOwnerSupplyActionAuthorized(ctx, args.businessId)) {
      return { step: 'test', state: 'refused', refusal: 'authorization_denied' }
    }
    const offering = await ownerSupplyOffering(
      ctx,
      args.businessId,
      args.offeringRef,
      args.offeringRevision,
      args.offeringSourceHash,
      args.publicationRef,
      args.publicationRevision,
    )
    if (offering === undefined || offering.operationRef === undefined) {
      return { step: 'test', state: 'refused', refusal: 'revision_changed' }
    }
    // x402 Test is the already-projected exact no-payment challenge, never a paid call.
    if (offering.sourceKind === 'x402') {
      if (!offering.testCompleted) {
        return { step: 'test', state: 'refused', refusal: 'health_unhealthy' }
      }
      return {
        step: 'test',
        state: 'completed',
        offeringRef: args.offeringRef,
        revision: args.offeringRevision,
        publicationRef: args.publicationRef,
        operationRef: offering.operationRef,
        message: 'The exact admitted operation returned a fresh valid x402 payment challenge. No payment was sent.',
      }
    }
    const taskStartedAt = Date.now()
    const result = await ctx.runAction(internal.capabilitySupplyReadiness.probe, {
      publicationRef: args.publicationRef,
      expectedRevision: args.publicationRevision,
    })
    if (result.kind === 'refused') {
      return { step: 'test', state: 'refused', refusal: ownerSupplyRefusalFromProbe(result.reason) }
    }
    if (result.kind === 'unavailable') {
      return { step: 'test', state: 'refused', refusal: result.reason }
    }
    if (result.lifecycle.state !== 'active') {
      return {
        step: 'test',
        state: 'refused',
        refusal: result.lifecycle.reasons[0] ?? 'health_unhealthy',
      }
    }
    const observedAt = Date.now()
    const taskDigest = canonicalDigest({
      operationKey: args.operationKey,
      publicationRef: args.publicationRef,
      publicationRevision: args.publicationRevision,
      operationRef: offering.operationRef,
    })
    await ctx.runMutation(internal.capabilitySupply.recordCapabilityCallEvent, {
      eventRef: `owner-supply-test:${taskDigest}`,
      businessId: args.businessId,
      offeringRef: args.offeringRef,
      publicationRef: args.publicationRef,
      publicationRevision: args.publicationRevision,
      operationRef: offering.operationRef,
      taskDigest,
      eventKind: 'supply_owner_test_observed',
      outcome: 'filled',
      taskStartedAt,
      successfulAt: observedAt,
      durationMs: Math.max(0, observedAt - taskStartedAt),
      observedAt,
      evidenceRefs: [`owner-supply:test:${args.operationKey}`],
      environment: 'development',
    })
    return {
      step: 'test',
      state: 'completed',
      offeringRef: args.offeringRef,
      revision: args.offeringRevision,
      publicationRef: args.publicationRef,
      operationRef: offering.operationRef,
      message: 'A fresh operation probe returned a contract-valid response.',
    }
  },
})

