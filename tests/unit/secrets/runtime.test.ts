import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  SecretPlaneError,
  secretGeneration,
  secretRef,
  withEphemeralSecretMaterial,
  type OidcIdentityTokenProvider,
  type SecretGenerationValidator,
  type SecretMaterialLease,
  type SecretPointer,
  type SecretPointerAdvanceRequest,
  type SecretPointerStore,
  type SecretStore,
  type SecretTarget,
} from '../../../src/modules/secrets/public'
import {
  createInfisicalCloudSecretRuntime,
  createProductionSecretRuntime,
  createSecretRuntime,
  type InfisicalVaultConfiguration,
  type ProductionScopedSecretPlaneDependencies,
  type ScopedSecretPlaneDependencies,
} from '../../../src/modules/secrets/runtime'

const { getVercelOidcToken } = vi.hoisted(() => ({ getVercelOidcToken: vi.fn() }))
vi.mock('@vercel/oidc', () => ({ getVercelOidcToken }))

const NOW = 2_000_000_000_000
const REF = secretRef('sec_11111111111111111111111111111111')
const GENERATION = secretGeneration('sgn_11111111111111111111111111111111')
const NEXT_GENERATION = secretGeneration('sgn_22222222222222222222222222222222')
const CANARY = 'secret-runtime-canary-never-return'

function jwt(): string {
  const nowSeconds = NOW / 1_000
  return [
    Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'key-1' })).toString('base64url'),
    Buffer.from(JSON.stringify({
      iat: nowSeconds - 60,
      nbf: nowSeconds - 60,
      exp: nowSeconds + 3_540,
    })).toString('base64url'),
    Buffer.from('signature').toString('base64url'),
  ].join('.')
}

class MemoryStore implements SecretStore {
  readonly bytes = new TextEncoder().encode(CANARY)

  async withSecret(_target: SecretTarget, operation: (lease: SecretMaterialLease) => Promise<void>): Promise<void> {
    await withEphemeralSecretMaterial(this.bytes, operation)
  }

  async createGeneration(): Promise<{ readonly kind: 'already-exists' }> {
    return { kind: 'already-exists' }
  }
}

function dependencies(): ScopedSecretPlaneDependencies {
  const pointerStore: SecretPointerStore = {
    getActive: async () => ({ secretRef: REF, activeGeneration: GENERATION, revision: 1 }),
    advanceActive: async () => undefined,
  }
  const validator: SecretGenerationValidator = { validate: async () => true }
  return { pointerStore, validator }
}

function productionDependencies(randomUuid?: () => string): ProductionScopedSecretPlaneDependencies {
  const { pointerStore } = dependencies()
  return {
    pointerStore,
    generationProbe: {
      validate: async (_target, lease) => {
        await lease.useBytes(async () => undefined)
      },
    },
    ...(randomUuid === undefined ? {} : { randomUuid }),
  }
}

function vault(scope: 'platform' | 'customer'): InfisicalVaultConfiguration {
  return {
    scope,
    baseUrl: 'https://app.infisical.com',
    projectId: scope === 'platform' ? 'project-platform' : 'project-customer',
    environment: 'production',
    secretPath: scope === 'platform' ? '/agentic-economy/platform' : '/agentic-economy/customer',
    machineIdentityId: scope === 'platform' ? 'identity-platform' : 'identity-customer',
    organizationSlug: 'acme',
  }
}

function oidcProvider(): OidcIdentityTokenProvider {
  return {
    getIdentityToken: async () => ({ jwt: jwt(), expiresAt: NOW + 3_540_000 }),
  }
}

function successfulVaultFetch(projects: string[]): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.pathname === '/api/v1/auth/oidc-auth/login') {
      return Response.json({
        accessToken: 'vault-access-token',
        tokenType: 'Bearer',
        expiresIn: 600,
        accessTokenMaxTTL: 600,
      })
    }
    const projectId = url.searchParams.get('projectId') ?? ''
    projects.push(projectId)
    return Response.json({
      secret: {
        secretKey: `${REF}--${GENERATION}`,
        secretValue: CANARY,
        environment: 'production',
        workspace: projectId,
      },
    })
  }) as typeof fetch
}

function rotationVaultFetch(): typeof fetch {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (url.pathname === '/api/v1/auth/oidc-auth/login') {
      return Response.json({
        accessToken: 'vault-access-token',
        tokenType: 'Bearer',
        expiresIn: 600,
        accessTokenMaxTTL: 600,
      })
    }
    const secretKey = decodeURIComponent(url.pathname.split('/').at(-1) ?? '')
    if (method === 'POST') {
      return Response.json({
        secret: {
          id: 'created-generation-id',
          version: 1,
          secretKey,
          environment: 'production',
          workspace: 'project-customer',
        },
      })
    }
    if (method === 'DELETE') return new Response(null, { status: 204 })
    return Response.json({
      secret: {
        secretKey,
        secretValue: CANARY,
        environment: 'production',
        workspace: 'project-customer',
      },
    })
  }) as typeof fetch
}

describe('secret runtime composition', () => {
  beforeEach(() => {
    getVercelOidcToken.mockReset()
  })

  it('composes a replaceable SecretStore through injected pointer and validator authority', async () => {
    const store = new MemoryStore()
    const plane = createSecretRuntime({ store, ...dependencies() })
    let observed = ''

    await expect(plane.withActiveSecret({ secretRef: REF }, async (lease) => {
      await lease.useBytes(async (bytes) => {
        observed = new TextDecoder().decode(bytes)
      })
    })).resolves.toBeUndefined()
    expect(observed).toBe(CANARY)
  })

  it('keeps platform and customer vault projects isolated at the production runtime seam', async () => {
    const projects: string[] = []
    const runtime = createInfisicalCloudSecretRuntime({
      configuration: { platform: vault('platform'), customer: vault('customer') },
      platform: dependencies(),
      customer: dependencies(),
      identityTokenProvider: oidcProvider(),
      fetch: successfulVaultFetch(projects),
      now: () => NOW,
    })

    await runtime.platform.withActiveSecret({ secretRef: REF }, async () => undefined)
    await runtime.customer.withActiveSecret({ secretRef: REF }, async () => undefined)
    expect(projects).toEqual(['project-platform', 'project-customer'])
    expect(runtime.platform).not.toBe(runtime.customer)
    expect(Object.keys(runtime).sort()).toEqual(['customer', 'platform'])
  })

  it.each([
    [{ platform: vault('customer'), customer: vault('customer') }, 'cross-scope platform discriminator'],
    [{ platform: vault('platform'), customer: vault('platform') }, 'cross-scope customer discriminator'],
    [{ platform: vault('platform'), customer: { ...vault('customer'), projectId: 'project-platform' } }, 'shared project'],
    [{ platform: vault('platform'), customer: { ...vault('customer'), secretPath: '/agentic-economy/platform' } }, 'shared path'],
    [{ platform: { ...vault('platform'), projectId: ' ' }, customer: vault('customer') }, 'blank project'],
    [{ platform: { ...vault('platform'), secretPath: 'relative' }, customer: vault('customer') }, 'relative path'],
    [{ platform: { ...vault('platform'), secretPath: '/agentic-economy/../customer' }, customer: vault('customer') }, 'traversal path'],
    [{ platform: { ...vault('platform'), baseUrl: 'http://app.infisical.com' }, customer: vault('customer') }, 'non-TLS URL'],
    [{ platform: { ...vault('platform'), baseUrl: 42 }, customer: vault('customer') }, 'non-string URL'],
    [{ platform: { ...vault('platform'), baseUrl: 'not a URL' }, customer: vault('customer') }, 'malformed URL'],
    [{ platform: { ...vault('platform'), baseUrl: 'https://app.infisical.com/api' }, customer: vault('customer') }, 'URL path ambiguity'],
    [{ platform: vault('platform'), customer: { ...vault('customer'), baseUrl: 'https://vault.example.com' } }, 'cross-origin vaults'],
    [{ platform: { ...vault('platform'), organizationSlug: '' }, customer: vault('customer') }, 'blank optional field'],
    [{ platform: undefined, customer: vault('customer') }, 'missing platform'],
    [undefined, 'missing runtime configuration'],
  ])('rejects ambiguous or project-path-mixed configuration: %s (%s)', (configuration, _description) => {
    expect(() => createInfisicalCloudSecretRuntime({
      configuration: configuration as never,
      platform: dependencies(),
      customer: dependencies(),
      identityTokenProvider: oidcProvider(),
    })).toThrowError('Secret runtime configuration is invalid.')
  })

  it('accepts explicit vault configuration without an organization slug or test-only runtime dependencies', () => {
    const { organizationSlug: _platformSlug, ...platform } = vault('platform')
    const { organizationSlug: _customerSlug, ...customer } = vault('customer')
    const runtime = createInfisicalCloudSecretRuntime({
      configuration: { platform, customer },
      platform: dependencies(),
      customer: dependencies(),
      identityTokenProvider: oidcProvider(),
    })
    expect(runtime.platform).toBeDefined()
    expect(runtime.customer).toBeDefined()
  })

  it('constructs production defaults without caller-provided time or transport hooks', () => {
    const runtime = createProductionSecretRuntime({
      configuration: { platform: vault('platform'), customer: vault('customer') },
      platform: productionDependencies(() => '11111111-1111-4111-8111-111111111111'),
      customer: productionDependencies(),
    })
    expect(runtime.platform).toBeDefined()
    expect(runtime.customer).toBeDefined()
  })

  it('fails closed on Vercel identity and vault outages before the secret operation', async () => {
    getVercelOidcToken.mockRejectedValueOnce(new Error(`identity-${CANARY}`))
    const identityRuntime = createProductionSecretRuntime({
      configuration: { platform: vault('platform'), customer: vault('customer') },
      platform: productionDependencies(),
      customer: productionDependencies(),
      fetch: successfulVaultFetch([]),
      now: () => NOW,
    })
    let identityOperationRan = false
    const identityFailure = await identityRuntime.platform.withActiveSecret({ secretRef: REF }, async () => {
      identityOperationRan = true
    }).catch((error: unknown) => error)
    expect(identityFailure).toMatchObject({ code: 'secret_store_authentication_failed' })
    expect(String(identityFailure)).not.toContain(CANARY)
    expect(identityOperationRan).toBe(false)

    const vaultRuntime = createInfisicalCloudSecretRuntime({
      configuration: { platform: vault('platform'), customer: vault('customer') },
      platform: dependencies(),
      customer: dependencies(),
      identityTokenProvider: oidcProvider(),
      fetch: vi.fn(async () => {
        throw new Error(`vault-${CANARY}`)
      }) as typeof fetch,
      now: () => NOW,
    })
    let vaultOperationRan = false
    const vaultFailure = await vaultRuntime.customer.withActiveSecret({ secretRef: REF }, async () => {
      vaultOperationRan = true
    }).catch((error: unknown) => error)
    expect(vaultFailure).toMatchObject({ code: 'secret_store_authentication_failed' })
    expect(String(vaultFailure)).not.toContain(CANARY)
    expect(vaultOperationRan).toBe(false)
  })

  it('never returns secret material and zeroes a captured callback view', async () => {
    const runtime = createInfisicalCloudSecretRuntime({
      configuration: { platform: vault('platform'), customer: vault('customer') },
      platform: dependencies(),
      customer: dependencies(),
      identityTokenProvider: oidcProvider(),
      fetch: successfulVaultFetch([]),
      now: () => NOW,
    })
    let captured: Uint8Array | undefined

    const result = await runtime.customer.withActiveSecret({ secretRef: REF }, async (lease) => {
      await lease.useBytes(async (bytes) => {
        captured = bytes
        return CANARY as never
      })
      return CANARY as never
    })

    expect(result).toBeUndefined()
    expect(captured).toBeDefined()
    expect([...captured!].every((byte) => byte === 0)).toBe(true)
    expect(JSON.stringify(runtime)).not.toContain(CANARY)
  })

  it('constructs the production adapter with getVercelOidcToken instead of a stub', async () => {
    getVercelOidcToken.mockResolvedValueOnce(jwt())
    const runtime = createProductionSecretRuntime({
      configuration: { platform: vault('platform'), customer: vault('customer') },
      platform: productionDependencies(),
      customer: productionDependencies(),
      fetch: successfulVaultFetch([]),
      now: () => NOW,
    })

    await expect(runtime.consequences.platform.execute({ secretRef: REF }, async () => undefined)).resolves.toBeUndefined()
    expect(getVercelOidcToken).toHaveBeenCalledWith({ expirationBufferMs: 5_000 })
  })

  it('production rotation validates the fetched generation before the canonical pointer advances', async () => {
    getVercelOidcToken.mockResolvedValue(jwt())
    let pointer: SecretPointer = Object.freeze({
      secretRef: REF,
      activeGeneration: GENERATION,
      revision: 1,
    })
    const events: string[] = []
    const pointerStore: SecretPointerStore = {
      getActive: async () => pointer,
      advanceActive: async (request: SecretPointerAdvanceRequest) => {
        events.push('pointer:advance')
        expect(request).toEqual({
          secretRef: REF,
          expectedActiveGeneration: GENERATION,
          expectedRevision: 1,
          newGeneration: NEXT_GENERATION,
        })
        pointer = Object.freeze({
          secretRef: request.secretRef,
          activeGeneration: request.newGeneration,
          revision: 2,
        })
      },
    }
    const runtime = createProductionSecretRuntime({
      configuration: { platform: vault('platform'), customer: vault('customer') },
      platform: productionDependencies(),
      customer: {
        pointerStore,
        randomUuid: () => '22222222-2222-2222-2222-222222222222',
        generationProbe: {
          validate: async (target, lease) => {
            events.push(`probe:${target.generation}`)
            await lease.useBytes(async (bytes) => {
              expect(new TextDecoder().decode(bytes)).toBe(CANARY)
            })
          },
        },
      },
      fetch: rotationVaultFetch(),
      now: () => NOW,
    })

    await expect(runtime.customer.rotate({ secretRef: REF }, {
      withMaterial: async (operation) => await withEphemeralSecretMaterial(
        new TextEncoder().encode('replacement'),
        operation,
      ),
    })).resolves.toEqual({
      secretRef: REF,
      previousGeneration: GENERATION,
      activeGeneration: NEXT_GENERATION,
      pointerRevision: 2,
    })
    expect(events).toEqual([`probe:${NEXT_GENERATION}`, 'pointer:advance'])
  })

  it('production rotation leaves the canonical pointer unchanged when the probe does not consume material', async () => {
    getVercelOidcToken.mockResolvedValue(jwt())
    const pointer: SecretPointer = Object.freeze({
      secretRef: REF,
      activeGeneration: GENERATION,
      revision: 1,
    })
    const advanceActive = vi.fn(async () => undefined)
    const runtime = createProductionSecretRuntime({
      configuration: { platform: vault('platform'), customer: vault('customer') },
      platform: productionDependencies(),
      customer: {
        pointerStore: { getActive: async () => pointer, advanceActive },
        randomUuid: () => '22222222-2222-2222-2222-222222222222',
        generationProbe: { validate: async () => undefined },
      },
      fetch: rotationVaultFetch(),
      now: () => NOW,
    })

    await expect(runtime.customer.rotate({ secretRef: REF }, {
      withMaterial: async (operation) => await withEphemeralSecretMaterial(
        new TextEncoder().encode('replacement'),
        operation,
      ),
    })).rejects.toEqual(new SecretPlaneError('secret_generation_validation_failed'))
    expect(advanceActive).not.toHaveBeenCalled()
    expect(pointer.activeGeneration).toBe(GENERATION)
  })

  it('does not translate a secret-plane consequence failure into a successful result', async () => {
    const runtime = createSecretRuntime({ store: new MemoryStore(), ...dependencies() })
    await expect(runtime.withActiveSecret({ secretRef: REF }, async () => {
      throw new Error(CANARY)
    })).rejects.toEqual(new SecretPlaneError('secret_operation_failed'))
  })
})
