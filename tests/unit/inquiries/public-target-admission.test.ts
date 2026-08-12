import { describe, expect, it } from 'vitest'

import {
  createInquiryServerBackend,
  readPublicTargetAdmissionThroughSource,
  setInquiryServerBackendForTests,
} from '@/modules/inquiries/inquiry.functions'
import { createLocalE2eInquiryServerBackend } from '../../helpers/inquiry-local-e2e-adapter'

describe('public target admission source wrapper', () => {
  it('admits the Joondalup local fixture from claim and recipient facts', async () => {
    await withLocalInquiryBackend(() => expect(readPublicTargetAdmissionThroughSource({
      businessId: 'business:joondalup-rapid-plumbing',
      offeringRef: 'offering:joondalup-rapid-plumbing:emergency-plumbing',
    })).resolves.toMatchObject({
      kind: 'ok',
      admission: {
        version: 'r1-target-admitted:v1',
        admitted: true,
        proof: { kind: 'claimed_owner' },
      },
    }))
  })

  it('keeps Demo Plumbing unadmitted instead of synthesizing a fallback', async () => {
    await withLocalInquiryBackend(() => expect(readPublicTargetAdmissionThroughSource({
      businessId: 'business:plumbing-demo',
      offeringRef: 'offering:plumbing-demo:diagnostic-plumbing',
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
    }))
  })
})

async function withLocalInquiryBackend<T>(run: () => Promise<T>): Promise<T> {
  const local = createLocalE2eInquiryServerBackend()
  const restore = setInquiryServerBackendForTests({
    ...createInquiryServerBackend(),
    readPublicTargetAdmission: async (target) => local.readPublicTargetAdmission(target),
  })
  try {
    return await run()
  } finally {
    restore()
  }
}

