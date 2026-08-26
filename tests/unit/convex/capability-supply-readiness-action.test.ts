import { describe, expect, it, vi } from 'vitest'

vi.mock('@/modules/capability-supply/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/capability-supply/server')>()
  return { ...actual, runCapabilityReadinessProbe: vi.fn() }
})

import { runCapabilityReadinessProbe } from '@/modules/capability-supply/server'
import type { Id } from '../../../convex/_generated/dataModel'
import { probeHandler } from '../../../convex/capabilitySupplyReadiness'

describe('capability supply readiness action authority', () => {
  it('carries the exact read-time publisher authority into the record consequence', async () => {
    const resourceAuthority = {
      publicationRef: 'publication:readiness-action',
      publicationRevision: 1,
      businessId: 'businesses:readiness-action' as Id<'businesses'>,
      publisherPrincipalRef: 'prn_readiness_action',
      ownerPrincipalRef: 'prn_readiness_action',
      owningAccountRef: 'acc_readiness_action',
      ownershipRef: 'own_readiness_action',
      accountRevision: 1,
      mode: 'human_owner' as const,
      publisherPrincipalRevision: 1,
      authorityDigest: `sha256:${'a'.repeat(64)}`,
    }
    const target = {
      publicationRef: resourceAuthority.publicationRef,
      revision: 1,
      bindingId: 'binding:readiness-action',
      capabilityId: 'reference.lookup',
      endpointUrl: 'https://provider.example.test/lookup',
      adapterId: 'http-json:v1',
      probeKind: 'openapi_http' as const,
      probeQuery: [],
      probeMethod: 'GET' as const,
      transportConfigJson: JSON.stringify({ method: 'GET', requestTimeoutMs: 5_000 }),
      targetDigest: `sha256:${'b'.repeat(64)}`,
      authority: { kind: 'keyless' as const },
      resourceAuthority,
    }
    vi.mocked(runCapabilityReadinessProbe).mockResolvedValueOnce({
      targetDigest: target.targetDigest,
      requestDigest: `sha256:${'c'.repeat(64)}`,
      responseStatus: 200,
      responseContentType: 'application/json',
      responseDigest: `sha256:${'d'.repeat(64)}`,
      outcome: 'healthy',
      credentialState: 'ready',
      healthState: 'healthy',
      observedAt: 10,
      validUntil: 20,
      evidenceRefs: ['probe:target_public'],
    })
    const runQuery = vi.fn().mockResolvedValue({ kind: 'available', target })
    const runMutation = vi.fn().mockResolvedValue({
      kind: 'observed',
      publicationRef: target.publicationRef,
      revision: 1,
      lifecycle: { state: 'active', reasons: [] },
    })

    await expect(probeHandler({ runQuery, runMutation } as never, {
      publicationRef: target.publicationRef,
      expectedRevision: 1,
    })).resolves.toMatchObject({ kind: 'observed' })
    expect(runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      publicationRef: target.publicationRef,
      expectedRevision: 1,
      resourceAuthority,
    }))
  })
})
