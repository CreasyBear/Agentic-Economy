import type {
  BusinessCausalityPosition,
  ProblemCategory,
  ProblemUpdateState,
  ProblemVisibility,
} from '../problem-support/commands'
import {
  labeledAvailableEvidence,
  type AttemptEvidenceItem,
} from '../problem-support/evidence'
import { projectCustomerEvidenceProblems } from '../problem-support/projections'

import {
  effectiveRouteAttemptState,
  exportState,
  type ExportedStepState,
  type RouteAttemptState,
  type RouteDispatchState,
} from './export-state'
import { routeAttemptIntegrityValid } from './integrity'

export type CustomerEvidenceExportRunState =
  | 'queued'
  | 'running'
  | 'outcome_unknown'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type CustomerEvidenceExportRunSnapshot = Readonly<{
  state: CustomerEvidenceExportRunState
  totalSteps: number
  resultJson?: string
  businesses?: readonly Readonly<{ businessRef: string; name: string }>[]
}>

export type CustomerEvidenceExportAttemptSnapshot = Readonly<{
  runRef: string
  requestId: string
  mandateRef: string
  actionId: string
  position: number
  operationKeyDigest: string
  grant: Readonly<{
    grantDigest: string
    step: Readonly<{
      offeringId: string
      bindingRegistrationHash: string
      businessId: string
    }>
  }>
  inputDigest: string
  createdAt: number
  attemptDigest: string
  attemptRef: string
  dispatchState?: RouteDispatchState
  inputJson: string
  outputJson?: string
  outputDigest?: string
  transportObservationJson?: string
  transportObservationDigest?: string
  state: RouteAttemptState
  updatedAt: number
  evidence?: readonly AttemptEvidenceItem[]
}>

export type CustomerEvidenceExportBindingSnapshot = Readonly<{
  offeringId: string
  registrationHash: string
  endpointUrl: string
}>

export type CustomerEvidenceExportProblemSnapshot = Readonly<{
  reportRef: string
  principalId: string
  attemptRef?: string
  step?: number
  businessName?: string
  createdAt: number
  category: ProblemCategory
  summary: string
  visibility?: ProblemVisibility
  evidenceReceiptRefs?: readonly string[]
}>

export type CustomerEvidenceExportProblemUpdateSnapshot = Readonly<{
  version: number
  state: ProblemUpdateState
  source: 'customer' | 'ae_support'
  message: string
  createdAt: number
}>

export type CustomerEvidenceExportBusinessReportSnapshot = Readonly<{
  businessId: string
  businessName: string
  causalityPosition: BusinessCausalityPosition
  statement: string
  evidenceReceiptRefs: readonly string[]
  createdAt: number
}>

export type CustomerEvidenceExportStep = {
  step: number
  state: ExportedStepState
  observedAt: number
  business: string
  providerOrigin: string
  outputDigest?: string
  evidence: Array<{ receiptRef: string; label: string }>
}

export type CustomerEvidenceExportFound = {
  kind: 'found'
  state: CustomerEvidenceExportRunState
  generatedAt: number
  resultJson?: string
  steps: CustomerEvidenceExportStep[]
  problems: ReturnType<typeof projectCustomerEvidenceProblems>
}

export function projectCustomerEvidenceExport(input: Readonly<{
  run: CustomerEvidenceExportRunSnapshot
  attempts: readonly CustomerEvidenceExportAttemptSnapshot[]
  bindings: readonly (CustomerEvidenceExportBindingSnapshot | null)[]
  problems: readonly CustomerEvidenceExportProblemSnapshot[]
  updatesByProblem: readonly (readonly CustomerEvidenceExportProblemUpdateSnapshot[])[]
  businessReportsByProblem: readonly (readonly CustomerEvidenceExportBusinessReportSnapshot[])[]
  principalId: string
  generatedAt: number
}>): CustomerEvidenceExportFound {
  const { run, attempts, bindings, problems, principalId, generatedAt } = input
  if (attempts.length === 0 || attempts.length > run.totalSteps
    || attempts.some((attempt) => !routeAttemptIntegrityValid(attempt))) {
    throw new Error('customer_request_route_run_attempt_integrity_failure')
  }
  if (bindings.some((binding, index) => {
    const attempt = attempts[index]
    return binding === null || attempt === undefined
      || binding.offeringId !== attempt.grant.step.offeringId
      || binding.registrationHash !== attempt.grant.step.bindingRegistrationHash
  })) {
    throw new Error('customer_request_route_run_binding_integrity_failure')
  }
  if (problems.length > 100 || problems.some((problem) => problem.principalId !== principalId)) {
    throw new Error('customer_request_route_problem_integrity_failure')
  }
  return {
    kind: 'found' as const,
    state: run.state,
    generatedAt,
    ...(run.resultJson === undefined ? {} : { resultJson: run.resultJson }),
    steps: attempts.map((attempt, index) => ({ attempt, binding: bindings[index] }))
      .sort((left, right) => left.attempt.position - right.attempt.position)
      .map(({ attempt, binding }) => ({
        step: attempt.position,
        state: exportState(effectiveRouteAttemptState(attempt.state, attempt.dispatchState)),
        observedAt: attempt.updatedAt,
        business: run.businesses?.[attempt.position - 1]?.name ?? `Business step ${attempt.position}`,
        providerOrigin: new URL(binding!.endpointUrl).origin,
        ...(attempt.outputDigest === undefined ? {} : { outputDigest: attempt.outputDigest }),
        evidence: labeledAvailableEvidence(attempt).map((item) => ({ ...item })),
      })),
    problems: projectCustomerEvidenceProblems({
      problems,
      updatesByProblem: input.updatesByProblem,
      businessReportsByProblem: input.businessReportsByProblem,
      attempts,
      observedAt: generatedAt,
    }),
  }
}
