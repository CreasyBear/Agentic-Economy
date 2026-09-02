import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  callSourceAction,
  callSourceMutation,
  callSourceQuery,
  sourceAction,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'

export type MoneyDocumentView = Readonly<{
  documentRef: string
  kind: 'funding_receipt' | 'service_fee_document' | 'statement' | 'adjustment' | 'tax_invoice'
  amountUnits: string
  residualUnits: string
  sourceTransactionRefs: string[]
  policyRefs: string[]
  policyDigest: string
  templateVersion: string
  rendered: boolean
  createdAt: number
}>

export type MoneyReconciliationCaseView = Readonly<{
  caseRef: string
  accountRef: string
  kind: 'projection_mismatch' | 'processor_difference' | 'treasury_difference' | 'settlement_difference' | 'document_difference'
  status: 'open' | 'resolved'
  ownerPrincipalRef?: string
  transactionRef?: string
  reasonCode: string
  evidenceRefs: string[]
  resolutionEvidenceRefs?: string[]
  createdAt: number
  updatedAt: number
  resolvedAt?: number
}>

type Page<T> = Readonly<{
  page: T[]
  continueCursor: string
  isDone: boolean
}>

const listDocumentsQuery = sourceQuery<{
  paginationOpts: { numItems: number; cursor: string | null }
}, Page<MoneyDocumentView>>('moneyDocuments:listOwnerDocuments')
const createStatementMutation = sourceMutation<{
  environment: 'sandbox' | 'production'
  periodStart: number
  periodEnd: number
}, { kind: 'created' | 'replayed'; documentRef: string } | { kind: 'refused'; code: string }>(
  'moneyDocuments:createOwnerStatement',
)
const renderDocumentAction = sourceAction<
  { documentRef: string },
  { kind: 'available'; fileId: string }
>('moneyDocumentRender:renderOwnerDocument')
const readDocumentUrlQuery = sourceQuery<{ documentRef: string }, string | null>(
  'moneyDocuments:readOwnerDocumentUrl',
)
const listCasesQuery = sourceQuery<{
  status?: 'open' | 'resolved'
  paginationOpts: { numItems: number; cursor: string | null }
}, Page<MoneyReconciliationCaseView>>('moneyReconciliation:listOwnerCases')

const cursorInput = z.strictObject({ cursor: z.string().max(2_000).nullable().optional() })
const statementInput = z.strictObject({
  periodStart: z.number().int().nonnegative(),
  periodEnd: z.number().int().positive(),
})
const documentInput = z.strictObject({ documentRef: z.string().min(1).max(500) })

export const readOwnerMoneyDocumentsServer = createServerFn({ method: 'GET' })
  .validator((data) => cursorInput.parse(data ?? {}))
  .handler(async ({ data }) => await callSourceQuery(listDocumentsQuery, {
    paginationOpts: { numItems: 50, cursor: data.cursor ?? null },
  }))

export const readOwnerMoneyReconciliationServer = createServerFn({ method: 'GET' })
  .validator((data) => cursorInput.parse(data ?? {}))
  .handler(async ({ data }) => await callSourceQuery(listCasesQuery, {
    paginationOpts: { numItems: 50, cursor: data.cursor ?? null },
  }))

export const createOwnerStatementServer = createServerFn({ method: 'POST' })
  .validator((data) => statementInput.parse(data))
  .handler(async ({ data }) => await callSourceMutation(createStatementMutation, {
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
  }))

export const renderOwnerMoneyDocumentServer = createServerFn({ method: 'POST' })
  .validator((data) => documentInput.parse(data))
  .handler(async ({ data }) => {
    await callSourceAction(renderDocumentAction, data)
    return await callSourceQuery(readDocumentUrlQuery, data)
  })
