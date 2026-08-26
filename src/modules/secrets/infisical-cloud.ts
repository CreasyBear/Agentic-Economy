import {
  SecretPlaneError,
  withEphemeralSecretMaterial,
  type SecretMaterialLease,
  type SecretGenerationCreation,
  type SecretStore,
  type SecretTarget,
} from './secret-plane'

const DEFAULT_TOKEN_REFRESH_SKEW_MS = 5_000
const DEFAULT_MAXIMUM_ACCESS_TOKEN_TTL_MS = 2 * 60 * 60 * 1_000
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]+$/u

export interface OidcIdentityToken {
  readonly jwt: string
  readonly expiresAt: number
}

export interface OidcIdentityTokenProvider {
  getIdentityToken(signal: AbortSignal): Promise<OidcIdentityToken>
}

export interface InfisicalCloudSecretStoreOptions {
  readonly baseUrl: string
  readonly projectId: string
  readonly environment: string
  readonly secretPath: string
  readonly machineIdentityId: string
  readonly organizationSlug?: string
  readonly identityTokenProvider: OidcIdentityTokenProvider
  readonly fetch?: typeof fetch
  readonly now?: () => number
  readonly tokenRefreshSkewMs?: number
  readonly maximumAccessTokenTtlMs?: number
  readonly requestTimeoutMs?: number
}

interface AccessToken {
  readonly value: string
  readonly expiresAt: number
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireNonEmpty(value: string, field: string): string {
  if (value.trim().length === 0) throw new TypeError(`${field} must not be empty`)
  return value
}

export class InfisicalCloudSecretStore implements SecretStore {
  readonly #baseUrl: string
  readonly #projectId: string
  readonly #environment: string
  readonly #secretPath: string
  readonly #machineIdentityId: string
  readonly #organizationSlug: string | undefined
  readonly #identityTokenProvider: OidcIdentityTokenProvider
  readonly #fetch: typeof fetch
  readonly #now: () => number
  readonly #tokenRefreshSkewMs: number
  readonly #maximumAccessTokenTtlMs: number
  readonly #requestTimeoutMs: number
  readonly #usesGuardedNetwork: boolean
  #accessToken: AccessToken | undefined
  #tokenAcquisition: Promise<AccessToken> | undefined

  constructor(options: InfisicalCloudSecretStoreOptions) {
    const baseUrl = new URL(options.baseUrl)
    if (baseUrl.protocol !== 'https:' || baseUrl.username !== '' || baseUrl.password !== '') {
      throw new TypeError('Infisical Cloud base URL must be an HTTPS origin')
    }
    this.#baseUrl = baseUrl.origin
    this.#projectId = requireNonEmpty(options.projectId, 'projectId')
    this.#environment = requireNonEmpty(options.environment, 'environment')
    this.#secretPath = requireNonEmpty(options.secretPath, 'secretPath')
    this.#machineIdentityId = requireNonEmpty(options.machineIdentityId, 'machineIdentityId')
    this.#organizationSlug = options.organizationSlug === undefined
      ? undefined
      : requireNonEmpty(options.organizationSlug, 'organizationSlug')
    this.#identityTokenProvider = options.identityTokenProvider
    this.#usesGuardedNetwork = options.fetch === undefined
    this.#fetch = options.fetch ?? (async (input, init) => {
      const { sendGuardedHttpRequest } = await import('@/modules/network-guard/server')
      return await sendGuardedHttpRequest(new Request(input, init), 512 * 1024)
    })
    this.#now = options.now ?? Date.now
    this.#tokenRefreshSkewMs = options.tokenRefreshSkewMs ?? DEFAULT_TOKEN_REFRESH_SKEW_MS
    this.#maximumAccessTokenTtlMs = options.maximumAccessTokenTtlMs ?? DEFAULT_MAXIMUM_ACCESS_TOKEN_TTL_MS
    this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    if (!Number.isFinite(this.#tokenRefreshSkewMs) ||
      this.#tokenRefreshSkewMs < 0 ||
      !Number.isFinite(this.#maximumAccessTokenTtlMs) ||
      this.#maximumAccessTokenTtlMs <= 0 ||
      this.#maximumAccessTokenTtlMs > DEFAULT_MAXIMUM_ACCESS_TOKEN_TTL_MS ||
      !Number.isFinite(this.#requestTimeoutMs) ||
      this.#requestTimeoutMs <= 0) {
      throw new TypeError('Infisical Cloud token lifetime configuration is invalid')
    }
  }

  async withSecret(
    target: SecretTarget,
    operation: (lease: SecretMaterialLease) => Promise<void>,
  ): Promise<void> {
    const expectedName = this.#secretName(target)
    const query = new URLSearchParams({
      projectId: this.#projectId,
      environment: this.#environment,
      secretPath: this.#secretPath,
      type: 'shared',
      viewSecretValue: 'true',
      expandSecretReferences: 'false',
    })
    const response = await this.#authorizedRequest(
      `/api/v4/secrets/${encodeURIComponent(expectedName)}?${query.toString()}`,
      { method: 'GET' },
    )
    const payload = await this.#readJson(response)
    const secret = isRecord(payload) && isRecord(payload.secret) ? payload.secret : undefined
    if (
      secret === undefined ||
      secret.secretKey !== expectedName ||
      secret.environment !== this.#environment ||
      secret.workspace !== this.#projectId ||
      typeof secret.secretValue !== 'string'
    ) {
      throw new SecretPlaneError('secret_store_invalid_response')
    }

    const bytes = new TextEncoder().encode(secret.secretValue)
    try {
      await withEphemeralSecretMaterial(bytes, operation)
    } catch (error) {
      if (error instanceof SecretPlaneError && error.code === 'secret_lease_expired') throw error
      throw new SecretPlaneError('secret_operation_failed')
    } finally {
      bytes.fill(0)
    }
  }

  async createGeneration(target: SecretTarget, material: SecretMaterialLease): Promise<SecretGenerationCreation> {
    try {
      const expectedName = this.#secretName(target)
      let response: Response | undefined
      await material.useBytes(async (bytes) => {
        const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        response = await this.#authorizedRequest(`/api/v4/secrets/${encodeURIComponent(expectedName)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            projectId: this.#projectId,
            environment: this.#environment,
            secretValue: value,
            secretPath: this.#secretPath,
            type: 'shared',
            skipMultilineEncoding: true,
          }),
        }, true)
      })
      if (response === undefined) throw new SecretPlaneError('secret_store_invalid_response')
      if (response.status === 409) {
        await this.#discardBody(response)
        return Object.freeze({ kind: 'already-exists' })
      }
      if (response.status === 400) {
        if (await this.#isExactDuplicateBadRequest(response)) {
          return Object.freeze({ kind: 'already-exists' })
        }
        throw new SecretPlaneError('secret_store_unavailable')
      }
      const payload = await this.#readJson(response)
      const secret = isRecord(payload) && isRecord(payload.secret) ? payload.secret : undefined
      if (
        secret === undefined ||
        typeof secret.id !== 'string' ||
        secret.id.trim().length === 0 ||
        typeof secret.version !== 'number' ||
        !Number.isInteger(secret.version) ||
        secret.version < 1 ||
        secret.secretKey !== expectedName ||
        secret.environment !== this.#environment ||
        secret.workspace !== this.#projectId
      ) {
        throw new SecretPlaneError('secret_store_invalid_response')
      }
      return Object.freeze({
        kind: 'created',
        discard: async () => await this.#deleteGeneration(target),
      })
    } catch (error) {
      if (error instanceof SecretPlaneError) throw error
      throw new SecretPlaneError('invalid_secret_material')
    }
  }

  async #deleteGeneration(target: SecretTarget): Promise<void> {
    const response = await this.#authorizedRequest(`/api/v4/secrets/${encodeURIComponent(this.#secretName(target))}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: this.#projectId,
        environment: this.#environment,
        secretPath: this.#secretPath,
        type: 'shared',
      }),
    })
    await this.#discardBody(response)
  }

  #secretName(target: SecretTarget): string {
    return `${target.secretRef}--${target.generation}`
  }

  async #authorizedRequest(path: string, init: RequestInit, acceptCreateOutcome = false): Promise<Response> {
    const token = await this.#getAccessToken()
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${token.value}`)
    let response: Response
    try {
      const target = new URL(path, this.#baseUrl)
      if (this.#usesGuardedNetwork && !await this.#isPublicTarget(target)) {
        throw new Error('secret_store_target_refused')
      }
      response = await this.#fetch(target, {
        ...init,
        headers,
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
        redirect: 'error',
      })
    } catch {
      throw new SecretPlaneError('secret_store_unavailable')
    }
    if (response.status === 401 || response.status === 403) {
      if (this.#accessToken === token) this.#accessToken = undefined
      await this.#discardBody(response)
      throw new SecretPlaneError('secret_store_authentication_failed')
    }
    if (acceptCreateOutcome && (response.status === 400 || response.status === 409)) return response
    if (!response.ok) {
      await this.#discardBody(response)
      throw new SecretPlaneError('secret_store_unavailable')
    }
    return response
  }

  async #isExactDuplicateBadRequest(response: Response): Promise<boolean> {
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      await this.#discardBody(response)
      return false
    }
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return false
    }
    return isRecord(payload) &&
      payload.statusCode === 400 &&
      payload.error === 'BadRequest' &&
      payload.message === 'Secret already exists'
  }

  async #getAccessToken(): Promise<AccessToken> {
    if (
      this.#accessToken !== undefined &&
      this.#accessToken.expiresAt > this.#now() + this.#tokenRefreshSkewMs
    ) {
      return this.#accessToken
    }
    const acquisition = this.#tokenAcquisition ?? this.#acquireAccessToken()
    this.#tokenAcquisition = acquisition
    try {
      const token = await acquisition
      this.#accessToken = token
      return token
    } finally {
      if (this.#tokenAcquisition === acquisition) this.#tokenAcquisition = undefined
    }
  }

  async #acquireAccessToken(): Promise<AccessToken> {
    let identityToken: OidcIdentityToken
    try {
      const signal = AbortSignal.timeout(this.#requestTimeoutMs)
      identityToken = await Promise.race([
        this.#identityTokenProvider.getIdentityToken(signal),
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new SecretPlaneError('secret_store_authentication_failed'))
          }, { once: true })
        }),
      ])
    } catch {
      throw new SecretPlaneError('secret_store_authentication_failed')
    }
    if (
      typeof identityToken.jwt !== 'string' ||
      identityToken.jwt.length === 0 ||
      !Number.isFinite(identityToken.expiresAt) ||
      identityToken.expiresAt <= this.#now() + this.#tokenRefreshSkewMs
    ) {
      throw new SecretPlaneError('secret_store_authentication_failed')
    }

    let response: Response
    try {
      const target = new URL('/api/v1/auth/oidc-auth/login', this.#baseUrl)
      if (this.#usesGuardedNetwork && !await this.#isPublicTarget(target)) {
        throw new Error('secret_store_target_refused')
      }
      response = await this.#fetch(target, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identityId: this.#machineIdentityId,
          jwt: identityToken.jwt,
          ...(this.#organizationSlug === undefined ? {} : { organizationSlug: this.#organizationSlug }),
        }),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
        redirect: 'error',
      })
    } catch {
      throw new SecretPlaneError('secret_store_authentication_failed')
    }
    if (!response.ok) {
      await this.#discardBody(response)
      throw new SecretPlaneError('secret_store_authentication_failed')
    }

    const payload = await this.#readJson(response, 'secret_store_authentication_failed')
    const expiresIn = isRecord(payload) ? payload.expiresIn : undefined
    const accessTokenMaxTTL = isRecord(payload) ? payload.accessTokenMaxTTL : undefined
    const accessToken = isRecord(payload) ? payload.accessToken : undefined
    const tokenType = isRecord(payload) ? payload.tokenType : undefined
    const ttlMs = typeof expiresIn === 'number' ? expiresIn * 1_000 : Number.NaN
    if (
      typeof accessToken !== 'string' ||
      accessToken.length === 0 ||
      !ACCESS_TOKEN_PATTERN.test(accessToken) ||
      tokenType !== 'Bearer' ||
      typeof expiresIn !== 'number' ||
      !Number.isFinite(ttlMs) ||
      ttlMs <= this.#tokenRefreshSkewMs ||
      ttlMs > this.#maximumAccessTokenTtlMs ||
      typeof accessTokenMaxTTL !== 'number' ||
      !Number.isFinite(accessTokenMaxTTL) ||
      expiresIn > accessTokenMaxTTL
    ) {
      throw new SecretPlaneError('secret_store_authentication_failed')
    }
    return Object.freeze({ value: accessToken, expiresAt: this.#now() + ttlMs })
  }

  async #isPublicTarget(target: URL): Promise<boolean> {
    const { defaultDnsResolver, isPublicHttpTarget } = await import('@/modules/network-guard/public')
    return await isPublicHttpTarget(target, defaultDnsResolver)
  }

  async #readJson(
    response: Response,
    errorCode: 'secret_store_invalid_response' | 'secret_store_authentication_failed' = 'secret_store_invalid_response',
  ): Promise<unknown> {
    try {
      return await response.json()
    } catch {
      throw new SecretPlaneError(errorCode)
    }
  }

  async #discardBody(response: Response): Promise<void> {
    try {
      await response.body?.cancel()
    } catch {
      // Provider bodies can contain secret material. Never read or surface them,
      // and never let a failed stream cancellation change the fixed outcome.
    }
  }
}
