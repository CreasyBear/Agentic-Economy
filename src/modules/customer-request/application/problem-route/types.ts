import type {
  CustomerRequestEvidenceResult,
  CustomerRequestProblemStatusChange,
} from '@/modules/customer-request/agent-contract'
import type {
  ProblemCategory,
  ProblemVisibility,
} from '@/modules/customer-request/route-execution/problem-support'
import type { CompareResumePorts } from '../compare-resume/types'
import type { ExactAmount } from '@/modules/money/public'

export type { ProblemCategory, ProblemVisibility }

export type ProblemLabeledEvidence = Readonly<{
  receiptRef: string
  label: string
}>

export type ProblemAffected = Readonly<{
  step: number
  attemptRef?: string
  business?: string
}>

export type ReportProblemMutationResult = Readonly<
  | {
      kind: 'reported' | 'replayed'
      reportRef: string
      reportedAt: number
      affected: ProblemAffected
      visibility: ProblemVisibility
      evidence: readonly ProblemLabeledEvidence[]
    }
  | { kind: 'conflict' }
  | { kind: 'refused'; reason: 'request_not_found' | 'evidence_not_found' }
>

export type RecordBusinessReportMutationResult = Readonly<
  | {
      kind: 'recorded' | 'replayed'
      statementRef: string
      reportRef: string
      business: string
      causalityPosition: 'supports' | 'disputes' | 'uncertain'
      statement: string
      evidence: readonly ProblemLabeledEvidence[]
      recordedAt: number
    }
  | { kind: 'conflict' }
  | {
      kind: 'refused'
      reason:
        | 'authentication_required'
        | 'authority_denied'
        | 'report_not_found'
        | 'sharing_not_authorized'
        | 'evidence_not_found'
        | 'invalid_report'
    }
>

export type ProblemUpdateMutationResult = Readonly<
  | {
      kind: 'updated'
      reportRef: string
      version: number
      state: 'investigating' | 'waiting_for_customer' | 'closed'
      recordedAt: number
    }
  | { kind: 'conflict'; reason: 'idempotency_key_reused' | 'stale_version' }
  | {
      kind: 'refused'
      reason: 'authentication_required' | 'authority_denied' | 'report_not_found' | 'invalid_update'
    }
>

export type ExportCustomerEvidenceQueryResult = Readonly<
  | { kind: 'none' }
  | {
      kind: 'found'
      state: 'queued' | 'running' | 'outcome_unknown' | 'completed' | 'failed' | 'cancelled'
      generatedAt: number
      resultJson?: string
      steps: readonly Readonly<{
        step: number
        state:
          | 'queued'
          | 'leased'
          | 'ready_to_contact'
          | 'contacting'
          | 'awaiting_result'
          | 'completed'
          | 'failed'
          | 'outcome_unknown'
          | 'cancelled'
        observedAt: number
        business: string
        providerOrigin: string
        outputDigest?: string
        evidence: readonly ProblemLabeledEvidence[]
      }>[]
      problems: readonly Readonly<{
        reportRef: string
        version: number
        state: 'received' | 'update_due' | 'investigating' | 'waiting_for_customer' | 'closed'
        category: ProblemCategory
        summary: string
        claimSource: 'customer'
        causality: 'unknown'
        resolution: 'not_adjudicated'
        nextAction: 'await_status_update' | 'check_status' | 'provide_information' | 'none'
        nextActor: 'ae' | 'customer' | 'none'
        nextUpdateDueAt?: number
        decisionAuthority: 'not_assigned'
        visibility: ProblemVisibility
        evidence: readonly ProblemLabeledEvidence[]
        reportedAt: number
        affected: ProblemAffected
        claims: readonly Readonly<{
          claimSource: 'customer' | 'business'
          causalityPosition: 'reported_problem' | 'supports' | 'disputes' | 'uncertain'
          statement: string
          business?: string
          evidence: readonly ProblemLabeledEvidence[]
          recordedAt: number
        }>[]
        history: readonly Readonly<{
          version: number
          state: 'received' | 'investigating' | 'waiting_for_customer' | 'closed'
          source: 'customer' | 'ae_support'
          message: string
          recordedAt: number
        }>[]
      }>[]
    }
>

export type BusinessProblemViewResult = Readonly<
  | {
      kind: 'business_problem'
      reportRef: string
      business: string
      category: ProblemCategory
      customerStatement: string
      causality: 'unknown'
      resolution: 'not_adjudicated'
      decisionAuthority: 'not_assigned'
      evidence: readonly ProblemLabeledEvidence[]
      availableEvidence: readonly ProblemLabeledEvidence[]
      businessClaims: readonly Readonly<{
        statementRef: string
        causalityPosition: 'supports' | 'disputes' | 'uncertain'
        statement: string
        evidence: readonly ProblemLabeledEvidence[]
        recordedAt: number
      }>[]
    }
  | {
      kind: 'refused'
      reason:
        | 'authentication_required'
        | 'authority_denied'
        | 'report_not_found'
        | 'sharing_not_authorized'
    }
>

export type BusinessProblemReportResult = Readonly<
  | {
      kind: 'business_report_recorded'
      statementRef: string
      reportRef: string
      business: string
      claimSource: 'business'
      causalityPosition: 'supports' | 'disputes' | 'uncertain'
      causality: 'unknown'
      resolution: 'not_adjudicated'
      decisionAuthority: 'not_assigned'
      statement: string
      evidence: readonly ProblemLabeledEvidence[]
      recordedAt: number
    }
  | { kind: 'conflict'; reason: 'idempotency_key_reused' }
  | {
      kind: 'refused'
      reason:
        | 'authentication_required'
        | 'authority_denied'
        | 'report_not_found'
        | 'sharing_not_authorized'
        | 'evidence_not_found'
        | 'invalid_report'
    }
>

export type SupportProblemListResult = Readonly<
  | {
      kind: 'allowed'
      rows: readonly Readonly<{
        reportRef: string
        requestRef: string
        version: number
        state: 'received' | 'update_due' | 'investigating' | 'waiting_for_customer' | 'closed'
        nextActor: 'ae' | 'customer' | 'none'
        category: ProblemCategory
        summary: string
        business?: string
        reportedAt: number
        lastUpdatedAt: number
      }>[]
    }
  | {
      kind: 'denied'
      reason: 'missing_membership' | 'inactive_membership' | 'action_not_allowed'
      rows: readonly unknown[]
    }
>

export type SupportProblemExportResult = Readonly<
  | {
      kind: 'problem_export'
      reportRef: string
      requestRef: string
      version: number
      state: 'received' | 'update_due' | 'investigating' | 'waiting_for_customer' | 'closed'
      category: ProblemCategory
      summary: string
      claimSource: 'customer'
      causality: 'unknown'
      resolution: 'not_adjudicated'
      nextAction: 'await_status_update' | 'check_status' | 'provide_information' | 'none'
      nextActor: 'ae' | 'customer' | 'none'
      nextUpdateDueAt?: number
      decisionAuthority: 'not_assigned'
      visibility: ProblemVisibility
      evidence: readonly ProblemLabeledEvidence[]
      reportedAt: number
      affected: Readonly<{ step: number; business?: string }>
      claims: readonly Readonly<{
        claimSource: 'customer' | 'business'
        causalityPosition: 'reported_problem' | 'supports' | 'disputes' | 'uncertain'
        statement: string
        business?: string
        evidence: readonly ProblemLabeledEvidence[]
        recordedAt: number
      }>[]
      history: readonly Readonly<{
        version: number
        state: 'received' | 'investigating' | 'waiting_for_customer' | 'closed'
        source: 'customer' | 'ae_support'
        message: string
        recordedAt: number
      }>[]
      reconstruction?: Readonly<{
        request: Readonly<{ revision: number; ordinaryRequest: string }>
        choice: Readonly<{
          businesses: readonly string[]
          selectedBecause: readonly string[]
          confirmedAt: number
          validUntil: number
        }>
        authority: Readonly<{
          state: 'current' | 'expired' | 'revoked'
          source: 'customer_confirmation'
          spend: Readonly<{
            limit: ExactAmount
            admitted: ExactAmount
          }>
          dataSharing: readonly Readonly<{
            classification: 'public' | 'personal' | 'sensitive' | 'credential'
            recipient: string
            purposes: readonly string[]
            releaseState: 'authorized' | 'business_step_released'
          }>[]
          effects: readonly Readonly<{
            class: 'data_release' | 'financial_exposure' | 'external_state_change'
            reversibility: 'not_applicable' | 'reversible' | 'conditional' | 'irreversible'
            releaseState: 'authorized' | 'business_step_released'
          }>[]
        }>
        execution: Readonly<{
          state: 'queued' | 'running' | 'outcome_unknown' | 'completed' | 'failed' | 'cancelled'
          completedSteps: number
          totalSteps: number
          duplicateRisk: 'protected_by_required_idempotency' | 'mixed_or_not_applicable'
          steps: readonly Readonly<{
            step: number
            business: string
            state:
              | 'blocked'
              | 'queued'
              | 'leased'
              | 'ready_to_contact'
              | 'contacting'
              | 'awaiting_result'
              | 'completed'
              | 'failed'
              | 'outcome_unknown'
              | 'cancelled'
            evidence: readonly ProblemLabeledEvidence[]
          }>[]
        }>
        recovery: Readonly<{
          nextActor: 'ae' | 'customer' | 'none'
          nextAction: 'await_status_update' | 'check_status' | 'provide_information' | 'none'
          retry: 'not_needed' | 'safe' | 'blocked_until_reconciled'
        }>
      }>
    }
  | { kind: 'not_found' }
  | {
      kind: 'denied'
      reason: 'missing_membership' | 'inactive_membership' | 'action_not_allowed'
    }
>

export type ProblemRoutePorts = Readonly<{
  loadCurrent: CompareResumePorts['loadCurrent']
  reportProblem: (input: Readonly<{
    requestId: string
    principalId: string
    idempotencyKey: string
    category: ProblemCategory
    summary: string
    affectedStep?: number
    evidenceReceiptRefs: readonly string[]
    visibility: ProblemVisibility
  }>) => Promise<ReportProblemMutationResult>
  recordProblemBusinessReport: (input: Readonly<{
    reportRef: string
    idempotencyKey: string
    causalityPosition: 'supports' | 'disputes' | 'uncertain'
    statement: string
    evidenceReceiptRefs: readonly string[]
  }>) => Promise<RecordBusinessReportMutationResult>
  updateProblemStatus: (input: Readonly<{
    reportRef: string
    expectedVersion: number
    idempotencyKey: string
    state: 'investigating' | 'waiting_for_customer' | 'closed'
    publicMessage: string
  }>) => Promise<ProblemUpdateMutationResult>
  replyProblem: (input: Readonly<{
    requestId: string
    reportRef: string
    principalId: string
    expectedVersion: number
    idempotencyKey: string
    message: string
  }>) => Promise<ProblemUpdateMutationResult>
  exportCustomerEvidence: (input: Readonly<{
    requestId: string
    principalId: string
  }>) => Promise<ExportCustomerEvidenceQueryResult>
  readProblemForBusiness: (input: Readonly<{
    reportRef: string
  }>) => Promise<BusinessProblemViewResult>
  listProblemsForSupport: (input: Readonly<{
    limit: number
  }>) => Promise<SupportProblemListResult>
  exportProblemForSupport: (input: Readonly<{
    reportRef: string
  }>) => Promise<SupportProblemExportResult>
}>

export type ReportRouteProblemInput = Readonly<{
  requestRef: string
  principalId: string
  idempotencyKey: string
  category: ProblemCategory
  summary: string
  affectedStep?: number
  evidenceReceiptRefs: readonly string[]
  visibility: ProblemVisibility
}>

export type RecordRouteProblemBusinessReportInput = Readonly<{
  reportRef: string
  idempotencyKey: string
  causalityPosition: 'supports' | 'disputes' | 'uncertain'
  statement: string
  evidenceReceiptRefs?: readonly string[]
}>

export type UpdateRouteProblemStatusInput = Readonly<{
  reportRef: string
  expectedVersion: number
  idempotencyKey: string
  state: 'investigating' | 'waiting_for_customer' | 'closed'
  publicMessage: string
}>

export type ReplyRouteProblemInput = Readonly<{
  requestRef: string
  reportRef: string
  principalId: string
  expectedVersion: number
  idempotencyKey: string
  message: string
}>

export type ExportRouteEvidenceInput = Readonly<{
  requestRef: string
  principalId: string
}>

export type ReadRouteProblemForBusinessInput = Readonly<{
  reportRef: string
}>

export type ListRouteProblemsForSupportInput = Readonly<{
  limit: number
}>

export type ExportRouteProblemForSupportInput = Readonly<{
  reportRef: string
}>

export type ReportRouteProblemResult = Readonly<
  | {
      kind: 'problem_reported'
      requestRef: string
      reportRef: string
      state: 'received'
      reportedAt: number
      problem: Readonly<{
        category: ProblemCategory
        claimSource: 'customer'
        causality: 'unknown'
        resolution: 'not_adjudicated'
        nextAction: 'await_status_update'
        nextActor: 'ae'
        nextUpdateDueAt: number
        decisionAuthority: 'not_assigned'
        visibility: ProblemVisibility
        evidence: readonly ProblemLabeledEvidence[]
        affected: ProblemAffected
      }>
    }
  | {
      kind: 'conflict'
      requestRef: string
      reason: 'idempotency_key_reused' | 'revision_changed' | 'options_changed' | 'identity_changed'
    }
  | {
      kind: 'refused'
      reason:
        | 'authentication_required'
        | 'request_not_found'
        | 'interpreter_unavailable'
        | 'capabilities_unavailable'
        | 'evidence_not_found'
        | 'invalid_amendment'
    }
>
export type ReplyRouteProblemResult = CustomerRequestProblemStatusChange
export type UpdateRouteProblemStatusResult = CustomerRequestProblemStatusChange
export type ExportRouteEvidenceResult = CustomerRequestEvidenceResult
