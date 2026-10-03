import { internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server'

import { createOwnerStatementArgs, createOwnerStatementResult, createOwnerStatementHandler } from './lib/money/documents/statement'
import { readStatementPageArgs, readStatementPageResult, readStatementPageHandler, applyStatementPageArgs, applyStatementPageResult, applyStatementPageHandler, runStatementPageArgs, runStatementPageResult, runStatementPageHandler } from './lib/money/documents/statementPage'
import { readStatementFinalizationArgs, readStatementFinalizationResult, readStatementFinalizationHandler, queueStatementRenderArgs, queueStatementRenderResult, queueStatementRenderHandler, finalizeStatementArgs, finalizeStatementResult, finalizeStatementHandler } from './lib/money/documents/statementFinalization'
import { completeDocumentWorkArgs, completeDocumentWorkResult, completeDocumentWorkHandler } from './lib/money/documents/workpool'
import { listOwnerDocumentsArgs, listOwnerDocumentsResult, listOwnerDocumentsHandler, readForRenderArgs, readForRenderResult, readForRenderHandler, readQueuedForRenderArgs, readQueuedForRenderResult, readQueuedForRenderHandler, readOwnerDocumentUrlArgs, readOwnerDocumentUrlResult, readOwnerDocumentUrlHandler } from './lib/money/documents/reads'
import { attachRenderedFileArgs, attachRenderedFileResult, attachRenderedFileHandler } from './lib/money/documents/attachment'
import { signOwnerDailyCloseArgs, signOwnerDailyCloseResult, signOwnerDailyCloseHandler } from './lib/money/documents/signing'
import {
  issueOwnerFundingTaxInvoiceArgs, issueFundingTaxInvoiceArgs, issueFundingTaxInvoiceResult,
  issueOwnerFundingTaxInvoiceHandler, issueFundingTaxInvoiceHandler,
} from './lib/money/documents/taxInvoices'


export const createOwnerStatement = mutation({
  args: createOwnerStatementArgs,
  returns: createOwnerStatementResult,
  handler: createOwnerStatementHandler,
})

export const issueOwnerFundingTaxInvoice = mutation({
  args: issueOwnerFundingTaxInvoiceArgs,
  returns: issueFundingTaxInvoiceResult,
  handler: issueOwnerFundingTaxInvoiceHandler,
})

export const issueFundingTaxInvoice = internalMutation({
  args: issueFundingTaxInvoiceArgs,
  returns: issueFundingTaxInvoiceResult,
  handler: issueFundingTaxInvoiceHandler,
})

export const readStatementPage = internalQuery({
  args: readStatementPageArgs,
  returns: readStatementPageResult,
  handler: readStatementPageHandler,
})

export const applyStatementPage = internalMutation({
  args: applyStatementPageArgs,
  returns: applyStatementPageResult,
  handler: applyStatementPageHandler,
})

export const runStatementPage = internalAction({
  args: runStatementPageArgs,
  returns: runStatementPageResult,
  handler: runStatementPageHandler,
})

export const readStatementFinalization = internalQuery({
  args: readStatementFinalizationArgs,
  returns: readStatementFinalizationResult,
  handler: readStatementFinalizationHandler,
})

export const queueStatementRender = internalMutation({
  args: queueStatementRenderArgs,
  returns: queueStatementRenderResult,
  handler: queueStatementRenderHandler,
})

export const finalizeStatement = internalAction({
  args: finalizeStatementArgs,
  returns: finalizeStatementResult,
  handler: finalizeStatementHandler,
})

export const completeDocumentWork = internalMutation({
  args: completeDocumentWorkArgs,
  returns: completeDocumentWorkResult,
  handler: completeDocumentWorkHandler,
})

export const listOwnerDocuments = query({
  args: listOwnerDocumentsArgs,
  returns: listOwnerDocumentsResult,
  handler: listOwnerDocumentsHandler,
})

export const readForRender = internalQuery({
  args: readForRenderArgs,
  returns: readForRenderResult,
  handler: readForRenderHandler,
})

export const readQueuedForRender = internalQuery({
  args: readQueuedForRenderArgs,
  returns: readQueuedForRenderResult,
  handler: readQueuedForRenderHandler,
})

export const readOwnerDocumentUrl = query({
  args: readOwnerDocumentUrlArgs,
  returns: readOwnerDocumentUrlResult,
  handler: readOwnerDocumentUrlHandler,
})

export const attachRenderedFile = internalMutation({
  args: attachRenderedFileArgs,
  returns: attachRenderedFileResult,
  handler: attachRenderedFileHandler,
})

export const signOwnerDailyClose = mutation({
  args: signOwnerDailyCloseArgs,
  returns: signOwnerDailyCloseResult,
  handler: signOwnerDailyCloseHandler,
})
