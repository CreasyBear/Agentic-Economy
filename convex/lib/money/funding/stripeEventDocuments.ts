import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import type { StableHashValue } from '../../../../src/modules/common/stable-hash'
import { AUD_EXPONENT } from '../../../../src/modules/money/public'
import { createAndQueueDocument } from '../documents/insert'
import { scheduleFundingTaxInvoice } from '../documents/taxInvoices'

export async function recordFundingDocuments(
  ctx: MutationCtx,
  command: Doc<'moneyFundingCommands'>,
  transactionRef: string,
  occurredAt: number,
): Promise<void> {
  const definitions: readonly Readonly<{
    kind: 'funding_receipt' | 'service_fee_document'
    amountUnits: string
    detail: Readonly<Record<string, string>>
  }>[] = [
    {
      kind: 'funding_receipt' as const,
      amountUnits: command.principalUnits,
      detail: {
        principalUnits: command.principalUnits,
        serviceFeeUnits: command.serviceFeeUnits,
        taxUnits: command.taxUnits,
        totalUnits: command.totalUnits,
      },
    },
    {
      kind: 'service_fee_document' as const,
      amountUnits: (BigInt(command.serviceFeeUnits) + BigInt(command.taxUnits)).toString(),
      detail: { serviceFeeUnits: command.serviceFeeUnits, taxUnits: command.taxUnits },
    },
  ]
  for (const definition of definitions) {
    const documentRef = `money-document:${definition.kind}:${transactionRef}`
    await createAndQueueDocument(ctx, documentRef, () => {
      const renderInput = {
        format: 'ae.money-document-render-input:v1',
        documentRef,
        accountRef: command.accountRef,
        kind: definition.kind,
        currency: 'AUD',
        exponent: AUD_EXPONENT,
        amountUnits: definition.amountUnits,
        detail: definition.detail,
        transactionRef,
        occurredAt,
        policyRefs: command.commercialPolicyRefs,
        policyDigest: command.commercialPolicyDigest,
      } as const satisfies StableHashValue
      return {
        renderInput,
        accountRef: command.accountRef,
        kind: definition.kind,
        sourceTransactionRef: transactionRef,
        amountUnits: definition.amountUnits,
        policyRefs: command.commercialPolicyRefs,
        policyDigest: command.commercialPolicyDigest,
        environment: command.environment,
        occurredAt,
      }
    })
  }
  await scheduleFundingTaxInvoice(ctx, command.commandRef, transactionRef)
}

export async function recordFundingReversalDocument(
  ctx: MutationCtx,
  command: Doc<'moneyFundingCommands'>,
  transactionRef: string,
  occurredAt: number,
): Promise<void> {
  const documentRef = `money-document:adjustment:${transactionRef}`
  await createAndQueueDocument(ctx, documentRef, () => {
    const renderInput = {
      format: 'ae.money-document-render-input:v1',
      documentRef,
      accountRef: command.accountRef,
      kind: 'adjustment',
      currency: 'AUD',
      exponent: AUD_EXPONENT,
      amountUnits: command.totalUnits,
      detail: {
        reason: 'processor_full_refund',
        principalUnits: command.principalUnits,
        serviceFeeUnits: command.serviceFeeUnits,
        taxUnits: command.taxUnits,
        totalUnits: command.totalUnits,
      },
      transactionRef,
      occurredAt,
      policyRefs: command.commercialPolicyRefs,
      policyDigest: command.commercialPolicyDigest,
    } as const satisfies StableHashValue
    return {
      renderInput,
      accountRef: command.accountRef,
      kind: 'adjustment' as const,
      sourceTransactionRef: transactionRef,
      amountUnits: command.totalUnits,
      policyRefs: command.commercialPolicyRefs,
      policyDigest: command.commercialPolicyDigest,
      environment: command.environment,
      occurredAt,
    }
  })
  await scheduleFundingTaxInvoice(ctx, command.commandRef, transactionRef)
}
