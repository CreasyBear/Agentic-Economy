import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  labelAttemptEvidence,
  labeledAvailableEvidence,
  type AttemptEvidenceItem,
  type LabeledEvidence,
} from './evidence'

export type ProblemCategory =
  | 'incorrect_result'
  | 'unexpected_cost'
  | 'privacy_concern'
  | 'duplicate_charge_or_effect'
  | 'could_not_stop'
  | 'other'

export type ProblemVisibility = 'customer_and_ae_only' | 'share_with_affected_business'

export type BusinessCausalityPosition = 'supports' | 'disputes' | 'uncertain'

export type ProblemUpdateState = 'investigating' | 'waiting_for_customer' | 'closed'

export type CustomerProblemReportArgs = Readonly<{
  requestId: string
  principalId: string
  idempotencyKey: string
  category: ProblemCategory
  summary: string
  affectedStep?: number
  evidenceReceiptRefs: readonly string[]
  visibility: ProblemVisibility
}>

export type PriorProblemReport = Readonly<{
  commandDigest: string
  reportRef: string
  createdAt: number
  step?: number
  attemptRef?: string
  businessName?: string
  evidenceReceiptRefs?: readonly string[]
  visibility?: ProblemVisibility
}>

export type ProblemReportInsert = Readonly<{
  reportRef: string
  commandKey: string
  commandDigest: string
  principalId: string
  requestId: string
  runRef: string
  mandateRef: string
  attemptRef: string
  step: number
  evidenceReceiptRefs: readonly string[]
  visibility: ProblemVisibility
  category: ProblemCategory
  summary: string
  createdAt: number
  businessName?: string
}>

export type CustomerProblemReportResult = Readonly<{
  kind: 'reported' | 'replayed'
  reportRef: string
  reportedAt: number
  affected: Readonly<{
    step: number
    attemptRef?: string
    business?: string
  }>
  visibility: ProblemVisibility
  evidence: readonly LabeledEvidence[]
}>

export type CustomerProblemReportAppend = Readonly<{
  kind: 'append'
  record: ProblemReportInsert
  result: Readonly<{
    kind: 'reported'
    reportRef: string
    reportedAt: number
    affected: Readonly<{
      step: number
      attemptRef?: string
      business?: string
    }>
    visibility: ProblemVisibility
    evidence: readonly LabeledEvidence[]
  }>
}>

export type CustomerProblemReportDecision =
  | CustomerProblemReportResult
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'refused'; reason: 'request_not_found' | 'evidence_not_found' }>
  | CustomerProblemReportAppend

export function decideCustomerProblemReport(input: Readonly<{
  args: CustomerProblemReportArgs
  head: Readonly<{ currentRunRef: string; principalId: string }>
  prior: PriorProblemReport | null
  now: number
  run?: Readonly<{
    principalId: string
    currentPosition: number
    totalSteps: number
    mandateRef: string
    businesses?: readonly Readonly<{ name: string }>[]
  }>
  attempt?: Readonly<{
    attemptRef: string
    position: number
    evidence?: readonly AttemptEvidenceItem[]
  }>
}>): CustomerProblemReportDecision {
  const { args, head, prior, now } = input
  const commandKey = `route-problem:v1:${canonicalDigest({
    principalId: args.principalId,
    requestId: args.requestId,
    idempotencyKey: args.idempotencyKey,
  })}`
  const commandDigest = canonicalDigest(args)
  const legacyCommandDigest = canonicalDigest({
    requestId: args.requestId,
    principalId: args.principalId,
    idempotencyKey: args.idempotencyKey,
    category: args.category,
    summary: args.summary,
  })
  if (prior !== null) {
    return (
      prior.commandDigest === commandDigest
      || (prior.evidenceReceiptRefs === undefined && prior.visibility === undefined
        && prior.commandDigest === legacyCommandDigest)
    )
      ? {
          kind: 'replayed' as const,
          reportRef: prior.reportRef,
          reportedAt: prior.createdAt,
          affected: {
            step: prior.step ?? 1,
            ...(prior.attemptRef === undefined ? {} : { attemptRef: prior.attemptRef }),
            ...(prior.businessName === undefined ? {} : { business: prior.businessName }),
          },
          visibility: prior.visibility ?? 'customer_and_ae_only' as const,
          evidence: (prior.evidenceReceiptRefs ?? []).map((receiptRef, index) => ({
            receiptRef, label: `Attached evidence ${index + 1}`,
          })),
        }
      : { kind: 'conflict' as const }
  }
  const run = input.run
  const attempt = input.attempt
  if (run === undefined || run.principalId !== args.principalId) {
    return { kind: 'refused', reason: 'request_not_found' }
  }
  if (attempt === undefined) {
    return { kind: 'refused', reason: 'evidence_not_found' }
  }
  const affectedStep = args.affectedStep ?? run.currentPosition
  if (!Number.isSafeInteger(affectedStep) || affectedStep < 1 || affectedStep > run.totalSteps
    || args.evidenceReceiptRefs.length > 20 || new Set(args.evidenceReceiptRefs).size !== args.evidenceReceiptRefs.length) {
    return { kind: 'refused', reason: 'evidence_not_found' }
  }
  if (attempt.position !== affectedStep) {
    return { kind: 'refused', reason: 'evidence_not_found' }
  }
  const availableEvidence = labeledAvailableEvidence(attempt)
  const selectedEvidence = args.evidenceReceiptRefs.map((receiptRef) => (
    availableEvidence.find((item) => item.receiptRef === receiptRef)
  ))
  if (selectedEvidence.some((item) => item === undefined)) {
    return { kind: 'refused', reason: 'evidence_not_found' }
  }
  const reportRef = `problem:${canonicalDigest({ commandKey, commandDigest, runRef: head.currentRunRef })}`
  const businessName = run.businesses?.[attempt.position - 1]?.name
  const evidence = selectedEvidence.filter((item) => item !== undefined)
  const result = {
    kind: 'reported' as const,
    reportRef,
    reportedAt: now,
    affected: businessName === undefined
      ? { step: attempt.position, attemptRef: attempt.attemptRef }
      : { step: attempt.position, attemptRef: attempt.attemptRef, business: businessName },
    visibility: args.visibility,
    evidence,
  }
  const record: ProblemReportInsert = businessName === undefined
    ? {
        reportRef,
        commandKey,
        commandDigest,
        principalId: args.principalId,
        requestId: args.requestId,
        runRef: head.currentRunRef,
        mandateRef: run.mandateRef,
        attemptRef: attempt.attemptRef,
        step: attempt.position,
        evidenceReceiptRefs: args.evidenceReceiptRefs,
        visibility: args.visibility,
        category: args.category,
        summary: args.summary.trim(),
        createdAt: now,
      }
    : {
        reportRef,
        commandKey,
        commandDigest,
        principalId: args.principalId,
        requestId: args.requestId,
        runRef: head.currentRunRef,
        mandateRef: run.mandateRef,
        attemptRef: attempt.attemptRef,
        step: attempt.position,
        evidenceReceiptRefs: args.evidenceReceiptRefs,
        visibility: args.visibility,
        category: args.category,
        summary: args.summary.trim(),
        createdAt: now,
        businessName,
      }
  return { kind: 'append', record, result }
}

export type BusinessProblemClaimArgs = Readonly<{
  reportRef: string
  idempotencyKey: string
  causalityPosition: BusinessCausalityPosition
  statement: string
  evidenceReceiptRefs: readonly string[]
}>

export type PriorBusinessClaim = Readonly<{
  commandDigest: string
  statementRef: string
  reportRef: string
  businessName: string
  causalityPosition: BusinessCausalityPosition
  statement: string
  evidenceReceiptRefs: readonly string[]
  createdAt: number
}>

export type BusinessClaimInsert = Readonly<{
  statementRef: string
  reportRef: string
  commandKey: string
  commandDigest: string
  businessId: string
  businessName: string
  actorRef: string
  causalityPosition: BusinessCausalityPosition
  statement: string
  evidenceReceiptRefs: readonly string[]
  createdAt: number
}>

export type BusinessProblemClaimResult = Readonly<{
  kind: 'recorded' | 'replayed'
  statementRef: string
  reportRef: string
  business: string
  causalityPosition: BusinessCausalityPosition
  statement: string
  evidence: readonly LabeledEvidence[]
  recordedAt: number
}>

export type BusinessProblemClaimAppend = Readonly<{
  kind: 'append'
  record: BusinessClaimInsert
  result: Readonly<{
    kind: 'recorded'
    statementRef: string
    reportRef: string
    business: string
    causalityPosition: BusinessCausalityPosition
    statement: string
    evidence: readonly LabeledEvidence[]
    recordedAt: number
  }>
}>

export type BusinessProblemClaimDecision =
  | BusinessProblemClaimResult
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{
      kind: 'refused'
      reason: 'evidence_not_found' | 'invalid_report'
    }>
  | BusinessProblemClaimAppend

export function decideBusinessProblemClaim(input: Readonly<{
  args: BusinessProblemClaimArgs
  report: Readonly<{ reportRef: string }>
  attempt: Readonly<{
    attemptRef: string
    evidence?: readonly AttemptEvidenceItem[]
  }>
  business: Readonly<{ id: string; name: string }>
  actorRef: string
  prior: PriorBusinessClaim | null
  now: number
}>): BusinessProblemClaimDecision {
  const { args, report, attempt, business, actorRef, prior, now } = input
  const statement = args.statement.trim()
  if (args.idempotencyKey.trim().length === 0 || statement.length === 0 || statement.length > 1_000
    || args.evidenceReceiptRefs.length > 20
    || new Set(args.evidenceReceiptRefs).size !== args.evidenceReceiptRefs.length) {
    return { kind: 'refused', reason: 'invalid_report' }
  }
  const commandKey = `route-problem-business-report:v1:${canonicalDigest({
    reportRef: args.reportRef,
    businessId: business.id,
    idempotencyKey: args.idempotencyKey,
  })}`
  const commandDigest = canonicalDigest(args)
  if (prior !== null) {
    const priorEvidence = labelAttemptEvidence(attempt, prior.evidenceReceiptRefs)
    if (priorEvidence.length !== prior.evidenceReceiptRefs.length) {
      throw new Error('customer_request_route_problem_business_report_integrity_failure')
    }
    return prior.commandDigest === commandDigest
      ? {
          kind: 'replayed',
          statementRef: prior.statementRef,
          reportRef: prior.reportRef,
          business: prior.businessName,
          causalityPosition: prior.causalityPosition,
          statement: prior.statement,
          evidence: priorEvidence,
          recordedAt: prior.createdAt,
        }
      : { kind: 'conflict' }
  }
  const evidence = labelAttemptEvidence(attempt, args.evidenceReceiptRefs)
  if (evidence.length !== args.evidenceReceiptRefs.length) {
    return { kind: 'refused', reason: 'evidence_not_found' }
  }
  const statementRef = `problem-business-report:${canonicalDigest({
    commandKey, commandDigest, attemptRef: attempt.attemptRef,
  })}`
  const result = {
    kind: 'recorded' as const,
    statementRef,
    reportRef: report.reportRef,
    business: business.name,
    causalityPosition: args.causalityPosition,
    statement,
    evidence,
    recordedAt: now,
  }
  return {
    kind: 'append',
    record: {
      statementRef,
      reportRef: report.reportRef,
      commandKey,
      commandDigest,
      businessId: business.id,
      businessName: business.name,
      actorRef,
      causalityPosition: args.causalityPosition,
      statement,
      evidenceReceiptRefs: args.evidenceReceiptRefs,
      createdAt: now,
    },
    result,
  }
}

export type ProblemUpdateArgs = Readonly<{
  reportRef: string
  expectedVersion: number
  idempotencyKey: string
  state: ProblemUpdateState
  publicMessage: string
}>

export type ProblemReplyArgs = Readonly<{
  requestId: string
  reportRef: string
  principalId: string
  expectedVersion: number
  idempotencyKey: string
  message: string
}>

export type PriorProblemUpdate = Readonly<{
  commandDigest: string
  reportRef: string
  version: number
  state: ProblemUpdateState
  createdAt: number
}>

export type ProblemUpdateRow = Readonly<{
  version: number
  state: ProblemUpdateState
  source: 'customer' | 'ae_support'
  message: string
  createdAt: number
}>

export type ProblemUpdateInsert = Readonly<{
  updateRef: string
  reportRef: string
  commandKey: string
  commandDigest: string
  version: number
  source: 'customer' | 'ae_support'
  actorRef: string
  state: ProblemUpdateState
  message: string
  createdAt: number
}>

export type ProblemUpdateResult = Readonly<{
  kind: 'updated'
  reportRef: string
  version: number
  state: ProblemUpdateState
  recordedAt: number
}>

export type ProblemUpdateDecision =
  | ProblemUpdateResult
  | Readonly<{ kind: 'conflict'; reason: 'idempotency_key_reused' | 'stale_version' }>
  | Readonly<{ kind: 'refused'; reason: 'invalid_update' }>
  | Readonly<{
      kind: 'append'
      record: ProblemUpdateInsert
      result: ProblemUpdateResult
    }>

export function decideSupportProblemStatus(input: Readonly<{
  args: ProblemUpdateArgs
  actorRef: string
  updates: readonly ProblemUpdateRow[]
  prior: PriorProblemUpdate | null
  now: number
}>): ProblemUpdateDecision {
  const { args, actorRef, updates, prior, now } = input
  const message = args.publicMessage.trim()
  if (!Number.isSafeInteger(args.expectedVersion) || args.expectedVersion < 0
    || args.idempotencyKey.trim().length === 0 || message.length === 0 || message.length > 1_000) {
    return { kind: 'refused', reason: 'invalid_update' }
  }
  const commandKey = `route-problem-update:v1:${canonicalDigest({
    reportRef: args.reportRef,
    actorRef,
    idempotencyKey: args.idempotencyKey,
  })}`
  const commandDigest = canonicalDigest(args)
  if (prior !== null) {
    return prior.commandDigest === commandDigest
      ? {
          kind: 'updated',
          reportRef: prior.reportRef,
          version: prior.version,
          state: prior.state,
          recordedAt: prior.createdAt,
        }
      : { kind: 'conflict', reason: 'idempotency_key_reused' }
  }
  if (updates.length !== args.expectedVersion) {
    return { kind: 'conflict', reason: 'stale_version' }
  }
  const version = updates.length + 1
  const result = {
    kind: 'updated' as const,
    reportRef: args.reportRef,
    version,
    state: args.state,
    recordedAt: now,
  }
  return {
    kind: 'append',
    record: {
      updateRef: `problem-update:${canonicalDigest({ commandKey, commandDigest, version })}`,
      reportRef: args.reportRef,
      commandKey,
      commandDigest,
      version,
      source: 'ae_support',
      actorRef,
      state: args.state,
      message,
      createdAt: now,
    },
    result,
  }
}

export function decideCustomerProblemReply(input: Readonly<{
  args: ProblemReplyArgs
  updates: readonly ProblemUpdateRow[]
  prior: PriorProblemUpdate | null
  now: number
}>): ProblemUpdateDecision {
  const { args, updates, prior, now } = input
  const message = args.message.trim()
  if (!Number.isSafeInteger(args.expectedVersion) || args.expectedVersion < 1
    || args.idempotencyKey.trim().length === 0 || message.length === 0 || message.length > 1_000) {
    return { kind: 'refused', reason: 'invalid_update' }
  }
  const commandKey = `route-problem-reply:v1:${canonicalDigest({
    reportRef: args.reportRef,
    principalId: args.principalId,
    idempotencyKey: args.idempotencyKey,
  })}`
  const commandDigest = canonicalDigest(args)
  if (prior !== null) {
    return prior.commandDigest === commandDigest
      ? {
          kind: 'updated',
          reportRef: prior.reportRef,
          version: prior.version,
          state: prior.state,
          recordedAt: prior.createdAt,
        }
      : { kind: 'conflict', reason: 'idempotency_key_reused' }
  }
  const latest = updates.at(-1)
  if (updates.length !== args.expectedVersion) {
    return { kind: 'conflict', reason: 'stale_version' }
  }
  if (latest?.state !== 'waiting_for_customer') {
    return { kind: 'refused', reason: 'invalid_update' }
  }
  const version = updates.length + 1
  const result = {
    kind: 'updated' as const,
    reportRef: args.reportRef,
    version,
    state: 'investigating' as const,
    recordedAt: now,
  }
  return {
    kind: 'append',
    record: {
      updateRef: `problem-update:${canonicalDigest({ commandKey, commandDigest, version })}`,
      reportRef: args.reportRef,
      commandKey,
      commandDigest,
      version,
      source: 'customer',
      actorRef: args.principalId,
      state: 'investigating',
      message,
      createdAt: now,
    },
    result,
  }
}
