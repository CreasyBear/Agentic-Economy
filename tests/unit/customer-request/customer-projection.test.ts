import { describe, expect, it } from 'vitest'

import { projectCustomerCriteria } from '@/modules/customer-request/customer-projection'

describe('customer Request criteria projection', () => {
  it('shows one customer criterion when several capabilities consume the same fact', () => {
    const repeatedRequest = {
      label: 'What outcome do you need?',
      value: 'Reach the conference by noon with an accessible transfer and hotel.',
      basis: 'customer_provided' as const,
    }

    expect(projectCustomerCriteria([
      { ...repeatedRequest, inputKey: 'transfer_request' },
      { ...repeatedRequest, inputKey: 'hotel_request' },
      { ...repeatedRequest, inputKey: 'itinerary_request' },
    ])).toEqual([{
      ...repeatedRequest,
      impact: 'eligibility_and_comparison',
    }])
  })
})
