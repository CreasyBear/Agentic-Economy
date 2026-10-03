import { v, type Infer } from 'convex/values'
import { makeFunctionReference } from 'convex/server'

import type { Doc } from '../../../_generated/dataModel'
import { env, type MutationCtx, type QueryCtx } from '../../../_generated/server'
import { deploymentPaymentEnvironment } from '../../../../src/lib/deployment/environment'
import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import {
  AUSTRALIAN_INVOICE_SELLER, COMMERCIAL_POLICY_FAMILIES, admitTaxInvoiceIssuance,
  evaluateCommercialPolicyGate, parseTaxDocumentSnapshot, taxDocumentNumber,
  validCommercialPolicyControl, validProductionCommercialPolicyControl, type TaxDocumentSnapshot, type TaxInvoiceSnapshot,
} from '../../../../src/modules/money/public'
import { requireStripeAccountContext } from '../customer/authority'
import { createAndQueueDocument } from './insert'
import { enqueueDocumentRender } from './workpool'

type ReadCtx = Pick<QueryCtx, 'db'>
type FundingCommand = Doc<'moneyFundingCommands'>
type TaxPolicy = Doc<'moneyCommercialPolicies'> & {
  control: Extract<Doc<'moneyCommercialPolicies'>['control'], { family: 'tax' }>
}

export const fundingTaxDocumentStatusValue = v.union(
  v.object({ kind: v.literal('issued'), documentRef: v.string(), documentNumber: v.string(), issuedAt: v.number() }),
  v.object({ kind: v.literal('rendering'), documentRef: v.string(), documentNumber: v.string() }),
  v.object({ kind: v.literal('retryable'), documentRef: v.string(), documentNumber: v.string() }),
  v.object({ kind: v.literal('ready') }),
  v.object({ kind: v.literal('withheld'), reason: v.string() }),
)
export const issueFundingTaxInvoiceResult = v.object({
  taxInvoice: fundingTaxDocumentStatusValue,
  adjustmentNote: v.optional(fundingTaxDocumentStatusValue),
})
export const issueOwnerFundingTaxInvoiceArgs = v.object({ commandRef: v.string() })
export const issueFundingTaxInvoiceArgs = v.object({ commandRef: v.string(), sourceTransactionRef: v.string() })
type DocumentStatus = Infer<typeof fundingTaxDocumentStatusValue>
type IssuanceResult = Infer<typeof issueFundingTaxInvoiceResult>
type Withheld = Extract<DocumentStatus, { kind: 'withheld' }>
const withheld = (reason: string): Withheld => ({ kind: 'withheld', reason })

const issueFundingTaxInvoiceRef = makeFunctionReference<'mutation', Infer<typeof issueFundingTaxInvoiceArgs>, IssuanceResult>(
  'moneyDocuments:issueFundingTaxInvoice',
)

/** The scheduler write commits with the settlement/refund event. Its handler reads
 * the completed source transaction, so it never treats a pending command as paid.
 * COMPLEXITY: one existing scheduler hop buys an after-commit source read for the
 * two funding event callers. Rendering still uses the existing document Workpool;
 * no second lifecycle, callback loop, queue service or invoice store is introduced. */
export async function scheduleFundingTaxInvoice(
  ctx: MutationCtx, commandRef: string, sourceTransactionRef: string,
): Promise<void> {
  await ctx.scheduler.runAfter(0, issueFundingTaxInvoiceRef, { commandRef, sourceTransactionRef })
}

function policyEvidence(policy: TaxPolicy): TaxInvoiceSnapshot['issuanceApproval'] {
  return {
    policyRef: policy.policyRef, revision: policy.revision, evidenceRef: policy.evidenceRef,
    evidenceDigest: policy.evidenceDigest, approvedByPrincipalRef: policy.approvedByPrincipalRef,
  }
}

async function issuancePolicy(ctx: ReadCtx, environment: FundingCommand['environment'], now: number): Promise<TaxPolicy | Withheld> {
  const rows = await ctx.db.query('moneyCommercialPolicies')
    .withIndex('by_environment_and_family_and_lifecycle', q => q.eq('environment', environment).eq('family', 'tax').eq('lifecycle', 'active'))
    .take(2)
  const policy = rows[0]
  if (rows.length > 1) return withheld('tax_policy_conflict')
  if (policy === undefined || policy.control.family !== 'tax'
    || !validCommercialPolicyControl(policy.control)
    || (environment === 'production' && !validProductionCommercialPolicyControl(policy.control))) return withheld('policy_disabled')
  if (policy.effectiveAt > now || policy.activatedAt > now) return withheld('tax_policy_not_effective')
  if (policy.expiresAt <= now) return withheld('tax_policy_expired')
  if (policy.control.taxInvoiceIssuance !== 'enabled') return withheld('policy_disabled')
  return { ...policy, control: policy.control }
}

async function originalTaxPolicy(ctx: ReadCtx, command: FundingCommand): Promise<TaxPolicy | Withheld> {
  // Original approval rows are retained after replacement. Reconstruct their
  // recorded digest at reservation time, never read today's rate as history.
  if (command.environment !== 'production' || command.commercialPolicyRefs.length !== COMMERCIAL_POLICY_FAMILIES.length) {
    return withheld('original_policy_unavailable')
  }
  const rows = await Promise.all(command.commercialPolicyRefs.map(policyRef => ctx.db.query('moneyCommercialPolicies')
    .withIndex('by_policyRef', q => q.eq('policyRef', policyRef)).unique()))
  const policies: Doc<'moneyCommercialPolicies'>[] = []
  for (const family of COMMERCIAL_POLICY_FAMILIES) {
    const matches = rows.filter(row => row !== null && row.family === family)
    const policy = matches[0]
    if (matches.length !== 1 || policy === undefined || policy === null
      || policy.environment !== command.environment || policy.activatedAt > command.createdAt
      || (policy.suspendedAt !== undefined && policy.suspendedAt <= command.createdAt)) {
      return withheld('original_policy_unavailable')
    }
    policies.push(policy)
  }
  const original = evaluateCommercialPolicyGate({
    environment: command.environment, now: command.createdAt,
    approvals: policies.map(policy => ({ ...policy, lifecycle: 'active' as const })),
  })
  if (original.kind !== 'admitted' || original.policyDigest !== command.commercialPolicyDigest) {
    return withheld('original_policy_unavailable')
  }
  const tax = policies.find(policy => policy.family === 'tax')
  if (tax === undefined || tax.control.family !== 'tax') return withheld('original_policy_unavailable')
  // This implementation supports only the approved Australian top-up basis.
  // A zero/different rate does not tell us whether a supply was GST-free, input
  // taxed or misconfigured, so it cannot manufacture a historical classification.
  if (tax.control.serviceFeeTaxBps !== 1_000 || original.controls.tax.callTaxBps !== 0) {
    return withheld('original_tax_treatment_unsupported')
  }
  return { ...tax, control: tax.control }
}

async function confirmedFundingSource(ctx: ReadCtx, command: FundingCommand): Promise<TaxInvoiceSnapshot['source'] | Withheld> {
  if ((command.state !== 'succeeded' && command.state !== 'reversed')
    || command.appliedTransactionRef === undefined || command.appliedStripeEventId === undefined
    || command.paymentId === undefined || command.evidenceDigest === undefined) return withheld('source_event_unconfirmed')
  const appliedStripeEventId = command.appliedStripeEventId
  const event = await ctx.db.query('moneyStripeEvents')
    .withIndex('by_stripeEventId', q => q.eq('stripeEventId', appliedStripeEventId)).unique()
  if (event === null || event.status !== 'applied' || event.appliedAt === undefined
    || event.appliedRef !== command.appliedTransactionRef || event.commandRef !== command.commandRef
    || event.paymentId !== command.paymentId || event.checkoutStatus !== 'paid'
    || event.payloadDigest !== command.appliedPayloadDigest || event.currency !== 'AUD'
    || event.exponent !== 6 || event.amountUnits !== command.totalUnits) return withheld('source_event_unconfirmed')
  return {
    commandRef: command.commandRef, transactionRef: command.appliedTransactionRef,
    eventRef: command.appliedStripeEventId, occurredAt: event.appliedAt,
    evidenceDigest: command.evidenceDigest, inputDigest: command.inputDigest,
    policyRefs: command.commercialPolicyRefs, policyDigest: command.commercialPolicyDigest,
  }
}

async function prepareInvoice(ctx: ReadCtx, command: FundingCommand, now: number): Promise<TaxInvoiceSnapshot | Withheld> {
  const source = await confirmedFundingSource(ctx, command)
  if ('kind' in source) return source
  const original = await originalTaxPolicy(ctx, command)
  if ('kind' in original) return original
  const approval = await issuancePolicy(ctx, command.environment, now)
  if ('kind' in approval) return approval
  if (!Number.isSafeInteger(source.occurredAt) || source.occurredAt < 0 || source.occurredAt > 8_640_000_000_000_000) {
    return withheld('original_tax_facts_invalid')
  }
  if (new Date(source.occurredAt).toISOString().slice(0, 10) < AUSTRALIAN_INVOICE_SELLER.gstEffectiveDate) {
    return withheld('seller_registration_not_effective')
  }
  const facts = await ctx.db.query('moneyCustomerTaxFacts')
    .withIndex('by_accountRef', q => q.eq('accountRef', command.accountRef)).unique()
  if (facts !== null && facts.legalCustomerRef !== command.legalCustomerRef) return withheld('customer_identity_mismatch')
  const admission = admitTaxInvoiceIssuance({
    taxControl: approval.control, totalUnits: command.totalUnits,
    ...(facts === null ? {} : { customerTaxFacts: facts }),
  })
  if (admission.kind === 'withheld') return admission
  const documentRef = `money-document:tax_invoice:${source.transactionRef}`
  const netUnits = /^\d{1,30}$/u.test(command.principalUnits) && /^\d{1,30}$/u.test(command.serviceFeeUnits)
    ? (BigInt(command.principalUnits) + BigInt(command.serviceFeeUnits)).toString() : 'invalid'
  const snapshot = parseTaxDocumentSnapshot({
    format: 'ae.tax-document:v1', kind: 'tax_invoice', documentRef,
    documentNumber: taxDocumentNumber(documentRef, 'tax_invoice'),
    accountRef: command.accountRef, legalCustomerRef: command.legalCustomerRef,
    environment: command.environment, currency: 'AUD', exponent: 6, issuedAt: now,
    seller: AUSTRALIAN_INVOICE_SELLER,
    customer: facts === null || (!facts.legalName?.trim() && !facts.abn) ? { kind: 'not_recorded', legalCustomerRef: command.legalCustomerRef } : {
      kind: 'identified', legalCustomerRef: facts.legalCustomerRef,
      legalName: facts.legalName?.trim() || null, abn: facts.abn || null,
      addressLines: [facts.addressLine1, facts.addressLine2,
        [facts.locality, facts.region, facts.postalCode].filter(Boolean).join(' '), facts.country]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
      revision: facts.revision ?? 0, effectiveAt: facts.effectiveAt,
    },
    source,
    tax: { basis: 'funding_principal_plus_service_fee', rateBps: 1_000,
      rounding: 'nearest_cent_half_up', originalApproval: policyEvidence(original) },
    issuanceApproval: policyEvidence(approval),
    supply: { description: 'Account credit top-up and service fee', quantity: 1,
      principalUnits: command.principalUnits, serviceFeeUnits: command.serviceFeeUnits,
      netUnits, gstUnits: command.taxUnits, totalUnits: command.totalUnits },
  })
  return snapshot?.kind === 'tax_invoice' ? snapshot : withheld('original_tax_facts_invalid')
}

function storedSnapshot(row: Doc<'moneyDocuments'>, command: FundingCommand): TaxDocumentSnapshot | undefined {
  try {
    const snapshot = parseTaxDocumentSnapshot(JSON.parse(row.renderInputJson))
    if (snapshot === undefined || row.accountRef !== command.accountRef || row.environment !== command.environment
      || snapshot.accountRef !== command.accountRef
      || snapshot.environment !== command.environment || snapshot.legalCustomerRef !== command.legalCustomerRef
      || snapshot.documentRef !== row.documentRef || snapshot.kind !== row.kind
      || snapshot.source.commandRef !== command.commandRef || snapshot.source.transactionRef !== command.appliedTransactionRef
      || snapshot.supply.principalUnits !== command.principalUnits || snapshot.supply.serviceFeeUnits !== command.serviceFeeUnits
      || snapshot.supply.gstUnits !== command.taxUnits || snapshot.supply.totalUnits !== command.totalUnits
      || snapshot.source.inputDigest !== command.inputDigest || snapshot.source.policyDigest !== command.commercialPolicyDigest
      || snapshot.source.eventRef !== command.appliedStripeEventId || snapshot.source.evidenceDigest !== command.evidenceDigest
      || canonicalDigest(snapshot) !== row.renderInputDigest) return undefined
    return snapshot
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'storedTaxInvoice', reason: 'invalid_response' })
  }
}

function documentStatus(row: Doc<'moneyDocuments'>, snapshot: TaxDocumentSnapshot): DocumentStatus {
  const identity = { documentRef: row.documentRef, documentNumber: snapshot.documentNumber }
  const complete = row.fileId !== undefined && row.csvFileId !== undefined
    && row.fileDigest !== undefined && row.csvFileDigest !== undefined
  if (row.state === 'issued' && complete) return { kind: 'issued', ...identity, issuedAt: snapshot.issuedAt }
  if (row.state === 'rendering') return { kind: 'rendering', ...identity }
  if (row.state === 'failed' && row.fileId === undefined && row.csvFileId === undefined) return { kind: 'retryable', ...identity }
  return withheld('document_integrity_failed')
}

async function readInvoice(ctx: ReadCtx, command: FundingCommand) {
  if (command.appliedTransactionRef === undefined) return null
  return await ctx.db.query('moneyDocuments').withIndex('by_documentRef', q =>
    q.eq('documentRef', `money-document:tax_invoice:${command.appliedTransactionRef}`)).unique()
}

async function prepareAdjustment(
  ctx: ReadCtx, command: FundingCommand, invoice: TaxInvoiceSnapshot, originalDigest: string, now: number,
): Promise<Extract<TaxDocumentSnapshot, { kind: 'adjustment' }> | Withheld> {
  if (command.state !== 'reversed' || command.reversalState !== 'succeeded'
    || command.reversalTransactionRef === undefined || command.reversalRefundId === undefined
    || command.reversalStripeEventId === undefined || command.reversalEvidenceDigest === undefined
    || command.reversedAt === undefined) return withheld('refund_event_unconfirmed')
  const reversalStripeEventId = command.reversalStripeEventId
  const event = await ctx.db.query('moneyStripeEvents')
    .withIndex('by_stripeEventId', q => q.eq('stripeEventId', reversalStripeEventId)).unique()
  if (event === null || event.status !== 'applied' || event.refundStatus !== 'succeeded'
    || event.commandRef !== undefined || event.sessionId !== undefined
    || event.appliedAt !== command.reversedAt || event.chargeId !== command.reversalChargeId
    || event.appliedRef !== command.reversalTransactionRef || event.paymentId !== command.paymentId
    || event.providerObjectId !== command.reversalRefundId || event.currency !== 'AUD'
    || event.exponent !== 6 || event.amountUnits !== invoice.supply.totalUnits) return withheld('refund_event_unconfirmed')
  const approval = await issuancePolicy(ctx, command.environment, now)
  if ('kind' in approval) return approval
  const documentRef = `money-document:tax-adjustment:${command.reversalTransactionRef}`
  const snapshot = parseTaxDocumentSnapshot({
    ...invoice, kind: 'adjustment', documentRef, documentNumber: taxDocumentNumber(documentRef, 'adjustment'),
    issuedAt: now, issuanceApproval: policyEvidence(approval),
    original: { documentRef: invoice.documentRef, documentNumber: invoice.documentNumber,
      issuedAt: invoice.issuedAt, renderInputDigest: originalDigest },
    refund: { refundRef: command.reversalRefundId, transactionRef: command.reversalTransactionRef,
      eventRef: command.reversalStripeEventId, occurredAt: command.reversedAt,
      evidenceDigest: command.reversalEvidenceDigest, reason: 'Full refund of account credit top-up and service fee' },
  })
  return snapshot?.kind === 'adjustment' ? snapshot : withheld('original_tax_facts_invalid')
}

async function readAdjustment(
  ctx: ReadCtx, command: FundingCommand, invoice: TaxInvoiceSnapshot, originalDigest: string, now: number,
): Promise<{ row: Doc<'moneyDocuments'> | null; snapshot: Extract<TaxDocumentSnapshot, { kind: 'adjustment' }> } | Withheld> {
  if (command.reversalTransactionRef === undefined) return withheld('refund_event_unconfirmed')
  const row = await ctx.db.query('moneyDocuments').withIndex('by_documentRef', q =>
    q.eq('documentRef', `money-document:tax-adjustment:${command.reversalTransactionRef}`)).unique()
  if (row !== null) {
    const snapshot = storedSnapshot(row, command)
    if (snapshot?.kind !== 'adjustment' || snapshot.original.documentRef !== invoice.documentRef
      || snapshot.original.renderInputDigest !== originalDigest || snapshot.refund.transactionRef !== command.reversalTransactionRef
      || snapshot.refund.refundRef !== command.reversalRefundId
      || snapshot.refund.eventRef !== command.reversalStripeEventId
      || snapshot.refund.evidenceDigest !== command.reversalEvidenceDigest
      || snapshot.refund.occurredAt !== command.reversedAt) return withheld('document_integrity_failed')
    return { row, snapshot }
  }
  const snapshot = await prepareAdjustment(ctx, command, invoice, originalDigest, now)
  return snapshot.kind === 'withheld' ? snapshot : { row: null, snapshot }
}

/** Queries report missing prerequisites without creating or repairing documents. */
export async function readFundingTaxDocuments(ctx: ReadCtx, command: FundingCommand, now: number): Promise<IssuanceResult> {
  if (command.environment !== deploymentPaymentEnvironment(env)) return { taxInvoice: withheld('environment_mismatch') }
  const row = await readInvoice(ctx, command)
  if (row === null) {
    const prepared = await prepareInvoice(ctx, command, now)
    return { taxInvoice: prepared.kind === 'withheld' ? prepared : { kind: 'ready' } }
  }
  const invoice = storedSnapshot(row, command)
  if (invoice?.kind !== 'tax_invoice') return { taxInvoice: withheld('document_integrity_failed') }
  const taxInvoice = documentStatus(row, invoice)
  if (command.state !== 'reversed') return { taxInvoice }
  if (taxInvoice.kind !== 'issued') return { taxInvoice, adjustmentNote: withheld('original_invoice_not_issued') }
  const adjustment = await readAdjustment(ctx, command, invoice, row.renderInputDigest, now)
  return { taxInvoice, adjustmentNote: 'kind' in adjustment ? adjustment
    : adjustment.row === null ? { kind: 'ready' } : documentStatus(adjustment.row, adjustment.snapshot) }
}

async function queueSnapshot(ctx: MutationCtx, snapshot: TaxDocumentSnapshot): Promise<void> {
  await createAndQueueDocument(ctx, snapshot.documentRef, () => ({
    renderInput: snapshot, accountRef: snapshot.accountRef, kind: snapshot.kind,
    sourceTransactionRef: snapshot.kind === 'adjustment' ? snapshot.refund.transactionRef : snapshot.source.transactionRef,
    amountUnits: snapshot.supply.totalUnits, policyRefs: snapshot.source.policyRefs,
    policyDigest: snapshot.source.policyDigest, environment: snapshot.environment, occurredAt: snapshot.issuedAt,
  }))
}

async function retryUnattached(ctx: MutationCtx, row: Doc<'moneyDocuments'>, snapshot: TaxDocumentSnapshot): Promise<void> {
  if (documentStatus(row, snapshot).kind !== 'retryable') return
  const workId = await enqueueDocumentRender(ctx, row.documentRef)
  await ctx.db.patch(row._id, { state: 'rendering', failureCode: undefined, workId })
}

/** Requires an authorised owner or the exact after-commit source identity.
 * Ensures one source-bound snapshot under mutation OCC; retries preserve its
 * original parties, tax, issue date and file pair. Existing snapshots do not
 * depend on today's customer profile or current tax rate. On violation return
 * a specific withheld result without changing financial or approval records. */
async function issueDocuments(ctx: MutationCtx, command: FundingCommand): Promise<IssuanceResult> {
  const now = Date.now()
  if (command.environment !== deploymentPaymentEnvironment(env)) return { taxInvoice: withheld('environment_mismatch') }
  let row = await readInvoice(ctx, command)
  let invoice: TaxInvoiceSnapshot
  if (row === null) {
    const prepared = await prepareInvoice(ctx, command, now)
    if (prepared.kind === 'withheld') return { taxInvoice: prepared }
    invoice = prepared
    await queueSnapshot(ctx, invoice)
    row = await readInvoice(ctx, command)
    if (row === null) throw new Error('tax_invoice_write_missing')
  } else {
    const snapshot = storedSnapshot(row, command)
    if (snapshot?.kind !== 'tax_invoice') return { taxInvoice: withheld('document_integrity_failed') }
    invoice = snapshot
    await retryUnattached(ctx, row, invoice)
  }
  if (command.state === 'reversed') {
    // Both frozen snapshots may render concurrently. History and downloads hide
    // the note until the referenced original has its canonical HTML/CSV pair.
    const adjustment = await readAdjustment(ctx, command, invoice, row.renderInputDigest, now)
    if (!('kind' in adjustment)) {
      if (adjustment.row === null) await queueSnapshot(ctx, adjustment.snapshot)
      else await retryUnattached(ctx, adjustment.row, adjustment.snapshot)
    }
  }
  return await readFundingTaxDocuments(ctx, command, now)
}

export async function issueOwnerFundingTaxInvoiceHandler(
  ctx: MutationCtx, args: Infer<typeof issueOwnerFundingTaxInvoiceArgs>,
): Promise<IssuanceResult> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return { taxInvoice: withheld('authentication_required') }
  const { canonicalAccountRef } = await requireStripeAccountContext(ctx.db, identity)
  const command = await ctx.db.query('moneyFundingCommands').withIndex('by_commandRef', q => q.eq('commandRef', args.commandRef)).unique()
  if (command === null || command.accountRef !== canonicalAccountRef) return { taxInvoice: withheld('funding_command_not_found') }
  return await issueDocuments(ctx, command)
}

export async function issueFundingTaxInvoiceHandler(
  ctx: MutationCtx, args: Infer<typeof issueFundingTaxInvoiceArgs>,
): Promise<IssuanceResult> {
  const command = await ctx.db.query('moneyFundingCommands').withIndex('by_commandRef', q => q.eq('commandRef', args.commandRef)).unique()
  if (command === null || (args.sourceTransactionRef !== command.appliedTransactionRef
    && args.sourceTransactionRef !== command.reversalTransactionRef)) return { taxInvoice: withheld('source_event_unconfirmed') }
  return await issueDocuments(ctx, command)
}
