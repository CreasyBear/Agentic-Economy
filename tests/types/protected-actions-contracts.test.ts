import { describe, expect, expectTypeOf, it } from 'vitest'

import type {
  ContactFollowUpActionSlug as ContactFollowUpActionSlugType,
  ContactFollowUpAttemptOutcome,
  ContactFollowUpDecision,
  ContactFollowUpParameterKey,
  ContactFollowUpPolicyKind,
} from '@/modules/protected-action/public'
import {
  ContactFollowUpActionSlug,
  ContactFollowUpAttemptOutcomeValues,
  ContactFollowUpDecisionValues,
  ContactFollowUpParameterKeyValues,
  ContactFollowUpPolicyKindValues,
} from '@/modules/protected-action/public'

describe('protected action type contracts', () => {
  it('keeps selected contact follow-up literal unions in sync with exported values', () => {
    expectTypeOf<typeof ContactFollowUpActionSlug>().toEqualTypeOf<ContactFollowUpActionSlugType>()
    expectTypeOf<(typeof ContactFollowUpParameterKeyValues)[number]>().toEqualTypeOf<ContactFollowUpParameterKey>()
    expectTypeOf<(typeof ContactFollowUpPolicyKindValues)[number]>().toEqualTypeOf<ContactFollowUpPolicyKind>()
    expectTypeOf<(typeof ContactFollowUpDecisionValues)[number]>().toEqualTypeOf<ContactFollowUpDecision>()
    expectTypeOf<(typeof ContactFollowUpAttemptOutcomeValues)[number]>().toEqualTypeOf<ContactFollowUpAttemptOutcome>()
  })

  it('keeps runtime values selected-action-specific', () => {
    expect(ContactFollowUpActionSlug).toBe('contact-follow-up')
    expect(ContactFollowUpParameterKeyValues).not.toContain('amount')
    expect(ContactFollowUpDecisionValues).not.toContain('auto_approved')
  })
})

// @ts-expect-error broad protected-action strings cannot replace the selected action slug
const invalidActionSlug: ContactFollowUpActionSlugType = 'protected-action'
void invalidActionSlug

// @ts-expect-error value-bearing fields are outside the selected contact follow-up parameters
const invalidParameterKey: ContactFollowUpParameterKey = 'amount'
void invalidParameterKey
