import type { WorkflowCtx } from '@convex-dev/workflow'

import { internal } from '../../_generated/api'

const offboardingInternal = internal.capabilityProviderOffboarding

export async function runProviderOffboardingWorkflow(step: WorkflowCtx, args: { caseRef: string }): Promise<string> {
  const frozen = await step.runMutation(offboardingInternal.freezeRouteability, args, { name: 'freeze-routeability' })
  if (frozen.cancelled) return args.caseRef
  if (!frozen.ready) throw new Error('provider_offboarding_freeze_blocked')
  for (let page = 0; ; page += 1) {
    const withdrawn = await step.runMutation(
      offboardingInternal.withdrawCatalogDocumentsPage,
      args,
      { name: `withdraw-catalog-documents-${page}` },
    )
    if (withdrawn.done) break
  }
  for (let page = 0; ; page += 1) {
    const withdrawn = await step.runMutation(
      offboardingInternal.withdrawToolTargetsPage,
      args,
      { name: `withdraw-tools-${page}` },
    )
    if (!withdrawn.ready) throw new Error('provider_offboarding_freeze_blocked')
    if (withdrawn.done) break
  }
  let offeringCursor: string | undefined
  for (let page = 0; ; page += 1) {
    const snapshotted = await step.runMutation(
      offboardingInternal.snapshotOfferingTargetsPage,
      { ...args, ...(offeringCursor === undefined ? {} : { afterOfferingRef: offeringCursor }) },
      { name: `snapshot-offerings-${page}` },
    )
    offeringCursor = snapshotted.nextOfferingRef
    if (snapshotted.done) break
  }
  let connectionCursor: string | undefined
  for (let page = 0; ; page += 1) {
    const snapshotted = await step.runMutation(
      offboardingInternal.snapshotConnectionTargetsPage,
      { ...args, ...(connectionCursor === undefined ? {} : { afterConnectionRef: connectionCursor }) },
      { name: `snapshot-connections-${page}` },
    )
    connectionCursor = snapshotted.nextConnectionRef
    if (snapshotted.done) break
  }
  await step.runMutation(offboardingInternal.completeFreeze, args, { name: 'complete-freeze' })
  let toolCursor: string | undefined
  for (let page = 0; ; page += 1) {
    const drained = await step.runMutation(
      offboardingInternal.drainCallsPage,
      { ...args, ...(toolCursor === undefined ? {} : { afterToolRef: toolCursor }) },
      { name: page === 0 ? 'drain-calls' : `drain-calls-${page}` },
    )
    if (!drained.ready) throw new Error('provider_offboarding_calls_blocked')
    toolCursor = drained.nextToolRef
    if (drained.done) break
  }
  await step.runMutation(offboardingInternal.completeCallDrain, args, { name: 'complete-call-drain' })
  const settled = await step.runMutation(offboardingInternal.settleObligations, args, { name: 'settle-obligations' })
  if (!settled.ready) throw new Error('provider_offboarding_obligations_blocked')
  let revokeCursor: string | undefined
  for (let page = 0; ; page += 1) {
    const revoked = await step.runMutation(
      offboardingInternal.revokeConnectionsPage,
      { ...args, ...(revokeCursor === undefined ? {} : { afterConnectionRef: revokeCursor }) },
      { name: page === 0 ? 'revoke-connections' : `revoke-connections-${page}` },
    )
    if (!revoked.ready) throw new Error('provider_offboarding_connections_blocked')
    revokeCursor = revoked.nextConnectionRef
    if (revoked.done) break
  }
  const connectionRevocation = await step.runMutation(
    offboardingInternal.completeConnectionRevocation,
    args,
    { name: 'complete-connection-revocation' },
  )
  if (!connectionRevocation.ready) throw new Error('provider_offboarding_connections_blocked')
  let verificationCursor: string | undefined
  for (let page = 0; ; page += 1) {
    const verified = await step.runMutation(
      offboardingInternal.verifyCallsPage,
      { ...args, ...(verificationCursor === undefined ? {} : { afterToolRef: verificationCursor }) },
      { name: `verify-calls-${page}` },
    )
    if (!verified.ready) throw new Error('provider_offboarding_calls_blocked')
    verificationCursor = verified.nextToolRef
    if (verified.done) break
  }
  let retirementCursor: string | undefined
  for (let page = 0; ; page += 1) {
    const retired = await step.runMutation(
      offboardingInternal.retireOfferingTargetsPage,
      { ...args, ...(retirementCursor === undefined ? {} : { afterOfferingRef: retirementCursor }) },
      { name: `retire-offerings-${page}` },
    )
    if (!retired.ready) throw new Error('provider_offboarding_retirement_blocked')
    retirementCursor = retired.nextOfferingRef
    if (retired.done) break
  }
  const completed = await step.runMutation(offboardingInternal.verifyCompletion, args, { name: 'verify-completion' })
  if (!completed.ready) throw new Error('provider_offboarding_completion_blocked')
  return args.caseRef
}
