/**
 * Customer Request application composition interface.
 *
 * Convex actions remain the transport/auth adapter; domain orchestration and
 * pure projections live here. ADR-002: mandate, preparation, and route stay
 * separate — this module composes them, it does not merge authority helpers.
 */
export type {
  CustomerRequestActionResult,
  CustomerRequestConflictReason,
  CustomerRequestRefusedReason,
} from './action-result'

export {
  assembleRequestGraph,
  bindRequirementAnswer,
  compileCommit,
  compileProposal,
  createConfiguredRequestInterpreter,
  durableSubmissionShellView,
  exactRefKey,
  interpretCompileCommit,
  interpreterFailureCode,
  loadRequestGraph,
  proposeThenCompile,
  rebindStoredFacts,
  replayCommittedCommand,
  retryableCompileAdmissionFailure,
  type CommitResult,
  type CommandReplayResult,
  type CompileCommitInput,
  type CompileCommitPorts,
  type EligibleSupply,
  type EligibleSupplyResult,
  type ExactContractResult,
  type InterpretCompileCommitInput,
  type InterpretCompileCommitPorts,
  type InterpreterEnvironment,
  type LoadRequestGraphPorts,
  type ProposeThenCompileInterpreter,
  type ProposeThenCompileResult,
  type ReplayCommittedCommandPorts,
  type RequestGraph,
  type RequestGraphLimits,
} from './interpret-compile'

export {
  customerProgressState,
  isPartialRouteResult,
  isProviderReportedRouteFailure,
  parseCustomerRouteResult,
  projectConfirmedRoute,
  projectRoutePlansFromMaterial,
  projectStoredAggregate,
  projectStoredRouteRun,
  storedGenerationRepresentsAggregate,
  type ProjectableCustomerRequestAggregate,
  type RoutePlanProjectionMaterial,
  type StoredRouteRunProjection,
} from './route-plan-projection'

export {
  customerPurposeLabel,
  preparationResultView,
  preparedActionFailureSummary,
  projectEgressCustomerState,
  projectPreparedAction,
  projectStoredPreparation,
  recoverUnresolvedEgress,
  resolvePreparedAction,
  resumePreparationEgress,
  runPreparationEgress,
  type EgressReleaseState,
  type EgressResumeResult,
  type EgressRunResult,
  type PreparationEgressAggregate,
  type PreparationEgressCommand,
  type PreparationEgressPorts,
  type PreparationMutationResult,
  type PreparedActionMutationResult,
  type PreparedActionRecoveryReason,
  type ReadyForRoutingPreparation,
  type ResumeRequestEgressResult,
  type StoredPreparation,
} from './preparation-egress'
