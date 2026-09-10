import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callSourceMutation: vi.fn(),
  callSourceQuery: vi.fn(),
  sourceMutation: vi.fn((name: string) => ({ name })),
  sourceQuery: vi.fn((name: string) => ({ name })),
}))

vi.mock('@/lib/server/convex-source', () => ({
  callSourceMutation: mocks.callSourceMutation,
  callSourceQuery: mocks.callSourceQuery,
  sourceMutation: mocks.sourceMutation,
  sourceQuery: mocks.sourceQuery,
}))

import {
  decideCallApprovalThroughSource,
  listPendingCallApprovalsThroughSource,
} from '@/lib/server/call-approval-source'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('operation approval source', () => {
  beforeEach(() => {
    mocks.callSourceMutation.mockReset()
    mocks.callSourceQuery.mockReset()
    vi.stubEnv('NODE_ENV', 'test')
  })

  it('returns an empty list under local E2E bypass without calling Convex', async () => {
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')

    await expect(listPendingCallApprovalsThroughSource()).resolves.toEqual([])
    expect(mocks.callSourceQuery).not.toHaveBeenCalled()
  })

  it('refuses decisions under local E2E bypass without calling Convex', async () => {
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')

    await expect(
      decideCallApprovalThroughSource({ callRef: 'call:test', decision: 'approve' }),
    ).resolves.toEqual({ kind: 'refused', code: 'authentication_required' })
    expect(mocks.callSourceMutation).not.toHaveBeenCalled()
  })

  it('delegates to Convex when the bypass is disabled', async () => {
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', '')
    mocks.callSourceQuery.mockResolvedValue([])
    mocks.callSourceMutation.mockResolvedValue({ kind: 'approved', callRef: 'call:test' })

    await expect(listPendingCallApprovalsThroughSource()).resolves.toEqual([])
    expect(mocks.callSourceQuery).toHaveBeenCalledTimes(1)

    await expect(
      decideCallApprovalThroughSource({ callRef: 'call:test', decision: 'deny' }),
    ).resolves.toEqual({ kind: 'approved', callRef: 'call:test' })
    expect(mocks.callSourceMutation).toHaveBeenCalledTimes(1)
  })
})
