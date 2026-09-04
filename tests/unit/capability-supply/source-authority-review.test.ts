import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callSourceMutation: vi.fn(),
  setResponseHeader: vi.fn(),
  sourceWriteAdmissionFromContext: vi.fn(),
  sourceWriteRequestFromAdmission: vi.fn(),
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: () => ({ handler: (handler: unknown) => handler }),
  }),
}))
vi.mock('@tanstack/react-start/server', () => ({
  setResponseHeader: mocks.setResponseHeader,
}))
vi.mock('@/lib/server/convex-source', () => ({
  callSourceMutation: mocks.callSourceMutation,
  sourceMutation: (name: string) => ({ name }),
}))
vi.mock('@/lib/server/source-write-admission', () => ({
  sourceWriteAdmissionFromContext: mocks.sourceWriteAdmissionFromContext,
  sourceWriteRequestFromAdmission: mocks.sourceWriteRequestFromAdmission,
}))

import { reviewSourceAuthorityServer } from '@/modules/capability-supply/source-authority-review.functions'

const review = {
  publicationRef: 'publication:openapi',
  expectedRevision: 3,
  expectedSourceDigest: `sha256:${'a'.repeat(64)}`,
  evidenceRef: 'review:source-control:ticket-123',
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('source authority review server boundary', () => {
  it('confirms one exact publication through the canonical admin mutation', async () => {
    mocks.sourceWriteAdmissionFromContext.mockResolvedValue({ signature: 'source-write' })
    mocks.sourceWriteRequestFromAdmission.mockReturnValue({ method: 'POST' })
    mocks.callSourceMutation.mockResolvedValue({
      kind: 'verified',
      publicationRef: review.publicationRef,
      revision: review.expectedRevision,
      operationRef: `operation:v1:${'b'.repeat(64)}`,
      sourceAuthorityState: 'verified',
    })

    await expect(reviewSourceAuthorityServer({ data: review }))
      .resolves.toMatchObject({ kind: 'verified', publicationRef: review.publicationRef })
    expect(mocks.setResponseHeader).toHaveBeenCalledWith('cache-control', 'private, no-store')
    expect(mocks.sourceWriteAdmissionFromContext).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'admin_operator',
      command: expect.objectContaining({
        publicationRef: review.publicationRef,
        expectedRevision: review.expectedRevision,
        expectedSourceDigest: review.expectedSourceDigest,
        evidenceRefs: [review.evidenceRef],
      }),
    }))
    expect(mocks.callSourceMutation).toHaveBeenCalledWith(
      { name: 'capabilitySupply:verifyCapabilitySourceAuthority' },
      expect.objectContaining({
        publicationRef: review.publicationRef,
        expectedRevision: review.expectedRevision,
        evidenceRefs: [review.evidenceRef],
        sourceWrite: { signature: 'source-write' },
        sourceWriteRequest: { method: 'POST' },
      }),
    )
  })

  it('fails closed without exposing source failures as approval', async () => {
    mocks.sourceWriteAdmissionFromContext.mockRejectedValue(new Error('private source failure'))

    await expect(reviewSourceAuthorityServer({ data: review }))
      .resolves.toEqual({ kind: 'error', code: 'source_unavailable' })
    expect(mocks.callSourceMutation).not.toHaveBeenCalled()
  })
})
