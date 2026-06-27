import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import { createEmptyDisputeSourceState, openRemovalDispute } from '@/modules/security/public'
import type { DisputeOpenCommand } from '@/modules/security/public'

describe('openRemovalDispute', () => {
  it('opens an audited removal dispute with contact and evidence hashes only', () => {
    const state = createEmptyDisputeSourceState()
    const result = openRemovalDispute(state, validCommand())

    expect(result).toMatchObject({
      kind: 'ok',
      code: 'dispute_opened',
      dispute: {
        status: 'opened',
        targetType: 'business',
        reasonCode: 'privacy_removal_requested',
        requestCount: 1,
      },
      auditEvent: {
        eventType: 'dispute.opened',
        actorKind: 'anonymous',
        targetType: 'dispute',
      },
    })
    expect(state.disputes).toHaveLength(1)
    expect(state.auditEvents).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain('owner@example.test')
    expect(JSON.stringify(state)).not.toContain('0412 000 000')
    expect(JSON.stringify(state)).not.toContain('Remove my private details')
  })

  it('replays the same operation key without duplicating dispute or audit rows', () => {
    const state = createEmptyDisputeSourceState()
    const first = openRemovalDispute(state, validCommand())
    const replay = openRemovalDispute(state, validCommand({ now: 20 }))

    expect(first).toMatchObject({ kind: 'ok', code: 'dispute_opened' })
    expect(replay).toMatchObject({ kind: 'ok', code: 'dispute_open_replayed' })
    expect(state.disputes).toHaveLength(1)
    expect(state.auditEvents).toHaveLength(1)
  })

  it('dedupes the same contact and target into an updated dispute with a new audit event', () => {
    const state = createEmptyDisputeSourceState()
    openRemovalDispute(state, validCommand())

    const updated = openRemovalDispute(
      state,
      validCommand({
        operationKey: brandNonEmpty('op:dispute:second', 'OperationKey'),
        correlationId: brandNonEmpty('corr:dispute:second', 'CorrelationId'),
        evidence: [
          {
            label: 'Second evidence',
            mediaType: 'application/pdf',
            byteLength: 20_000,
            privateRef: 'private:evidence:dispute:2',
          },
        ],
        now: 30,
      })
    )

    expect(updated).toMatchObject({
      kind: 'ok',
      code: 'dispute_open_updated',
      dispute: { status: 'updated', requestCount: 2 },
      auditEvent: { eventType: 'dispute.updated', beforeState: 'opened', afterState: 'updated' },
    })
    expect(state.disputes).toHaveLength(1)
    expect(state.auditEvents.map((event) => event.eventType)).toEqual(['dispute.opened', 'dispute.updated'])
  })

  it('rejects missing CSRF, repeated abuse bucket attempts, missing contact, and invalid evidence', () => {
    expect(
      openRemovalDispute(
        createEmptyDisputeSourceState(),
        validCommand({
          security: {
            csrf: { allowedOrigins: ['https://ae.example'] },
            rateLimit: rateLimit('csrf'),
          },
        })
      )
    ).toMatchObject({ kind: 'error', code: 'dispute_csrf_rejected' })

    const limitedState = createEmptyDisputeSourceState()
    const first = openRemovalDispute(
      limitedState,
      validCommand({ security: { csrf: csrf('limit').csrf, rateLimit: { ...rateLimit('same-contact'), limit: 1 } } })
    )
    const second = openRemovalDispute(
      limitedState,
      validCommand({
        operationKey: brandNonEmpty('op:dispute:limited:2', 'OperationKey'),
        security: { csrf: csrf('limit').csrf, rateLimit: { ...rateLimit('same-contact'), limit: 1 } },
      })
    )

    expect(first).toMatchObject({ kind: 'ok' })
    expect(second).toMatchObject({ kind: 'error', code: 'dispute_rate_limited' })

    expect(openRemovalDispute(createEmptyDisputeSourceState(), validCommand({ contact: {} }))).toMatchObject({
      kind: 'error',
      code: 'dispute_invalid_contact',
    })

    expect(
      openRemovalDispute(
        createEmptyDisputeSourceState(),
        validCommand({
          evidence: [
            {
              label: 'Unsupported',
              mediaType: 'text/plain',
              byteLength: 6_000_000,
              privateRef: 'private:evidence:too-large',
            },
          ],
        })
      )
    ).toMatchObject({ kind: 'error', code: 'dispute_invalid_evidence' })
  })
})

function validCommand(overrides: Partial<DisputeOpenCommand> = {}): DisputeOpenCommand {
  return {
    businessId: brandNonEmpty('business:parramatta-emergency-plumbing', 'BusinessId'),
    targetType: 'business',
    targetRef: 'business:parramatta-emergency-plumbing',
    reasonCode: 'privacy_removal_requested',
    contact: {
      email: 'owner@example.test',
      phone: '0412 000 000',
      name: 'Sam Owner',
    },
    evidence: [
      {
        label: 'Owner evidence',
        mediaType: 'text/plain',
        byteLength: 2_000,
        privateRef: 'private:evidence:dispute:1',
      },
    ],
    publicMessage: 'Remove my private details from the listing.',
    security: csrf('dispute'),
    operationKey: brandNonEmpty('op:dispute:first', 'OperationKey'),
    correlationId: brandNonEmpty('corr:dispute:first', 'CorrelationId'),
    now: 10,
    ...overrides,
  }
}

function csrf(key: string) {
  return {
    csrf: {
      csrfToken: `csrf-${key}`,
      csrfCookie: `csrf-${key}`,
      allowedOrigins: ['https://ae.example'],
    },
    rateLimit: rateLimit(key),
  }
}

function rateLimit(key: string) {
  return {
    scope: 'dispute_open' as const,
    key,
    now: 1_000,
    limit: 5,
    windowMs: 60_000,
  }
}
