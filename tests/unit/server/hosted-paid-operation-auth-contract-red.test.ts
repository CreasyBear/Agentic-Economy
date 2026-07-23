import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const convex = readFileSync('convex/actionInvocationControl.ts', 'utf8')
const agentAuth = readFileSync('src/lib/server/customer-request-agent-auth.ts', 'utf8')

function absentContract(reason: string, source: string, token: string) {
  expect(source, `[P3C_RED:${reason}] required Phase 3C contract is absent`).toContain(token)
}

describe('Phase 3C hosted paid-operation authentication RED', () => {
  it('derives the hosted actor from ctx.auth instead of caller owner fields', () => {
    absentContract('ctx_auth_actor_bridge_absent', convex, 'resolveHostedPaidOperationActor(ctx.auth)')
  })

  it('keeps authentication and evaluator admission separate from consequence authority', () => {
    absentContract('identity_authority_separation_absent', convex, 'admitHostedEvaluatorWithoutGrantingAuthority')
  })

  it('reserves evaluator count concurrency and rate limits atomically', () => {
    absentContract('atomic_trial_admission_absent', convex, 'reserveHostedTrialAdmissionAtomically')
  })

  it('fails closed for revoked paid-operation agent credentials', () => {
    absentContract('paid_operation_agent_revocation_absent', agentAuth, 'PAID_OPERATION_AGENT_SCOPE')
  })

  it('uses a non-enumerating missing and cross-principal hosted read boundary', () => {
    absentContract('hosted_non_enumeration_boundary_absent', convex, 'hostedInvocationUnavailable')
  })

  it('rejects direct bypass before any hosted operation facts are loaded', () => {
    absentContract('hosted_direct_bypass_guard_absent', convex, 'requireHostedPaidOperationIdentityBeforeRead')
  })
})
