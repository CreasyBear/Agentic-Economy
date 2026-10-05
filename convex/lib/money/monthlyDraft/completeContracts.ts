import { v } from 'convex/values'
import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
export const reportingPolicyValue=v.object({automaticMonthly:v.boolean(),revision:v.number(),ownerConsentCurrent:v.boolean(),schedulerActive:v.literal(false)})
export const configureReportingArgs={automaticMonthly:v.boolean(),expectedRevision:v.number(),idempotencyRef:v.string()}
export const configureReportingResult=v.object({kind:v.union(v.literal('updated'),v.literal('replayed')),revision:v.number()})
export const completeMonthArgs={month:v.string(),revision:v.number()}
export const closeRefArgs={draftRef:v.string()}
export const monthlyCloseValue=v.object({format:v.literal('ae.monthly-usage-close:v2'),draftRef:v.string(),month:v.string(),revision:v.number(),priorDraftRef:v.union(v.string(),v.null()),priorDraftDigest:v.union(v.string(),v.null()),
  state:v.union(v.literal('building'),v.literal('complete'),v.literal('failed')),usageReportRef:v.string(),documentRef:v.union(v.string(),v.null()),snapshotDigest:v.union(v.string(),v.null()),snapshotJson:v.union(v.string(),v.null()),
  relatedDocumentPartCount:v.number(),relatedDocumentCountUnits:v.string(),relatedDocumentsDigest:v.string(),failureCode:v.union(v.string(),v.null()),issuedInvoice:v.literal(false),authoritativeForConsequences:v.literal(false)})
export const monthlyCloseResult=v.union(v.object({kind:v.literal('available'),close:monthlyCloseValue}),v.object({kind:v.union(v.literal('refused'),v.literal('setup_required')),code:v.string()}))
export const advanceCompleteMonthResult=v.object({kind:v.union(v.literal('advanced'),v.literal('replayed'),v.literal('waiting'),v.literal('failed'))})
export const monthlyDocumentPartsArgs={...closeRefArgs,paginationOpts:paginationOptsValidator}
export const monthlyDocumentPartValue=v.object({position:v.number(),recordsJson:v.string(),partDigest:v.string()})
export const monthlyDocumentPartsResult=paginationResultValidator(monthlyDocumentPartValue)
export const automaticMonthArgs={cursor:v.union(v.string(),v.null())}
export const automaticMonthResult=v.object({isDone:v.boolean(),continueCursor:v.string(),requestedCount:v.number()})
