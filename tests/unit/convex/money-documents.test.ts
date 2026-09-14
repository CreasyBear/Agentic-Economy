/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../../convex/_generated/api'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import { convexTestWithWorkers, ownerAdmin, publishedBusinessOwner } from '../../helpers/convex-fixtures'

const documentRef = 'money-document:statement:test'

function page(input: Readonly<{
  expectedCursor: string | null
  continueCursor: string
  isDone: boolean
  transactionRefs: string[]
  exactAmountUnits: string
}>) {
  return {
    documentRef,
    ...input,
    pageDigest: canonicalDigest({
      format: 'ae.money-statement-page:v1',
      documentRef,
      expectedCursor: input.expectedCursor ?? 'start',
      continueCursor: input.continueCursor,
      isDone: input.isDone,
      transactionRefs: input.transactionRefs,
      exactAmountUnits: input.exactAmountUnits,
    }),
  }
}

describe('Formance-sourced money documents', () => {
  it('advances cursor pages idempotently and freezes exact totals before rendering', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyDocuments', {
        documentRef,
        accountRef: 'account:document-test',
        kind: 'statement',
        sourceTransactionRefs: [],
        amountUnits: '0',
        residualUnits: '0',
        policyRefs: ['commercial-policy:sandbox'],
        policyDigest: `sha256:${'a'.repeat(64)}`,
        templateVersion: 'ae.money-document:html:v1',
        renderInputJson: '{}',
        renderInputDigest: `sha256:${'b'.repeat(64)}`,
        state: 'building',
        environment: 'sandbox',
        sourceCount: 0,
        snapshotDigest: `sha256:${'c'.repeat(64)}`,
        snapshotCutoffAt: 1_800_086_400_000,
        periodStart: 1_800_000_000_000,
        periodEnd: 1_800_086_400_000,
        pageCount: 0,
        exactAmountUnits: '0',
        createdAt: 1_800_086_400_000,
      })
    })
    const first = page({
      expectedCursor: null,
      continueCursor: 'cursor:two',
      isDone: false,
      transactionRefs: ['ae-p4:test:settle-one'],
      exactAmountUnits: '10001',
    })
    await expect(backend.mutation(internal.moneyDocuments.applyStatementPage, first))
      .resolves.toEqual({ kind: 'advanced' })
    await expect(backend.mutation(internal.moneyDocuments.applyStatementPage, first))
      .resolves.toEqual({ kind: 'replayed' })

    const second = page({
      expectedCursor: 'cursor:two',
      continueCursor: '',
      isDone: true,
      transactionRefs: ['ae-p4:test:settle-two'],
      exactAmountUnits: '5000',
    })
    await expect(backend.mutation(internal.moneyDocuments.applyStatementPage, second))
      .resolves.toEqual({ kind: 'advanced' })
    await expect(backend.run(async (ctx) => await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', documentRef)).unique()))
      .resolves.toMatchObject({
        state: 'adjusting',
        exactAmountUnits: '15001',
        amountUnits: '20000',
        residualUnits: '4999',
        sourceCount: 2,
        pageCount: 2,
      })

    await expect(backend.mutation(internal.moneyDocuments.queueStatementRender, {
      documentRef,
      adjustmentTransactionRefs: ['ae-p4:test:buyer-adjustment'],
    })).resolves.toEqual({ kind: 'advanced' })
    await expect(backend.run(async (ctx) => await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', documentRef)).unique()))
      .resolves.toMatchObject({
        state: 'rendering',
        sourceTransactionRefs: [
          'ae-p4:test:settle-one',
          'ae-p4:test:settle-two',
          'ae-p4:test:buyer-adjustment',
        ],
      })
  })

  it('binds public creation and listing to each owner Account and rejects anonymous access', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const first = await publishedBusinessOwner(backend, 'documents-first')
    const second = await publishedBusinessOwner(backend, 'documents-second')
    const administrator = await ownerAdmin(backend, 'user_documents-admin-only')
    const workload = await publishedBusinessOwner(backend, 'documents-workload')
    await backend.run(async (ctx) => {
      const workloadPrincipal = await ctx.db.query('principals')
        .withIndex('by_principalRef', (query) => query.eq('principalRef', workload.canonicalPrincipalRef))
        .unique()
      if (workloadPrincipal === null) throw new Error('document_workload_fixture_missing')
      await ctx.db.patch(workloadPrincipal._id, { kind: 'workload' })

      const principals = await ctx.db.query('principals').collect()
      const administratorPrincipal = principals.find((principal) =>
        principal.displayName === 'user_documents-admin-only admin')
      if (administratorPrincipal === undefined) throw new Error('document_admin_fixture_missing')
      for (const ownership of await ctx.db.query('accountOwnerships').collect()) {
        if (ownership.ownerPrincipalRef === administratorPrincipal.principalRef) {
          await ctx.db.delete(ownership._id)
        }
      }
    })
    const day = 24 * 60 * 60 * 1_000
    const firstPeriod = {
      environment: 'sandbox' as const,
      periodStart: 0,
      periodEnd: day,
      purpose: 'statement' as const,
    }
    const secondPeriod = {
      ...firstPeriod,
      periodStart: day,
      periodEnd: 2 * day,
    }

    const firstCreated = await first.owner.mutation(api.moneyDocuments.createOwnerStatement, firstPeriod)
    const firstSecondCreated = await first.owner.mutation(api.moneyDocuments.createOwnerStatement, secondPeriod)
    const secondCreated = await second.owner.mutation(api.moneyDocuments.createOwnerStatement, firstPeriod)
    expect(firstCreated).toMatchObject({ kind: 'created' })
    expect(firstSecondCreated).toMatchObject({ kind: 'created' })
    expect(secondCreated).toMatchObject({ kind: 'created' })
    if (firstCreated.kind !== 'created'
      || firstSecondCreated.kind !== 'created'
      || secondCreated.kind !== 'created') throw new Error('document creation failed')
    expect(firstCreated.documentRef).not.toBe(secondCreated.documentRef)
    await expect(first.owner.mutation(api.moneyDocuments.createOwnerStatement, firstPeriod))
      .resolves.toEqual({ kind: 'replayed', documentRef: firstCreated.documentRef })

    const firstPage = await first.owner.query(api.moneyDocuments.listOwnerDocuments, {
      paginationOpts: { numItems: 1, cursor: null },
    })
    expect(firstPage.page).toHaveLength(1)
    expect(firstPage.isDone).toBe(false)
    const firstDocumentRefs = firstPage.page.map((document) => document.documentRef)
    expect(firstDocumentRefs).not.toContain(secondCreated.documentRef)

    const crossAccountPage = await second.owner.query(api.moneyDocuments.listOwnerDocuments, {
      paginationOpts: { numItems: 1, cursor: firstPage.continueCursor },
    }).catch(() => null)
    if (crossAccountPage !== null) {
      expect(crossAccountPage.page.map((document) => document.documentRef))
        .not.toContain(firstCreated.documentRef)
      expect(crossAccountPage.page.map((document) => document.documentRef))
        .not.toContain(firstSecondCreated.documentRef)
    }

    const firstAll = await first.owner.query(api.moneyDocuments.listOwnerDocuments, {
      paginationOpts: { numItems: 50, cursor: null },
    })
    const secondAll = await second.owner.query(api.moneyDocuments.listOwnerDocuments, {
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(firstAll.page.map((document) => document.documentRef).sort())
      .toEqual([firstCreated.documentRef, firstSecondCreated.documentRef].sort())
    expect(secondAll.page.map((document) => document.documentRef))
      .toEqual([secondCreated.documentRef])

    await expect(backend.mutation(api.moneyDocuments.createOwnerStatement, firstPeriod))
      .resolves.toEqual({ kind: 'refused', code: 'authentication_required' })
    await expect(backend.query(api.moneyDocuments.listOwnerDocuments, {
      paginationOpts: { numItems: 50, cursor: null },
    })).rejects.toThrow('money_document_authentication_required')
    for (const caller of [administrator, workload.owner]) {
      await expect(caller.mutation(api.moneyDocuments.createOwnerStatement, firstPeriod))
        .resolves.toEqual({ kind: 'refused', code: 'authentication_required' })
      await expect(caller.query(api.moneyDocuments.listOwnerDocuments, {
        paginationOpts: { numItems: 50, cursor: null },
      })).rejects.toThrow('money_document_authentication_required')
    }
  })

  it('keeps daily-close signing and download bound to the owner Account', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const first = await publishedBusinessOwner(backend, 'daily-close-first')
    const second = await publishedBusinessOwner(backend, 'daily-close-second')
    const day = 24 * 60 * 60 * 1_000

    const seedDailyClose = async (input: Readonly<{
      accountRef: string
      documentRef: string
      state: 'awaiting_signature' | 'issued'
    }>) => {
      const renderInputDigest = canonicalDigest({
        format: 'test-money-document-render-input:v1',
        documentRef: input.documentRef,
      })
      const snapshotDigest = canonicalDigest({
        format: 'test-money-document-snapshot:v1',
        documentRef: input.documentRef,
      })
      const fileDigest = canonicalDigest({ format: 'test-money-document-file:v1', documentRef: input.documentRef })
      const csvFileDigest = canonicalDigest({ format: 'test-money-document-csv:v1', documentRef: input.documentRef })
      const files = await backend.run(async (ctx) => ({
        fileId: await ctx.storage.store(new Blob([`file:${input.documentRef}`], { type: 'application/pdf' })),
        csvFileId: await ctx.storage.store(new Blob([`csv:${input.documentRef}`], { type: 'text/csv' })),
      }))
      await backend.run(async (ctx) => {
        await ctx.db.insert('moneyDocuments', {
          documentRef: input.documentRef,
          accountRef: input.accountRef,
          kind: 'daily_close',
          sourceTransactionRefs: [],
          amountUnits: '0',
          residualUnits: '0',
          policyRefs: ['commercial-policy:sandbox'],
          policyDigest: `sha256:${'a'.repeat(64)}`,
          templateVersion: 'ae.money-document:html:v1',
          renderInputJson: '{}',
          renderInputDigest,
          state: input.state,
          environment: 'sandbox',
          sourceCount: 0,
          snapshotDigest,
          snapshotCutoffAt: day,
          periodStart: 0,
          periodEnd: day,
          pageCount: 1,
          exactAmountUnits: '0',
          fileId: files.fileId,
          fileDigest,
          csvFileId: files.csvFileId,
          csvFileDigest,
          createdAt: day,
        })
      })
      return { renderInputDigest }
    }

    const firstDocumentRef = 'money-document:daily-close:first'
    const secondDocumentRef = 'money-document:daily-close:second'
    await seedDailyClose({
      accountRef: first.canonicalAccountRef,
      documentRef: firstDocumentRef,
      state: 'issued',
    })
    const secondDocument = await seedDailyClose({
      accountRef: second.canonicalAccountRef,
      documentRef: secondDocumentRef,
      state: 'awaiting_signature',
    })
    const administrator = await ownerAdmin(backend, 'user_daily-close-admin-only')
    const workload = await publishedBusinessOwner(backend, 'daily-close-workload')
    await backend.run(async (ctx) => {
      const workloadPrincipal = await ctx.db.query('principals')
        .withIndex('by_principalRef', (query) => query.eq('principalRef', workload.canonicalPrincipalRef))
        .unique()
      if (workloadPrincipal === null) throw new Error('daily_close_workload_fixture_missing')
      await ctx.db.patch(workloadPrincipal._id, { kind: 'workload' })

      const principals = await ctx.db.query('principals').collect()
      const administratorPrincipal = principals.find((principal) =>
        principal.displayName === 'user_daily-close-admin-only admin')
      if (administratorPrincipal === undefined) throw new Error('daily_close_admin_fixture_missing')
      for (const ownership of await ctx.db.query('accountOwnerships').collect()) {
        if (ownership.ownerPrincipalRef === administratorPrincipal.principalRef) {
          await ctx.db.delete(ownership._id)
        }
      }
    })
    const documentBeforeRoleRefusals = await backend.run(async (ctx) => await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (query) => query.eq('documentRef', secondDocumentRef)).unique())

    await expect(first.owner.mutation(api.moneyDocuments.signOwnerDailyClose, {
      documentRef: secondDocumentRef,
      expectedRenderInputDigest: secondDocument.renderInputDigest,
      confirmation: secondDocumentRef,
    })).resolves.toEqual({ kind: 'refused', code: 'daily_close_not_found' })
    for (const caller of [administrator, workload.owner]) {
      await expect(caller.mutation(api.moneyDocuments.signOwnerDailyClose, {
        documentRef: secondDocumentRef,
        expectedRenderInputDigest: secondDocument.renderInputDigest,
        confirmation: secondDocumentRef,
      })).resolves.toEqual({ kind: 'refused', code: 'authentication_required' })
    }
    const documentAfterRoleRefusals = await backend.run(async (ctx) => await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (query) => query.eq('documentRef', secondDocumentRef)).unique())
    expect(documentAfterRoleRefusals).toEqual(documentBeforeRoleRefusals)
    await expect(second.owner.mutation(api.moneyDocuments.signOwnerDailyClose, {
      documentRef: secondDocumentRef,
      expectedRenderInputDigest: secondDocument.renderInputDigest,
      confirmation: secondDocumentRef,
    })).resolves.toMatchObject({ kind: 'signed', documentRef: secondDocumentRef })

    await expect(first.owner.query(api.moneyDocuments.readOwnerDocumentUrl, {
      documentRef: secondDocumentRef,
    })).resolves.toBeNull()
    await expect(first.owner.query(api.moneyDocuments.readOwnerDocumentUrl, {
      documentRef: firstDocumentRef,
    })).resolves.toEqual(expect.any(String))
    await expect(second.owner.query(api.moneyDocuments.readOwnerDocumentUrl, {
      documentRef: secondDocumentRef,
    })).resolves.toEqual(expect.any(String))
    for (const caller of [administrator, workload.owner]) {
      await expect(caller.query(api.moneyDocuments.readOwnerDocumentUrl, {
        documentRef: secondDocumentRef,
      })).resolves.toBeNull()
    }

    await expect(backend.mutation(api.moneyDocuments.signOwnerDailyClose, {
      documentRef: secondDocumentRef,
      expectedRenderInputDigest: secondDocument.renderInputDigest,
      confirmation: secondDocumentRef,
    })).resolves.toEqual({ kind: 'refused', code: 'authentication_required' })
    await expect(backend.query(api.moneyDocuments.readOwnerDocumentUrl, {
      documentRef: secondDocumentRef,
    })).resolves.toBeNull()
  })
})
