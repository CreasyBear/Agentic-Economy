import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reverificationError } from '@clerk/shared/authorization-errors'

import { principalRef } from '@/modules/principal-account/principal/public'

const posthog = vi.hoisted(() => ({ captureServerEvent: vi.fn() }))
const sentry = vi.hoisted(() => ({ captureServerException: vi.fn() }))
const server = vi.hoisted(() => ({
  handler: vi.fn(),
  operator: vi.fn(),
  proof: vi.fn(),
  mint: vi.fn(),
  mutate: vi.fn(),
}))

vi.mock('@/lib/observability/posthog.server', () => posthog)
vi.mock('@/lib/observability/sentry.server', () => sentry)
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator() { return this },
    handler(fn: (...args: unknown[]) => unknown) { server.handler.mockImplementation(fn); return fn },
  }),
}))
vi.mock('@tanstack/react-start/server', () => ({ setResponseHeader: vi.fn() }))
vi.mock('@/lib/server/operator-context.functions', () => ({ readOperatorContextThroughSource: server.operator }))
vi.mock('@/lib/server/clerk-consequence-proof', () => ({ requireStrictClerkConsequenceProof: server.proof }))
vi.mock('@/lib/server/source-write-admission', () => ({
  sourceWriteAdmissionFromContext: server.mint,
  sourceWriteRequestFromAdmission: vi.fn(),
}))
vi.mock('@/lib/server/convex-source', () => ({
  sourceMutation: (name: string) => name,
  callSourceMutation: server.mutate,
}))
vi.mock('@/components/ae/admin/actions/captureAdminCommand.functions', () => ({ captureAdminCommand: vi.fn() }))

import {
  buildAdminEventProperties,
  captureAdminEvent,
} from '@/lib/observability/admin-event-props'
import { safeTelemetryPath } from '@/lib/observability/private-route-safety'
import '@/components/ae/admin/actions/submitAdminCommand.functions'

const actor = principalRef('prn_00000000000040008000000000000001')
const commandRequest = {
  data: {
    action: 'grant_admin_membership', input: {
      targetClerkUserId: 'user_target', targetTokenIdentifier: 'token_target', role: 'support',
    },
    reasonCode: 'onboarding', evidenceRefs: ['ticket:1'],
    operationKey: 'admin:key', correlationId: 'admin:correlation',
    approval: { kind: 'execute' },
  },
  context: {},
}

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
  beforeEach(() => {
    posthog.captureServerEvent.mockClear()
    sentry.captureServerException.mockClear()
    server.operator.mockReset()
    server.proof.mockReset()
    server.mint.mockReset()
    server.mutate.mockReset()
  })
  it('excludes secret-looking fields from every event projection', () => {
    const secret = `operator@example.com:operation-invocation:v1:${'a'.repeat(64)}`
    const injected = { reason: secret, ref: secret, token: secret }
    const properties = [
      buildAdminEventProperties('admin_command', {
        ...injected,
        action: 'set_business_suppression',
        permission: 'suppress_business',
        outcome: 'completed',
      }),
      buildAdminEventProperties('admin_lookup', { ...injected, refKind: 'call', found: true }),
      buildAdminEventProperties('admin_queue_view', { ...injected, kind: 'uncertain_call' }),
    ]
    expect(properties).toEqual([commandProperties, lookupProperties, queueProperties])
    expect(JSON.stringify(properties)).not.toContain(secret)
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

  it('returns a not-applied MFA refusal without minting or mutating, and reports no invariant', async () => {
    server.operator.mockResolvedValue({
      kind: 'authorized', principalRef: actor, allowedSurfaces: ['admin'],
    })
    server.proof.mockRejectedValue(reverificationError('strict'))
    const receipt = await server.handler(commandRequest)
    expect(receipt).toEqual({
      kind: 'refused', action: 'grant_admin_membership',
      code: 'mfa_reverification_required', correlationId: 'admin:correlation',
    })
    expect(server.mint).not.toHaveBeenCalled()
    expect(server.mutate).not.toHaveBeenCalled()
    expect(sentry.captureServerException).not.toHaveBeenCalled()
  })

  it('refuses a first-factor-only claim before source-write admission or mutation', async () => {
    server.operator.mockResolvedValue({
      kind: 'authorized', principalRef: actor, allowedSurfaces: ['admin'],
    })
    server.proof.mockResolvedValue({
      reverificationId: 'reverify:first-only', firstFactorAgeMinutes: 0, secondFactorAgeMinutes: -1,
    })
    const receipt = await server.handler(commandRequest)
    expect(receipt).toMatchObject({ kind: 'refused', code: 'mfa_reverification_required' })
    expect(server.mint).not.toHaveBeenCalled()
    expect(server.mutate).not.toHaveBeenCalled()
  })

  it('refuses non-admin sessions before proof or mutation', async () => {
    server.operator.mockResolvedValue({ kind: 'authorized', principalRef: actor, allowedSurfaces: ['owner'] })
    const receipt = await server.handler(commandRequest)
    expect(receipt).toMatchObject({ kind: 'refused', code: 'missing_membership' })
    expect(server.proof).not.toHaveBeenCalled()
    expect(server.mutate).not.toHaveBeenCalled()
    expect(sentry.captureServerException).not.toHaveBeenCalled()
  })

  it('captures source-write failures with Sentry while surfacing unknown outcome', async () => {
    server.operator.mockResolvedValue({ kind: 'authorized', principalRef: actor, allowedSurfaces: ['admin'] })
    server.proof.mockResolvedValue({
      reverificationId: 'reverify:1', firstFactorAgeMinutes: 0, secondFactorAgeMinutes: 0,
    })
    const failure = new Error('source transport failed')
    server.mint.mockRejectedValue(failure)
    await expect(server.handler(commandRequest)).rejects.toThrow('admin_command_outcome_unknown')
    expect(sentry.captureServerException).toHaveBeenCalledWith(failure)
    expect(server.mutate).not.toHaveBeenCalled()
  })
})
