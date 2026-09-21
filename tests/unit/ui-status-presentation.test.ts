import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import {
  dispositionToAeStatus,
  offeringAccessToAeStatus,
  offeringSupportToAeStatus,
} from '@/lib/ui/business-status-mapping'
import {
  aeStatusPresentation,
  aeStatusValues,
  getStatusPresentation,
} from '@/lib/ui/status-presentation'


const statusAccessPathRef = brandNonEmpty('access:status', 'AccessPathRef')
const websitePathDescriptor = {
  kind: 'human_request' as const,
  channel: 'website' as const,
  disclosure: 'Use the website.',
}

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

  it('defines canonical public, connection, credential, and lifecycle labels', () => {
    const expected = {
      operational: { label: 'Operational', compactLabel: 'Operational', tone: 'success', audience: 'public', publicness: 'public' },
      connected: { label: 'Connected', compactLabel: 'Connected', tone: 'success', audience: 'owner', publicness: 'private' },
      disconnected: { label: 'Disconnected', compactLabel: 'Disconnected', tone: 'neutral', audience: 'owner', publicness: 'private' },
      active: { label: 'Active', compactLabel: 'Active', tone: 'success', audience: 'owner', publicness: 'private' },
      paused: { label: 'Paused', compactLabel: 'Paused', tone: 'warning', audience: 'owner', publicness: 'private' },
      needs_attention: { label: 'Needs attention', compactLabel: 'Attention', tone: 'warning', audience: 'owner', publicness: 'private' },
      ready_now: { label: 'Ready now', compactLabel: 'Ready', tone: 'success', audience: 'public', publicness: 'public' },
      setup_required: { label: 'Setup required', compactLabel: 'Setup', tone: 'warning', audience: 'public', publicness: 'public' },
      completed: { label: 'Completed', compactLabel: 'Completed', tone: 'success', audience: 'owner', publicness: 'private' },
      credential_expired: { label: 'Expired', compactLabel: 'Expired', tone: 'warning', audience: 'owner', publicness: 'private' },
      current: { label: 'Current', compactLabel: 'Current', tone: 'success', audience: 'owner', publicness: 'private' },
      credential_revoked: { label: 'Revoked', compactLabel: 'Revoked', tone: 'danger', audience: 'owner', publicness: 'private' },
    } as const

    for (const [status, presentation] of Object.entries(expected)) {
      expect(getStatusPresentation(status as keyof typeof expected)).toMatchObject(presentation)
    }
  })

  it('covers one reachable status presentation for each P2-P5 phase', () => {
    expect(aeStatusPresentation.notification_bounced).toMatchObject({
      label: 'Notification bounced',
      compactLabel: 'Bounced',
      audience: 'owner',
      publicness: 'private',
      nextAction: 'Review suppression and contact-readback before retrying.',
    })
    expect(aeStatusPresentation.discovery_parity_failed).toMatchObject({
      label: 'Discovery parity failed',
      compactLabel: 'Parity failed',
      tone: 'danger',
      disabledReason: 'Parity failure blocks public discovery claims.',
    })
    expect(aeStatusPresentation.protected_action_proof_gap).toMatchObject({
      label: 'Protected action proof gap',
      compactLabel: 'Proof gap',
      audience: 'operator',
    })
    expect(aeStatusPresentation.billing_provider_event_held).toMatchObject({
      label: 'Billing provider event held',
      compactLabel: 'Held',
      nextAction: 'Bind or reject the event through reconciliation without granting entitlement.',
    })
  })

  it('routes V2 disposition and Offering support/access fields through explicit presentation entries', () => {
    expect(dispositionToAeStatus('stale')).toBe('stale')
    expect(dispositionToAeStatus('partial')).toBe('degraded')
    expect(dispositionToAeStatus('current')).toBe('available')
    expect(offeringSupportToAeStatus({ integrated: true, aeSupportedAction: false })).toBe('guarded')
    expect(offeringSupportToAeStatus({ integrated: false, aeSupportedAction: false })).toBe('not_live')
    expect(offeringSupportToAeStatus({ integrated: true, aeSupportedAction: true })).toBe('available')
    expect(offeringAccessToAeStatus([])).toBe('not_queued')
    expect(offeringAccessToAeStatus([{
      accessPathRef: statusAccessPathRef,
      offeringRevision: 1,
      ...websitePathDescriptor,
    }])).toBe('listed')
  })
})
