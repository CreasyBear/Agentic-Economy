import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  PROBLEM_STATUS_UPDATE_WINDOW_MS,
  decideBusinessProblemClaim,
  decideCustomerProblemReply,
  decideCustomerProblemReport,
  decideSupportProblemStatus,
  projectCustomerEvidenceProblems,
  projectCustomerRequestProblemTracking,
  projectSupportProblemExport,
  projectSupportProblemList,
} from '@/modules/customer-request/route-execution/problem-support'

const evidenceItem = {
  evidenceId: 'result-1',
  outputPointer: 'ptr',
  schemaIdentity: 'schema',
  valueDigest: 'digest',
}

function receiptRef(attemptRef: string) {
  return `evidence:${canonicalDigest({ attemptRef, evidence: evidenceItem })}`
}

describe('problem-support public interface', () => {
  describe('tracking', () => {
    it('moves from received to update_due after the status window', () => {
      const reportedAt = 1_000
      expect(projectCustomerRequestProblemTracking(reportedAt, reportedAt + 1)).toMatchObject({
        state: 'received',
        nextAction: 'await_status_update',
        nextActor: 'ae',
      })
      expect(projectCustomerRequestProblemTracking(
        reportedAt,
        reportedAt + PROBLEM_STATUS_UPDATE_WINDOW_MS + 1,
      )).toMatchObject({
        state: 'update_due',
        nextAction: 'check_status',
        nextActor: 'ae',
      })
    })

    it('short-circuits for waiting_for_customer and closed', () => {
      expect(projectCustomerRequestProblemTracking(1, 99_999, {
        state: 'waiting_for_customer',
        recordedAt: 10,
      })).toEqual({
        state: 'waiting_for_customer',
        nextAction: 'provide_information',
        nextActor: 'customer',
        decisionAuthority: 'not_assigned',
      })
      expect(projectCustomerRequestProblemTracking(1, 99_999, {
        state: 'closed',
        recordedAt: 10,
      })).toEqual({
        state: 'closed',
        nextAction: 'none',
        nextActor: 'none',
        decisionAuthority: 'not_assigned',
      })
    })
  })

  describe('decideCustomerProblemReport', () => {
    const args = {
      requestId: 'req-1',
      principalId: 'principal-1',
      idempotencyKey: 'idem-1',
      category: 'other' as const,
      summary: 'Something went wrong',
      evidenceReceiptRefs: [] as string[],
      visibility: 'customer_and_ae_only' as const,
    }
    const head = { currentRunRef: 'run-1', principalId: 'principal-1' }
    const run = {
      principalId: 'principal-1',
      currentPosition: 1,
      totalSteps: 1,
      mandateRef: 'mandate-1',
      businesses: [{ name: 'Acme' }],
    }
    const attempt = {
      attemptRef: 'attempt-1',
      position: 1,
      evidence: [evidenceItem],
    }
    const receipt = receiptRef(attempt.attemptRef)

    it('replays the same digest and conflicts on digest change', () => {
      const prior = {
        commandDigest: canonicalDigest(args),
        reportRef: 'problem:prior',
        createdAt: 50,
        step: 1,
        attemptRef: 'attempt-1',
        businessName: 'Acme',
        evidenceReceiptRefs: [receipt],
        visibility: 'customer_and_ae_only' as const,
      }
      expect(decideCustomerProblemReport({
        args, head, prior, now: 100,
      })).toMatchObject({ kind: 'replayed', reportRef: 'problem:prior' })

      expect(decideCustomerProblemReport({
        args: { ...args, summary: 'Different summary' },
        head,
        prior,
        now: 100,
      })).toEqual({ kind: 'conflict' })
    })

    it('replays legacy digests that omit evidence and visibility', () => {
      const legacyArgs = {
        requestId: args.requestId,
        principalId: args.principalId,
        idempotencyKey: args.idempotencyKey,
        category: args.category,
        summary: args.summary,
      }
      const prior = {
        commandDigest: canonicalDigest(legacyArgs),
        reportRef: 'problem:legacy',
        createdAt: 40,
        step: 1,
      }
      expect(decideCustomerProblemReport({
        args, head, prior, now: 100,
      })).toMatchObject({ kind: 'replayed', reportRef: 'problem:legacy' })
    })

    it('refuses bad step or unknown evidence', () => {
      expect(decideCustomerProblemReport({
        args: { ...args, affectedStep: 9 },
        head,
        prior: null,
        run,
        attempt,
        now: 100,
      })).toEqual({ kind: 'refused', reason: 'evidence_not_found' })

      expect(decideCustomerProblemReport({
        args: { ...args, evidenceReceiptRefs: ['evidence:missing'] },
        head,
        prior: null,
        run,
        attempt,
        now: 100,
      })).toEqual({ kind: 'refused', reason: 'evidence_not_found' })
    })

    it('returns an append payload for a fresh valid report', () => {
      const decision = decideCustomerProblemReport({
        args: { ...args, evidenceReceiptRefs: [receipt] },
        head,
        prior: null,
        run,
        attempt,
        now: 123,
      })
      expect(decision.kind).toBe('append')
      if (decision.kind !== 'append') return
      expect(decision.result).toMatchObject({
        kind: 'reported',
        reportedAt: 123,
        affected: { step: 1, attemptRef: 'attempt-1', business: 'Acme' },
      })
      expect(decision.record.createdAt).toBe(123)
    })
  })

  describe('status and reply', () => {
    it('conflicts on stale version and replays identical status updates', () => {
      const args = {
        reportRef: 'problem:1',
        expectedVersion: 0,
        idempotencyKey: 'status-1',
        state: 'investigating' as const,
        publicMessage: 'Looking into it',
      }
      expect(decideSupportProblemStatus({
        args: { ...args, expectedVersion: 1 },
        actorRef: 'support-1',
        updates: [],
        prior: null,
        now: 10,
      })).toEqual({ kind: 'conflict', reason: 'stale_version' })

      const append = decideSupportProblemStatus({
        args, actorRef: 'support-1', updates: [], prior: null, now: 10,
      })
      expect(append.kind).toBe('append')
      if (append.kind !== 'append') return

      expect(decideSupportProblemStatus({
        args,
        actorRef: 'support-1',
        updates: [],
        prior: {
          commandDigest: append.record.commandDigest,
          reportRef: append.record.reportRef,
          version: append.record.version,
          state: append.record.state,
          createdAt: append.record.createdAt,
        },
        now: 20,
      })).toMatchObject({ kind: 'updated', version: 1, state: 'investigating' })
    })

    it('refuses customer reply unless latest state is waiting_for_customer', () => {
      const args = {
        requestId: 'req-1',
        reportRef: 'problem:1',
        principalId: 'principal-1',
        expectedVersion: 1,
        idempotencyKey: 'reply-1',
        message: 'More detail',
      }
      expect(decideCustomerProblemReply({
        args,
        updates: [{
          version: 1,
          state: 'investigating',
          source: 'ae_support',
          message: 'Working',
          createdAt: 5,
        }],
        prior: null,
        now: 10,
      })).toEqual({ kind: 'refused', reason: 'invalid_update' })

      const decision = decideCustomerProblemReply({
        args,
        updates: [{
          version: 1,
          state: 'waiting_for_customer',
          source: 'ae_support',
          message: 'Need info',
          createdAt: 5,
        }],
        prior: null,
        now: 10,
      })
      expect(decision.kind).toBe('append')
      if (decision.kind !== 'append') return
      expect(decision.result.state).toBe('investigating')
    })
  })

  describe('support reconstruction and evidence labeling', () => {
    it('projects support list rows through tracking', () => {
      const rows = projectSupportProblemList({
        reports: [{
          reportRef: 'problem:1',
          requestId: 'req-1',
          createdAt: 1_000,
          category: 'other',
          summary: 'Broken',
          businessName: 'Acme',
        }],
        updatesByReport: [[]],
        observedAt: 1_000,
      })
      expect(rows).toEqual([{
        reportRef: 'problem:1',
        requestRef: 'req-1',
        version: 0,
        state: 'received',
        nextActor: 'ae',
        category: 'other',
        summary: 'Broken',
        business: 'Acme',
        reportedAt: 1_000,
        lastUpdatedAt: 1_000,
      }])
    })

    it('reconstructs spend admit sum, releaseState, and retry posture', () => {
      const material = {
        problem: {
          reportRef: 'problem:1',
          requestId: 'req-1',
          runRef: 'run-1',
          mandateRef: 'mandate-1',
          attemptRef: 'attempt-1',
          step: 1,
          businessName: 'Resolver',
          createdAt: 5_000,
          category: 'other',
          summary: 'Need help',
          visibility: 'share_with_affected_business',
          evidenceReceiptRefs: [],
        },
        updates: [],
        businessReports: [],
        attempt: {
          attemptRef: 'attempt-1',
          requestId: 'req-1',
          position: 1,
          grant: { step: { businessId: 'biz-1' } },
          evidence: [],
        },
        requestRevision: {
          requestRevision: 1,
          aggregate: { snapshot: { intent: 'Resolve a service reference' } },
        },
        mandateIssue: {
          requestId: 'req-1',
          mandateRef: 'mandate-1',
          mandate: {
            issuedAt: 5_000,
            expiresAt: 305_000,
            route: {
              maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
              steps: [{
                position: 1,
                businessId: 'biz-1',
                dataScope: [{
                  classification: 'public',
                  recipient: { kind: 'registered_binding', businessId: 'biz-1', bindingId: 'bind-1' },
                  purposes: ['resolve'],
                }],
                effects: [{
                  class: 'data_release',
                  reversibility: 'irreversible',
                }],
                recovery: {
                  idempotency: 'required',
                  recovery: 'retry_safe',
                },
              }],
            },
          },
        },
        run: {
          requestId: 'req-1',
          mandateRef: 'mandate-1',
          state: 'failed',
          completedSteps: 0,
          totalSteps: 1,
          businesses: [{ businessRef: 'biz-1', name: 'Resolver' }],
        },
        revocation: null,
        reservations: [{ reservedSpend: { currency: 'AUD', amountMinor: 300 } }],
        attempts: [{
          position: 1,
          state: 'failed',
          dispatchState: 'delivered',
          transportObservationJson: JSON.stringify({
            transport: 'http',
            disposition: 'refused',
            releaseStarted: true,
            requestDigest: 'input-digest',
          }),
          attemptRef: 'attempt-1',
          evidence: [],
        }],
        businessNames: new Map([['biz-1', 'Resolver']]),
        observedAt: 10_000,
      } satisfies Parameters<typeof projectSupportProblemExport>[0]
      const export_ = projectSupportProblemExport(material)
      expect(export_.kind).toBe('problem_export')

      expect(export_.reconstruction?.execution.steps[0]?.state).toBe('failed')
      expect(export_.reconstruction?.authority.spend.admitted).toEqual({
        currency: 'AUD', amountMinor: 300,
      })
      expect(export_.reconstruction?.authority.dataSharing[0]?.releaseState).toBe('business_step_released')
      expect(export_.reconstruction?.recovery.retry).toBe('safe')
      const notReleased = projectSupportProblemExport({
        ...material,
        attempts: [{
          ...material.attempts[0]!,
          dispatchState: 'failed',
          transportObservationJson: JSON.stringify({
            transport: 'unknown',
            disposition: 'refused',
            releaseStarted: false,
            requestDigest: 'input-digest',
            failureCode: 'route_transport_work_lease_not_released',
          }),
        }],
      })
      expect(notReleased.reconstruction?.authority.dataSharing[0]?.releaseState).toBe('authorized')
      expect(notReleased.reconstruction?.authority.effects[0]?.releaseState).toBe('authorized')

      const leasedAttempt = material.attempts[0]!
      const leased = projectSupportProblemExport({
        ...material,
        attempts: [{
          position: leasedAttempt.position,
          state: 'queued',
          dispatchState: 'leased',
          attemptRef: leasedAttempt.attemptRef,
          evidence: leasedAttempt.evidence,
        }],
      })
      expect(leased.reconstruction?.execution.steps[0]?.state).toBe('leased')
    })

    it('labels only selected evidence receipt refs for customer evidence problems', () => {
      const attemptRef = 'attempt-1'
      const selected = receiptRef(attemptRef)
      const problems = projectCustomerEvidenceProblems({
        problems: [{
          reportRef: 'problem:1',
          attemptRef,
          step: 1,
          createdAt: 1,
          category: 'other',
          summary: 'Issue',
          evidenceReceiptRefs: [selected, 'evidence:unknown'],
        }],
        updatesByProblem: [[]],
        businessReportsByProblem: [[]],
        attempts: [{
          attemptRef,
          grant: { step: { businessId: 'biz-1' } },
          evidence: [evidenceItem],
        }],
        observedAt: 10,
      })
      expect(problems[0]?.evidence).toEqual([
        { receiptRef: selected, label: 'Result evidence 1' },
        { receiptRef: 'evidence:unknown', label: 'Recorded evidence' },
      ])
    })
  })

  describe('decideBusinessProblemClaim', () => {
    it('returns append for a valid claim and conflicts on digest change', () => {
      const attempt = {
        attemptRef: 'attempt-1',
        evidence: [evidenceItem],
      }
      const receipt = receiptRef(attempt.attemptRef)
      const args = {
        reportRef: 'problem:1',
        idempotencyKey: 'claim-1',
        causalityPosition: 'disputes' as const,
        statement: 'We disagree',
        evidenceReceiptRefs: [receipt],
      }
      const decision = decideBusinessProblemClaim({
        args,
        report: { reportRef: 'problem:1' },
        attempt,
        business: { id: 'biz-1', name: 'Acme' },
        actorRef: 'owner-token',
        prior: null,
        now: 20,
      })
      expect(decision.kind).toBe('append')
      if (decision.kind !== 'append') return

      expect(decideBusinessProblemClaim({
        args: { ...args, statement: 'Different' },
        report: { reportRef: 'problem:1' },
        attempt,
        business: { id: 'biz-1', name: 'Acme' },
        actorRef: 'owner-token',
        prior: {
          commandDigest: decision.record.commandDigest,
          statementRef: decision.record.statementRef,
          reportRef: decision.record.reportRef,
          businessName: decision.record.businessName,
          causalityPosition: decision.record.causalityPosition,
          statement: decision.record.statement,
          evidenceReceiptRefs: decision.record.evidenceReceiptRefs,
          createdAt: decision.record.createdAt,
        },
        now: 30,
      })).toEqual({ kind: 'conflict' })
    })
  })
})
