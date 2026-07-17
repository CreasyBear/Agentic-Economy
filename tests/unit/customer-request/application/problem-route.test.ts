import { describe, expect, it, vi } from 'vitest'

import {
  exportRouteEvidence,
  listRouteProblemsForSupport,
  projectProblemReported,
  projectProblemStatusChange,
  readRouteProblemForBusiness,
  recordRouteProblemBusinessReport,
  replyRouteProblem,
  reportRouteProblem,
  updateRouteProblemStatus,
  type ProblemRoutePorts,
} from '@/modules/customer-request/application/public'
import type { CompareResumeAggregate } from '@/modules/customer-request/application/compare-resume/types'

const NOW = Date.now()

const aggregate = {
  snapshot: {
    requestId: 'req:1',
    revision: 3,
    intent: 'Find a wheelchair-accessible ride',
    principalId: 'principal:1',
    networkId: 'net:1',
    delegatedAgentId: 'agent:1',
    facts: [],
    snapshotDigest: 'snap:1',
  },
  evaluation: {
    criteria: [{
      label: 'Destination',
      value: 'Perth',
      basis: 'customer_provided' as const,
      inputKey: 'destination',
    }],
    posture: 'progress_available' as const,
    factsDigest: 'facts:1',
    evaluationDigest: 'eval:1',
  },
  outcome: 'plan_ready' as const,
  plan: {
    actions: [{ actionId: 'action:1' }],
    planRevisionId: 'plan:1',
    planDigest: 'digest:plan:1',
    createdAt: NOW,
    registrySnapshotDigest: 'registry:1',
    compilerVersion: 'v1',
    interpreterId: 'interp:1',
    proposalDigest: 'prop:1',
  },
} satisfies CompareResumeAggregate

function basePorts(overrides: Partial<ProblemRoutePorts> = {}): ProblemRoutePorts {
  return {
    loadCurrent: vi.fn(async () => ({
      kind: 'current' as const,
      aggregate,
      routeGenerationNumber: 2,
      routeGenerationRef: 'gen:1',
    })),
    reportProblem: vi.fn(async () => ({
      kind: 'reported' as const,
      reportRef: 'problem:1',
      reportedAt: NOW,
      affected: { step: 1 },
      visibility: 'customer_and_ae_only' as const,
      evidence: [{ receiptRef: 'receipt:1', label: 'Step evidence' }],
    })),
    recordProblemBusinessReport: vi.fn(async () => ({
      kind: 'recorded' as const,
      statementRef: 'statement:1',
      reportRef: 'problem:1',
      business: 'Accessible Rides',
      causalityPosition: 'disputes' as const,
      statement: 'We delivered the booked trip.',
      evidence: [{ receiptRef: 'receipt:2', label: 'Business evidence' }],
      recordedAt: NOW,
    })),
    updateProblemStatus: vi.fn(async () => ({
      kind: 'updated' as const,
      reportRef: 'problem:1',
      version: 2,
      state: 'investigating' as const,
      recordedAt: NOW,
    })),
    replyProblem: vi.fn(async () => ({
      kind: 'updated' as const,
      reportRef: 'problem:1',
      version: 3,
      state: 'waiting_for_customer' as const,
      recordedAt: NOW,
    })),
    exportCustomerEvidence: vi.fn(async () => ({
      kind: 'found' as const,
      state: 'completed' as const,
      generatedAt: NOW,
      steps: [{
        step: 1,
        state: 'completed' as const,
        observedAt: NOW,
        business: 'Accessible Rides',
        providerOrigin: 'https://example.com',
        evidence: [{ receiptRef: 'receipt:1', label: 'Step evidence' }],
      }],
      problems: [],
    })),
    readProblemForBusiness: vi.fn(async () => ({
      kind: 'business_problem' as const,
      reportRef: 'problem:1',
      business: 'Accessible Rides',
      category: 'incorrect_result' as const,
      customerStatement: 'Wrong drop-off',
      causality: 'unknown' as const,
      resolution: 'not_adjudicated' as const,
      decisionAuthority: 'not_assigned' as const,
      evidence: [],
      availableEvidence: [],
      businessClaims: [],
    })),
    listProblemsForSupport: vi.fn(async () => ({
      kind: 'allowed' as const,
      rows: [{
        reportRef: 'problem:1',
        requestRef: 'req:1',
        version: 1,
        state: 'received' as const,
        nextActor: 'ae' as const,
        category: 'incorrect_result' as const,
        summary: 'Wrong drop-off',
        reportedAt: NOW,
        lastUpdatedAt: NOW,
      }],
    })),
    exportProblemForSupport: vi.fn(async () => ({ kind: 'not_found' as const })),
    ...overrides,
  }
}

describe('customer-request problem-route', () => {
  it('projects a problem receipt from tracking', () => {
    expect(projectProblemReported({
      requestRef: 'req:1',
      category: 'incorrect_result',
      reportRef: 'problem:1',
      reportedAt: NOW,
      visibility: 'customer_and_ae_only',
      evidence: [{ receiptRef: 'receipt:1', label: 'Step evidence' }],
      affected: { step: 1 },
    })).toMatchObject({
      kind: 'problem_reported',
      state: 'received',
      problem: {
        claimSource: 'customer',
        nextAction: 'await_status_update',
        nextActor: 'ae',
      },
    })
  })

  it('projects a status change and rejects check_status integrity failure', () => {
    expect(projectProblemStatusChange('problem_status_updated', {
      reportRef: 'problem:1',
      version: 2,
      state: 'investigating',
      recordedAt: NOW,
    })).toMatchObject({
      kind: 'problem_status_updated',
      nextAction: 'await_status_update',
      nextActor: 'ae',
    })
  })

  it('reports a problem through the reportProblem port', async () => {
    const ports = basePorts()
    const result = await reportRouteProblem({
      requestRef: 'req:1',
      principalId: 'principal:1',
      idempotencyKey: 'report:1',
      category: 'incorrect_result',
      summary: 'Wrong drop-off',
      evidenceReceiptRefs: ['receipt:1'],
      visibility: 'customer_and_ae_only',
    }, ports)
    expect(result).toMatchObject({ kind: 'problem_reported', reportRef: 'problem:1' })
    expect(ports.reportProblem).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'req:1',
      principalId: 'principal:1',
    }))
  })

  it('refuses report when the request is not owned by the principal', async () => {
    const result = await reportRouteProblem({
      requestRef: 'req:1',
      principalId: 'principal:other',
      idempotencyKey: 'report:1',
      category: 'incorrect_result',
      summary: 'Wrong drop-off',
      evidenceReceiptRefs: [],
      visibility: 'customer_and_ae_only',
    }, basePorts())
    expect(result).toEqual({ kind: 'refused', reason: 'request_not_found' })
  })

  it('records a business report through the port', async () => {
    const ports = basePorts()
    const result = await recordRouteProblemBusinessReport({
      reportRef: 'problem:1',
      idempotencyKey: 'biz:1',
      causalityPosition: 'disputes',
      statement: 'We delivered the booked trip.',
    }, ports)
    expect(result).toMatchObject({
      kind: 'business_report_recorded',
      claimSource: 'business',
      decisionAuthority: 'not_assigned',
    })
  })

  it('updates and replies through shared status projection', async () => {
    const ports = basePorts()
    await expect(updateRouteProblemStatus({
      reportRef: 'problem:1',
      expectedVersion: 1,
      idempotencyKey: 'status:1',
      state: 'investigating',
      publicMessage: 'Looking into it',
    }, ports)).resolves.toMatchObject({ kind: 'problem_status_updated', state: 'investigating' })

    await expect(replyRouteProblem({
      requestRef: 'req:1',
      reportRef: 'problem:1',
      principalId: 'principal:1',
      expectedVersion: 2,
      idempotencyKey: 'reply:1',
      message: 'Here is more detail',
    }, ports)).resolves.toMatchObject({
      kind: 'problem_reply_recorded',
      state: 'waiting_for_customer',
      nextAction: 'provide_information',
    })
  })

  it('exports evidence after ownership check', async () => {
    const ports = basePorts()
    const result = await exportRouteEvidence({
      requestRef: 'req:1',
      principalId: 'principal:1',
    }, ports)
    expect(result).toMatchObject({
      kind: 'evidence',
      requestRef: 'req:1',
      state: 'completed',
    })
    expect(ports.exportCustomerEvidence).toHaveBeenCalledWith({
      requestId: 'req:1',
      principalId: 'principal:1',
    })
  })

  it('delegates thin business and support reads through ports', async () => {
    const ports = basePorts()
    await expect(readRouteProblemForBusiness({ reportRef: 'problem:1' }, ports))
      .resolves.toMatchObject({ kind: 'business_problem' })
    await expect(listRouteProblemsForSupport({ limit: 20 }, ports))
      .resolves.toMatchObject({ kind: 'allowed', rows: [{ reportRef: 'problem:1' }] })
  })
})
