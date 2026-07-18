import { describe, expect, it, vi } from 'vitest'

import {
  assembleCustomerEvidenceExport,
  assertProblemBusinessReportsIntegrity,
  assertProblemUpdatesIntegrity,
  loadProblemBusinessReports,
  loadProblemUpdates,
  type EvidenceLoadPorts,
} from '@/modules/customer-request/route-execution/evidence-load'

describe('evidence-load problem-row integrity', () => {
  it('accepts contiguous update versions and rejects gaps or overflow', () => {
    expect(() => assertProblemUpdatesIntegrity([
      { version: 1 }, { version: 2 },
    ])).not.toThrow()
    expect(() => assertProblemUpdatesIntegrity([
      { version: 1 }, { version: 3 },
    ])).toThrow('customer_request_route_problem_update_integrity_failure')
    expect(() => assertProblemUpdatesIntegrity(
      Array.from({ length: 101 }, (_, index) => ({ version: index + 1 })),
    )).toThrow('customer_request_route_problem_update_integrity_failure')
  })

  it('rejects more than 100 business reports', () => {
    expect(() => assertProblemBusinessReportsIntegrity(
      Array.from({ length: 101 }, () => ({})),
    )).toThrow('customer_request_route_problem_business_report_integrity_failure')
  })

  it('loadProblemUpdates enforces integrity through ports', async () => {
    const ports = {
      listProblemUpdatesByReportRef: vi.fn(async () => [
        { version: 1, state: 'received' as const, source: 'customer' as const, message: 'a', createdAt: 1 },
      ]),
    }
    const updates = await loadProblemUpdates(ports, 'report:1')
    expect(updates).toHaveLength(1)
    expect(ports.listProblemUpdatesByReportRef).toHaveBeenCalledWith('report:1', 101)
  })

  it('loadProblemBusinessReports enforces integrity through ports', async () => {
    const ports = {
      listProblemBusinessReportsByReportRef: vi.fn(async () => [
        {
          statementRef: 'stmt:1',
          businessId: 'biz:1',
          businessName: 'AccessRide',
          causalityPosition: 'supports' as const,
          statement: 'ok',
          evidenceReceiptRefs: [],
          createdAt: 1,
        },
      ]),
    }
    const reports = await loadProblemBusinessReports(ports, 'report:1')
    expect(reports).toHaveLength(1)
    expect(ports.listProblemBusinessReportsByReportRef).toHaveBeenCalledWith('report:1', 101)
  })
})

describe('assembleCustomerEvidenceExport', () => {
  it('returns none when head is missing or principal mismatches', async () => {
    const ports = {
      getRunHeadByRequestId: vi.fn(async () => null),
    } as unknown as EvidenceLoadPorts
    await expect(assembleCustomerEvidenceExport(
      { requestId: 'req:1', principalId: 'principal:1' },
      ports,
    )).resolves.toEqual({ kind: 'none' })

    const mismatched = {
      getRunHeadByRequestId: vi.fn(async () => ({
        currentRunRef: 'run:1', principalId: 'other',
      })),
    } as unknown as EvidenceLoadPorts
    await expect(assembleCustomerEvidenceExport(
      { requestId: 'req:1', principalId: 'principal:1' },
      mismatched,
    )).resolves.toEqual({ kind: 'none' })
  })
})
