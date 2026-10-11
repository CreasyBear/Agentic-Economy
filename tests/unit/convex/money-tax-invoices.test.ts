import type { FunctionArgs } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../../convex/_generated/api'
import type { ActionCtx } from '../../../convex/_generated/server'
import type { Id } from '../../../convex/_generated/dataModel'
import { renderQueuedDocument } from '../../../convex/moneyDocumentRender'
import { recordFundingDocuments } from '../../../convex/lib/money/funding/stripeEventDocuments'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  AUSTRALIAN_INVOICE_SELLER, COMMERCIAL_POLICY_FAMILIES, evaluateCommercialPolicyGate,
  parseTaxDocumentSnapshot,
} from '@/modules/money/public'
import { convexTestWithWorkers, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import { PRODUCTION_COMMERCIAL_POLICY_CONTROLS } from '../../helpers/commercial-policy-fixtures'

const now = Date.UTC(2026, 9, 3, 12)
const commandRef = 'funding:tax-invoice-test'
const transactionRef = 'formance:funding:tax-invoice-test'
const documentRef = `money-document:tax_invoice:${transactionRef}`
const refundTransactionRef = 'formance:refund:tax-invoice-test'
const adjustmentRef = `money-document:tax-adjustment:${refundTransactionRef}`
const eventRef = 'evt_tax_invoice_paid'
type Backend = ReturnType<typeof convexTestWithWorkers>
type AttachArgs = FunctionArgs<typeof internal.moneyDocuments.attachRenderedFile>
const renderDocument = (renderQueuedDocument as unknown as {
  _handler: (ctx: ActionCtx, args: { documentRef: string }) => Promise<{ kind: 'available'; fileId: Id<'_storage'> }>
})._handler

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production') })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs() })

async function fixture(options: { large?: boolean; customer?: boolean } = {}) {
  const backend = convexTestWithWorkers({ pauseWorkpool: true })
  const owner = await publishedBusinessOwner(backend, 'invoice-owner')
  const principalUnits = options.large ? '1000000000' : '5000000'
  const serviceFeeUnits = options.large ? '50000000' : '250000'
  const taxUnits = options.large ? '105000000' : '530000'
  const totalUnits = options.large ? '1155000000' : '5780000'
  await backend.run(async ctx => {
    for (const family of COMMERCIAL_POLICY_FAMILIES) {
      await ctx.db.insert('moneyCommercialPolicies', {
        policyRef: `policy:${family}:original`, family, environment: 'production', revision: 1,
        lifecycle: 'active', effectiveAt: now - 20_000, expiresAt: now + 86_400_000,
        evidenceRef: `approval:${family}`, evidenceDigest: canonicalDigest(`approval:${family}`),
        control: family === 'tax' ? { ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.tax, taxInvoiceIssuance: 'enabled' }
          : PRODUCTION_COMMERCIAL_POLICY_CONTROLS[family],
        approvedByPrincipalRef: owner.canonicalPrincipalRef, activeAccountRef: owner.canonicalAccountRef,
        authorityGeneration: 1, correlationRef: `policy:${family}`, idempotencyRef: `policy:${family}`,
        commandDigest: canonicalDigest(`command:${family}`), activatedAt: now - 20_000, updatedAt: now - 20_000,
      })
    }
    const approvals = await ctx.db.query('moneyCommercialPolicies').collect()
    const gate = evaluateCommercialPolicyGate({ environment: 'production', now: now - 10_000, approvals })
    if (gate.kind !== 'admitted') throw new Error(`fixture_policy_gate:${JSON.stringify(gate)}`)
    await ctx.db.insert('moneyFundingCommands', {
      commandRef, accountRef: owner.canonicalAccountRef, legalCustomerRef: owner.canonicalPrincipalRef,
      actorPrincipalRef: owner.canonicalPrincipalRef, environment: 'production', currency: 'AUD', exponent: 6,
      principalUnits, serviceFeeUnits, taxUnits, totalUnits,
      commercialPolicyRefs: [...gate.policyRefs], commercialPolicyDigest: gate.policyDigest,
      idempotencyKey: commandRef, inputDigest: canonicalDigest('funding-input'), successReturnRef: 'owner/credit',
      providerRecoveryDeadlineAt: now + 60_000, initiationKind: 'owner_top_up', state: 'succeeded',
      paymentId: 'pi_tax_invoice', externalRef: 'cs_tax_invoice', appliedTransactionRef: transactionRef,
      appliedStripeEventId: eventRef, appliedPayloadDigest: canonicalDigest('checkout-payload'),
      evidenceDigest: canonicalDigest('checkout-evidence'), createdAt: now - 10_000, updatedAt: now - 5_000,
    })
    await ctx.db.insert('moneyStripeEvents', {
      stripeEventId: eventRef, eventType: 'checkout.session.completed', payloadDigest: canonicalDigest('checkout-payload'),
      providerObjectId: 'cs_tax_invoice', providerObjectDigest: canonicalDigest('checkout-session'),
      commandRef, sessionId: 'cs_tax_invoice', paymentId: 'pi_tax_invoice', checkoutStatus: 'paid',
      currency: 'AUD', exponent: 6, amountUnits: totalUnits, status: 'applied',
      appliedRef: transactionRef, receivedAt: now - 5_000, appliedAt: now - 5_000,
    })
    if (options.customer !== false) await ctx.db.insert('moneyCustomerTaxFacts', {
      accountRef: owner.canonicalAccountRef, legalCustomerRef: owner.canonicalPrincipalRef,
      legalName: 'Buyer <script>alert(1)</script> Pty Ltd', abn: '51824753556', gstRegistered: false,
      addressLine1: '1 Buyer Street', country: 'AU', revision: 1, effectiveAt: now - 8_000, updatedAt: now - 8_000,
    })
  })
  return { backend, ...owner }
}

async function command(backend: Backend) {
  const row = await backend.run(ctx => ctx.db.query('moneyFundingCommands').withIndex('by_commandRef', q => q.eq('commandRef', commandRef)).unique())
  if (row === null) throw new Error('fixture_command_missing')
  return row
}
async function document(backend: Backend, ref = documentRef) {
  const row = await backend.run(ctx => ctx.db.query('moneyDocuments').withIndex('by_documentRef', q => q.eq('documentRef', ref)).unique())
  if (row === null) throw new Error('fixture_document_missing')
  return row
}
async function history(owner: Awaited<ReturnType<typeof fixture>>['owner']) {
  return (await owner.query(api.moneyAccountFunding.listOwnerInvoiceHistory, { paginationOpts: { numItems: 20, cursor: null } })).page[0]!
}
function transport(backend: Backend) {
  const store = vi.fn(async (blob: Blob) => await backend.run(ctx => ctx.storage.store(blob)))
  const remove = vi.fn(async (id: Id<'_storage'>) => await backend.run(ctx => ctx.storage.delete(id)))
  const runMutation = vi.fn(async (_ref: unknown, args: AttachArgs) => await backend.mutation(internal.moneyDocuments.attachRenderedFile, args))
  const ctx = { storage: { store, delete: remove }, runMutation,
    runQuery: async (_ref: unknown, args: { documentRef: string }) => await backend.query(internal.moneyDocuments.readQueuedForRender, args),
  } as unknown as ActionCtx
  return { ctx, store, remove, runMutation }
}
async function contents(backend: Backend, ref = documentRef) {
  const row = await document(backend, ref)
  const values = await backend.run(async ctx => {
    const html = row.fileId === undefined ? null : await ctx.storage.get(row.fileId)
    const csv = row.csvFileId === undefined ? null : await ctx.storage.get(row.csvFileId)
    return { html: await html?.text(), csv: await csv?.text() }
  })
  expect(canonicalDigest(values.html!)).toBe(row.fileDigest)
  expect(canonicalDigest(values.csv!)).toBe(row.csvFileDigest)
  return values
}
async function refund(backend: Backend) {
  const row = await command(backend)
  await backend.run(async ctx => {
    await ctx.db.patch(row._id, { state: 'reversed', reversalState: 'succeeded',
      reversalTransactionRef: refundTransactionRef, reversalRefundId: 're_tax_invoice',
      reversalStripeEventId: 'evt_tax_invoice_refund', reversalChargeId: 'ch_tax_invoice',
      reversalEvidenceDigest: canonicalDigest('refund-evidence'), reversedAt: now - 1_000 })
    await ctx.db.insert('moneyStripeEvents', {
      stripeEventId: 'evt_tax_invoice_refund', eventType: 'refund.updated', payloadDigest: canonicalDigest('refund-payload'),
      providerObjectId: 're_tax_invoice', providerObjectDigest: canonicalDigest('refund-object'),
      paymentId: 'pi_tax_invoice', chargeId: 'ch_tax_invoice', refundStatus: 'succeeded',
      currency: 'AUD', exponent: 6, amountUnits: row.totalUnits, status: 'applied',
      appliedRef: refundTransactionRef, receivedAt: now - 1_000, appliedAt: now - 1_000,
    })
  })
}

describe('funding tax invoice issuance', () => {
  it('creates readable HTML and CSV with actual seller, buyer, approved original tax and amounts', async () => {
    const { backend, owner } = await fixture()
    expect((await history(owner)).taxInvoice).toEqual({ kind: 'ready' })
    const first = await owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })
    expect(first.taxInvoice.kind).toBe('rendering')
    await renderDocument(transport(backend).ctx, { documentRef })
    const issued = (await history(owner)).taxInvoice
    expect(issued).toMatchObject({ kind: 'issued', documentRef, issuedAt: now, documentNumber: expect.stringMatching(/^AE-[A-F0-9]{32}$/u) })
    const { html, csv } = await contents(backend)
    for (const text of [AUSTRALIAN_INVOICE_SELLER.legalName, '98 700 838 115', 'Tax invoice', '2026-10-03', '10%', 'A$5.25', 'A$0.53', 'A$5.78']) {
      expect(html).toContain(text); expect(csv).toContain(text)
    }
    expect(html).toContain('Buyer &lt;script&gt;'); expect(html).not.toContain('<script>')
    expect(html).toContain('@media print')
    expect(await owner.query(api.moneyDocuments.readOwnerDocumentUrl, { documentRef })).toMatch(/^https?:/u)
    expect(await owner.query(api.moneyDocuments.readOwnerDocumentUrl, { documentRef, format: 'csv' })).toMatch(/^https?:/u)
  })

  it('enqueues the funding receipt only once the tax invoice is issued, keyed on the command', async () => {
    const { backend, owner } = await fixture()
    const receipts = () => backend.run(async ctx => (await ctx.db.query('notificationDeliveries').collect()).filter(row => row.eventKind === 'funding_receipt'))
    await owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })
    expect(await receipts()).toHaveLength(0)
    await renderDocument(transport(backend).ctx, { documentRef })
    await renderDocument(transport(backend).ctx, { documentRef })
    expect(await receipts()).toEqual([expect.objectContaining({ sourceEventRef: commandRef, stream: 'transactional' })])
  })

  it('retains one immutable invoice and canonical pair across duplicate issuance, rendering and profile/policy changes', async () => {
    const { backend, owner, canonicalAccountRef } = await fixture()
    await Promise.all([owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef }), owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })])
    const before = await document(backend)
    const rpc = transport(backend)
    await renderDocument(rpc.ctx, { documentRef })
    const issued = await document(backend)
    await backend.run(async ctx => {
      const facts = await ctx.db.query('moneyCustomerTaxFacts').withIndex('by_accountRef', q => q.eq('accountRef', canonicalAccountRef)).unique()
      await ctx.db.patch(facts!._id, { legalName: 'Changed Buyer', revision: 2 })
      const tax = await ctx.db.query('moneyCommercialPolicies').withIndex('by_policyRef', q => q.eq('policyRef', 'policy:tax:original')).unique()
      await ctx.db.patch(tax!._id, { lifecycle: 'suspended', suspendedAt: now + 1 })
    })
    await owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })
    await renderDocument(rpc.ctx, { documentRef })
    const after = await document(backend)
    expect(after.renderInputJson).toBe(before.renderInputJson)
    expect([after.fileId, after.csvFileId]).toEqual([issued.fileId, issued.csvFileId])
    expect(rpc.store).toHaveBeenCalledTimes(2)
    expect(await backend.run(ctx => ctx.db.query('moneyDocuments').collect())).toHaveLength(1)
  })

  it('issues using the recorded original approval after rates change, without applying the new rate', async () => {
    const { backend, owner } = await fixture()
    await backend.run(async ctx => {
      const old = await ctx.db.query('moneyCommercialPolicies').withIndex('by_policyRef', q => q.eq('policyRef', 'policy:tax:original')).unique()
      if (old === null || old.control.family !== 'tax') throw new Error('tax missing')
      await ctx.db.patch(old._id, { lifecycle: 'superseded' })
      const { _id, _creationTime, ...fields } = old
      await ctx.db.insert('moneyCommercialPolicies', { ...fields, policyRef: 'policy:tax:replacement', revision: 2,
        effectiveAt: now - 1_000, activatedAt: now - 1_000,
        control: { ...old.control, serviceFeeTaxBps: 0, callTaxBps: 0 },
      })
    })
    expect((await owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })).taxInvoice.kind).toBe('rendering')
    const snapshot = parseTaxDocumentSnapshot(JSON.parse((await document(backend)).renderInputJson))!
    expect(snapshot.tax.originalApproval.policyRef).toBe('policy:tax:original')
    expect(snapshot.issuanceApproval.policyRef).toBe('policy:tax:replacement')
    expect(snapshot.supply.gstUnits).toBe('530000')
  })

  it('refuses a current approval that violates production tax controls before creating an invoice', async () => {
    const { backend, owner } = await fixture()
    await backend.run(async ctx => {
      const old = await ctx.db.query('moneyCommercialPolicies').withIndex('by_policyRef', q => q.eq('policyRef', 'policy:tax:original')).unique()
      if (old === null || old.control.family !== 'tax') throw new Error('tax missing')
      await ctx.db.patch(old._id, { lifecycle: 'superseded' })
      const { _id, _creationTime, ...fields } = old
      await ctx.db.insert('moneyCommercialPolicies', { ...fields, policyRef: 'policy:tax:invalid-current', revision: 2,
        effectiveAt: now - 1_000, activatedAt: now - 1_000,
        control: { ...old.control, callTaxBps: 200 },
      })
    })
    expect((await owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })).taxInvoice)
      .toEqual({ kind: 'withheld', reason: 'policy_disabled' })
    expect(await backend.run(ctx => ctx.db.query('moneyDocuments').collect())).toHaveLength(0)
  })

  it('requires recipient identity only at the A$1,000 threshold and never requires buyer GST registration', async () => {
    const small = await fixture({ customer: false })
    expect((await small.owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })).taxInvoice.kind).toBe('rendering')
    const large = await fixture({ large: true, customer: false })
    expect((await large.owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })).taxInvoice).toEqual({ kind: 'withheld', reason: 'customer_tax_facts_missing' })
    const identified = await fixture({ large: true })
    expect((await identified.owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })).taxInvoice.kind).toBe('rendering')
  })

  it.each(['event', 'original_policy', 'amount', 'date', 'environment'] as const)('withholds unprovable %s facts without writing a document', async field => {
    const { backend, owner } = await fixture()
    const row = await command(backend)
    await backend.run(async ctx => {
      if (field === 'event') {
        const event = await ctx.db.query('moneyStripeEvents').withIndex('by_stripeEventId', q => q.eq('stripeEventId', eventRef)).unique()
        await ctx.db.patch(event!._id, { status: 'received' })
      } else if (field === 'original_policy') await ctx.db.patch(row._id, { commercialPolicyDigest: canonicalDigest('wrong') })
      else if (field === 'amount') await ctx.db.patch(row._id, { principalUnits: 'invalid' })
      else if (field === 'date') {
        const event = await ctx.db.query('moneyStripeEvents').withIndex('by_stripeEventId', q => q.eq('stripeEventId', eventRef)).unique()
        await ctx.db.patch(event!._id, { appliedAt: 9e15 })
      } else vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    })
    expect((await owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })).taxInvoice.kind).toBe('withheld')
    expect(await backend.run(ctx => ctx.db.query('moneyDocuments').collect())).toHaveLength(0)
  })

  it('refuses anonymous and foreign owners and scopes both download formats', async () => {
    const { backend, owner } = await fixture()
    const foreign = await publishedBusinessOwner(backend, 'foreign-invoice-owner')
    expect((await backend.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })).taxInvoice).toEqual({ kind: 'withheld', reason: 'authentication_required' })
    expect((await foreign.owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })).taxInvoice).toEqual({ kind: 'withheld', reason: 'funding_command_not_found' })
    await owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })
    await renderDocument(transport(backend).ctx, { documentRef })
    for (const format of ['html', 'csv'] as const) expect(await foreign.owner.query(api.moneyDocuments.readOwnerDocumentUrl, { documentRef, format })).toBeNull()
  })

  it('freezes a full-refund note but exposes it only after the original failed render is retried and issued', async () => {
    const { backend, owner } = await fixture()
    await refund(backend)
    await owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })
    await renderDocument(transport(backend).ctx, { documentRef: adjustmentRef })
    const original = await document(backend)
    await backend.run(ctx => ctx.db.patch(original._id, { state: 'failed', failureCode: 'renderer_unavailable' }))
    expect((await history(owner)).adjustmentNote).toEqual({ kind: 'withheld', reason: 'original_invoice_not_issued' })
    const pendingList = await owner.query(api.moneyDocuments.listOwnerDocuments, { paginationOpts: { numItems: 20, cursor: null } })
    expect(pendingList.page.find(row => row.documentRef === adjustmentRef)).toMatchObject({ state: 'adjusting', rendered: false })
    expect(await owner.query(api.moneyDocuments.readOwnerDocumentUrl, { documentRef: adjustmentRef })).toBeNull()
    expect((await owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })).taxInvoice.kind).toBe('rendering')
    await renderDocument(transport(backend).ctx, { documentRef })
    expect(await history(owner)).toMatchObject({ taxInvoice: { kind: 'issued' }, adjustmentNote: { kind: 'issued', documentRef: adjustmentRef } })
    const issuedList = await owner.query(api.moneyDocuments.listOwnerDocuments, { paginationOpts: { numItems: 20, cursor: null } })
    expect(issuedList.page.find(row => row.documentRef === adjustmentRef)).toMatchObject({ state: 'issued', rendered: true })
    const note = await contents(backend, adjustmentRef)
    for (const text of ['Adjustment note', 'Original invoice', 'Full refund', 'A$0.53', 'A$5.78']) {
      expect(note.html).toContain(text); expect(note.csv).toContain(text)
    }
    expect(note.csv).toContain('Price after full refund","A$0.00')
    expect(await owner.query(api.moneyDocuments.readOwnerDocumentUrl, { documentRef: adjustmentRef, format: 'csv' })).toMatch(/^https?:/u)
    const funding = await command(backend)
    await backend.run(ctx => ctx.db.patch(funding._id, { reversalEvidenceDigest: canonicalDigest('different-refund') }))
    expect((await history(owner)).adjustmentNote).toEqual({ kind: 'withheld', reason: 'document_integrity_failed' })
  })

  it('refuses a refund whose source event timestamp or identity does not match', async () => {
    const { backend, owner } = await fixture()
    await refund(backend)
    await backend.run(async ctx => {
      const event = await ctx.db.query('moneyStripeEvents').withIndex('by_stripeEventId', q => q.eq('stripeEventId', 'evt_tax_invoice_refund')).unique()
      await ctx.db.patch(event!._id, { appliedAt: now - 2_000, commandRef: 'foreign-command' })
    })
    await owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })
    await renderDocument(transport(backend).ctx, { documentRef })
    expect((await history(owner)).adjustmentNote).toEqual({ kind: 'withheld', reason: 'refund_event_unconfirmed' })
    expect(await backend.run(ctx => ctx.db.query('moneyDocuments').collect())).toHaveLength(1)
  })

  it('withholds a partial refund adjustment while preserving the original issued invoice', async () => {
    const { backend, owner } = await fixture()
    await owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })
    await renderDocument(transport(backend).ctx, { documentRef })
    const original = await document(backend)
    await refund(backend)
    await backend.run(async ctx => {
      const event = await ctx.db.query('moneyStripeEvents').withIndex('by_stripeEventId', q => q.eq('stripeEventId', 'evt_tax_invoice_refund')).unique()
      await ctx.db.patch(event!._id, { amountUnits: '1000000' })
    })
    const result = await owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })
    expect(result).toMatchObject({ taxInvoice: { kind: 'issued', documentRef }, adjustmentNote: { kind: 'withheld', reason: 'refund_event_unconfirmed' } })
    expect(await document(backend)).toEqual(original)
    expect(await backend.run(ctx => ctx.db.query('moneyDocuments').collect())).toHaveLength(1)
  })

  it('schedules issuance with funding commit identity and rejects unrelated scheduled transaction refs', async () => {
    const { backend } = await fixture()
    const paid = await command(backend)
    await backend.run(ctx => recordFundingDocuments(ctx, paid, transactionRef, now - 5_000))
    const scheduled = await backend.run(ctx => ctx.db.system.query('_scheduled_functions').collect())
    expect(scheduled.some(item => item.name === 'moneyDocuments:issueFundingTaxInvoice'
      && JSON.stringify(item.args).includes(transactionRef))).toBe(true)
    expect((await backend.mutation(internal.moneyDocuments.issueFundingTaxInvoice, { commandRef, sourceTransactionRef: 'wrong' })).taxInvoice.kind).toBe('withheld')
    expect((await backend.mutation(internal.moneyDocuments.issueFundingTaxInvoice, { commandRef, sourceTransactionRef: transactionRef })).taxInvoice.kind).toBe('rendering')
  })

  it('strict snapshot parsing refuses malformed amounts and dates without throwing', async () => {
    const { backend, owner } = await fixture()
    await owner.mutation(api.moneyDocuments.issueOwnerFundingTaxInvoice, { commandRef })
    const snapshot = parseTaxDocumentSnapshot(JSON.parse((await document(backend)).renderInputJson))!
    expect(parseTaxDocumentSnapshot({ ...snapshot, supply: { ...snapshot.supply, netUnits: 'not-a-number' } })).toBeUndefined()
    expect(parseTaxDocumentSnapshot({ ...snapshot, source: { ...snapshot.source, occurredAt: 9e15 } })).toBeUndefined()
    expect(parseTaxDocumentSnapshot({ ...snapshot, supply: { ...snapshot.supply, gstUnits: '520000' } })).toBeUndefined()
  })
})
