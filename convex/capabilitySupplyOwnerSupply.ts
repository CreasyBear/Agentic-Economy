"use node"

import { v, type Infer } from 'convex/values'
import { canonicalDigest } from '@/modules/common/canonical-digest'


import { api, internal } from './_generated/api'
import { action, type ActionCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { resolveBusinessActor } from './authz'
import { jsonObject } from '@/modules/capability-execution/convex'
import { sourceWriteArgs } from './sourceWriteAdmission'

const ownerSupplyCompletedValue = v.object({
  step: v.union(v.literal('readiness'), v.literal('test')),
  state: v.literal('completed'),
  offeringRef: v.string(),
  revision: v.number(),
  message: v.string(),
  publicationRef: v.optional(v.string()),
  toolRef: v.optional(v.string()),
  canaryRef: v.optional(v.string()),
  callRef: v.optional(v.string()),
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
      v.literal('revision_changed'), v.literal('tool_not_found'),
      v.literal('tool_not_keyless'), v.literal('tool_not_executable'),
      v.literal('input_invalid'),
      v.literal('admission_unproven'), v.literal('conformance_unproven'),
      v.literal('credential_readiness_unobserved'), v.literal('health_unobserved'),
      v.literal('health_unhealthy'), v.literal('health_stale'),
      v.literal('eligibility_integrity_failure'), v.literal('provider_authority_unverified'), v.literal('withdrawn'),
      v.literal('incompatible_revision'),
      v.literal('canary_admission_refused'),
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
  correlationId: v.optional(v.string()),
  input: v.optional(jsonObject),
  ...sourceWriteArgs,
}

type OwnerSupplyOffering = Readonly<{
  offeringRef: string
  revision: number
  sourceHash?: string
  publicationRef?: string
  publicationRevision?: number
  toolRef?: string
  publisher?: string
  sourceKind?: string
  readinessCompleted?: boolean
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
    ...(offering.toolRef === undefined ? {} : { toolRef: offering.toolRef }),
    readinessCompleted: offering.stepStates.readiness === 'completed',
    ...(offering.publication === undefined ? {} : {
      publisher: offering.publication.authorityMode,
      sourceKind: offering.publication.source.kind,
    }),
  }
}

type OwnerSupplyAuthority = Extract<Awaited<ReturnType<typeof resolveBusinessActor>>, { kind: 'authenticated_owner' }>

async function currentOwnerSupplyAuthority(ctx: ActionCtx, businessId: Id<'businesses'>): Promise<OwnerSupplyAuthority | null> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  return await ctx.runQuery(api.catalog.authorizeProviderBusiness, { businessId })
    ? actor
    : null
}

function sameOwnerSupplyAuthority(left: OwnerSupplyAuthority, right: OwnerSupplyAuthority | null): boolean {
  return right !== null &&
    ownerSupplyAuthorityFingerprint(left) === ownerSupplyAuthorityFingerprint(right)
}

function ownerSupplyAuthorityFingerprint(authority: OwnerSupplyAuthority): string {
  return canonicalDigest({
    principalRef: authority.canonicalPrincipalRef,
    accountRef: authority.canonicalAccountRef,
    revision: authority.authorityRevision,
    provenance: {
      providerNamespace: authority.authorityProvenance.providerNamespace,
      bindingRef: authority.authorityProvenance.bindingRef,
      credentialRef: authority.authorityProvenance.credentialRef,
      credentialGeneration: authority.authorityProvenance.credentialGeneration,
      accessKind: authority.authorityProvenance.accessKind,
      accessRef: authority.authorityProvenance.accessRef,
      currentOwnershipRef: authority.authorityProvenance.currentOwnershipRef,
    },
  })
}

function ownerSupplyRefusalFromProbe(reason: 'revision_changed' | 'target_changed'): Extract<OwnerSupplyActionResult, { state: 'refused' }>['refusal'] {
  return reason
}


export const runOwnerSupplyReadiness = action({
  args: ownerSupplyInput,
  returns: ownerSupplyActionResultValue,
  handler: async (ctx, args): Promise<OwnerSupplyActionResult> => {
    if (await currentOwnerSupplyAuthority(ctx, args.businessId) === null) {
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
    const probeAuthority = await currentOwnerSupplyAuthority(ctx, args.businessId)
    if (probeAuthority === null) {
      return { step: 'readiness', state: 'refused', refusal: 'authorization_denied' }
    }
    const result = offering.sourceKind === 'x402'
      ? await ctx.runAction(internal.capabilitySupplyReadiness.probeOwnerStaged, {
          publicationRef: args.publicationRef,
          expectedRevision: args.publicationRevision,
          businessId: args.businessId,
        })
      : await ctx.runAction(internal.capabilitySupplyReadiness.probe, {
          publicationRef: args.publicationRef,
          expectedRevision: args.publicationRevision,
        })
    if (!sameOwnerSupplyAuthority(
      probeAuthority,
      await currentOwnerSupplyAuthority(ctx, args.businessId),
    )) {
      return { step: 'readiness', state: 'refused', refusal: 'authorization_denied' }
    }
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
      ...(offering.toolRef === undefined ? {} : { toolRef: offering.toolRef }),
      message: offering.sourceKind === 'x402'
        ? 'The exact staged Tool is ready for the seller canary. It is not public yet.'
        : 'The admitted public Tool is ready.',
    }
  },
})
export const runOwnerSupplyTest = action({
  args: ownerSupplyInput,
  returns: ownerSupplyActionResultValue,
  handler: async (ctx, args): Promise<OwnerSupplyActionResult> => {
    if (await currentOwnerSupplyAuthority(ctx, args.businessId) === null) {
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
    if (offering === undefined || offering.toolRef === undefined) {
      return { step: 'test', state: 'refused', refusal: 'revision_changed' }
    }
    if (offering.sourceKind === 'x402') {
      if (!offering.readinessCompleted) {
        return { step: 'test', state: 'refused', refusal: 'health_unhealthy' }
      }
      if (args.correlationId === undefined) return { step: 'test', state: 'refused', refusal: 'authorization_denied' }
      const canary = await ctx.runMutation(internal.capabilitySupplyOwnerCanary.requestSellerOnboardingCanary, {
        businessId: args.businessId,
        offeringRef: args.offeringRef,
        offeringRevision: args.offeringRevision,
        offeringSourceHash: args.offeringSourceHash,
        publicationRef: args.publicationRef,
        publicationRevision: args.publicationRevision,
        input: args.input ?? {},
        operationKey: args.operationKey,
        correlationId: args.correlationId,
        ...(args.sourceWrite === undefined ? {} : { sourceWrite: args.sourceWrite }),
        ...(args.sourceWriteRequest === undefined ? {} : { sourceWriteRequest: args.sourceWriteRequest }),
      })
      if (canary.kind === 'refused') {
        return {
          step: 'test',
          state: 'refused',
          refusal: canary.code === 'input_invalid' ? 'input_invalid' : 'canary_admission_refused',
        }
      }
      return {
        step: 'test',
        state: 'completed',
        offeringRef: args.offeringRef,
        revision: args.offeringRevision,
        publicationRef: args.publicationRef,
        toolRef: canary.toolRef,
        canaryRef: canary.canaryRef,
        callRef: canary.callRef,
        message: 'The exact seller canary was admitted and queued on Base Sepolia. Publication remains blocked until settlement and output evidence pass.',
      }
    }
    const taskStartedAt = Date.now()
    const probeAuthority = await currentOwnerSupplyAuthority(ctx, args.businessId)
    if (probeAuthority === null) {
      return { step: 'test', state: 'refused', refusal: 'authorization_denied' }
    }
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
      toolRef: offering.toolRef,
    })
    if (!sameOwnerSupplyAuthority(
      probeAuthority,
      await currentOwnerSupplyAuthority(ctx, args.businessId),
    )) {
      return { step: 'test', state: 'refused', refusal: 'authorization_denied' }
    }
    await ctx.runMutation(internal.capabilitySupply.recordCapabilityCallEvent, {
      eventRef: `owner-supply-test:${taskDigest}`,
      businessId: args.businessId,
      offeringRef: args.offeringRef,
      publicationRef: args.publicationRef,
      publicationRevision: args.publicationRevision,
      toolRef: offering.toolRef,
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
      toolRef: offering.toolRef,
      message: 'A fresh operation probe returned a contract-valid response.',
    }
  },
})
