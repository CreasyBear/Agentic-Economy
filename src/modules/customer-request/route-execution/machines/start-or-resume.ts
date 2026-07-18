import { canonicalDigest } from '@/modules/common/canonical-digest'

import { routeRunIdentityDigest } from '../journal'

import type { JournalMutationPorts } from './ports'
import type { StartCommand, StartResult } from './types'

export async function startOrResume(
  args: StartCommand,
  ports: JournalMutationPorts,
): Promise<StartResult> {
  if (args.principalId.trim().length === 0 || args.idempotencyKey.trim().length === 0) {
    return { kind: 'conflict', reason: 'command_changed' }
  }
  const now = ports.now()
  const current = await ports.loadActiveMandateForPrincipal(
    args.requestId, args.principalId, now,
  )
  if (current.kind !== 'active') {
    return {
      kind: 'refused',
      reason: current.kind === 'expired' ? 'confirmation_expired' : 'confirmation_required',
    }
  }
  const mandate = current.mandate
  const commandKey = `route-run-command:v1:${canonicalDigest({
    principalId: mandate.principal.principalId,
    requestId: args.requestId,
    idempotencyKey: args.idempotencyKey,
  })}`
  const commandDigest = canonicalDigest(args)
  const priorCommand = await ports.loadPriorRunCommand(commandKey)
  if (priorCommand !== null) {
    if (priorCommand.commandDigest !== commandDigest
      || priorCommand.principalId !== mandate.principal.principalId
      || priorCommand.requestId !== args.requestId) {
      return { kind: 'conflict', reason: 'command_changed' }
    }
    return await ports.commitCommandReplay(priorCommand.runRef)
  }

  const head = await ports.loadRunHead(args.requestId)
  if (head !== null && head.principalId !== mandate.principal.principalId) {
    throw new Error('customer_request_route_run_head_integrity_failure')
  }
  const existing = await ports.loadRunByMandateRef(mandate.mandateRef)
  if (existing !== null) {
    if (head !== null && (head.currentRunRef !== existing.runRef
      || head.currentMandateRef !== mandate.mandateRef)) {
      throw new Error('customer_request_route_run_head_integrity_failure')
    }
    return await ports.commitResumedRun({
      requestId: args.requestId,
      principalId: mandate.principal.principalId,
      mandateRef: mandate.mandateRef,
      runRef: existing.runRef,
      runCreatedAt: existing.createdAt,
      commandKey,
      commandDigest,
      now,
      headMissing: head === null,
    })
  }

  if (head !== null) {
    const priorRun = await ports.loadRunByRunRef(head.currentRunRef)
    if (priorRun === null || priorRun.mandateRef !== head.currentMandateRef) {
      throw new Error('customer_request_route_run_head_integrity_failure')
    }
    const priorAttempt = await ports.loadAttemptAtPosition(
      priorRun.runRef, priorRun.currentPosition,
    )
    if (priorAttempt === null) throw new Error('customer_request_route_run_attempt_integrity_failure')
    if (priorAttempt.state === 'dispatched' || priorAttempt.state === 'accepted'
      || priorAttempt.state === 'outcome_unknown') {
      return { kind: 'refused', reason: 'route_unavailable' }
    }
    if (priorAttempt.state === 'queued' || priorAttempt.state === 'leased') {
      const priorOutbox = await ports.loadDispatchByAttemptRef(priorAttempt.attemptRef)
      if (priorOutbox === null || (priorOutbox.state !== 'pending' && priorOutbox.state !== 'leased')) {
        throw new Error('customer_request_route_dispatch_integrity_failure')
      }
      await ports.cancelPriorUnreleasedRun({
        runRef: priorRun.runRef,
        attemptRef: priorAttempt.attemptRef,
        now,
      })
    }
  }

  const orderedSteps = [...mandate.route.steps].sort((left, right) => left.position - right.position)
  const firstStep = orderedSteps[0]
  if (firstStep === undefined) return { kind: 'refused', reason: 'route_unavailable' }
  const businesses = await ports.snapshotRouteBusinesses(orderedSteps)
  if (businesses === undefined) return { kind: 'refused', reason: 'route_unavailable' }
  const firstInput = await ports.materializeStepInput({
    requestId: args.requestId,
    generationRef: mandate.route.generationRef,
    routePlanId: mandate.route.routePlanId,
    routeDigest: mandate.route.routeDigest,
    position: firstStep.position,
    actionId: firstStep.actionId,
    contractRef: firstStep.contractRef,
    upstreamOutputs: new Map(),
  })
  if (firstInput === null) return { kind: 'refused', reason: 'route_unavailable' }
  const runRef = `route-run:v1:${canonicalDigest({
    principalId: mandate.principal.principalId,
    requestId: args.requestId,
    mandateRef: mandate.mandateRef,
    mandateDigest: mandate.mandateDigest,
  })}`
  const admission = await ports.admitRouteStep({
    requestId: args.requestId,
    mandateRef: mandate.mandateRef,
    expectedMandateDigest: mandate.mandateDigest,
    expectedGenerationRef: mandate.route.generationRef,
    expectedRoutePlanId: mandate.route.routePlanId,
    expectedRouteDigest: mandate.route.routeDigest,
    stepPosition: firstStep.position,
    expectedActionId: firstStep.actionId,
    expectedCapabilityId: firstStep.contractRef.capabilityId,
    expectedCapabilityVersion: firstStep.contractRef.version,
    expectedCapabilityContractDigest: firstStep.contractRef.contractDigest,
    idempotencyKey: `run-step:${runRef}:${firstStep.actionId}`,
    principalId: args.principalId,
  })
  if (admission.kind !== 'admitted' && admission.kind !== 'replayed') {
    return {
      kind: 'refused',
      reason: admission.kind === 'refused' && admission.reason === 'mandate_not_current'
        ? 'confirmation_changed'
        : 'route_unavailable',
    }
  }

  const runMaterial = {
    principalId: mandate.principal.principalId,
    requestId: args.requestId,
    requestRevision: mandate.request.requestRevision,
    mandateRef: mandate.mandateRef,
    mandateDigest: mandate.mandateDigest,
    generationRef: mandate.route.generationRef,
    routePlanId: mandate.route.routePlanId,
    routeDigest: mandate.route.routeDigest,
    businesses,
    state: 'queued' as const,
    totalSteps: orderedSteps.length,
    completedSteps: 0,
    currentPosition: firstStep.position,
    createdAt: now,
    updatedAt: now,
  }
  const runDigest = routeRunIdentityDigest({ runRef, ...runMaterial })
  const inputDigest = canonicalDigest(firstInput)
  const attemptMaterial = {
    runRef,
    requestId: args.requestId,
    mandateRef: mandate.mandateRef,
    actionId: firstStep.actionId,
    position: firstStep.position,
    operationKeyDigest: admission.grant.operationKeyDigest,
    grantDigest: admission.grant.grantDigest,
    inputDigest,
    createdAt: now,
  }
  const attemptDigest = canonicalDigest(attemptMaterial)
  const attemptRef = `route-step-attempt:v1:${attemptDigest}`
  const dispatchMaterial = {
    runRef,
    attemptRef,
    operationKeyDigest: admission.grant.operationKeyDigest,
    availableAt: now,
    createdAt: now,
  }
  const dispatchDigest = canonicalDigest(dispatchMaterial)
  const dispatchRef = `route-dispatch:v1:${dispatchDigest}`

  return await ports.commitStartedRun({
    requestId: args.requestId,
    principalId: mandate.principal.principalId,
    mandate,
    runRef,
    runDigest,
    runMaterial,
    attemptRef,
    attemptDigest,
    actionId: firstStep.actionId,
    position: firstStep.position,
    grant: admission.grant,
    input: firstInput,
    inputDigest,
    dispatchRef,
    dispatchDigest,
    commandKey,
    commandDigest,
    now,
    head,
  })
}
