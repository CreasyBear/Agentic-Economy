import type { AdminCommandReceipt } from './contracts'

export const CALL_CONTENT_REVIEW_MS = 10 * 60 * 1_000
export type CallContentReview =
  | { kind: 'command'; receipt: AdminCommandReceipt<'review_call_content'> }
  | { kind: 'content'; receipt: Extract<AdminCommandReceipt<'review_call_content'>, { kind: 'completed' }>;
      callRef: string; expiresAt: number; inputJson?: string; outputJson?: string }
