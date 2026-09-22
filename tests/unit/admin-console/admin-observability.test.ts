import { describe, expect, it, vi } from 'vitest'

import { principalRef } from '@/modules/principal-account/principal/public'

const posthog = vi.hoisted(() => ({ captureServerEvent: vi.fn() }))

vi.mock('@/lib/observability/posthog.server', () => posthog)

import {
  buildAdminEventProperties,
  captureAdminEvent,
} from '@/lib/observability/admin-event-props'
import { safeTelemetryPath } from '@/lib/observability/private-route-safety'

const actor = principalRef('prn_00000000000040008000000000000001')

const commandProperties = buildAdminEventProperties('admin_command', {
  action: 'set_business_suppression',
  permission: 'suppress_business',
  outcome: 'completed',
})
const lookupProperties = buildAdminEventProperties('admin_lookup', {
  refKind: 'call',
  found: true,
})
const queueProperties = buildAdminEventProperties('admin_queue_view', {
  kind: 'uncertain_call',
})

// @ts-expect-error Admin analytics properties never accept object references.
buildAdminEventProperties('admin_lookup', { refKind: 'call', found: true, ref: 'x' })
// @ts-expect-error Admin analytics properties never accept email addresses.
buildAdminEventProperties('admin_command', { action: 'set_business_suppression', permission: 'suppress_business', outcome: 'completed', email: 'x' })
// @ts-expect-error Admin analytics properties never accept operator reasons.
buildAdminEventProperties('admin_queue_view', { kind: 'all', reason: 'x' })

describe('admin observability boundary', () => {
  it.each([
    ['command', commandProperties],
    ['lookup', lookupProperties],
    ['queue', queueProperties],
  ])('keeps %s event properties free of references and email addresses', (_name, properties) => {
    const values = Object.values(properties).join(' ')
    expect(values).not.toContain('operation-invocation:')
    expect(values).not.toContain('@')
  })

  it('redacts admin object references from telemetry paths', () => {
    expect(safeTelemetryPath({
      pathname: `/admin/calls/operation-invocation:v1:${'a'.repeat(64)}`,
    })).toBe('/admin/calls/[ref]')
    expect(safeTelemetryPath({ pathname: '/admin/providers/some-slug' })).toBe('/admin/providers/[ref]')
    expect(safeTelemetryPath({ pathname: '/admin/search' })).toBe('/admin/search')
  })

  it('captures with a pseudonymous admin distinct id', () => {
    captureAdminEvent(actor, 'admin_lookup', lookupProperties)

    expect(posthog.captureServerEvent).toHaveBeenCalledOnce()
    const [distinctId, event, properties] = posthog.captureServerEvent.mock.calls[0] ?? []
    expect(distinctId).toMatch(/^admin:/u)
    expect(distinctId).not.toBe(actor)
    expect(distinctId).not.toContain(actor)
    expect(event).toBe('admin_lookup')
    expect(properties).toEqual(lookupProperties)
  })
})
