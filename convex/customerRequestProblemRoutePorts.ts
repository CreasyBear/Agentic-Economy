import type { ProblemRoutePorts } from '@/modules/customer-request/application/public'

import { internal } from './_generated/api'
import type { ActionCtx } from './_generated/server'
import { compareResumePorts } from './customerRequestCompareResumePorts'

export function problemRoutePorts(ctx: ActionCtx): ProblemRoutePorts {
  const compare = compareResumePorts(ctx)
  return {
    loadCurrent: compare.loadCurrent,
    reportProblem: (input) => ctx.runMutation(
      internal.customerRequestRouteExecution.reportProblem,
      {
        requestId: input.requestId,
        principalId: input.principalId,
        idempotencyKey: input.idempotencyKey,
        category: input.category,
        summary: input.summary,
        evidenceReceiptRefs: [...input.evidenceReceiptRefs],
        visibility: input.visibility,
        ...(input.affectedStep === undefined ? {} : { affectedStep: input.affectedStep }),
      },
    ) as ReturnType<ProblemRoutePorts['reportProblem']>,
    recordProblemBusinessReport: (input) => ctx.runMutation(
      internal.customerRequestRouteExecution.recordProblemBusinessReport,
      {
        reportRef: input.reportRef,
        idempotencyKey: input.idempotencyKey,
        causalityPosition: input.causalityPosition,
        statement: input.statement,
        evidenceReceiptRefs: [...input.evidenceReceiptRefs],
      },
    ) as ReturnType<ProblemRoutePorts['recordProblemBusinessReport']>,
    updateProblemStatus: (input) => ctx.runMutation(
      internal.customerRequestRouteExecution.updateProblemStatus, input,
    ) as ReturnType<ProblemRoutePorts['updateProblemStatus']>,
    replyProblem: (input) => ctx.runMutation(
      internal.customerRequestRouteExecution.replyProblem, input,
    ) as ReturnType<ProblemRoutePorts['replyProblem']>,
    exportCustomerEvidence: (input) => ctx.runQuery(
      internal.customerRequestRouteExecution.exportCustomerEvidence, input,
    ) as ReturnType<ProblemRoutePorts['exportCustomerEvidence']>,
    readProblemForBusiness: (input) => ctx.runQuery(
      internal.customerRequestRouteExecution.readProblemForBusiness, input,
    ) as ReturnType<ProblemRoutePorts['readProblemForBusiness']>,
    listProblemsForSupport: (input) => ctx.runQuery(
      internal.customerRequestRouteExecution.listProblemsForSupport, input,
    ) as ReturnType<ProblemRoutePorts['listProblemsForSupport']>,
    exportProblemForSupport: (input) => ctx.runQuery(
      internal.customerRequestRouteExecution.exportProblemForSupport, input,
    ) as ReturnType<ProblemRoutePorts['exportProblemForSupport']>,
  }
}
