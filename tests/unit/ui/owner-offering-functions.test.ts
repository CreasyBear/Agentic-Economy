import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ConvexSourceModule from '@/lib/server/convex-source'
import type * as SourceWriteAdmissionModule from '@/lib/server/source-write-admission'
import type * as TanstackReactStartModule from '@tanstack/react-start'

const sourceMocks = vi.hoisted(() => ({
  callSourceMutation: vi.fn(),
  sourceWriteAdmissionFromContext: vi.fn(),
}))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof TanstackReactStartModule>()),
  createServerFn: () => ({
    validator: () => ({ handler: (handler: unknown) => handler }),
    handler: (handler: unknown) => handler,
  }),
}))
vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexSourceModule>()),
  callSourceMutation: sourceMocks.callSourceMutation,
}))
vi.mock('@/lib/server/source-write-admission', async (importOriginal) => ({
  ...(await importOriginal<typeof SourceWriteAdmissionModule>()),
  sourceWriteAdmissionFromContext: sourceMocks.sourceWriteAdmissionFromContext,
}))

import { saveOwnerOfferingServer } from '@/components/ae/offerings/owner-offering.functions'

const value = {
  offeringRef: 'offering:request-a',
  expectedRevision: 1,
  name: 'Request A details',
  category: 'Data',
  summary: 'Request A details should not resume after a newer owner revision.',
  serviceAreaSummary: '',
  availabilitySummary: '',
  pricingSummary: '',
  status: 'published' as const,
  accessPaths: [{
    accessPathRef: 'access:request-a',
    status: 'published' as const,
    descriptor: {
      kind: 'human_request' as const,
      channel: 'website' as const,
      disclosure: 'Start here.',
      url: 'https://example.com/start',
    },
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
  sourceMocks.sourceWriteAdmissionFromContext.mockResolvedValue({
    keyId: 'test',
    scope: 'catalog_publish',
    operationKey: 'owner-offering:request-a:revise',
    correlationId: 'owner-offering:request-a',
    commandDigest: 'sha256:command',
    nonce: 'nonce',
    issuedAt: 1,
    method: 'POST',
    initiatorOrigin: 'https://ae.example',
    targetOrigin: 'https://ae.example',
    targetPath: '/catalog',
    targetQuery: '',
    bodyDigest: 'sha256:body',
    signature: 'signature',
  })
})

describe('owner offering replay fencing', () => {
  it('does not advance status or access paths when details replay is fenced by a newer revision', async () => {
    sourceMocks.callSourceMutation.mockResolvedValueOnce({
      kind: 'error',
      code: 'revision_conflict',
      reason: 'Offering changed since the operation was committed.',
    })

    const result = await saveOwnerOfferingServer({
      data: {
        requestKey: 'request-a',
        businessId: 'business:owner',
        value,
      },
    })

    expect(result).toEqual({ kind: 'revision_conflict', message: 'Reload the latest Operation before saving your changes.' })
    expect(sourceMocks.callSourceMutation).toHaveBeenCalledTimes(1)
    expect(sourceMocks.callSourceMutation.mock.calls[0]?.[1]).toMatchObject({ operationKey: 'owner-offering:request-a:revise' })
  })
})
