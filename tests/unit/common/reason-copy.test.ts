import { describe, expect, it } from 'vitest'

import { REASON_COPY, REASON_COPY_FALLBACK } from '@/content/reason-copy'
import { callRefusalCodeValues } from '@/modules/capability-execution/call-contracts'
import { callStatusRefusalCodeValues } from '@/modules/capability-execution/call-recovery-contracts'

/**
 * `TYPED_REASON_COPY` in `reason-copy.ts` already fails typecheck if a
 * schema-checked refusal code (Call, Call-status, Quote, Provider-connection,
 * market-request) loses its sentence. This test is the equivalent guard for
 * the funding handoff codes, whose wire schema carries an open `code: string`
 * (see `money/funding-handoff.actions.ts`), so there is no union for
 * `satisfies` to check against.
 */
const FUNDING_HANDOFF_CODES = [
  'stripe_setup_required',
  'funding_amount_invalid',
  'funding_outcome_unknown',
  'funding_idempotency_conflict',
  'payment_binding_invalid',
] as const

const REGISTRY_NOT_FOUND_CODES = ['service_not_found', 'business_not_found'] as const

describe('REASON_COPY', () => {
  it('never falls back to the raw code for a known funding handoff refusal', () => {
    for (const code of FUNDING_HANDOFF_CODES) {
      expect(REASON_COPY[code]).toBeDefined()
      expect(REASON_COPY[code]).not.toBe(REASON_COPY_FALLBACK)
    }
  })

  it('never falls back to the raw code for a registry not-found result', () => {
    for (const code of REGISTRY_NOT_FOUND_CODES) {
      expect(REASON_COPY[code]).toBeDefined()
      expect(REASON_COPY[code]).not.toBe(REASON_COPY_FALLBACK)
    }
  })

  it('covers every Call refusal code (belt-and-braces alongside the `satisfies` check)', () => {
    for (const code of callRefusalCodeValues) {
      expect(REASON_COPY[code], `missing copy for call refusal code "${code}"`).toBeDefined()
    }
  })

  it('covers every Call-status refusal code', () => {
    for (const code of callStatusRefusalCodeValues) {
      expect(REASON_COPY[code], `missing copy for call-status refusal code "${code}"`).toBeDefined()
    }
  })

  it('keeps the fallback sentence plain and actionable', () => {
    expect(REASON_COPY_FALLBACK).toBe('Something stopped this step. Try again or contact Help.')
  })
})
