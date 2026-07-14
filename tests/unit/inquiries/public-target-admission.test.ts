import { afterEach, describe, expect, it, vi } from 'vitest'

import { readPublicTargetAdmissionThroughSource } from '@/modules/inquiries/inquiry.functions'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('public target admission source wrapper', () => {
  it('admits the Joondalup local fixture from claim and recipient facts', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')

    await expect(readPublicTargetAdmissionThroughSource({
      businessId: 'business:joondalup-rapid-plumbing',
      serviceId: 'service:business:joondalup-rapid-plumbing:emergency-plumbing',
      capabilityKind: 'phone_inquiry',
    })).resolves.toMatchObject({
      kind: 'ok',
      admission: {
        version: 'r1-target-admitted:v1',
        admitted: true,
        proof: { kind: 'claimed_owner' },
      },
    })
  })

  it('keeps Demo Plumbing unadmitted instead of synthesizing a fallback', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')

    await expect(readPublicTargetAdmissionThroughSource({
      businessId: 'business:plumbing-demo',
      serviceId: 'service:business:plumbing-demo:diagnostic-plumbing',
      capabilityKind: 'phone_inquiry',
    })).resolves.toMatchObject({
      kind: 'ok',
      admission: {
        version: 'r1-target-admitted:v1',
        admitted: false,
        blockers: expect.arrayContaining([
          expect.objectContaining({ kind: 'not_published' }),
          expect.objectContaining({ kind: 'not_claimed' }),
        ]),
      },
    })
  })
})
