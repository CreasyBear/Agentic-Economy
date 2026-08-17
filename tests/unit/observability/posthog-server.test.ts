import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const posthogMocks = vi.hoisted(() => ({
  capture: vi.fn(),
  construct: vi.fn(),
}))

vi.mock('posthog-node', () => ({
  PostHog: posthogMocks.construct,
}))

// Fresh imports isolate the module-level client and constructor-failure cases.
beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('POSTHOG_KEY', 'phc_test')
  vi.stubEnv('AE_DISABLE_OBSERVABILITY', '')
  posthogMocks.capture.mockReset()
  posthogMocks.construct.mockReset().mockImplementation(function () {
    return {
      capture: posthogMocks.capture,
      flush: vi.fn(),
      shutdown: vi.fn(),
    }
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('PostHog server capture', () => {
  it('does not construct or capture without a PostHog key', async () => {
    vi.stubEnv('POSTHOG_KEY', '')
    vi.stubEnv('VITE_POSTHOG_KEY', '')
    const { captureServerEvent } = await import('@/lib/observability/posthog.server')

    captureServerEvent('diagnostic', 'test')

    expect(posthogMocks.construct).not.toHaveBeenCalled()
    expect(posthogMocks.capture).not.toHaveBeenCalled()
  })

  it('does not construct or capture when observability is disabled', async () => {
    vi.stubEnv('AE_DISABLE_OBSERVABILITY', 'true')
    const { captureServerEvent } = await import('@/lib/observability/posthog.server')

    captureServerEvent('diagnostic', 'test')

    expect(posthogMocks.construct).not.toHaveBeenCalled()
    expect(posthogMocks.capture).not.toHaveBeenCalled()
  })

  it.each([
    ['businesses', 'list'],
    ['businesses', 'search'],
    ['businesses', 'detail'],
    ['services', 'list'],
    ['services', 'search'],
    ['services', 'detail'],
  ] as const)('captures the exact %s %s legacy route payload', async (routeFamily, routeKind) => {
    const { captureLegacyRegistryApiRequest } = await import('@/lib/observability/posthog.server')

    captureLegacyRegistryApiRequest(routeFamily, routeKind)

    expect(posthogMocks.capture).toHaveBeenCalledTimes(1)
    expect(posthogMocks.capture).toHaveBeenCalledWith({
      distinctId: 'ae-legacy-registry-api',
      event: 'legacy_registry_api_request',
      properties: {
        route_family: routeFamily,
        route_kind: routeKind,
        surface: 'http',
        $process_person_profile: false,
        $geoip_disable: true,
      },
    })
  })

  it.each([
    ['registry.list', 'businesses', 'list'],
    ['registry.search', 'businesses', 'search'],
    ['registry.detail', 'businesses', 'detail'],
    ['registry.services_list', 'services', 'list'],
    ['registry.services_search', 'services', 'search'],
    ['registry.services_detail', 'services', 'detail'],
  ] as const)('captures the exact %s action payload on both static surfaces', async (
    actionId,
    routeFamily,
    routeKind,
  ) => {
    const { captureLegacyRegistryActionRequest } = await import('@/lib/observability/posthog.server')

    captureLegacyRegistryActionRequest(actionId, 'mcp')
    captureLegacyRegistryActionRequest(actionId, 'answer')

    expect(posthogMocks.capture).toHaveBeenCalledTimes(2)
    expect(posthogMocks.capture).toHaveBeenNthCalledWith(1, {
      distinctId: 'ae-legacy-registry-api',
      event: 'legacy_registry_api_request',
      properties: {
        route_family: routeFamily,
        route_kind: routeKind,
        surface: 'mcp',
        $process_person_profile: false,
        $geoip_disable: true,
      },
    })
    expect(posthogMocks.capture).toHaveBeenNthCalledWith(2, {
      distinctId: 'ae-legacy-registry-api',
      event: 'legacy_registry_api_request',
      properties: {
        route_family: routeFamily,
        route_kind: routeKind,
        surface: 'answer',
        $process_person_profile: false,
        $geoip_disable: true,
      },
    })
  })

  it('does not capture unknown or dynamic operation action IDs', async () => {
    const { captureLegacyRegistryActionRequest } = await import('@/lib/observability/posthog.server')

    captureLegacyRegistryActionRequest('operation.execute', 'mcp')
    captureLegacyRegistryActionRequest('registry.unknown', 'answer')

    expect(posthogMocks.capture).not.toHaveBeenCalled()
  })

  it('does not let constructor exceptions escape', async () => {
    posthogMocks.construct.mockImplementationOnce(() => {
      throw new Error('constructor failed')
    })
    const { captureServerEvent } = await import('@/lib/observability/posthog.server')

    expect(() => captureServerEvent('diagnostic', 'test')).not.toThrow()
  })

  it('does not let capture exceptions escape', async () => {
    posthogMocks.capture.mockImplementationOnce(() => {
      throw new Error('capture failed')
    })
    const { captureServerEvent } = await import('@/lib/observability/posthog.server')

    expect(() => captureServerEvent('diagnostic', 'test')).not.toThrow()
  })
})
