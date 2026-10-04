import { assertFinancialEnvironment, financialEnvironmentValue, type FinancialEnvironment } from '../formance/contracts'
import { makeFunctionReference } from 'convex/server'
import { v, type Infer } from 'convex/values'
import { z } from 'zod'
import type { ActionCtx, MutationCtx, QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { isRecord } from '../../../../src/modules/common/is-record'
import { stableStringify, type StableHashValue } from '../../../../src/modules/common/stable-hash'
import { enqueueDocumentRender } from './workpool'

const readStatementFinalizationRef = makeFunctionReference<'query', { documentRef: string }, {
  documentRef: string; accountRef: string; residualUnits: string; policyDigest: string; snapshotDigest: string; expectedEnvironment: FinancialEnvironment; adjustmentAllowed: boolean
} | null>('moneyDocuments:readStatementFinalization')
const bookBuyerAdjustmentRef = makeFunctionReference<'action', {
  documentRef: string; accountRef: string; residualUnits: string; policyDigest: string; snapshotDigest: string; expectedEnvironment: FinancialEnvironment
}, { kind: 'completed'; transactionRefs: string[]; replayed: boolean }
  | { kind: 'refused'; code: string; retryable: false }
  | { kind: 'unavailable'; code: string; submissionProvenAbsent: true }
  | { kind: 'outcome_unknown'; reference: string; statusRef: string }>('moneyFormance:bookBuyerAdjustment')
const queueStatementRenderRef = makeFunctionReference<'mutation', {
  documentRef: string; adjustmentTransactionRefs: string[]
}, { kind: 'advanced' | 'replayed' | 'refused' }>('moneyDocuments:queueStatementRender')

const unapprovedPolicyContext = z.strictObject({
  format: z.literal('ae.money-statement-policy-context:v1'),
  kind: z.literal('not_admitted'),
  environment: z.enum(['sandbox', 'production']),
  observedAt: z.number().int().nonnegative(),
  refusalCode: z.string().min(1),
  family: z.string().min(1).optional(),
  missingFamilies: z.array(z.string().min(1)).optional(),
})

function readUnapprovedPolicyContext(row: Doc<'moneyDocuments'>) {
  if (row.policyRefs.length > 0) return undefined
  const input: unknown = JSON.parse(row.renderInputJson)
  const context = unapprovedPolicyContext.parse(isRecord(input) ? input.policyAdmission : undefined)
  if (canonicalDigest(input) !== row.renderInputDigest || canonicalDigest(context) !== row.policyDigest
    || context.environment !== row.environment || context.observedAt !== row.snapshotCutoffAt) {
    throw new Error('statement_policy_context_invalid')
  }
  return {
    format: context.format,
    kind: context.kind,
    environment: context.environment,
    observedAt: context.observedAt,
    refusalCode: context.refusalCode,
    ...(context.family === undefined ? {} : { family: context.family }),
    ...(context.missingFamilies === undefined ? {} : { missingFamilies: context.missingFamilies }),
  } as const
}

export const readStatementFinalizationArgs = v.object({ documentRef: v.string() })
export const readStatementFinalizationResult = v.union(v.null(), v.object({
    documentRef: v.string(),
    expectedEnvironment: financialEnvironmentValue,
    accountRef: v.string(),
    residualUnits: v.string(),
    policyDigest: v.string(),
    snapshotDigest: v.string(),
    adjustmentAllowed: v.boolean(),
  }))
export const readStatementFinalizationHandler = async (ctx: QueryCtx, args: Infer<typeof readStatementFinalizationArgs>) => {
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || row.state !== 'adjusting'
      || (row.kind !== 'statement' && row.kind !== 'daily_close' && row.kind !== 'monthly_usage')) return null
    const policyAdmission = readUnapprovedPolicyContext(row)
    return {
      adjustmentAllowed: row.kind!=='monthly_usage' && policyAdmission === undefined,
      documentRef: row.documentRef,
      expectedEnvironment: row.environment,
      accountRef: row.accountRef,
      residualUnits: row.residualUnits,
      policyDigest: row.policyDigest,
      snapshotDigest: row.snapshotDigest,
    }
  }

export const queueStatementRenderArgs = v.object({ documentRef: v.string(), adjustmentTransactionRefs: v.array(v.string()) })
export const queueStatementRenderResult = v.object({ kind: v.union(v.literal('advanced'), v.literal('replayed'), v.literal('refused')) })
export const queueStatementRenderHandler = async (ctx: MutationCtx, args: Infer<typeof queueStatementRenderArgs>) => {
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || (row.kind !== 'statement' && row.kind !== 'daily_close' && row.kind !== 'monthly_usage')) {
      return { kind: 'refused' as const }
    }
    assertFinancialEnvironment(row.environment)
    if (row.state === 'rendering' || row.state === 'awaiting_signature' || row.state === 'issued') {
      return { kind: 'replayed' as const }
    }
    if (row.state !== 'adjusting') return { kind: 'refused' as const }
    const policyAdmission = readUnapprovedPolicyContext(row)
    if (policyAdmission !== undefined && row.residualUnits !== '0') {
      await ctx.db.patch(row._id, { state: 'failed', failureCode: 'statement_adjustment_requires_approved_policy' })
      return { kind: 'refused' as const }
    }
    if (args.adjustmentTransactionRefs.length > 1
      || (row.residualUnits === '0') !== (args.adjustmentTransactionRefs.length === 0)
      || row.periodStart === undefined
      || row.periodEnd === undefined
      || row.snapshotCutoffAt === undefined) return { kind: 'refused' as const }
    if(row.kind==='monthly_usage' && (row.residualUnits!=='0'||args.adjustmentTransactionRefs.length!==0))return {kind:'refused' as const}
    const monthly=row.kind==='monthly_usage'?{monthlyCloseRef:row.monthlyCloseRef,usageReportRef:row.usageReportRef,usageReportDigest:row.usageReportDigest}:undefined
    if(monthly!==undefined&&(monthly.monthlyCloseRef===undefined||monthly.usageReportRef===undefined||monthly.usageReportDigest===undefined))return {kind:'refused' as const}
    const sourceTransactionRefs = [...row.sourceTransactionRefs, ...args.adjustmentTransactionRefs].slice(0, 32)
    const renderInput = {
      format: 'ae.money-document-render-input:v3',
      documentRef: row.documentRef,
      accountRef: row.accountRef,
      kind: row.kind,
      environment: row.environment,
      currency: 'AUD',
      exponent: 6,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      snapshotCutoffAt: row.snapshotCutoffAt,
      exactCallUnits: row.exactAmountUnits ?? '0',
      roundedCallUnits: row.amountUnits,
      residualUnits: row.residualUnits,
      sourceCount: row.sourceCount,
      adjustmentTransactionRefs: args.adjustmentTransactionRefs,
      ...(monthly===undefined?{}:{monthlyCloseRef:monthly.monthlyCloseRef,usageReportRef:monthly.usageReportRef,usageReportDigest:monthly.usageReportDigest,monthlyEvidence:JSON.parse(row.renderInputJson) as StableHashValue}),
      snapshotDigest: row.snapshotDigest,
      policyRefs: row.policyRefs,
      policyDigest: row.policyDigest,
      ...(policyAdmission === undefined ? {} : { policyAdmission }),
    } as const satisfies StableHashValue
    const workId = await enqueueDocumentRender(ctx, row.documentRef)
    await ctx.db.patch(row._id, {
      sourceTransactionRefs,
      renderInputJson: stableStringify(renderInput),
      renderInputDigest: canonicalDigest(renderInput),
      state: 'rendering',
      workId,
    })
    return { kind: 'advanced' as const }
  }

export const finalizeStatementArgs = v.object({ documentRef: v.string() })
export const finalizeStatementResult = v.object({ kind: v.literal('advanced') })
export const finalizeStatementHandler = async (ctx: ActionCtx, args: Infer<typeof finalizeStatementArgs>): Promise<{ kind: 'advanced' }> => {
    const input = await ctx.runQuery(readStatementFinalizationRef, args)
    if (input === null) return { kind: 'advanced' as const }
    assertFinancialEnvironment(input.expectedEnvironment)
    const { adjustmentAllowed, ...bookingInput } = input
    if (!adjustmentAllowed && input.residualUnits !== '0') {
      // Persist a specific refusal without a ledger call or a retry that could
      // borrow later approval. The frozen report remains visible to its owner.
      await ctx.runMutation(queueStatementRenderRef, { documentRef: input.documentRef, adjustmentTransactionRefs: [] })
      return { kind: 'advanced' as const }
    }
    let adjustmentTransactionRefs: string[] = []
    if (input.residualUnits !== '0') {
      const result = await ctx.runAction(bookBuyerAdjustmentRef, bookingInput)
      if (result.kind !== 'completed') {
        throw new Error(result.kind === 'outcome_unknown' ? 'document_adjustment_outcome_unknown' : result.code)
      }
      adjustmentTransactionRefs = result.transactionRefs
    }
    const queued = await ctx.runMutation(queueStatementRenderRef, {
      documentRef: input.documentRef,
      adjustmentTransactionRefs,
    })
    if (queued.kind === 'refused') throw new Error('money_document_finalize_conflict')
    return { kind: 'advanced' as const }
  }
