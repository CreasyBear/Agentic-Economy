import { expect, it } from 'vitest'

import { providerLeadPatch } from '../../../convex/lib/market/directoryIndex/providerLead'

it('keeps a quiet host sortable and records the busiest Tool without summing the host', () => {
  expect(providerLeadPatch(null)).toEqual({ leadCalls: -1 })
  expect(providerLeadPatch({
    popularOrder: 334244, payersOrder: 183, minimumUsdPrice: '0.002', slug: 'api-v1-chat-completions', name: '  AI chat completions  ',
  })).toEqual({
    leadCalls: 334244, leadPayers: 183, leadPrice: '0.002', leadSlug: 'api-v1-chat-completions', leadTitle: 'AI chat completions',
  })
  expect(providerLeadPatch({ popularOrder: -1, name: 'Unused' })).toEqual({ leadCalls: -1, leadTitle: 'Unused' })
})
