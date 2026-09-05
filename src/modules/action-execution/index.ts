import type { ActionResult } from '@/modules/common/action'
import type { InMemoryControlSnapshot } from './contracts'

export {
  createInMemoryActionExecutionTracer,
} from './in-memory'
export {
  createDevelopmentReleaseSignal,
  createDevelopmentTimeoutSignal,
} from './attempts'
export {
  type ReconciliationEvidence,
  type ReconciliationEvidenceMaterial,
  type ReconciliationEvidenceVerifier,
} from './reconciliation-evidence'
export {
  validateX402PaymentReconciliationEvidence,
} from './x402-payment-reconciliation-evidence'
export type {
  X402PaymentReconciliationEvidence,
  X402PaymentReconciliationEvidenceError,
  X402PaymentReconciliationEvidenceMaterial,
  X402PaymentReconciliationEvidenceVerifier,
} from './x402-payment-reconciliation-evidence'
export function roundTripControlSnapshot<Result extends ActionResult>(
  snapshot: InMemoryControlSnapshot<Result>,
): InMemoryControlSnapshot<Result> {
  return structuredClone(snapshot)
}
export {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDurableActionExecutionTracer,
  readCompletedResultIdentity,
} from './durable'
export {
  buildCanonicalClaimCommand,
  buildCanonicalReleaseFenceCommand,
  buildCanonicalTerminalOutcomeCommand,
  claimCanonicalExecution,
  persistCanonicalReleaseFence,
  persistCanonicalTerminalOutcome,
} from './canonical-claim'
export type {
  CanonicalClaimAcceptedAuthority,
  CanonicalClaimAuthority,
  CanonicalClaimCommand,
  CanonicalClaimDecision,
  CanonicalClaimInput,
  CanonicalClaimRefusalCode,
  CanonicalClaimSnapshot,
  CanonicalReleaseFenceInput,
  CanonicalTerminalOutcome,
  CanonicalTerminalOutcomeInput,
} from './canonical-claim'
export {
  authorityUseIntegrityValid,
  issueStandingMandate,
  mandateIntegrityValid,
  restoreStandingMandateStore,
  StandingMandateStore,
  STANDING_MANDATE_FORMAT,
} from './standing-mandate'
export {
  createDevelopmentStandingMandateGrantVerifier,
  verifiedGrantMatchesMandate,
} from './standing-mandate-grant'
export { evaluateStandingMandatePolicy } from './standing-mandate-policy'
export { materialDigest } from './preparation'
export {
  cancelPublicExecution,
  inspectPublicExecution,
  readAgentUsage,
  readPublicExecutionStatus,
  reconcilePublicExecution,
} from './execution-public'
export type {
  PublicExecutionAttempt,
  PublicExecutionCommandResult,
  PublicExecutionHistory,
  PublicExecutionReadResult,
  PublicExecutionRefusal,
  PublicExecutionStatus,
} from './execution-public'

export type {
  ActionExecutionOrigin,
  ActionAttemptView,
  ActionExecutionTracer,
  ActionExecutionView,
  DecisionRefusalCode,
  ExecutionActor,
  ExecutionDecision,
  InMemoryControlSnapshot,
  InvokeActionInput,
  PrepareActionInput,
  PreparedExecution,
  StandingMandateAuthorityBasis,
} from './contracts'
export type {
  AuthorityUse,
  AuthorityUseMaterial,
  AuthorityExposureOffset,
  MandateDecision,
  MandateRefusalCode,
  StandingMandate,
  StandingMandateScope,
  StandingMandateSnapshot,
} from './standing-mandate'
export type {
  StandingMandateGrantVerifier,
  VerifiedStandingMandateGrant,
} from './standing-mandate-grant'
export type {
  StandingMandatePolicyDecision,
  StandingMandatePolicyProposal,
} from './standing-mandate-policy'
export type {
  ExposureOffsetRuleIdentity,
  ExposureReleaseAttestation,
  ExposureReleaseAttestationMaterial,
} from './exposure-offset-rules'
export type {
  DurableActionExecutionPort,
  DurableActionExecutionTracer,
  DurableTracerOptions,
  CompletedResultIdentity,
} from './durable'
