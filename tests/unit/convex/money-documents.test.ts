/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import { internal } from '../../../convex/_generated/api'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import { convexTestWithWorkers } from '../../helpers/convex-fixtures'

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
})
