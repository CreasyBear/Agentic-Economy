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
  attachImportedCommitmentReference,
  type AttachImportedCommitmentReferenceInput,
  type AttachImportedCommitmentReferencePorts,
  type AttachImportedCommitmentReferenceResult,
} from './imported-commitment-reference'

export {
  attachCompletedTaskReference,
  type AttachCompletedTaskReferenceInput,
  type AttachCompletedTaskReferencePorts,
  type AttachCompletedTaskReferenceResult,
} from './completed-task-reference'

export {
  persistCompletedTaskReference,
  type PersistCompletedTaskReferenceInput,
  type PersistCompletedTaskReferencePorts,
  type PersistCompletedTaskReferenceResult,
} from './persist-completed-task-reference'

export {
  projectReferenceComposition,
  type ReferenceCompositionNode,
  type ReferenceCompositionProjection,
  type ReferenceCompositionPorts,
  type ReferenceCompositionResult,
  type ReferenceCompositionState,
  type RegisteredActionDescriptor,
  type ResolvedInvocationReference,
} from './reference-composition'

export {
  compileCommit,
  createConfiguredRequestInterpreter,
  durableSubmissionShellView,
  interpretCompileCommit,
  loadRequestGraph,
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
  type RequestGraphUnavailable,
} from './interpret-compile'
export {
  previewCustomerRequest,
  type PreviewCustomerRequest,
  type PreviewCustomerRequestInput,
  type PreviewCustomerRequestPorts,
  type PreviewCustomerRequestResult,
  type PreviewCustomerRequestStep,
} from './interpret-compile'
export {
  discoverAndFilterDescriptors,
  type DiscoverCapabilities,
} from './interpret-compile'

export {
  projectConsumerPlan,
  projectCustomerRequestDecisionRecords,
  type ConsumerDecisionRecord,
  type ConsumerDestination,
  type ConsumerNextAction,
  type ConsumerPlan,
  type ConsumerPlanFrontier,
  type ConsumerPlanOption,
  type ConsumerPlanResult,
  type ConsumerPlanStep,
  type ConsumerSupplyOption,
} from './consumer-plan-projection'
export {
  customerProgressState,
  isPartialRouteResult,
  isProviderReportedRouteFailure,
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

export {
  hasTransientBindingUnavailable,
  persistRetryableRouteRefresh,
  prepareCompare,
  projectGenerationRefreshResult,
  refreshCurrentRouteGeneration,
  resumeCustomerRequest,
  routeRefreshCommand,
  routesAreCurrent,
  type CompareResumeAggregate,
  type CompareResumeMandate,
  type CompareResumePorts,
  type CompareResumeRouteGeneration,
  type GenerationRefreshReplayResult,
  type GenerationRefreshResult,
  type PrepareCompareInput,
  type PreparationResumeResult,
  type ResumeCustomerRequestInput,
  type RouteRefreshRetryReason,
  type StoredAggregateResult,
} from './compare-resume'

export {
  allowStandingRoute,
  inspectStandingRoute,
  listStandingRouteAssistants,
  projectRepeatPermission,
  repeatPermissionRef,
  resolveSelectableCurrentRoute,
  revokeStandingRoute,
  applyStandingRoute,
  type AllowStandingRouteInput,
  type InspectStandingRouteInput,
  type ListStandingRouteAssistantsInput,
  type ProjectableStandingPolicy,
  type RepeatPermissionAssistantsResult,
  type RepeatPermissionReceipt,
  type RepeatPermissionResult,
  type RevokeStandingRouteInput,
  type StandingRoutePorts,
  type UseStandingRouteInput,
} from './standing-route'

export {
  confirmCustomerRoute,
  type ConfirmRouteInput,
  type ConfirmRoutePorts,
  type ConfirmRouteResult,
  type ConfirmServiceAuthorization,
  type IssueConfirmMandateResult,
} from './confirm-route'

export {
  refineCustomerRequest,
  type RecordNoopCommandResult,
  type RefineAggregate,
  type RefineCustomerRequestInput,
  type RefineCustomerRequestPorts,
  type RefineCustomerRequestResult,
  type RefineRouteGeneration,
  type RefineStoredResult,
} from './refine'

export {
  provideCustomerRequestFacts,
  type ProvideFactsAggregate,
  type ProvideFactsInput,
  type ProvideFactsPorts,
  type ProvideFactsResult,
  type ProvideFactsStoredResult,
} from './provide-facts'

export {
  toActionResult,
  withRestoredRequest,
  writableView,
} from './action-projection'

export {
  authorizePreparation,
  type AuthorizePreparationApprovalActor,
  type AuthorizePreparationInput,
  type AuthorizePreparationPorts,
  type AuthorizePreparationResult,
} from './authorize-preparation'

export {
  exportRouteEvidence,
  exportRouteProblemForSupport,
  listRouteProblemsForSupport,
  projectProblemReported,
  projectProblemStatusChange,
  readRouteProblemForBusiness,
  recordRouteProblemBusinessReport,
  replyRouteProblem,
  reportRouteProblem,
  updateRouteProblemStatus,
  type BusinessProblemReportResult,
  type BusinessProblemViewResult,
  type ExportRouteEvidenceInput,
  type ExportRouteEvidenceResult,
  type ProblemRoutePorts,
  type RecordRouteProblemBusinessReportInput,
  type ReplyRouteProblemInput,
  type ReplyRouteProblemResult,
  type ReportRouteProblemInput,
  type ReportRouteProblemResult,
  type SupportProblemExportResult,
  type SupportProblemListResult,
  type UpdateRouteProblemStatusInput,
  type UpdateRouteProblemStatusResult,
} from './problem-route'
