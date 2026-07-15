import { describe, expect, it } from 'vitest'

import {
  sensitiveCustomerRequestCategories,
  sensitiveCustomerRequestRefusal,
} from '@/modules/customer-request/sensitive-input-admission'

describe('customer Request sensitive-input admission', () => {
  it('recognizes payment cards and explicitly labelled account secrets without returning their values', () => {
    expect(sensitiveCustomerRequestCategories(
      'Card: 4242 4242 4242 4242; password is synthetic-password.',
    )).toEqual(['payment_card', 'account_secret'])
    expect(sensitiveCustomerRequestCategories('api_key=sk_test_synthetic')).toEqual(['account_secret'])
    expect(sensitiveCustomerRequestRefusal({ password: 'synthetic-password' })).toMatchObject({
      reason: 'sensitive_information_not_accepted', nextAction: 'revise_request',
    })
  })

  it('does not block ordinary budgets, dates, references, or discussion of passwords without a value', () => {
    expect(sensitiveCustomerRequestCategories(
      'Keep it below AUD 500 by 20 July 2026. Reference 1234567890123. I need help resetting a password.',
    )).toEqual([])
  })
})
