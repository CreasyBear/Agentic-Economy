import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callSourceMutation: vi.fn(),
  callSourceQuery: vi.fn(),
  sourceMutation: vi.fn((name: string) => ({ name })),
  sourceQuery: vi.fn((name: string) => ({ name })),
  proof: vi.fn(), admission: vi.fn(), request: vi.fn(),
}))

vi.mock('@/lib/server/convex-source', () => ({
  callSourceMutation: mocks.callSourceMutation,
  callSourceQuery: mocks.callSourceQuery,
  sourceMutation: mocks.sourceMutation,
  sourceQuery: mocks.sourceQuery,
}))

vi.mock('@/lib/server/clerk-consequence-proof', () => ({ readClerkMfaConsequenceProof: mocks.proof }))
vi.mock('@/lib/server/source-write-admission', () => ({
  sourceWriteAdmissionFromContext: mocks.admission, sourceWriteRequestFromAdmission: mocks.request,
}))

import {
  decideCallApprovalThroughSource,
  listPendingCallApprovalsThroughSource,
} from '@/lib/server/call-approval-source'

describe('operation approval source', () => {
  beforeEach(() => {
    mocks.callSourceMutation.mockReset()
    mocks.callSourceQuery.mockReset()
    mocks.proof.mockReset()
    mocks.admission.mockReset().mockResolvedValue({ signature: 'signed' })
    mocks.request.mockReset().mockReturnValue({ method: 'POST' })
  })

  it('delegates to Convex', async () => {
    mocks.callSourceQuery.mockResolvedValue([])
    mocks.callSourceMutation.mockResolvedValue({ kind: 'approved', callRef: 'call:test' })

    await expect(listPendingCallApprovalsThroughSource()).resolves.toEqual([])
    expect(mocks.callSourceQuery).toHaveBeenCalledTimes(1)

    await expect(
      decideCallApprovalThroughSource({ callRef: 'call:test', decision: 'deny' }, { request: 'same-origin' }),
    ).resolves.toEqual({ kind: 'approved', callRef: 'call:test' })
    expect(mocks.callSourceMutation).toHaveBeenCalledTimes(1)
    expect(mocks.proof).not.toHaveBeenCalled()
    expect(mocks.admission).toHaveBeenCalledWith(expect.objectContaining({ scope: 'protected_action',
      command: { callRef: 'call:test', decision: 'deny', operationKey: 'call-approval:call:test:deny', correlationId: 'call-approval:call:test:deny' } }))
  })
})
