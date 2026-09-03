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
import { requireStrictClerkConsequenceProof } from '@/lib/server/clerk-consequence-proof'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
import { sourceWriteRequestFromAdmission } from '@/modules/security/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'

export type MoneyDocumentView = Readonly<{
  documentRef: string
  kind: 'funding_receipt' | 'service_fee_document' | 'statement' | 'daily_close' | 'adjustment' | 'tax_invoice'
  amountUnits: string
  residualUnits: string
  sourceTransactionRefs: string[]
  policyRefs: string[]
  policyDigest: string
  renderInputDigest: string
  templateVersion: string
  state: 'building' | 'adjusting' | 'rendering' | 'awaiting_signature' | 'issued' | 'failed'
  sourceCount: number
  failureCode?: string
  rendered: boolean
  signedByPrincipalRef?: string
  signedAt?: number
  closeEvidenceDigest?: string
  createdAt: number
}>

export type MoneyReconciliationCaseView = Readonly<{
  caseRef: string
  accountRef: string
  kind: 'projection_mismatch' | 'processor_difference' | 'treasury_difference' | 'settlement_difference' | 'document_difference'
  status: 'open' | 'resolved'
  scopeType?: 'account' | 'legal_customer' | 'treasury_pool' | 'operation' | 'provider_obligation' | 'document'
  scopeRef?: string
  ownerPrincipalRef?: string
  transactionRef?: string
  reasonCode: string
  evidenceRefs: string[]
  resolutionEvidenceRefs?: string[]
  createdAt: number
  updatedAt: number
  resolvedAt?: number
}>

export type MoneyProviderObligationView = Readonly<{
  obligationRef: string
  invocationRef: string
  operationRef: string
  providerRef: string
  buyerAmountUnits: string
  providerAmountUnits: string
  state: 'accrued' | 'held' | 'payable' | 'settled' | 'reversed' | 'disputed'
  payoutEligibility: 'ineligible_x402'
  evidenceRefs: string[]
  settlementTransactionRef?: string
  reversalState?: 'pending' | 'succeeded' | 'outcome_unknown'
  reversalTransactionRef?: string
  reversalStatusRef?: string
  createdAt: number
  updatedAt: number
  settledAt?: number
  reversedAt?: number
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
  purpose?: 'statement' | 'daily_close'
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
}, Page<MoneyReconciliationCaseView>>('moneyReconciliationCases:listOwnerCases')
const resolveCaseMutation = sourceMutation<{
  caseRef: string; confirmation: string; resolutionEvidenceRef: string
}, { kind: 'resolved' | 'replayed'; caseRef: string } | { kind: 'refused'; code: string }>(
  'moneyReconciliationCases:resolveOwnerCase',
)
const listObligationsQuery = sourceQuery<{
  paginationOpts: { numItems: number; cursor: string | null }
}, Page<MoneyProviderObligationView>>('moneyProviderObligations:listOwnerObligations')
const signDailyCloseMutation = sourceMutation<{
  documentRef: string; expectedRenderInputDigest: string; confirmation: string
}, { kind: 'signed' | 'replayed'; documentRef: string; evidenceDigest: string }
  | { kind: 'refused'; code: string }>('moneyDocuments:signOwnerDailyClose')
type ProviderReversalResult =
  | Readonly<{ kind: 'completed' | 'replayed'; obligationRef: string; transactionRef: string }>
  | Readonly<{ kind: 'refused'; code: string; retryable: false }>
  | Readonly<{ kind: 'unavailable'; code: string; submissionProvenAbsent: true }>
  | Readonly<{ kind: 'outcome_unknown'; reference: string; statusRef: string }>
const reverseProviderSettlementAction = sourceAction<
  Readonly<{
    obligationRef: string
    invocationRef: string
    settlementTransactionRef: string
    evidenceRef: string
    evidenceDigest: string
    expectedUpdatedAt: number
    confirmation: string
    commandRef: string
    idempotencyKey: string
    proof: Awaited<ReturnType<typeof requireStrictClerkConsequenceProof>>
    operationKey: string
    correlationId: string
    sourceWrite: Awaited<ReturnType<typeof sourceWriteAdmissionFromContext>>
    sourceWriteRequest: ReturnType<typeof sourceWriteRequestFromAdmission>
  }>,
  ProviderReversalResult
>('moneyProviderObligations:reverseOwnerSettlement')

const cursorInput = z.strictObject({ cursor: z.string().max(2_000).nullable().optional() })
const statementInput = z.strictObject({
  periodStart: z.number().int().nonnegative(),
  periodEnd: z.number().int().positive(),
})
const documentInput = z.strictObject({ documentRef: z.string().min(1).max(500) })
const signCloseInput = z.strictObject({
  documentRef: z.string().min(1).max(500),
  expectedRenderInputDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
})
const resolveCaseInput = z.strictObject({
  caseRef: z.string().min(1).max(500),
  resolutionEvidenceRef: z.string().min(1).max(500),
})
const reverseProviderSettlementInput = z.strictObject({
  obligationRef: z.string().min(1).max(500),
  invocationRef: z.string().min(1).max(500),
  settlementTransactionRef: z.string().min(1).max(500),
  evidenceRef: z.string().min(1).max(500),
  evidenceDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  expectedUpdatedAt: z.number().int().nonnegative(),
})

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

export const readOwnerProviderObligationsServer = createServerFn({ method: 'GET' })
  .validator((data) => cursorInput.parse(data ?? {}))
  .handler(async ({ data }) => await callSourceQuery(listObligationsQuery, {
    paginationOpts: { numItems: 50, cursor: data.cursor ?? null },
  }))

export const createOwnerStatementServer = createServerFn({ method: 'POST' })
  .validator((data) => statementInput.parse(data))
  .handler(async ({ data }) => await callSourceMutation(createStatementMutation, {
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    purpose: 'statement',
  }))

export const createOwnerDailyCloseServer = createServerFn({ method: 'POST' })
  .validator((data) => statementInput.parse(data))
  .handler(async ({ data }) => await callSourceMutation(createStatementMutation, {
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    purpose: 'daily_close',
  }))

export const signOwnerDailyCloseServer = createServerFn({ method: 'POST' })
  .validator((data) => signCloseInput.parse(data))
  .handler(async ({ data }) => await callSourceMutation(signDailyCloseMutation, {
    ...data,
    confirmation: data.documentRef,
  }))

export const resolveOwnerMoneyCaseServer = createServerFn({ method: 'POST' })
  .validator((data) => resolveCaseInput.parse(data))
  .handler(async ({ data }) => await callSourceMutation(resolveCaseMutation, {
    ...data,
    confirmation: data.caseRef,
  }))

export const reverseOwnerProviderSettlementServer = createServerFn({ method: 'POST' })
  .validator((data) => reverseProviderSettlementInput.parse(data))
  .handler(async ({ data, context }): Promise<ProviderReversalResult> => {
    const commandRef = canonicalDigest({
      format: 'ae.provider-obligation-reversal-command-ref:v1',
      obligationRef: data.obligationRef,
      invocationRef: data.invocationRef,
      settlementTransactionRef: data.settlementTransactionRef,
      evidenceDigest: data.evidenceDigest,
    })
    const proof = await requireStrictClerkConsequenceProof(commandRef)
    const operationKey = 'moneyProviderObligations:reverseOwnerSettlement'
    const command = {
      ...data,
      confirmation: data.obligationRef,
      commandRef,
      idempotencyKey: commandRef,
      proof,
      operationKey,
      correlationId: commandRef,
    }
    const sourceWrite = await sourceWriteAdmissionFromContext({
      context,
      command,
      scope: 'billing',
      operationKey,
      correlationId: commandRef,
    })
    return await callSourceAction(reverseProviderSettlementAction, {
      ...command,
      sourceWrite,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    })
  })

export const renderOwnerMoneyDocumentServer = createServerFn({ method: 'POST' })
  .validator((data) => documentInput.parse(data))
  .handler(async ({ data }) => {
    await callSourceAction(renderDocumentAction, data)
    return await callSourceQuery(readDocumentUrlQuery, data)
  })
