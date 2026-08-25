export type TransferArm = 'direct_read' | 'direct_consequential' | 'controlled'
export type TransferBoundaryEvent =
  | Readonly<{ kind: 'approval_policy'; policy: 'allow' | 'deny' | 'prompt'; reason: string }>
  | Readonly<{ kind: 'direct_runner_started'; actionId: string }>
  | Readonly<{ kind: 'direct_runner_returned'; actionId: string; outcome: string }>
  | Readonly<{ kind: 'action_invocation'; invocationRef: string }>
  | Readonly<{ kind: 'control'; invocationRef: string }>
  | Readonly<{ kind: 'attempt'; invocationRef: string; attemptRef: string }>
  | Readonly<{ kind: 'history'; invocationRef: string; commandId: string }>
  | Readonly<{
      kind: 'direct_control_snapshot'
      actionInvocationEmissions: number
      controlEmissions: number
      attemptEmissions: number
      historyEmissions: number
      approvalPolicyEmissions: number
    }>
  | Readonly<{ kind: 'effect_call'; actionId: string }>
  | Readonly<{ kind: 'provider_release'; actionId: string }>
  | Readonly<{ kind: 'authority_decision'; invocationRef: string }>
  | Readonly<{ kind: 'user_or_supervisor_decision'; invocationRef: string }>

export type TransferMeasurement = Readonly<{
  arm: TransferArm
  controlRecords: number
  attributableAttempts: number
  runnerCalls: number
  effectCalls: number
  authorityDecisions: number
  userOrSupervisorDecisions: number
  requiredContinuations: number
  logicalTransitions: number
  durableHistoryRecords: number
}>

export type ReferenceReuseMeasurement = Readonly<{
  completedReferences: number
  completedNodes: number
  currentNodes: number
  effectsBeforeReuse: number
  effectsAfterReuse: number
  copiedLifecycleOrResultFields: number
  persistedRoutePlansOrBundles: number
}>

export type TransferEvidence = Readonly<{
  events: Readonly<Record<TransferArm, readonly TransferBoundaryEvent[]>>
  requiredContinuations: Readonly<Record<TransferArm, number>>
  controlledReadback: Readonly<{
    invocationVersion: number
    controlRecords: number
    attributableAttempts: number
    durableHistoryRecords: number
    terminalResultReconstructed: boolean
    exactAuthorityBeforeRelease: boolean
    retryClass: string
  }>
  referenceReuse: ReferenceReuseMeasurement
}>

export const transferFalsifiers = Object.freeze({
  F1: 'controlled burden requires exact authority and an attributable released attempt',
  F2: 'a possibly released effect requires reconcile-before-retry',
  F3: 'a fresh reader must reconstruct the terminal result',
  F4: 'the read-only arm must create no invocation lifecycle or supervisor decision',
  F5: 'reference reuse must preserve one effect and copy no lifecycle or result fields',
})

function count(events: readonly TransferBoundaryEvent[], kind: TransferBoundaryEvent['kind']) {
  return events.filter((event) => event.kind === kind).length
}

function measure(
  arm: TransferArm,
  evidence: TransferEvidence,
): TransferMeasurement {
  const events = evidence.events[arm]
  const controlled = arm === 'controlled' ? evidence.controlledReadback : undefined
  return {
    arm,
    controlRecords: controlled?.controlRecords ?? count(events, 'control'),
    attributableAttempts: controlled?.attributableAttempts ?? count(events, 'attempt'),
    runnerCalls: count(events, 'direct_runner_started'),
    effectCalls: count(events, 'effect_call') + count(events, 'provider_release'),
    authorityDecisions: count(events, 'authority_decision'),
    userOrSupervisorDecisions: count(events, 'user_or_supervisor_decision'),
    requiredContinuations: evidence.requiredContinuations[arm],
    logicalTransitions: controlled?.invocationVersion
      ?? count(events, 'direct_runner_started') + count(events, 'direct_runner_returned'),
    durableHistoryRecords: controlled?.durableHistoryRecords ?? count(events, 'history'),
  }
}

export function evaluateAdr009Transfer(evidence: TransferEvidence) {
  const measurements = {
    directRead: measure('direct_read', evidence),
    directConsequential: measure('direct_consequential', evidence),
    controlled: measure('controlled', evidence),
    referenceReuse: evidence.referenceReuse,
  }
  const controlledEvents = evidence.events.controlled
  const hasReleasedAttempt = controlledEvents.some((event) => event.kind === 'attempt')
    && evidence.controlledReadback.attributableAttempts > 0
  const dispositions = {
    F1: evidence.controlledReadback.controlRecords > 0
      && evidence.controlledReadback.exactAuthorityBeforeRelease
      && hasReleasedAttempt,
    F2: evidence.controlledReadback.retryClass === 'reconcile_before_retry',
    F3: evidence.controlledReadback.terminalResultReconstructed,
    F4: measurements.directRead.controlRecords === 0
      && measurements.directRead.attributableAttempts === 0
      && measurements.directRead.durableHistoryRecords === 0
      && measurements.directRead.userOrSupervisorDecisions === 0,
    F5: evidence.referenceReuse.effectsBeforeReuse === 1
      && evidence.referenceReuse.effectsAfterReuse === evidence.referenceReuse.effectsBeforeReuse
      && evidence.referenceReuse.completedReferences > 0
      && evidence.referenceReuse.completedNodes > 0
      && evidence.referenceReuse.copiedLifecycleOrResultFields === 0
      && evidence.referenceReuse.persistedRoutePlansOrBundles === 0,
  }
  const failed = Object.entries(dispositions)
    .filter(([, passed]) => !passed)
    .map(([id]) => id)

  return {
    environment: 'MOCK/DEVELOPMENT ONLY' as const,
    latencyMeasure: 'deterministic logical transitions; wall-clock/provider latency unproven',
    measurements,
    falsifiers: Object.fromEntries(
      Object.entries(dispositions).map(([id, passed]) => [
        id,
        { definition: transferFalsifiers[id as keyof typeof transferFalsifiers], disposition: passed ? 'does_not_hold' : 'holds' },
      ]),
    ),
    recommendation: failed.length === 0
      ? 'retain_control_for_consequential_and_bypass_read_only'
      : 'narrow_action_invocation_seam',
    failedFalsifiers: failed,
  }
}
