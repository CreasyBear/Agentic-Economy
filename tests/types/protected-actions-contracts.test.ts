import { describe, expect, expectTypeOf, it } from 'vitest'

import type {
  ContactFollowUpActionSlug as ContactFollowUpActionSlugType,
  ContactFollowUpAttemptOutcome,
  ContactFollowUpDecision,
  ContactFollowUpParameterKey,
  ContactFollowUpPolicyKind,
  ContactFollowUpReadbackStatus,
} from '@/modules/protected-action/public'
import {
  ContactFollowUpActionSlug,
  ContactFollowUpAttemptOutcomeValues,
  ContactFollowUpDecisionValues,
  ContactFollowUpMaxAttemptCount,
  ContactFollowUpParameterKeyValues,
  ContactFollowUpPolicyKindValues,
  ContactFollowUpReadbackStatusValues,
} from '@/modules/protected-action/public'
import type { OwnerContactFollowUpMutationServerResult } from '@/modules/protected-action/contact-follow-up.functions'

describe('protected action type contracts', () => {
  it('keeps selected contact follow-up literal unions in sync with exported values', () => {
    expectTypeOf<typeof ContactFollowUpActionSlug>().toEqualTypeOf<ContactFollowUpActionSlugType>()
    expectTypeOf<(typeof ContactFollowUpParameterKeyValues)[number]>().toEqualTypeOf<ContactFollowUpParameterKey>()
    expectTypeOf<(typeof ContactFollowUpPolicyKindValues)[number]>().toEqualTypeOf<ContactFollowUpPolicyKind>()
    expectTypeOf<(typeof ContactFollowUpDecisionValues)[number]>().toEqualTypeOf<ContactFollowUpDecision>()
    expectTypeOf<(typeof ContactFollowUpAttemptOutcomeValues)[number]>().toEqualTypeOf<ContactFollowUpAttemptOutcome>()
    expectTypeOf<(typeof ContactFollowUpReadbackStatusValues)[number]>().toEqualTypeOf<ContactFollowUpReadbackStatus>()
    expectTypeOf<typeof ContactFollowUpMaxAttemptCount>().toEqualTypeOf<2>()
  })

  it('keeps runtime values selected-action-specific', () => {
    expect(ContactFollowUpActionSlug).toBe('contact-follow-up')
    expect(ContactFollowUpParameterKeyValues).not.toContain('amount')
    expect(ContactFollowUpDecisionValues).not.toContain('auto_approved')
    expect(ContactFollowUpReadbackStatusValues).toEqual(expect.arrayContaining(['stale', 'refused', 'disputed', 'reversed', 'retry_exhausted']))
    expect(ContactFollowUpMaxAttemptCount).toBe(2)
  })

  it('keeps owner mutation server result selected-action scoped', () => {
    const result = {
      kind: 'error',
      code: 'contact_follow_up_source_unavailable',
      retryable: true,
      reason: 'Contact follow-up source state is not reachable right now.',
    } satisfies OwnerContactFollowUpMutationServerResult

    expect(result.code).toBe('contact_follow_up_source_unavailable')
  })
})

// @ts-expect-error broad protected-action strings cannot replace the selected action slug
const invalidActionSlug: ContactFollowUpActionSlugType = 'protected-action'
void invalidActionSlug

// @ts-expect-error value-bearing fields are outside the selected contact follow-up parameters
const invalidParameterKey: ContactFollowUpParameterKey = 'amount'
void invalidParameterKey
