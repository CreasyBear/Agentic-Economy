import type {
  BusinessProblemAuthority,
  ProblemAttemptSnapshot,
  ProblemMutationPorts,
  ProblemRunSnapshot,
  ProblemSupportReadPorts,
} from '@/modules/customer-request/route-execution/machines/problem-ports'
import type {
  PriorBusinessClaim,
  PriorProblemReport,
  PriorProblemUpdate,
  ProblemUpdateRow,
  ProblemVisibility,
} from '@/modules/customer-request/route-execution/problem-support/commands'
import type {
  SupportProblemExportMaterial,
} from '@/modules/customer-request/route-execution/problem-support/projections'
import {
  loadProblemBusinessReports,
  loadProblemUpdates,
} from '@/modules/customer-request/route-execution/evidence-load'
import { routeAttemptIntegrityValid } from '@/modules/customer-request/route-execution/journal'

import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { resolveAdminAuthority } from './authz'
import { evidenceLoadPorts } from './customerRequestEvidenceLoadPorts'

type DbCtx = MutationCtx | QueryCtx

export function problemMutationPorts(ctx: MutationCtx): ProblemMutationPorts {
  return {
    now: () => Date.now(),

    loadRunHeadForProblem: async (requestId, principalId) => {
      const head = await ctx.db.query('customerRequestRouteRunHeads')
        .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
      if (head === null || head.principalId !== principalId) return null
      return {
        principalId: head.principalId,
        currentRunRef: head.currentRunRef,
      }
    },

    loadPriorProblemReport: async (commandKey) => {
      const prior = await ctx.db.query('customerRequestRouteProblemReports')
        .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
      return prior === null ? null : toPriorProblemReport(prior)
    },

    loadRunForProblem: async (runRef, principalId) => {
      const run = await ctx.db.query('customerRequestRouteRuns')
        .withIndex('by_runRef', (query) => query.eq('runRef', runRef)).unique()
      if (run === null || run.principalId !== principalId) return null
      return toProblemRun(run)
    },

    loadAttemptAtPosition: async (runRef, position) => {
      const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
        .withIndex('by_runRef_and_position', (query) => (
          query.eq('runRef', runRef).eq('position', position)
        )).unique()
      return attempt === null ? null : toProblemAttempt(attempt)
    },

    commitProblemReport: async (record) => {
      const { businessName, evidenceReceiptRefs, ...rest } = record
      await ctx.db.insert('customerRequestRouteProblemReports', {
        ...rest,
        evidenceReceiptRefs: [...evidenceReceiptRefs],
        ...(businessName === undefined ? {} : { businessName }),
      })
    },

    resolveBusinessProblemAuthority: async (reportRef) => (
      await resolveBusinessAuthority(ctx, reportRef)
    ),

    loadPriorBusinessClaim: async (commandKey) => {
      const prior = await ctx.db.query('customerRequestRouteProblemBusinessReports')
        .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
      return prior === null ? null : toPriorBusinessClaim(prior)
    },

    commitBusinessClaim: async (record) => {
      await ctx.db.insert('customerRequestRouteProblemBusinessReports', {
        ...record,
        evidenceReceiptRefs: [...record.evidenceReceiptRefs],
      })
    },

    resolveSupportAnnotateAuthority: async () => {
      const authority = await resolveAdminAuthority(
        { db: ctx.db, auth: ctx.auth },
        'annotate_triage',
      )
      if (authority.kind === 'denied') {
        return {
          kind: 'refused' as const,
          reason: authority.reason === 'missing_membership'
            ? 'authentication_required' as const
            : 'authority_denied' as const,
        }
      }
      return {
        kind: 'allowed' as const,
        actorRef: authority.membership.clerkUserId,
      }
    },

    loadProblemReportRef: async (reportRef) => {
      const report = await ctx.db.query('customerRequestRouteProblemReports')
        .withIndex('by_reportRef', (query) => query.eq('reportRef', reportRef)).unique()
      if (report === null) return null
      return {
        reportRef: report.reportRef,
        requestId: report.requestId,
        principalId: report.principalId,
      }
    },

    loadPriorProblemUpdate: async (commandKey) => {
      const prior = await ctx.db.query('customerRequestRouteProblemUpdates')
        .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
      return prior === null ? null : toPriorProblemUpdate(prior)
    },

    loadProblemUpdateRows: async (reportRef) => {
      const updates = await loadProblemUpdates(evidenceLoadPorts(ctx), reportRef)
      return updates as readonly ProblemUpdateRow[]
    },

    commitProblemUpdate: async (record) => {
      await ctx.db.insert('customerRequestRouteProblemUpdates', { ...record })
    },
  }
}

export function problemSupportReadPorts(ctx: DbCtx): ProblemSupportReadPorts {
  return {
    now: () => Date.now(),

    loadSupportExportMaterial: async (reportRef) => (
      await loadSupportExportMaterial(ctx, reportRef)
    ),
  }
}

async function loadSupportExportMaterial(
  ctx: DbCtx,
  reportRef: string,
): Promise<SupportProblemExportMaterial | null> {
  const problem = await ctx.db.query('customerRequestRouteProblemReports')
    .withIndex('by_reportRef', (query) => query.eq('reportRef', reportRef)).unique()
  if (problem === null) return null
  const attemptRef = problem.attemptRef
  const mandateRef = problem.mandateRef
  const ports = evidenceLoadPorts(ctx)
  const [mandateIssue, run] = await Promise.all([
    mandateRef === undefined
      ? null
      : ctx.db.query('customerRequestRouteMandateIssues')
        .withIndex('by_mandateRef', (query) => query.eq('mandateRef', mandateRef)).unique(),
    ctx.db.query('customerRequestRouteRuns')
      .withIndex('by_runRef', (query) => query.eq('runRef', problem.runRef)).unique(),
  ])
  const [updates, businessReports, attempt, requestRevisionRow, revocation,
    reservations, attempts] = await Promise.all([
    loadProblemUpdates(ports, problem.reportRef),
    loadProblemBusinessReports(ports, problem.reportRef),
    attemptRef === undefined
      ? null
      : ctx.db.query('customerRequestRouteStepAttempts')
        .withIndex('by_attemptRef', (query) => query.eq('attemptRef', attemptRef)).unique(),
    mandateIssue === null
      ? undefined
      : ctx.db.query('customerRequestV2Revisions')
        .withIndex('by_requestId_and_requestRevision', (query) => (
          query.eq('requestId', problem.requestId)
            .eq('requestRevision', mandateIssue.mandate.request.requestRevision)
        )).unique(),
    mandateRef === undefined
      ? null
      : ctx.db.query('customerRequestRouteMandateRevocations')
        .withIndex('by_mandateRef', (query) => query.eq('mandateRef', mandateRef)).first(),
    mandateRef === undefined || mandateIssue === null
      ? []
      : ctx.db.query('customerRequestRouteStepReservations')
        .withIndex('by_mandateRef_and_recordedAt', (query) => query.eq('mandateRef', mandateRef))
        .order('asc')
        .take(mandateIssue.mandate.route.steps.length + 1),
    run === null
      ? []
      : ctx.db.query('customerRequestRouteStepAttempts')
        .withIndex('by_runRef_and_position', (query) => query.eq('runRef', problem.runRef))
        .order('asc')
        .take(run.totalSteps + 1),
  ])
  if (attempt !== null && !routeAttemptIntegrityValid(attempt)) {
    throw new Error('customer_request_route_problem_attempt_integrity_failure')
  }
  if (mandateIssue !== null && reservations.length > mandateIssue.mandate.route.steps.length) {
    throw new Error('customer_request_route_step_budget_integrity_failure')
  }
  if (run !== null && attempts.length > run.totalSteps) {
    throw new Error('customer_request_route_run_attempt_integrity_failure')
  }
  const requestRevision = requestRevisionRow ?? undefined
  if (run === null) {
    throw new Error('customer_request_route_problem_reconstruction_integrity_failure')
  }
  const businessNames = new Map<string, string>()
  if (problem.mandateRef !== undefined && mandateIssue !== null) {
    for (const step of mandateIssue.mandate.route.steps) {
      const business = await ctx.db.get(step.businessId as Id<'businesses'>)
      if (business === null) throw new Error('customer_request_route_problem_business_integrity_failure')
      businessNames.set(step.businessId, business.name)
    }
  }
  return {
    problem,
    updates,
    businessReports,
    attempt,
    requestRevision,
    mandateIssue,
    run,
    revocation,
    reservations,
    attempts,
    businessNames,
  }
}

async function resolveBusinessAuthority(
  ctx: MutationCtx,
  reportRef: string,
): Promise<BusinessProblemAuthority> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    return { kind: 'refused', reason: 'authentication_required' }
  }
  const report = await ctx.db.query('customerRequestRouteProblemReports')
    .withIndex('by_reportRef', (query) => query.eq('reportRef', reportRef)).unique()
  if (report === null) {
    return { kind: 'refused', reason: 'report_not_found' }
  }
  const attemptRef = report.attemptRef
  if (attemptRef === undefined) {
    return { kind: 'refused', reason: 'report_not_found' }
  }
  if ((report.visibility ?? 'customer_and_ae_only') !== 'share_with_affected_business') {
    return { kind: 'refused', reason: 'sharing_not_authorized' }
  }
  const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
    .withIndex('by_attemptRef', (query) => query.eq('attemptRef', attemptRef)).unique()
  if (attempt === null || report.attemptRef === undefined
    || attempt.requestId !== report.requestId || attempt.position !== report.step
    || !routeAttemptIntegrityValid(attempt)) {
    throw new Error('customer_request_route_problem_attempt_integrity_failure')
  }
  const business = await ctx.db.get(attempt.grant.step.businessId as Id<'businesses'>)
  const owner = business === null ? null : await ctx.db.get(business.ownerId)
  if (business === null || owner === null || owner.clerkUserId !== identity.subject) {
    return { kind: 'refused', reason: 'authority_denied' }
  }
  return {
    kind: 'allowed',
    report: {
      reportRef: report.reportRef,
      requestId: report.requestId,
      step: report.step,
      attemptRef: report.attemptRef,
      visibility: (report.visibility ?? 'customer_and_ae_only') as ProblemVisibility,
    },
    attempt: toProblemAttempt(attempt),
    business: { id: String(business._id), name: business.name },
    actorRef: identity.tokenIdentifier,
  }
}

function toPriorProblemReport(
  prior: Doc<'customerRequestRouteProblemReports'>,
): PriorProblemReport {
  return {
    commandDigest: prior.commandDigest,
    reportRef: prior.reportRef,
    createdAt: prior.createdAt,
    ...(prior.step === undefined ? {} : { step: prior.step }),
    ...(prior.attemptRef === undefined ? {} : { attemptRef: prior.attemptRef }),
    ...(prior.businessName === undefined ? {} : { businessName: prior.businessName }),
    ...(prior.evidenceReceiptRefs === undefined
      ? {}
      : { evidenceReceiptRefs: prior.evidenceReceiptRefs }),
    ...(prior.visibility === undefined
      ? {}
      : { visibility: prior.visibility as ProblemVisibility }),
  }
}

function toProblemRun(run: Doc<'customerRequestRouteRuns'>): ProblemRunSnapshot {
  return {
    principalId: run.principalId,
    currentPosition: run.currentPosition,
    totalSteps: run.totalSteps,
    mandateRef: run.mandateRef,
    ...(run.businesses === undefined ? {} : {
      businesses: run.businesses.map((business) => ({ name: business.name })),
    }),
  }
}

function toProblemAttempt(
  attempt: Doc<'customerRequestRouteStepAttempts'>,
): ProblemAttemptSnapshot {
  return {
    runRef: attempt.runRef,
    requestId: attempt.requestId,
    mandateRef: attempt.mandateRef,
    actionId: attempt.actionId,
    position: attempt.position,
    operationKeyDigest: attempt.operationKeyDigest,
    grant: { grantDigest: attempt.grant.grantDigest },
    inputDigest: attempt.inputDigest,
    createdAt: attempt.createdAt,
    attemptDigest: attempt.attemptDigest,
    attemptRef: attempt.attemptRef,
    inputJson: attempt.inputJson,
    ...(attempt.outputJson === undefined ? {} : { outputJson: attempt.outputJson }),
    ...(attempt.outputDigest === undefined ? {} : { outputDigest: attempt.outputDigest }),
    ...(attempt.transportObservationJson === undefined
      ? {}
      : { transportObservationJson: attempt.transportObservationJson }),
    ...(attempt.transportObservationDigest === undefined
      ? {}
      : { transportObservationDigest: attempt.transportObservationDigest }),
    ...(attempt.evidence === undefined ? {} : { evidence: attempt.evidence }),
  }
}

function toPriorBusinessClaim(
  prior: Doc<'customerRequestRouteProblemBusinessReports'>,
): PriorBusinessClaim {
  return {
    commandDigest: prior.commandDigest,
    statementRef: prior.statementRef,
    reportRef: prior.reportRef,
    businessName: prior.businessName,
    causalityPosition: prior.causalityPosition,
    statement: prior.statement,
    evidenceReceiptRefs: prior.evidenceReceiptRefs,
    createdAt: prior.createdAt,
  }
}

function toPriorProblemUpdate(
  prior: Doc<'customerRequestRouteProblemUpdates'>,
): PriorProblemUpdate {
  return {
    commandDigest: prior.commandDigest,
    reportRef: prior.reportRef,
    version: prior.version,
    state: prior.state,
    createdAt: prior.createdAt,
  }
}
