import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'

export type CustomerRequestConflictReason =
  | 'revision_changed'
  | 'options_changed'
  | 'identity_changed'
  | 'idempotency_key_reused'

export type CustomerRequestRefusedReason =
  | 'authentication_required'
  | 'request_not_found'
  | 'interpreter_unavailable'
  | 'capabilities_unavailable'
  | 'evidence_not_found'
  | 'invalid_amendment'

/** Composition-layer action result — Convex adapters clone into validators via writableView. */
export type CustomerRequestActionResult =
  | CustomerRequestView
  | Readonly<{
      kind: 'conflict'
      requestRef: string
      reason: CustomerRequestConflictReason
    }>
  | Readonly<{
      kind: 'refused'
      reason: CustomerRequestRefusedReason
    }>
