import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callSourceMutation: vi.fn(),
  setResponseHeader: vi.fn(),
  sourceWriteAdmissionFromContext: vi.fn(),
  requireStrictClerkConsequenceProof: vi.fn(),
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
vi.mock('@/lib/server/clerk-consequence-proof', () => ({
  requireStrictClerkConsequenceProof: mocks.requireStrictClerkConsequenceProof,
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
    mocks.requireStrictClerkConsequenceProof.mockResolvedValue({
      reverificationId: 'test:source-review', firstFactorAgeMinutes: 0, secondFactorAgeMinutes: -1,
    })
    mocks.callSourceMutation.mockResolvedValue({
      kind: 'completed', action: 'verify_capability_source_authority',
      code: 'source_authority_verified', effectRefs: [review.publicationRef],
      auditEventRef: 'audit:source-review', correlationId: 'source-review:test',
    })

    await expect(reviewSourceAuthorityServer({ data: review }))
      .resolves.toMatchObject({ kind: 'completed', code: 'source_authority_verified' })
    expect(mocks.setResponseHeader).toHaveBeenCalledWith('cache-control', 'private, no-store')
    expect(mocks.sourceWriteAdmissionFromContext).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'admin_operator',
      command: expect.objectContaining({
        input: {
          publicationRef: review.publicationRef,
          expectedRevision: review.expectedRevision,
          expectedSourceDigest: review.expectedSourceDigest,
        },
        evidenceRefs: [review.evidenceRef],
      }),
    }))
    expect(mocks.callSourceMutation).toHaveBeenCalledWith(
      { name: 'capabilitySupply:verifyCapabilitySourceAuthority' },
      expect.objectContaining({
        input: expect.objectContaining({ publicationRef: review.publicationRef, expectedRevision: review.expectedRevision }),
        evidenceRefs: [review.evidenceRef],
        proof: expect.objectContaining({ reverificationId: 'test:source-review' }),
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
