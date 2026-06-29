import { describe, expect, it } from 'vitest'

import {
  aeStatusPresentation,
  aeStatusValues,
  discoveryStatusToAeStatus,
  getStatusPresentation,
  statusPresentation,
} from '@/lib/ui/status-presentation'

describe('getStatusPresentation', () => {
  it('keeps unavailable capabilities explicit and human-readable', () => {
    expect(getStatusPresentation('not_live')).toMatchObject({
      label: 'Not live',
      compactLabel: 'Not live',
      tone: 'neutral',
      publicness: 'public',
      disabledReason: 'Capability not yet proven from source-owned runtime evidence.',
    })
  })

  it('maps every status to badge-compatible long and compact copy', () => {
    for (const status of aeStatusValues) {
      const presentation = aeStatusPresentation[status]

      expect(presentation.label.length).toBeGreaterThanOrEqual(presentation.compactLabel.length)
      expect(presentation.compactLabel.length).toBeGreaterThan(0)
      expect(['neutral', 'info', 'success', 'warning', 'danger']).toContain(presentation.tone)
      expect(['public', 'private']).toContain(presentation.publicness)
    }
  })

  it('covers one reachable status presentation for each P2-P5 phase', () => {
    expect(statusPresentation.notification_bounced).toMatchObject({
      label: 'Notification bounced',
      compactLabel: 'Bounced',
      audience: 'owner',
      publicness: 'private',
      nextAction: 'Review suppression and contact-readback before retrying.',
    })
    expect(statusPresentation.discovery_parity_failed).toMatchObject({
      label: 'Discovery parity failed',
      compactLabel: 'Parity failed',
      tone: 'danger',
      disabledReason: 'Parity failure blocks public discovery claims.',
    })
    expect(statusPresentation.protected_action_proof_gap).toMatchObject({
      label: 'Protected action proof gap',
      compactLabel: 'Proof gap',
      audience: 'operator',
    })
    expect(statusPresentation.billing_provider_event_held).toMatchObject({
      label: 'Billing provider event held',
      compactLabel: 'Held',
      nextAction: 'Bind or reject the event through reconciliation without granting entitlement.',
    })
  })

  it('routes discovery status enums through P3-specific presentation entries instead of raw provider copy', () => {
    expect(discoveryStatusToAeStatus('stale')).toBe('discovery_stale')
    expect(discoveryStatusToAeStatus('degraded')).toBe('discovery_degraded')
    expect(discoveryStatusToAeStatus('unavailable')).toBe('discovery_unavailable')
    expect(getStatusPresentation(discoveryStatusToAeStatus('available'))).toMatchObject({
      label: 'Available',
      compactLabel: 'Available',
    })
  })
})
