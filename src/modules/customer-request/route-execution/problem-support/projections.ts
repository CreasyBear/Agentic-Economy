import { formatCurrencyAmount } from '@/modules/customer-request/format-currency-amount'

import type {
  BusinessCausalityPosition,
  ProblemCategory,
  ProblemUpdateState,
  ProblemVisibility,
} from './commands'
import {
  buildAttemptEvidenceLabelMap,
  evidenceReceiptRef,
  labelAttemptEvidence,
  type AttemptEvidenceItem,
  type LabeledEvidence,
} from './evidence'
import {
  projectCustomerRequestProblemTracking,
  type CustomerRequestProblemTracking,
} from './tracking'

export type BusinessProblemProjection = Readonly<{
  kind: 'business_problem'
  reportRef: string
  business: string
  category: ProblemCategory
  customerStatement: string
  causality: 'unknown'
  resolution: 'not_adjudicated'
  decisionAuthority: 'not_assigned'
  evidence: readonly LabeledEvidence[]
  availableEvidence: readonly LabeledEvidence[]
  businessClaims: readonly Readonly<{
    statementRef: string
    causalityPosition: BusinessCausalityPosition
    statement: string
    evidence: readonly LabeledEvidence[]
    recordedAt: number
  }>[]
}>

export function projectBusinessProblem(input: Readonly<{
  report: Readonly<{
    reportRef: string
    category: ProblemCategory
    summary: string
    evidenceReceiptRefs?: readonly string[]
  }>
  attempt: Readonly<{
    attemptRef: string
    evidence?: readonly AttemptEvidenceItem[]
  }>
  businessName: string
  businessId: string
  businessReports: readonly Readonly<{
    statementRef: string
    businessId: string
    causalityPosition: BusinessCausalityPosition
    statement: string
    evidenceReceiptRefs: readonly string[]
    createdAt: number
  }>[]
}>): BusinessProblemProjection {
  const { report, attempt, businessName, businessId, businessReports } = input
  if (businessReports.some((item) => item.businessId !== businessId)) {
    throw new Error('customer_request_route_problem_business_report_integrity_failure')
  }
  const availableEvidence = labelAttemptEvidence(
    attempt,
    (attempt.evidence ?? []).map((item) => evidenceReceiptRef(attempt.attemptRef, item)),
  )
  const evidence = labelAttemptEvidence(attempt, report.evidenceReceiptRefs ?? [])
  if (evidence.length !== (report.evidenceReceiptRefs ?? []).length
    || businessReports.some((item) => (
      labelAttemptEvidence(attempt, item.evidenceReceiptRefs).length !== item.evidenceReceiptRefs.length
    ))) {
    throw new Error('customer_request_route_problem_evidence_integrity_failure')
  }
  return {
    kind: 'business_problem',
    reportRef: report.reportRef,
    business: businessName,
    category: report.category,
    customerStatement: report.summary,
    causality: 'unknown',
    resolution: 'not_adjudicated',
    decisionAuthority: 'not_assigned',
    evidence,
    availableEvidence,
    businessClaims: businessReports.map((item) => ({
      statementRef: item.statementRef,
      causalityPosition: item.causalityPosition,
      statement: item.statement,
      evidence: labelAttemptEvidence(attempt, item.evidenceReceiptRefs),
      recordedAt: item.createdAt,
    })),
  }
}

export type SupportProblemListRow = Readonly<{
  reportRef: string
  requestRef: string
  version: number
  state: CustomerRequestProblemTracking['state']
  nextActor: CustomerRequestProblemTracking['nextActor']
  category: ProblemCategory
  summary: string
  business?: string
  reportedAt: number
  lastUpdatedAt: number
}>

export function projectSupportProblemList(input: Readonly<{
  reports: readonly Readonly<{
    reportRef: string
    requestId: string
    createdAt: number
    category: ProblemCategory
    summary: string
    businessName?: string
  }>[]
  updatesByReport: readonly (readonly Readonly<{
    state: ProblemUpdateState
    createdAt: number
  }>[])[]
  observedAt: number
}>): SupportProblemListRow[] {
  return input.reports.map((problem, index) => {
    const updates = input.updatesByReport[index] ?? []
    const latest = updates.at(-1)
    const tracking = projectCustomerRequestProblemTracking(
      problem.createdAt,
      input.observedAt,
      latest === undefined ? undefined : { state: latest.state, recordedAt: latest.createdAt },
    )
    return {
      reportRef: problem.reportRef,
      requestRef: problem.requestId,
      version: updates.length,
      state: tracking.state,
      nextActor: tracking.nextActor,
      category: problem.category,
      summary: problem.summary,
      ...(problem.businessName === undefined ? {} : { business: problem.businessName }),
      reportedAt: problem.createdAt,
      lastUpdatedAt: latest?.createdAt ?? problem.createdAt,
    }
  })
}

function supportAttemptState(
  state: 'queued' | 'leased' | 'dispatched' | 'accepted' | 'succeeded' | 'failed' | 'outcome_unknown' | 'cancelled',
): 'queued' | 'leased' | 'ready_to_contact' | 'contacting' | 'awaiting_result' | 'completed' | 'failed' | 'outcome_unknown' | 'cancelled' {
  if (state === 'leased') return 'leased'
  if (state === 'dispatched') return 'contacting'
  if (state === 'accepted') return 'awaiting_result'
  if (state === 'succeeded') return 'completed'
  return state
}

function supportAttemptWasReleased(
  state: 'queued' | 'leased' | 'dispatched' | 'accepted' | 'succeeded' | 'failed' | 'outcome_unknown' | 'cancelled'
    | undefined,
): boolean {
  return state === 'dispatched' || state === 'accepted' || state === 'succeeded'
    || state === 'failed' || state === 'outcome_unknown'
}


function customerLabel(value: string): string {
  const words = value.replaceAll(/[-_]+/gu, ' ')
  return `${words.slice(0, 1).toUpperCase()}${words.slice(1)}`
}

function supportProblemReconstruction(input: Readonly<{
  requestRevision: {
    requestRevision: number
    aggregate: { snapshot: { intent: string } }
  }
  mandate: {
    issuedAt: number
    expiresAt: number
    route: {
      maximumTotalSpend: { currency: string; amountMinor: number }
      steps: readonly Readonly<{
        position: number
        businessId: string
        dataScope: readonly Readonly<{
          classification: 'public' | 'personal' | 'sensitive' | 'credential'
          recipient:
            | { kind: 'registered_binding'; businessId: string; bindingId: string }
            | { kind: 'named_recipient'; recipientId: string }
          purposes: readonly string[]
        }>[]
        effects: readonly Readonly<{
          class: 'data_release' | 'financial_exposure' | 'external_state_change'
          reversibility: 'not_applicable' | 'reversible' | 'conditional' | 'irreversible'
        }>[]
        recovery: {
          idempotency: 'not_applicable' | 'required'
          recovery: 'retry_safe' | 'reconcile_required'
        }
      }>[]
    }
  }
  run: {
    state: 'queued' | 'running' | 'outcome_unknown' | 'completed' | 'failed' | 'cancelled'
    completedSteps: number
    totalSteps: number
    businesses?: readonly Readonly<{ businessRef: string; name: string }>[]
  }
  revocation: null | { recordedAt: number }
  reservations: readonly Readonly<{ reservedSpend: { currency: string; amountMinor: number } }>[]
  attempts: readonly Readonly<{
    position: number
    state: 'queued' | 'leased' | 'dispatched' | 'accepted' | 'succeeded' | 'failed' | 'outcome_unknown' | 'cancelled'
    attemptRef: string
    evidence?: readonly AttemptEvidenceItem[]
  }>[]
  businessNames: ReadonlyMap<string, string>
  tracking: {
    nextAction: 'await_status_update' | 'check_status' | 'provide_information' | 'none'
    nextActor: 'ae' | 'customer' | 'none'
  }
  observedAt: number
}>) {
  const businesses = new Map((input.run.businesses ?? []).map((business) => [
    business.businessRef,
    business.name,
  ]))
  for (const [businessId, name] of input.businessNames) businesses.set(businessId, name)
  const admitted = input.reservations.reduce((total, reservation) => {
    if (reservation.reservedSpend.currency !== input.mandate.route.maximumTotalSpend.currency) {
      throw new Error('customer_request_route_problem_spend_currency_integrity_failure')
    }
    return total + reservation.reservedSpend.amountMinor
  }, 0)
  const attempts = new Map(input.attempts.map((attempt) => [attempt.position, attempt]))
  const allIdempotent = input.mandate.route.steps.every((step) => step.recovery.idempotency === 'required')
  const allRetrySafe = input.mandate.route.steps.every((step) => step.recovery.recovery === 'retry_safe')
  const maximum = input.mandate.route.maximumTotalSpend
  return {
    request: {
      revision: input.requestRevision.requestRevision,
      ordinaryRequest: input.requestRevision.aggregate.snapshot.intent,
    },
    choice: {
      businesses: input.mandate.route.steps.map((step) => (
        businesses.get(step.businessId) ?? 'Registered business'
      )),
      selectedBecause: [
        input.mandate.route.steps.length === 1
          ? 'The registered business can provide the requested result.'
          : `All ${input.mandate.route.steps.length} registered steps can provide the requested result.`,
        `The confirmed option stays within ${formatCurrencyAmount(maximum.currency, maximum.amountMinor)}.`,
      ],
      confirmedAt: input.mandate.issuedAt,
      validUntil: input.mandate.expiresAt,
    },
    authority: {
      state: input.revocation !== null
        ? 'revoked' as const
        : input.observedAt >= input.mandate.expiresAt ? 'expired' as const : 'current' as const,
      source: 'customer_confirmation' as const,
      spend: {
        limit: { ...maximum },
        admitted: { currency: maximum.currency, amountMinor: admitted },
      },
      dataSharing: input.mandate.route.steps.flatMap((step) => {
        const released = supportAttemptWasReleased(attempts.get(step.position)?.state)
        return step.dataScope.map((scope) => ({
          classification: scope.classification,
          recipient: scope.recipient.kind === 'named_recipient'
            ? customerLabel(scope.recipient.recipientId)
            : businesses.get(scope.recipient.businessId) ?? 'Registered business',
          purposes: [...scope.purposes],
          releaseState: released ? 'business_step_released' as const : 'authorized' as const,
        }))
      }),
      effects: input.mandate.route.steps.flatMap((step) => {
        const released = supportAttemptWasReleased(attempts.get(step.position)?.state)
        return step.effects.map((effect) => ({
          class: effect.class,
          reversibility: effect.reversibility,
          releaseState: released ? 'business_step_released' as const : 'authorized' as const,
        }))
      }),
    },
    execution: {
      state: input.run.state,
      completedSteps: input.run.completedSteps,
      totalSteps: input.run.totalSteps,
      duplicateRisk: allIdempotent
        ? 'protected_by_required_idempotency' as const
        : 'mixed_or_not_applicable' as const,
      steps: input.mandate.route.steps.map((step) => {
        const attempt = attempts.get(step.position)
        const evidence = attempt === undefined
          ? []
          : (attempt.evidence ?? []).map((item) => ({
              receiptRef: evidenceReceiptRef(attempt.attemptRef, item),
              label: customerLabel(item.evidenceId),
            }))
        return {
          step: step.position,
          business: businesses.get(step.businessId) ?? 'Registered business',
          state: attempt === undefined ? 'blocked' as const : supportAttemptState(attempt.state),
          evidence,
        }
      }),
    },
    recovery: {
      nextActor: input.tracking.nextActor,
      nextAction: input.tracking.nextAction,
      retry: input.run.state === 'outcome_unknown'
        ? 'blocked_until_reconciled' as const
        : input.run.state === 'failed'
          ? allRetrySafe ? 'safe' as const : 'blocked_until_reconciled' as const
          : 'not_needed' as const,
    },
  }
}

export type SupportProblemExportMaterial = Readonly<{
  problem: Readonly<{
    reportRef: string
    requestId: string
    runRef: string
    mandateRef?: string
    attemptRef?: string
    step?: number
    businessName?: string
    createdAt: number
    category: ProblemCategory
    summary: string
    visibility?: ProblemVisibility
    evidenceReceiptRefs?: readonly string[]
  }>
  updates: readonly Readonly<{
    version: number
    state: ProblemUpdateState
    source: 'customer' | 'ae_support'
    message: string
    createdAt: number
  }>[]
  businessReports: readonly Readonly<{
    businessId: string
    businessName: string
    causalityPosition: BusinessCausalityPosition
    statement: string
    evidenceReceiptRefs: readonly string[]
    createdAt: number
  }>[]
  attempt: null | Readonly<{
    attemptRef: string
    requestId: string
    position: number
    grant: { step: { businessId: string } }
    evidence?: readonly AttemptEvidenceItem[]
  }>
  requestRevision: undefined | Readonly<{
    requestRevision: number
    aggregate: { snapshot: { intent: string } }
  }>
  mandateIssue: null | Readonly<{
    requestId: string
    mandateRef: string
    mandate: Parameters<typeof supportProblemReconstruction>[0]['mandate']
  }>
  run: Readonly<{
    requestId: string
    mandateRef: string
    state: 'queued' | 'running' | 'outcome_unknown' | 'completed' | 'failed' | 'cancelled'
    completedSteps: number
    totalSteps: number
    businesses?: readonly Readonly<{ businessRef: string; name: string }>[]
  }>
  revocation: null | { recordedAt: number }
  reservations: readonly Readonly<{
    reservedSpend: { currency: string; amountMinor: number }
  }>[]
  attempts: readonly Readonly<{
    position: number
    state: 'queued' | 'leased' | 'dispatched' | 'accepted' | 'succeeded' | 'failed' | 'outcome_unknown' | 'cancelled'
    attemptRef: string
    evidence?: readonly AttemptEvidenceItem[]
  }>[]
  businessNames: ReadonlyMap<string, string>
}>

export type SupportProblemExportProjectionInput = SupportProblemExportMaterial & Readonly<{
  observedAt: number
}>

export function projectSupportProblemExport(input: SupportProblemExportProjectionInput) {
  const {
    problem, updates, businessReports, attempt, requestRevision, mandateIssue,
    run, revocation, reservations, attempts, businessNames, observedAt,
  } = input
  if (problem.attemptRef !== undefined && attempt === null) {
    throw new Error('customer_request_route_problem_attempt_integrity_failure')
  }
  if (attempt !== null && (attempt.requestId !== problem.requestId || attempt.position !== problem.step)) {
    throw new Error('customer_request_route_problem_attempt_integrity_failure')
  }
  if (run.requestId !== problem.requestId) {
    throw new Error('customer_request_route_problem_reconstruction_integrity_failure')
  }
  if (problem.mandateRef !== undefined) {
    if (requestRevision === undefined || mandateIssue === null
      || mandateIssue.requestId !== problem.requestId
      || run.mandateRef !== mandateIssue.mandateRef) {
      throw new Error('customer_request_route_problem_reconstruction_integrity_failure')
    }
  }
  const latest = updates.at(-1)
  const tracking = projectCustomerRequestProblemTracking(
    problem.createdAt,
    observedAt,
    latest === undefined ? undefined : { state: latest.state, recordedAt: latest.createdAt },
  )
  const evidenceByReceipt = attempt === null
    ? new Map<string, string>()
    : buildAttemptEvidenceLabelMap(attempt.attemptRef, attempt.evidence)
  const evidenceLabel = (receiptRef: string): string => {
    const label = evidenceByReceipt.get(receiptRef)
    if (label === undefined) throw new Error('customer_request_route_problem_evidence_integrity_failure')
    return label
  }
  if ((problem.evidenceReceiptRefs ?? []).some((receiptRef) => !evidenceByReceipt.has(receiptRef))) {
    throw new Error('customer_request_route_problem_evidence_integrity_failure')
  }
  if (businessReports.some((report) => (
    report.businessId !== attempt?.grant.step.businessId
    || report.evidenceReceiptRefs.some((receiptRef) => !evidenceByReceipt.has(receiptRef))
  ))) {
    throw new Error('customer_request_route_problem_business_report_integrity_failure')
  }
  return {
    kind: 'problem_export' as const,
    reportRef: problem.reportRef,
    requestRef: problem.requestId,
    version: updates.length,
    state: tracking.state,
    category: problem.category,
    summary: problem.summary,
    claimSource: 'customer' as const,
    causality: 'unknown' as const,
    resolution: 'not_adjudicated' as const,
    nextAction: tracking.nextAction,
    nextActor: tracking.nextActor,
    ...(tracking.nextUpdateDueAt === undefined ? {} : { nextUpdateDueAt: tracking.nextUpdateDueAt }),
    decisionAuthority: tracking.decisionAuthority,
    visibility: problem.visibility ?? 'customer_and_ae_only',
    evidence: (problem.evidenceReceiptRefs ?? []).map((receiptRef) => ({
      receiptRef,
      label: evidenceLabel(receiptRef),
    })),
    reportedAt: problem.createdAt,
    affected: {
      step: problem.step ?? 1,
      ...(problem.businessName === undefined ? {} : { business: problem.businessName }),
    },
    claims: [
      {
        claimSource: 'customer' as const,
        causalityPosition: 'reported_problem' as const,
        statement: problem.summary,
        evidence: (problem.evidenceReceiptRefs ?? []).map((receiptRef) => ({
          receiptRef,
          label: evidenceLabel(receiptRef),
        })),
        recordedAt: problem.createdAt,
      },
      ...businessReports.map((businessReport) => ({
        claimSource: 'business' as const,
        causalityPosition: businessReport.causalityPosition,
        statement: businessReport.statement,
        business: businessReport.businessName,
        evidence: businessReport.evidenceReceiptRefs.map((receiptRef) => ({
          receiptRef,
          label: evidenceLabel(receiptRef),
        })),
        recordedAt: businessReport.createdAt,
      })),
    ],
    history: [
      {
        version: 0,
        state: 'received' as const,
        source: 'customer' as const,
        message: problem.summary,
        recordedAt: problem.createdAt,
      },
      ...updates.map((update) => ({
        version: update.version,
        state: update.state,
        source: update.source,
        message: update.message,
        recordedAt: update.createdAt,
      })),
    ],
    ...(requestRevision === undefined || mandateIssue === null
      ? {}
      : {
          reconstruction: supportProblemReconstruction({
            requestRevision,
            mandate: mandateIssue.mandate,
            run,
            revocation,
            reservations,
            attempts,
            businessNames,
            tracking,
            observedAt,
          }),
        }),
  }
}

export function projectCustomerEvidenceProblems(input: Readonly<{
  problems: readonly Readonly<{
    reportRef: string
    attemptRef?: string
    step?: number
    businessName?: string
    createdAt: number
    category: ProblemCategory
    summary: string
    visibility?: ProblemVisibility
    evidenceReceiptRefs?: readonly string[]
  }>[]
  updatesByProblem: readonly (readonly Readonly<{
    version: number
    state: ProblemUpdateState
    source: 'customer' | 'ae_support'
    message: string
    createdAt: number
  }>[])[]
  businessReportsByProblem: readonly (readonly Readonly<{
    businessId: string
    businessName: string
    causalityPosition: BusinessCausalityPosition
    statement: string
    evidenceReceiptRefs: readonly string[]
    createdAt: number
  }>[])[]
  attempts: readonly Readonly<{
    attemptRef: string
    grant: { step: { businessId: string } }
    evidence?: readonly AttemptEvidenceItem[]
  }>[]
  observedAt: number
}>) {
  return input.problems.map((problem, problemIndex) => {
    const updates = input.updatesByProblem[problemIndex] ?? []
    const businessReports = input.businessReportsByProblem[problemIndex] ?? []
    const latest = updates.at(-1)
    const tracking = projectCustomerRequestProblemTracking(
      problem.createdAt,
      input.observedAt,
      latest === undefined ? undefined : {
        state: latest.state,
        recordedAt: latest.createdAt,
      },
    )
    const attempt = input.attempts.find((candidate) => candidate.attemptRef === problem.attemptRef)
    const evidenceByReceipt = attempt === undefined
      ? new Map<string, string>()
      : buildAttemptEvidenceLabelMap(attempt.attemptRef, attempt.evidence)
    if (businessReports.some((businessReport) => (
      businessReport.businessId !== attempt?.grant.step.businessId
      || businessReport.evidenceReceiptRefs.some((receiptRef) => !evidenceByReceipt.has(receiptRef))
    ))) {
      throw new Error('customer_request_route_problem_business_report_integrity_failure')
    }
    return {
      reportRef: problem.reportRef,
      version: updates.length,
      state: tracking.state,
      category: problem.category,
      summary: problem.summary,
      claimSource: 'customer' as const,
      causality: 'unknown' as const,
      resolution: 'not_adjudicated' as const,
      nextAction: tracking.nextAction,
      nextActor: tracking.nextActor,
      ...(tracking.nextUpdateDueAt === undefined ? {} : { nextUpdateDueAt: tracking.nextUpdateDueAt }),
      decisionAuthority: tracking.decisionAuthority,
      visibility: problem.visibility ?? 'customer_and_ae_only',
      evidence: (problem.evidenceReceiptRefs ?? []).map((receiptRef) => ({
        receiptRef, label: evidenceByReceipt.get(receiptRef) ?? 'Recorded evidence',
      })),
      reportedAt: problem.createdAt,
      affected: {
        step: problem.step ?? 1,
        ...(problem.attemptRef === undefined ? {} : { attemptRef: problem.attemptRef }),
        ...(problem.businessName === undefined ? {} : { business: problem.businessName }),
      },
      claims: [
        {
          claimSource: 'customer' as const,
          causalityPosition: 'reported_problem' as const,
          statement: problem.summary,
          evidence: (problem.evidenceReceiptRefs ?? []).map((receiptRef) => ({
            receiptRef,
            label: evidenceByReceipt.get(receiptRef) ?? 'Recorded evidence',
          })),
          recordedAt: problem.createdAt,
        },
        ...businessReports.map((businessReport) => ({
          claimSource: 'business' as const,
          causalityPosition: businessReport.causalityPosition,
          statement: businessReport.statement,
          business: businessReport.businessName,
          evidence: businessReport.evidenceReceiptRefs.map((receiptRef) => ({
            receiptRef,
            label: evidenceByReceipt.get(receiptRef) ?? 'Recorded evidence',
          })),
          recordedAt: businessReport.createdAt,
        })),
      ],
      history: [
        {
          version: 0,
          state: 'received' as const,
          source: 'customer' as const,
          message: problem.summary,
          recordedAt: problem.createdAt,
        },
        ...updates.map((update) => ({
          version: update.version,
          state: update.state,
          source: update.source,
          message: update.message,
          recordedAt: update.createdAt,
        })),
      ],
    }
  })
}
