import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FunctionArgs } from 'convex/server'
import type { WorkId } from '@convex-dev/workpool'
import { api, internal } from '../../../convex/_generated/api'
import type { ActionCtx } from '../../../convex/_generated/server'
import type { Id } from '../../../convex/_generated/dataModel'
import schema from '../../../convex/schema'
import { renderQueuedDocument } from '../../../convex/moneyDocumentRender'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { convexModules, publishedBusinessOwner } from '../../helpers/convex-fixtures'

const documentRef = 'money-document:attachment-recovery'
const workId = 'work:document-attachment' as WorkId
const render = (renderQueuedDocument as unknown as {
  _handler: (ctx: ActionCtx, args: { documentRef: string }) => Promise<{ kind: 'available'; fileId: Id<'_storage'> }>
})._handler
type Backend = TestConvex<typeof schema>
type AttachArgs = FunctionArgs<typeof internal.moneyDocuments.attachRenderedFile>

afterEach(() => vi.restoreAllMocks())

async function fixture(kind: 'statement' | 'daily_close' = 'daily_close', accountRef = 'account:document-recovery') {
  const backend = convexTest(schema, convexModules)
  const renderInput = { documentRef, kind, sourceCount: 0, amountUnits: '0' }
  await backend.run(ctx => ctx.db.insert('moneyDocuments', {
    documentRef, accountRef, kind, sourceTransactionRefs: [], amountUnits: '0', residualUnits: '0',
    policyRefs: ['policy:fixture'], policyDigest: canonicalDigest('fixture-policy'),
    templateVersion: 'ae.money-document:html:v1', renderInputJson: JSON.stringify(renderInput),
    renderInputDigest: canonicalDigest(renderInput), state: 'rendering', environment: 'sandbox',
    sourceCount: 0, snapshotDigest: canonicalDigest('fixture-snapshot'), createdAt: 1, workId,
  }))
  return backend
}

async function document(backend: Backend) {
  const row = await backend.run(ctx => ctx.db.query('moneyDocuments').withIndex('by_documentRef', q => q.eq('documentRef', documentRef)).unique())
  if (row === null) throw new Error('document_fixture_missing')
  return row
}

function transport(backend: Backend) {
  const runQuery = vi.fn(async (_ref: unknown, args: { documentRef: string }) =>
    await backend.query(internal.moneyDocuments.readQueuedForRender, args))
  const runMutation = vi.fn(async (_ref: unknown, args: AttachArgs) =>
    await backend.mutation(internal.moneyDocuments.attachRenderedFile, args))
  const store = vi.fn(async (blob: Blob) => await backend.run(ctx => ctx.storage.store(blob)))
  const remove = vi.fn(async (id: Id<'_storage'>) => await backend.run(ctx => ctx.storage.delete(id)))
  const ctx = { runQuery, runMutation, storage: { store, delete: remove } } as unknown as ActionCtx
  return { ctx, runQuery, runMutation, store, remove }
}

async function expectCanonicalBytes(backend: Backend) {
  const row = await document(backend)
  if (row.fileId === undefined || row.csvFileId === undefined) throw new Error('attachment_missing')
  const [html, csv] = await backend.run(async ctx => await Promise.all([row.fileId!, row.csvFileId!]
    .map(async id => (await ctx.storage.get(id))?.text() ?? null)))
  expect(html).not.toBeNull()
  expect(csv).not.toBeNull()
  expect(canonicalDigest(html)).toBe(row.fileDigest)
  expect(canonicalDigest(csv)).toBe(row.csvFileDigest)
  return row
}

describe('financial document attachment recovery', () => {
  it.each(['daily_close', 'statement'] as const)('replays %s from its canonical files without storing a second pair', async kind => {
    const backend = await fixture(kind)
    const rpc = transport(backend)
    const first = await render(rpc.ctx, { documentRef })
    const row = await expectCanonicalBytes(backend)
    expect(row.state).toBe(kind === 'daily_close' ? 'awaiting_signature' : 'issued')
    expect(await render(rpc.ctx, { documentRef })).toEqual(first)
    expect(rpc.store).toHaveBeenCalledTimes(2)
    expect(rpc.runMutation).toHaveBeenCalledOnce()
    expect(rpc.remove).not.toHaveBeenCalled()
  })

  it('recovers an attachment committed before its acknowledgement was lost without deleting its bytes', async () => {
    const backend = await fixture()
    const rpc = transport(backend)
    const commit = rpc.runMutation.getMockImplementation()!
    rpc.runMutation.mockImplementationOnce(async (...args) => { await commit(...args); throw new Error('acknowledgement lost') })
    const result = await render(rpc.ctx, { documentRef })
    const row = await expectCanonicalBytes(backend)
    expect(result).toEqual({ kind: 'available', fileId: row.fileId })
    expect(row.state).toBe('awaiting_signature')
    expect(rpc.remove).not.toHaveBeenCalled()
    expect(rpc.runMutation).toHaveBeenCalledOnce()
  })

  it('retains candidates after an unknown result even if readback has not yet observed the commit', async () => {
    const backend = await fixture()
    const rpc = transport(backend)
    rpc.runMutation.mockRejectedValueOnce(new Error('acknowledgement unknown'))
    await expect(render(rpc.ctx, { documentRef })).rejects.toThrow('acknowledgement unknown')
    expect(rpc.remove).not.toHaveBeenCalled()
    const submitted = rpc.runMutation.mock.calls[0]![1]
    expect(await backend.run(async ctx => (await ctx.storage.get(submitted.fileId)) !== null)).toBe(true)
    expect(await backend.run(async ctx => (await ctx.storage.get(submitted.csvFileId)) !== null)).toBe(true)
    // The original request may still commit after the first recovery read.
    await backend.mutation(internal.moneyDocuments.attachRenderedFile, submitted)
    expect(await render(rpc.ctx, { documentRef })).toEqual({ kind: 'available', fileId: submitted.fileId })
    await expectCanonicalBytes(backend)
    expect(rpc.store).toHaveBeenCalledTimes(2)
  })

  it('preserves committed bytes when recovery readback also fails, then resolves on the next delivery', async () => {
    const backend = await fixture()
    const rpc = transport(backend)
    const commit = rpc.runMutation.getMockImplementation()!
    rpc.runMutation.mockImplementationOnce(async (...args) => {
      await commit(...args)
      rpc.runQuery.mockRejectedValueOnce(new Error('readback unavailable'))
      throw new Error('acknowledgement lost')
    })
    await expect(render(rpc.ctx, { documentRef })).rejects.toThrow('readback unavailable')
    expect(rpc.remove).not.toHaveBeenCalled()
    const row = await expectCanonicalBytes(backend)
    expect(await render(rpc.ctx, { documentRef })).toEqual({ kind: 'available', fileId: row.fileId })
    expect(rpc.store).toHaveBeenCalledTimes(2)
  })

  it('cleans only the known unattached first file when storing the second file fails', async () => {
    const backend = await fixture()
    const rpc = transport(backend)
    const store = rpc.store.getMockImplementation()!
    rpc.store.mockImplementationOnce(store).mockRejectedValueOnce(new Error('storage unavailable'))
    await expect(render(rpc.ctx, { documentRef })).rejects.toThrow('storage unavailable')
    expect(rpc.runMutation).not.toHaveBeenCalled()
    expect(rpc.remove).toHaveBeenCalledOnce()
    expect(await backend.run(ctx => ctx.storage.get(rpc.remove.mock.calls[0]![0]))).toBeNull()
    expect((await document(backend)).state).toBe('rendering')
  })

  it('cleans candidate bytes on a definite attachment refusal without altering the document', async () => {
    const backend = await fixture()
    const rpc = transport(backend)
    const commit = rpc.runMutation.getMockImplementation()!
    rpc.runMutation.mockImplementationOnce(async (...args) => {
      const row = await document(backend)
      await backend.run(ctx => ctx.db.patch(row._id, { state: 'failed' }))
      return await commit(...args)
    })
    await expect(render(rpc.ctx, { documentRef })).rejects.toThrow('money_document_render_conflict')
    expect(rpc.remove).toHaveBeenCalledTimes(2)
    for (const [id] of rpc.remove.mock.calls) expect(await backend.run(ctx => ctx.storage.get(id))).toBeNull()
    expect(await document(backend)).toMatchObject({ state: 'failed' })
    expect((await document(backend)).fileId).toBeUndefined()
  })

  it.each([false, true])('concurrent renders retain one canonical pair, even when duplicate cleanup fails=%s', async cleanupFails => {
    const backend = await fixture()
    const rpc = transport(backend)
    const read = rpc.runQuery.getMockImplementation()!
    let reads = 0
    let release: (() => void) | undefined
    const bothRead = new Promise<void>(resolve => { release = resolve })
    rpc.runQuery.mockImplementation(async (...args) => {
      const snapshot = await read(...args)
      reads += 1
      if (reads === 2) release?.()
      if (reads <= 2) await bothRead
      return snapshot
    })
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    if (cleanupFails) rpc.remove.mockRejectedValueOnce(new Error('cleanup unavailable'))
    const results = await Promise.all([render(rpc.ctx, { documentRef }), render(rpc.ctx, { documentRef })])
    const row = await expectCanonicalBytes(backend)
    expect(results).toEqual([{ kind: 'available', fileId: row.fileId }, { kind: 'available', fileId: row.fileId }])
    expect(rpc.store).toHaveBeenCalledTimes(4)
    expect(rpc.remove).toHaveBeenCalledTimes(2)
    for (const [id] of rpc.remove.mock.calls) expect([row.fileId, row.csvFileId]).not.toContain(id)
    expect(warn).toHaveBeenCalledTimes(cleanupFails ? 1 : 0)
    if (!cleanupFails) {
      for (const [id] of rpc.remove.mock.calls) expect(await backend.run(ctx => ctx.storage.get(id))).toBeNull()
    }
  })

  it('replays same-content attachment calls and refuses changed input or file digests without changing the canonical pair', async () => {
    const backend = await fixture()
    const rpc = transport(backend)
    await render(rpc.ctx, { documentRef })
    const submitted = rpc.runMutation.mock.calls[0]![1]
    const before = await document(backend)
    expect(await backend.mutation(internal.moneyDocuments.attachRenderedFile, submitted)).toEqual({
      kind: 'replayed', fileId: before.fileId, csvFileId: before.csvFileId,
    })
    for (const changes of [{ renderInputDigest: canonicalDigest('different input') }, { fileDigest: canonicalDigest('different HTML') }, { csvFileDigest: canonicalDigest('different CSV') }]) {
      expect(await backend.mutation(internal.moneyDocuments.attachRenderedFile, { ...submitted, ...changes })).toEqual({ kind: 'refused' })
    }
    expect(await document(backend)).toEqual(before)
    await expectCanonicalBytes(backend)
  })

  it.each(['failed', 'canceled'] as const)('a late %s worker completion cannot demote a daily close awaiting a signature', async kind => {
    const backend = await fixture()
    const rpc = transport(backend)
    await render(rpc.ctx, { documentRef })
    const before = await document(backend)
    await backend.mutation(internal.moneyDocuments.completeDocumentWork, { workId, context: { documentRef },
      result: kind === 'failed' ? { kind, error: 'acknowledgement unavailable' } : { kind } })
    expect(await document(backend)).toEqual(before)
    expect(await backend.run(ctx => ctx.db.query('moneyReconciliationCases').collect())).toEqual([])
    await expectCanonicalBytes(backend)
  })

  it('keeps unsigned document downloads private while internal readback and the real owner signing remain available', async () => {
    const backend = await fixture()
    const first = await publishedBusinessOwner(backend, 'attachment-owner')
    const second = await publishedBusinessOwner(backend, 'attachment-other')
    const row = await document(backend)
    await backend.run(ctx => ctx.db.patch(row._id, { accountRef: first.canonicalAccountRef }))
    const rpc = transport(backend)
    await render(rpc.ctx, { documentRef })
    expect(await backend.query(internal.moneyDocuments.readQueuedForRender, { documentRef })).toMatchObject({ state: 'awaiting_signature' })
    expect(await first.owner.query(internal.moneyDocuments.readForRender, { documentRef })).toBeNull()
    expect(await first.owner.query(api.moneyDocuments.readOwnerDocumentUrl, { documentRef })).toBeNull()
    expect(await second.owner.query(api.moneyDocuments.readOwnerDocumentUrl, { documentRef })).toBeNull()
    const attached = await document(backend)
    expect(await first.owner.mutation(api.moneyDocuments.signOwnerDailyClose, { documentRef,
      expectedRenderInputDigest: attached.renderInputDigest, confirmation: documentRef })).toMatchObject({ kind: 'signed' })
    expect(await first.owner.query(api.moneyDocuments.readOwnerDocumentUrl, { documentRef })).toEqual(expect.any(String))
    expect(await second.owner.query(api.moneyDocuments.readOwnerDocumentUrl, { documentRef })).toBeNull()
    await expectCanonicalBytes(backend)
  })
})
