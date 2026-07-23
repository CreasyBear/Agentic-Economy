import {
  validateReconciliationEvidence,
  type ReconciliationEvidence,
  type ReconciliationEvidenceVerifier,
} from './reconciliation-evidence'
import type { X402PaymentAttempt } from './x402-payment-attempt'
import {
  validateX402PaymentReconciliationEvidence,
  type X402PaymentReconciliationEvidence,
  type X402PaymentReconciliationEvidenceVerifier,
} from './x402-payment-reconciliation-evidence'

type PublicReconcileIntent = Readonly<{
  command: 'reconcile'
  commandId: string
  expectedInvocationVersion: number
}>

type BoundAttempt = Readonly<{
  source: string
  invocationRef: string
  invocationVersion: number
  attemptRef: string
  effectGeneration: number
  paymentAttempt: X402PaymentAttempt
}>

type ReconciliationResult =
  | Readonly<{
      kind: 'accepted'
      schema: 'agentic-paid-operation:v1'
      currentVersion: number
      relations: Readonly<{
        invocationRef: string
        attemptRef: string
        effectGeneration: number
        paymentIdentifier: string
      }>
    }>
  | Readonly<{
      kind: 'refused'
      code:
        | 'reconcile_intent_invalid'
        | 'invocation_not_found'
        | 'stale_invocation_version'
        | 'trusted_observation_invalid'
        | 'reconciliation_not_applied'
    }>

type HostedSandboxReconciliation = Readonly<{
  reconcile(body: unknown): Promise<ReconciliationResult>
  counters(): Readonly<{
    observations: number
    mutations: number
    effects: 0
    retries: 0
    fallbacks: 0
    switches: 0
  }>
}>

/**
 * Public input carries intent and concurrency identity only. Trusted evidence
 * stays inside this server/operator boundary; persistence receives digests and
 * opaque references, never the evidence material itself.
 */
export function createHostedSandboxReconciliation(input: Readonly<{
  loadBoundAttempt(intent: PublicReconcileIntent): Promise<BoundAttempt | undefined>
  observeTrustedFixture(bound: BoundAttempt): Promise<Readonly<{
    actionEvidence: ReconciliationEvidence
    paymentEvidence: X402PaymentReconciliationEvidence
  }>>
  verifyActionEvidence: ReconciliationEvidenceVerifier
  verifyPaymentEvidence: X402PaymentReconciliationEvidenceVerifier
  applyValidated(args: Readonly<{
    commandId: string
    expectedInvocationVersion: number
    invocationRef: string
    attemptRef: string
    effectGeneration: number
    paymentIdentifier: string
    actionResolution: ReconciliationEvidence['resolution']
    paymentResolution: X402PaymentReconciliationEvidence['resolution']
    actionEvidenceRef: string
    actionEvidenceDigest: string
    paymentEvidenceRef: string
    paymentEvidenceDigest: string
  }>): Promise<Readonly<{ currentVersion: number }> | undefined>
  now(): number
}>): HostedSandboxReconciliation {
  let observations = 0
  let mutations = 0
  const reconciliation: HostedSandboxReconciliation = {
    reconcile: async (body: unknown): Promise<ReconciliationResult> => {
      if (!isPublicReconcileIntent(body)) {
        return { kind: 'refused', code: 'reconcile_intent_invalid' }
      }
      const bound = await input.loadBoundAttempt(body)
      if (bound === undefined) return { kind: 'refused', code: 'invocation_not_found' }
      if (bound.invocationVersion !== body.expectedInvocationVersion) {
        return { kind: 'refused', code: 'stale_invocation_version' }
      }
      observations += 1
      const observed = await input.observeTrustedFixture(bound)
      const actionError = validateReconciliationEvidence({
        evidence: observed.actionEvidence,
        source: bound.source,
        invocationRef: bound.invocationRef,
        attemptRef: bound.attemptRef,
        effectGeneration: bound.effectGeneration,
        now: new Date(input.now()).toISOString(),
        notBefore: new Date(
          bound.paymentAttempt.submissionStartedAt ?? bound.paymentAttempt.preparedAt,
        ).toISOString(),
        verifySourceEvidence: input.verifyActionEvidence,
      })
      const paymentError = validateX402PaymentReconciliationEvidence({
        evidence: observed.paymentEvidence,
        attempt: bound.paymentAttempt,
        source: bound.source,
        now: input.now(),
        verifySourceEvidence: input.verifyPaymentEvidence,
      })
      if (actionError !== undefined || paymentError !== undefined) {
        return { kind: 'refused', code: 'trusted_observation_invalid' }
      }
      const applied = await input.applyValidated({
        commandId: body.commandId,
        expectedInvocationVersion: body.expectedInvocationVersion,
        invocationRef: bound.invocationRef,
        attemptRef: bound.attemptRef,
        effectGeneration: bound.effectGeneration,
        paymentIdentifier: bound.paymentAttempt.paymentIdentifier,
        actionResolution: observed.actionEvidence.resolution,
        paymentResolution: observed.paymentEvidence.resolution,
        actionEvidenceRef: observed.actionEvidence.evidenceRef,
        actionEvidenceDigest: observed.actionEvidence.digest,
        paymentEvidenceRef: observed.paymentEvidence.evidenceRef,
        paymentEvidenceDigest: observed.paymentEvidence.digest,
      })
      if (applied === undefined) {
        return { kind: 'refused', code: 'reconciliation_not_applied' }
      }
      mutations += 1
      return {
        kind: 'accepted',
        schema: 'agentic-paid-operation:v1',
        currentVersion: applied.currentVersion,
        relations: {
          invocationRef: bound.invocationRef,
          attemptRef: bound.attemptRef,
          effectGeneration: bound.effectGeneration,
          paymentIdentifier: bound.paymentAttempt.paymentIdentifier,
        },
      }
    },
    counters: () => ({
      observations,
      mutations,
      effects: 0,
      retries: 0,
      fallbacks: 0,
      switches: 0,
    }),
  }
  return Object.freeze(reconciliation)
}

function isPublicReconcileIntent(value: unknown): value is PublicReconcileIntent {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Partial<PublicReconcileIntent>
  const keys = Object.keys(value).sort()
  return keys.length === 3
    && keys[0] === 'command'
    && keys[1] === 'commandId'
    && keys[2] === 'expectedInvocationVersion'
    && candidate.command === 'reconcile'
    && typeof candidate.commandId === 'string'
    && candidate.commandId.trim().length > 0
    && Number.isSafeInteger(candidate.expectedInvocationVersion)
    && (candidate.expectedInvocationVersion ?? -1) >= 0
}
