import { describe, expect, it } from 'vitest'

import {
  admitCapabilityPublicationCommand,
  preparePublicationDraft,
} from '@/modules/capability-supply/public'

import {
  actor,
  context,
  emptyPorts,
  publicationSource,
} from './publication-commands-harness'

describe('capability-supply publication commands prepare', () => {
  it('refuses prepare when source is invalid', async () => {
    const result = await preparePublicationDraft({
      source: { ...publicationSource(), documentJson: '{' },
      sourceRevision: 'source-revision:demo',
      pricingConfig: {
        version: 'pricing:v3',
        kind: 'fixed_aud',
        currency: 'AUD',
        exponent: 6,
        amountUnits: '12000000',
      },
      evidenceRefs: context.evidenceRefs,
    })
    expect(result).toEqual({ kind: 'refused', reason: 'source_invalid' })
  })

  it('refuses admission before normalization when source revision is invalid', async () => {
    const result = await admitCapabilityPublicationCommand({
      businessId: 'business-1',
      catalogOfferingRef: 'catalog:demo',
      catalogOfferingRevision: 1,
      source: { ...publicationSource(), documentJson: '{', sourceRevision: '' },
      authorityMode: 'provider_owned',
      actor,
      ...context,
      now: 10,
    }, emptyPorts())
    expect(result).toEqual({ kind: 'refused', reason: 'source_revision_invalid' })
  })
})
