// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { brandNonEmpty } from '@/modules/common/ids'
import { createEmptyNotificationOutboxSourceState } from '@/modules/notification-outbox/public'
import {
  enqueueWorkTreeMemoNotification,
  renderWeeklyMemo,
  safeReadbackUrl,
  type WeeklyMemoData,
  type WorkTreeMemoNotificationInput,
} from '@/modules/work-tree/public'

describe('weekly memo render', () => {
  it('renders static HTML with the five-dimension top line and exceptions', async () => {
    const html = await renderWeeklyMemo({
      title: 'Weekly memo',
      periodLabel: 'Week of 1 August',
      nextDecision: 'Next decision: 12h',
      cost: { committed: { currency: 'AUD', units: '12345', exponent: 2 }, envelope: { currency: 'AUD', units: '30000', exponent: 2 } },
      timingCriticalPathSummary: 'Quote review by Friday',
      effortMinutes: 90,
      scopeCoverage: { accepted: 3, total: 5 },
      waitingDecisions: [{ title: 'Choose the venue', detail: 'The guest count shapes the venue decision.', moneyYes: true }],
      exceptions: [{ title: 'Quote expiring', detail: 'Review before 4 August.', severity: 'warning' }],
    })

    expect(html).toContain('Next decision: 12h')
    expect(html).toContain('123.45')
    expect(html).toContain('300.00')
    expect(html).toContain('Quote review by Friday')
    expect(html).toMatch(/90(?:<!-- -->)?\s+min/u)
    expect(html).toMatch(/3(?:<!-- -->)?\/(?:<!-- -->)?5(?:<!-- -->)?\s+accepted/u)
    expect(html).toMatchSnapshot()
    expect(html).toContain('Quote expiring')
    expect(html).toContain('Review before 4 August.')
  })
})

const notificationMemo: WeeklyMemoData = {
  title: 'Weekly memo',
  periodLabel: 'Week of 1 August',
  nextDecision: 'Next decision: 12h',
  cost: { committed: { currency: 'AUD', units: '12345', exponent: 2 }, envelope: { currency: 'AUD', units: '30000', exponent: 2 } },
  timingCriticalPathSummary: 'Quote review by Friday',
  effortMinutes: 90,
  scopeCoverage: { accepted: 3, total: 5 },
  exceptions: [],
}

function notificationInput(recipientRole: 'owner' | 'customer'): WorkTreeMemoNotificationInput {
  return {
    businessId: brandNonEmpty('business:memo-tests', 'BusinessId'),
    projectId: 'project:memo-tests',
    revision: 4,
    recipientRole,
    providerFamily: 'resend',
    correlationId: brandNonEmpty(`correlation:memo-tests:${recipientRole}`, 'CorrelationId'),
    readbackUrl: '/api/v1/work-tree/inspect',
    memo: notificationMemo,
    now: 1_754_000_000_000,
  }
}

describe('weekly memo safety boundaries', () => {
  it('redacts caller-supplied HTML credentials before enqueue', () => {
    const result = enqueueWorkTreeMemoNotification(
      createEmptyNotificationOutboxSourceState(),
      notificationInput('owner'),
      '<p>Authorization: Bearer SECRET</p><p>"authorization": "Bearer SECRET"</p>',
    )
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') throw new Error(result.code)
    expect(JSON.stringify(result.dispatch.redactedPayload)).not.toContain('SECRET')
    expect(JSON.stringify(result.dispatch.redactedPayload)).toContain('[redacted]')
  })

  it('allows only single-slash app-relative readback URLs', () => {
    expect(safeReadbackUrl('/api/v1/work-tree/inspect')).toBe('/api/v1/work-tree/inspect')
    expect(safeReadbackUrl('//attacker.example/collect')).toBe('/')
    expect(safeReadbackUrl('https://attacker.example/collect')).toBe('/')
  })

  it('derives distinct default operation keys for each recipient', () => {
    const first = enqueueWorkTreeMemoNotification(
      createEmptyNotificationOutboxSourceState(),
      notificationInput('owner'),
    )
    expect(first.kind).toBe('ok')
    if (first.kind !== 'ok') throw new Error(first.code)

    const second = enqueueWorkTreeMemoNotification(first.state, notificationInput('customer'))
    expect(second.kind).toBe('ok')
    if (second.kind !== 'ok') throw new Error(second.code)
    expect(second.state.dispatches).toHaveLength(2)
    expect(second.dispatch.operationKey).not.toBe(first.dispatch.operationKey)
  })
})
