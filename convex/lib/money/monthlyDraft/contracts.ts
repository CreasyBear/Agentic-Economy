import { v } from 'convex/values'
import { failureValues, financialReadResult } from '../usageReconciliation/contracts'
export const draftIntentArgs = { month: v.string(), revision: v.number() }
export const draftReadArgs = { draftRef: v.string() }
export const draftResult = v.union(v.object({ kind: v.literal('available'), draftRef: v.string(), snapshotJson: v.string(), snapshotDigest: v.string(), issuedInvoice: v.literal(false), authoritativeForConsequences: v.literal(false) }), ...failureValues)
export const draftAdmissionResult = v.union(v.object({ kind: v.literal('admitted'), draftRef: v.string(), accountRef: v.string(), month: v.string(), revision: v.number(), ledgerSnapshotAt: v.number(), sourceDigest: v.string(), snapshotJson: v.union(v.string(), v.null()), financialSnapshotJson: v.union(v.string(), v.null()) }), ...failureValues)
export const captureFinancialArgs = { draftRef: v.string(), financial: financialReadResult }
export const captureResult = v.union(v.object({ kind: v.literal('captured') }), ...failureValues)
