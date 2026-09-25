import { canonicalDigest } from '@/modules/common/canonical-digest'

import { internal } from '../../../_generated/api'
import type { Id } from '../../../_generated/dataModel'
import type { ActionCtx } from '../../../_generated/server'
import {
  currentOwnerSupplyAuthority,
  ownerSupplyOffering,
  sameOwnerSupplyAuthority,
} from './context'
import {
  ownerSupplyRefusalFromProbe,
  type OwnerSupplyActionResult,
  type OwnerSupplyArgs,
} from './contracts'

type OwnerSupplyProbeLifecycle = Readonly<{
  state: 'inactive' | 'active' | 'withdrawn' | 'incompatible'
  reasons: Array<Extract<OwnerSupplyActionResult, { state: 'refused' }>['refusal']>
}>

export type OwnerSupplyProbeResult = Readonly<
  | { kind: 'observed'; publicationRef: string; revision: number; lifecycle: OwnerSupplyProbeLifecycle }
  | { kind: 'refused'; reason: 'revision_changed' | 'target_changed' }
  | { kind: 'unavailable'; reason: Extract<OwnerSupplyActionResult, { state: 'refused' }>['refusal'] }
>

export type OwnerSupplyProbePorts = Readonly<{
  probe: (args: { publicationRef: string; expectedRevision: number }) => Promise<OwnerSupplyProbeResult>
  probeOwnerStaged: (args: {
    publicationRef: string
    expectedRevision: number
    businessId: Id<'businesses'>
  }) => Promise<OwnerSupplyProbeResult>
}>

export async function runOwnerSupplyReadinessHandler(
  ctx: ActionCtx,
  args: OwnerSupplyArgs,
  ports: OwnerSupplyProbePorts,
): Promise<OwnerSupplyActionResult> {
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
    ? await ports.probeOwnerStaged({
        publicationRef: args.publicationRef,
        expectedRevision: args.publicationRevision,
        businessId: args.businessId,
      })
    : await ports.probe({
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
}

export async function runOwnerSupplyTestHandler(
  ctx: ActionCtx,
  args: OwnerSupplyArgs,
  ports: OwnerSupplyProbePorts,
): Promise<OwnerSupplyActionResult> {
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
      ...(args.input === undefined ? {} : { input: args.input }),
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
      message: 'The exact seller canary was admitted and queued on its selected x402 network. Publication remains blocked until settlement and output evidence pass.',
    }
  }
  const taskStartedAt = Date.now()
  const probeAuthority = await currentOwnerSupplyAuthority(ctx, args.businessId)
  if (probeAuthority === null) {
    return { step: 'test', state: 'refused', refusal: 'authorization_denied' }
  }
  const result = await ports.probe({
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
}
