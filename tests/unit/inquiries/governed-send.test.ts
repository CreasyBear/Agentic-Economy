import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import {
  GOVERNED_SEND_ACTION_CLASS,
  GOVERNED_SEND_CANONICAL_FIELDS,
  GOVERNED_SEND_SCHEMA_VERSION,
  buildGovernedSendIntent,
  type GovernedSendIntentInput,
} from '@/modules/inquiries/internal/governed-send'

const target = {
  businessId: brandNonEmpty('business:governed-send', 'BusinessId'),
  offeringRef: brandNonEmpty('offering:governed-send', 'OfferingRef'),
} satisfies GovernedSendIntentInput['target']

describe('buildGovernedSendIntent', () => {
  it('constructs payload keys in the declared canonical field order', () => {
    const expectedFieldOrder = [
      'businessId',
      'offeringRef',
      'body',
      'contactName',
      'contactEmail',
      'contactPhone',
      'originThreadId',
    ]

    const intent = buildGovernedSendIntent({
      target,
      body: 'Please inspect the leaking isolation valve.',
      contact: {},
    })

    expect(GOVERNED_SEND_CANONICAL_FIELDS.map(({ key }) => key)).toEqual(expectedFieldOrder)
    expect(Object.keys(intent.payload)).toEqual(expectedFieldOrder)
  })

  it('maps the inquiry target, body, contact, and origin into the governed payload', () => {
    const intent = buildGovernedSendIntent({
      target,
      body: 'Please inspect the leaking isolation valve.',
      contact: {
        name: 'Alex Rivera',
        email: 'alex@example.com',
        phone: '+61 400 000 000',
      },
      origin: {
        kind: 'answer_thread',
        threadId: 'answer-thread:governed-send',
      },
    })

    expect(intent.payload).toEqual({
      businessId: 'business:governed-send',
      offeringRef: 'offering:governed-send',
      body: 'Please inspect the leaking isolation valve.',
      contactName: 'Alex Rivera',
      contactEmail: 'alex@example.com',
      contactPhone: '+61 400 000 000',
      originThreadId: 'answer-thread:governed-send',
    })
  })

  it('represents every absent optional contact and origin value as an explicit null', () => {
    const intent = buildGovernedSendIntent({
      target,
      body: 'Please inspect the leaking isolation valve.',
      contact: {},
    })

    expect(intent.payload).toEqual({
      businessId: 'business:governed-send',
      offeringRef: 'offering:governed-send',
      body: 'Please inspect the leaking isolation valve.',
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      originThreadId: null,
    })
  })

  it('binds the governed action class and schema version into the intent', () => {
    const intent = buildGovernedSendIntent({
      target,
      body: 'Please inspect the leaking isolation valve.',
      contact: {},
    })

    expect(GOVERNED_SEND_ACTION_CLASS).toBe('inquiry.send:v1')
    expect(GOVERNED_SEND_SCHEMA_VERSION).toBe(1)
    expect(intent).toMatchObject({
      commitmentKind: 'generic',
      actionClass: 'inquiry.send:v1',
      schemaVersion: 1,
    })
  })
})
