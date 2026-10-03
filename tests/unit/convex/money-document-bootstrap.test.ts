import type { FunctionArgs } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../../convex/_generated/api'
import type { ActionCtx } from '../../../convex/_generated/server'
import type { Id } from '../../../convex/_generated/dataModel'
import { runStatementPageHandler } from '../../../convex/lib/money/documents/statementPage'
import { finalizeStatementHandler } from '../../../convex/lib/money/documents/statementFinalization'
import { renderQueuedDocument } from '../../../convex/moneyDocumentRender'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { COMMERCIAL_POLICY_FAMILIES } from '@/modules/money/public'
import { convexTestWithWorkers, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import { PRODUCTION_COMMERCIAL_POLICY_CONTROLS } from '../../helpers/commercial-policy-fixtures'

const now = Date.UTC(2026, 9, 3, 12)
const period = { environment: 'production' as const, periodStart: Date.UTC(2026, 9, 2), periodEnd: Date.UTC(2026, 9, 3), purpose: 'daily_close' as const }
type Backend = ReturnType<typeof convexTestWithWorkers>
type ApplyPageArgs = FunctionArgs<typeof internal.moneyDocuments.applyStatementPage>
type QueueRenderArgs = FunctionArgs<typeof internal.moneyDocuments.queueStatementRender>
type AttachArgs = FunctionArgs<typeof internal.moneyDocuments.attachRenderedFile>
const render = (renderQueuedDocument as unknown as {
  _handler: (ctx: ActionCtx, args: { documentRef: string }) => Promise<{ kind: 'available'; fileId: Id<'_storage'> }>
})._handler

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now)
  vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production'); vi.stubEnv('AE_FORMANCE_ENVIRONMENT', 'production')
  vi.stubEnv('AE_X402_CUSTODY_MAX_ATOMIC', '10000')
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs() })

async function fixture() {
  const backend = convexTestWithWorkers({ pauseWorkpool: true })
  const owner = await publishedBusinessOwner(backend, 'bootstrap-owner')
  return { backend, ...owner }
}

async function document(backend: Backend, documentRef: string) {
  const row = await backend.run(ctx => ctx.db.query('moneyDocuments').withIndex('by_documentRef', q => q.eq('documentRef', documentRef)).unique())
  if (row === null) throw new Error('bootstrap_document_missing')
  return row
}

function pageTransport(backend: Backend, units = '0') {
  const runAction = vi.fn(async () => ({ kind: 'available', transactionRefs: units === '0' ? [] : ['native:original-sale'], exactAmountUnits: units, continueCursor: '', isDone: true }))
  return {
    runAction,
    ctx: {
      runQuery: async (_ref: unknown, args: { documentRef: string }) => await backend.query(internal.moneyDocuments.readStatementPage, args),
      runAction,
      runMutation: async (_ref: unknown, args: ApplyPageArgs) => await backend.mutation(internal.moneyDocuments.applyStatementPage, args),
    } as unknown as ActionCtx,
  }
}

function finalizationTransport(backend: Backend) {
  const runAction = vi.fn(async () => ({ kind: 'completed', transactionRefs: ['native:adjustment'], replayed: false }))
  return {
    runAction,
    ctx: {
      runQuery: async (_ref: unknown, args: { documentRef: string }) => await backend.query(internal.moneyDocuments.readStatementFinalization, args),
      runAction,
      runMutation: async (_ref: unknown, args: QueueRenderArgs) => await backend.mutation(internal.moneyDocuments.queueStatementRender, args),
    } as unknown as ActionCtx,
  }
}

async function renderAndRead(backend: Backend, documentRef: string) {
  await render({
    runQuery: async (_ref: unknown, args: { documentRef: string }) => await backend.query(internal.moneyDocuments.readQueuedForRender, args),
    runMutation: async (_ref: unknown, args: AttachArgs) => await backend.mutation(internal.moneyDocuments.attachRenderedFile, args),
    storage: {
      store: async (blob: Blob) => await backend.run(ctx => ctx.storage.store(blob)),
      delete: async (id: Id<'_storage'>) => await backend.run(ctx => ctx.storage.delete(id)),
    },
  } as unknown as ActionCtx, { documentRef })
  const row = await document(backend, documentRef)
  if (row.fileId === undefined || row.csvFileId === undefined) throw new Error('bootstrap_attachment_missing')
  const [html, csv] = await backend.run(async ctx => await Promise.all([row.fileId!, row.csvFileId!]
    .map(async id => (await ctx.storage.get(id))!.text())))
  expect(canonicalDigest(html)).toBe(row.fileDigest)
  expect(canonicalDigest(csv)).toBe(row.csvFileDigest)
  return { row, html, csv }
}

async function approvePolicies(input: Awaited<ReturnType<typeof fixture>>) {
  await input.backend.run(async ctx => {
    for (const family of COMMERCIAL_POLICY_FAMILIES) await ctx.db.insert('moneyCommercialPolicies', {
      policyRef: `bootstrap-policy:${family}`, family, environment: 'production', revision: 1,
      lifecycle: 'active', effectiveAt: now - 1000, expiresAt: now + 1000,
      evidenceRef: `approval:${family}`, evidenceDigest: canonicalDigest(`approval:${family}`),
      control: PRODUCTION_COMMERCIAL_POLICY_CONTROLS[family],
      approvedByPrincipalRef: input.canonicalPrincipalRef, activeAccountRef: input.canonicalAccountRef,
      authorityGeneration: 1, correlationRef: `policy:${family}`, idempotencyRef: `policy:${family}`,
      commandDigest: canonicalDigest(`command:${family}`), activatedAt: now - 1000, updatedAt: now - 1000,
    })
  })
}

describe('Account close before commercial activation', () => {
  it.each(['0', '10000'])('freezes a truthful %s-unit report, permits private review and signs the same bytes without a ledger write', async units => {
    const first = await fixture()
    const { backend, owner } = first
    const other = await publishedBusinessOwner(backend, 'bootstrap-other')
    const created = await owner.mutation(api.moneyDocuments.createOwnerStatement, period)
    if (created.kind !== 'created') throw new Error('bootstrap_create_failed')
    const { documentRef } = created
    const initial = await document(backend, documentRef)
    const policyAdmission = JSON.parse(initial.renderInputJson).policyAdmission
    expect(initial.policyRefs).toEqual([])
    expect(policyAdmission).toMatchObject({ kind: 'not_admitted', environment: 'production', observedAt: now, refusalCode: 'commercial_policy_missing' })
    expect(canonicalDigest(policyAdmission)).toBe(initial.policyDigest)
    const read = pageTransport(backend, units)
    await runStatementPageHandler(read.ctx, { documentRef })
    expect(read.runAction).toHaveBeenCalledOnce()
    const finalize = finalizationTransport(backend)
    await finalizeStatementHandler(finalize.ctx, { documentRef })
    expect(finalize.runAction).not.toHaveBeenCalled()
    const prepared = await renderAndRead(backend, documentRef)
    expect(prepared.row).toMatchObject({ state: 'awaiting_signature', sourceCount: units === '0' ? 0 : 1, exactAmountUnits: units, amountUnits: units, residualUnits: '0', policyRefs: [], policyDigest: initial.policyDigest })
    expect(JSON.parse(prepared.row.renderInputJson).policyAdmission).toEqual(policyAdmission)
    expect(prepared.html).toContain('Account daily close')
    expect(prepared.html).not.toContain('Signed daily close')
    expect(prepared.html).not.toContain('Issued by')
    for (const bytes of [prepared.html, prepared.csv]) {
      expect(bytes).toContain('Funding, refunds, treasury and chain reconciliation are outside this report.')
      expect(bytes).toContain('Not admitted. This report grants no payment or adjustment authority.')
    }
    for (const format of ['html', 'csv'] as const) {
      expect(await owner.query(api.moneyDocuments.readOwnerDocumentUrl, { documentRef, format })).toEqual(expect.any(String))
      expect(await other.owner.query(api.moneyDocuments.readOwnerDocumentUrl, { documentRef, format })).toBeNull()
      expect(await backend.query(api.moneyDocuments.readOwnerDocumentUrl, { documentRef, format })).toBeNull()
    }
    expect(await owner.query(internal.moneyDocuments.readForRender, { documentRef })).toBeNull()
    expect((await document(backend, documentRef)).state).toBe('awaiting_signature')
    const sign = { documentRef, expectedRenderInputDigest: prepared.row.renderInputDigest, confirmation: documentRef }
    expect(await owner.mutation(api.moneyDocuments.signOwnerDailyClose, { ...sign, expectedRenderInputDigest: canonicalDigest('stale') }))
      .toEqual({ kind: 'refused', code: 'daily_close_confirmation_invalid' })
    const signatures = await Promise.all([owner.mutation(api.moneyDocuments.signOwnerDailyClose, sign), owner.mutation(api.moneyDocuments.signOwnerDailyClose, sign)])
    expect(signatures.map(result => result.kind).sort()).toEqual(['replayed', 'signed'])
    const signed = await document(backend, documentRef)
    expect(signed).toMatchObject({ state: 'issued', signedByPrincipalRef: first.canonicalPrincipalRef, signedAt: now,
      fileId: prepared.row.fileId, csvFileId: prepared.row.csvFileId, fileDigest: prepared.row.fileDigest, csvFileDigest: prepared.row.csvFileDigest, renderInputJson: prepared.row.renderInputJson })
    expect(signatures[0]).toHaveProperty('evidenceDigest', signed.closeEvidenceDigest)
    expect(signatures[1]).toHaveProperty('evidenceDigest', signed.closeEvidenceDigest)
    expect(await backend.run(ctx => ctx.db.query('moneyCommercialPolicies').collect())).toEqual([])
  })

  it('retains one capture across concurrent creation and later approval instead of inventing original approval', async () => {
    const input = await fixture()
    const created = await Promise.all([0, 1].map(() => input.owner.mutation(api.moneyDocuments.createOwnerStatement, period)))
    expect(created.map(result => result.kind).sort()).toEqual(['created', 'replayed'])
    const result = created[0]!
    if (result.kind === 'refused') throw new Error('bootstrap_create_failed')
    const original = await document(input.backend, result.documentRef)
    await approvePolicies(input)
    vi.setSystemTime(now + 2000)
    expect(await input.owner.mutation(api.moneyDocuments.createOwnerStatement, period)).toEqual({ kind: 'replayed', documentRef: original.documentRef })
    expect(await document(input.backend, original.documentRef)).toEqual(original)
    expect(await input.backend.run(ctx => ctx.db.query('moneyDocuments').collect())).toHaveLength(1)
  })

  it('preserves the approved capture and its authorized adjustment behavior after policy expiry', async () => {
    const input = await fixture()
    await approvePolicies(input)
    const created = await input.owner.mutation(api.moneyDocuments.createOwnerStatement, period)
    if (created.kind !== 'created') throw new Error('bootstrap_create_failed')
    const initial = await document(input.backend, created.documentRef)
    expect(initial.policyRefs).toHaveLength(6)
    expect(JSON.parse(initial.renderInputJson)).not.toHaveProperty('policyAdmission')
    vi.setSystemTime(now + 2000)
    expect(await input.owner.mutation(api.moneyDocuments.createOwnerStatement, period)).toEqual({ kind: 'replayed', documentRef: created.documentRef })
    await runStatementPageHandler(pageTransport(input.backend, '15001').ctx, { documentRef: created.documentRef })
    const finalize = finalizationTransport(input.backend)
    await finalizeStatementHandler(finalize.ctx, { documentRef: created.documentRef })
    expect(finalize.runAction).toHaveBeenCalledOnce()
    expect(await document(input.backend, created.documentRef)).toMatchObject({ state: 'rendering', residualUnits: '4999', policyRefs: initial.policyRefs, policyDigest: initial.policyDigest })
  })

  it.each(['action', 'direct_queue'] as const)('refuses unapproved rounding through %s with an inspectable failure and no financial action', async path => {
    const { backend, owner } = await fixture()
    const created = await owner.mutation(api.moneyDocuments.createOwnerStatement, period)
    if (created.kind !== 'created') throw new Error('bootstrap_create_failed')
    await runStatementPageHandler(pageTransport(backend, '15001').ctx, { documentRef: created.documentRef })
    const before = await document(backend, created.documentRef)
    const finalize = finalizationTransport(backend)
    if (path === 'action') await finalizeStatementHandler(finalize.ctx, { documentRef: created.documentRef })
    else expect(await backend.mutation(internal.moneyDocuments.queueStatementRender, { documentRef: created.documentRef, adjustmentTransactionRefs: ['forged:adjustment'] })).toEqual({ kind: 'refused' })
    expect(finalize.runAction).not.toHaveBeenCalled()
    const failed = await document(backend, created.documentRef)
    expect(failed).toMatchObject({ state: 'failed', failureCode: 'statement_adjustment_requires_approved_policy', renderInputJson: before.renderInputJson,
      snapshotDigest: before.snapshotDigest, exactAmountUnits: '15001', residualUnits: '4999', sourceTransactionRefs: ['native:original-sale'] })
    expect(failed.fileId).toBeUndefined()
    expect(await owner.query(api.moneyDocuments.readOwnerDocumentUrl, { documentRef: created.documentRef })).toBeNull()
    expect(await owner.mutation(api.moneyDocuments.createOwnerStatement, period)).toEqual({ kind: 'replayed', documentRef: created.documentRef })
    expect((await owner.query(api.moneyDocuments.listOwnerDocuments, { paginationOpts: { numItems: 10, cursor: null } })).page[0])
      .toMatchObject({ state: 'failed', failureCode: 'statement_adjustment_requires_approved_policy', rendered: false })
  })

  it.each([['development', 'production'], ['production', 'sandbox'], ['', 'production'], ['production', '']] as const)(
    'rejects declared environments %s/%s before enqueueing a report', async (deployment, formance) => {
      const { backend, owner } = await fixture()
      vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', deployment); vi.stubEnv('AE_FORMANCE_ENVIRONMENT', formance)
      expect(await owner.mutation(api.moneyDocuments.createOwnerStatement, period)).toEqual({ kind: 'refused', code: 'environment_mismatch' })
      expect(await backend.run(ctx => ctx.db.query('moneyDocuments').collect())).toEqual([])
    })

  it('refuses future and malformed daily periods before recording a snapshot', async () => {
    const { backend, owner } = await fixture()
    expect(await owner.mutation(api.moneyDocuments.createOwnerStatement, { ...period, periodEnd: now + 1 })).toEqual({ kind: 'refused', code: 'statement_period_invalid' })
    expect(await owner.mutation(api.moneyDocuments.createOwnerStatement, { ...period, periodStart: period.periodStart + 1 })).toEqual({ kind: 'refused', code: 'daily_close_period_invalid' })
    expect(await backend.run(ctx => ctx.db.query('moneyDocuments').collect())).toEqual([])
  })

  it('does not convert an invalid deployment profile into unapproved report authority', async () => {
    const input = await fixture()
    await approvePolicies(input)
    vi.stubEnv('AE_X402_CUSTODY_MAX_ATOMIC', '')
    expect(await input.owner.mutation(api.moneyDocuments.createOwnerStatement, period))
      .toEqual({ kind: 'refused', code: 'commercial_policy_deployment_profile_invalid' })
    expect(await input.backend.run(ctx => ctx.db.query('moneyDocuments').collect())).toEqual([])
  })

  it('rejects a destination change before reading the ledger and keeps source failure distinct from zero activity', async () => {
    const { backend, owner } = await fixture()
    const created = await owner.mutation(api.moneyDocuments.createOwnerStatement, period)
    if (created.kind !== 'created') throw new Error('bootstrap_create_failed')
    const before = await document(backend, created.documentRef)
    const read = pageTransport(backend)
    vi.stubEnv('AE_FORMANCE_ENVIRONMENT', 'sandbox')
    await expect(runStatementPageHandler(read.ctx, { documentRef: created.documentRef })).rejects.toThrow('environment_mismatch')
    expect(read.runAction).not.toHaveBeenCalled()
    vi.stubEnv('AE_FORMANCE_ENVIRONMENT', 'production')
    read.runAction.mockRejectedValueOnce(new Error('native ledger unavailable'))
    await expect(runStatementPageHandler(read.ctx, { documentRef: created.documentRef })).rejects.toThrow('native ledger unavailable')
    expect(await document(backend, created.documentRef)).toEqual(before)
    expect(await owner.query(api.moneyDocuments.readOwnerDocumentUrl, { documentRef: created.documentRef })).toBeNull()
  })

  it.each(['digest', 'file', 'environment'] as const)('denies unsigned review and signing when %s evidence is invalid', async defect => {
    const { backend, owner } = await fixture()
    const created = await owner.mutation(api.moneyDocuments.createOwnerStatement, period)
    if (created.kind !== 'created') throw new Error('bootstrap_create_failed')
    await runStatementPageHandler(pageTransport(backend).ctx, { documentRef: created.documentRef })
    await finalizeStatementHandler(finalizationTransport(backend).ctx, { documentRef: created.documentRef })
    const { row } = await renderAndRead(backend, created.documentRef)
    if (defect === 'digest') await backend.run(ctx => ctx.db.patch(row._id, { renderInputJson: row.renderInputJson.replace('not_admitted', 'admitted') }))
    if (defect === 'file') await backend.run(ctx => ctx.storage.delete(row.csvFileId!))
    if (defect === 'environment') vi.stubEnv('AE_FORMANCE_ENVIRONMENT', 'sandbox')
    for (const format of ['html', 'csv'] as const) expect(await owner.query(api.moneyDocuments.readOwnerDocumentUrl, { documentRef: row.documentRef, format })).toBeNull()
    expect(await owner.mutation(api.moneyDocuments.signOwnerDailyClose, { documentRef: row.documentRef, expectedRenderInputDigest: row.renderInputDigest, confirmation: row.documentRef }))
      .toEqual({ kind: 'refused', code: defect === 'environment' ? 'environment_mismatch' : 'daily_close_confirmation_invalid' })
    expect(await document(backend, row.documentRef)).toMatchObject({ state: 'awaiting_signature' })
    expect((await document(backend, row.documentRef)).closeEvidenceDigest).toBeUndefined()
  })
})
