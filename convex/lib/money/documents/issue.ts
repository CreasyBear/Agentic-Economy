import { v, type Infer } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { readCommercialPolicyGate } from '../../../moneyCommercialPolicy'
import { admitTaxInvoiceIssuance, AUD_EXPONENT, calculateAudGstSplit, type CustomerTaxFacts } from '../../../../src/modules/money/public'
import { createAndQueueDocument, documentEnvironment } from './insert'
import type { StableHashValue } from '../../../../src/modules/common/stable-hash'

export async function readCustomerTaxFactsForAccount(
  ctx: QueryCtx,
  accountRef: string,
): Promise<CustomerTaxFacts | undefined> {
  const row = await ctx.db.query('moneyCustomerTaxFacts')
    .withIndex('by_accountRef', (index) => index.eq('accountRef', accountRef))
    .unique()
  if (row === null) return undefined
  return Object.freeze({
    abn: row.abn,
    gstRegistered: row.gstRegistered,
    legalCustomerRef: row.legalCustomerRef,
    effectiveAt: row.effectiveAt,
  })
}

export const createOwnerTaxInvoiceArgs = v.object({
    environment: documentEnvironment,
    grossUnits: v.string(),
    sourceTransactionRef: v.string(),
  })
export const createOwnerTaxInvoiceResult = v.union(
    v.object({ kind: v.literal('created'), documentRef: v.string() }),
    v.object({ kind: v.literal('replayed'), documentRef: v.string() }),
    v.object({
      kind: v.literal('refused'),
      code: v.literal('tax_invoice_withheld'),
      reason: v.string(),
    }),
    v.object({ kind: v.literal('refused'), code: v.string() }),
  )
export const createOwnerTaxInvoiceHandler = async (ctx: MutationCtx, args: Infer<typeof createOwnerTaxInvoiceArgs>) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') {
      return { kind: 'refused' as const, code: 'authentication_required' }
    }
    if (!/^(?:0|[1-9]\d{0,77})$/u.test(args.grossUnits)
      || args.sourceTransactionRef.trim().length === 0) {
      return { kind: 'refused' as const, code: 'tax_invoice_input_invalid' }
    }
    const policy = await readCommercialPolicyGate(ctx.db, {
      environment: args.environment,
      now: Date.now(),
      ...(args.environment === 'sandbox'
        ? { sandboxFixture: 'managed_x402_deterministic_v1' as const }
        : {}),
    })
    if (policy.kind === 'refused') return { kind: 'refused' as const, code: policy.code }
    const customerTaxFacts = await readCustomerTaxFactsForAccount(ctx, actor.canonicalAccountRef)
    const admission = admitTaxInvoiceIssuance({
      taxControl: policy.controls.tax,
      ...(customerTaxFacts === undefined ? {} : { customerTaxFacts }),
    })
    if (admission.kind === 'withheld' || customerTaxFacts === undefined) {
      return {
        kind: 'refused' as const,
        code: 'tax_invoice_withheld',
        reason: admission.kind === 'withheld' ? admission.reason : 'customer_tax_facts_missing',
      }
    }
    const gstSplit = calculateAudGstSplit(args.grossUnits, policy.controls.tax.serviceFeeTaxBps)
    if (gstSplit === undefined) {
      return { kind: 'refused' as const, code: 'tax_invoice_amount_invalid' }
    }
    const documentRef = `money-document:tax_invoice:${args.sourceTransactionRef}`
    const created = await createAndQueueDocument(ctx, documentRef, () => {
      const occurredAt = Date.now()
      const renderInput = {
        format: 'ae.money-document-render-input:v2',
        documentRef,
        accountRef: actor.canonicalAccountRef,
        kind: 'tax_invoice' as const,
        currency: 'AUD',
        exponent: AUD_EXPONENT,
        grossUnits: gstSplit.grossUnits,
        netUnits: gstSplit.netUnits,
        gstUnits: gstSplit.gstUnits,
        gstBps: policy.controls.tax.serviceFeeTaxBps,
        abn: customerTaxFacts.abn,
        legalCustomerRef: customerTaxFacts.legalCustomerRef,
        transactionRef: args.sourceTransactionRef,
        occurredAt,
        policyRefs: policy.policyRefs,
        policyDigest: policy.policyDigest,
      } as const satisfies StableHashValue
      return {
        renderInput,
        accountRef: actor.canonicalAccountRef,
        kind: 'tax_invoice' as const,
        sourceTransactionRef: args.sourceTransactionRef,
        amountUnits: gstSplit.grossUnits,
        policyRefs: policy.policyRefs,
        policyDigest: policy.policyDigest,
        environment: args.environment,
        occurredAt,
      }
    })
    if (!created) return { kind: 'replayed' as const, documentRef }
    return { kind: 'created' as const, documentRef }
  }
