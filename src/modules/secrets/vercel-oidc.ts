import { getVercelOidcToken } from '@vercel/oidc'

import type { OidcIdentityTokenProvider } from './infisical-cloud'
import { SecretPlaneError } from './secret-plane'

const DEFAULT_MINIMUM_REMAINING_TTL_MS = 5_000
const DEFAULT_MAXIMUM_TOKEN_TTL_MS = 60 * 60 * 1_000
const DEFAULT_CLOCK_SKEW_MS = 5_000
const MAXIMUM_CLOCK_SKEW_MS = 60_000
const MAXIMUM_JWT_LENGTH = 32 * 1_024
const JWT_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/u

interface VercelOidcTokenSourceOptions {
  readonly expirationBufferMs: number
}

export type VercelOidcTokenSource = (
  options: VercelOidcTokenSourceOptions,
) => Promise<string>

export interface VercelOidcIdentityTokenProviderOptions {
  readonly tokenSource?: VercelOidcTokenSource
  readonly now?: () => number
  readonly minimumRemainingTtlMs?: number
  readonly maximumTokenTtlMs?: number
  readonly clockSkewMs?: number
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumericDate(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function authenticationFailure(): SecretPlaneError {
  return new SecretPlaneError('secret_store_authentication_failed')
}

export class VercelOidcIdentityTokenProvider implements OidcIdentityTokenProvider {
  readonly #tokenSource: VercelOidcTokenSource
  readonly #now: () => number
  readonly #minimumRemainingTtlMs: number
  readonly #maximumTokenTtlMs: number
  readonly #clockSkewMs: number

  constructor(options: VercelOidcIdentityTokenProviderOptions = {}) {
    this.#tokenSource = options.tokenSource ?? getVercelOidcToken
    this.#now = options.now ?? Date.now
    this.#minimumRemainingTtlMs = options.minimumRemainingTtlMs ?? DEFAULT_MINIMUM_REMAINING_TTL_MS
    this.#maximumTokenTtlMs = options.maximumTokenTtlMs ?? DEFAULT_MAXIMUM_TOKEN_TTL_MS
    this.#clockSkewMs = options.clockSkewMs ?? DEFAULT_CLOCK_SKEW_MS
    if (
      !Number.isFinite(this.#minimumRemainingTtlMs) ||
      this.#minimumRemainingTtlMs < 0 ||
      !Number.isFinite(this.#maximumTokenTtlMs) ||
      this.#maximumTokenTtlMs <= 0 ||
      this.#maximumTokenTtlMs > DEFAULT_MAXIMUM_TOKEN_TTL_MS ||
      this.#minimumRemainingTtlMs >= this.#maximumTokenTtlMs ||
      !Number.isFinite(this.#clockSkewMs) ||
      this.#clockSkewMs < 0 ||
      this.#clockSkewMs > MAXIMUM_CLOCK_SKEW_MS
    ) {
      throw new TypeError('Vercel OIDC token lifetime configuration is invalid')
    }
  }

  async getIdentityToken(signal: AbortSignal): Promise<{
    readonly jwt: string
    readonly expiresAt: number
  }> {
    try {
      const jwt = await this.#acquireToken(signal)
      const expiresAt = this.#validateAndReadExpiry(jwt)
      return Object.freeze({ jwt, expiresAt })
    } catch {
      throw authenticationFailure()
    }
  }

  async #acquireToken(signal: AbortSignal): Promise<string> {
    if (signal.aborted) throw authenticationFailure()
    let rejectAbort!: (reason: SecretPlaneError) => void
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject
    })
    const abort = () => rejectAbort(authenticationFailure())
    signal.addEventListener('abort', abort, { once: true })
    try {
      return await Promise.race([
        this.#tokenSource({ expirationBufferMs: this.#minimumRemainingTtlMs }),
        aborted,
      ])
    } finally {
      signal.removeEventListener('abort', abort)
    }
  }

  #validateAndReadExpiry(jwt: string): number {
    if (typeof jwt !== 'string' || jwt.length === 0 || jwt.length > MAXIMUM_JWT_LENGTH) {
      throw authenticationFailure()
    }
    const segments = jwt.split('.')
    if (
      segments.length !== 3 ||
      segments.some((segment) => segment.length === 0 || !JWT_SEGMENT_PATTERN.test(segment))
    ) {
      throw authenticationFailure()
    }

    let claims: unknown
    try {
      const encodedClaims = segments.at(1)
      if (encodedClaims === undefined) throw authenticationFailure()
      claims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8')) as unknown
    } catch {
      throw authenticationFailure()
    }
    if (
      !isRecord(claims) ||
      !isNumericDate(claims.iat) ||
      (claims.nbf !== undefined && !isNumericDate(claims.nbf)) ||
      !isNumericDate(claims.exp)
    ) {
      throw authenticationFailure()
    }

    const now = this.#now()
    const issuedAt = claims.iat * 1_000
    const notBefore = claims.nbf === undefined ? issuedAt : claims.nbf * 1_000
    const expiresAt = claims.exp * 1_000
    if (
      !Number.isSafeInteger(now) ||
      now <= 0 ||
      !Number.isSafeInteger(issuedAt) ||
      !Number.isSafeInteger(notBefore) ||
      !Number.isSafeInteger(expiresAt) ||
      issuedAt > now + this.#clockSkewMs ||
      notBefore > now + this.#clockSkewMs ||
      expiresAt <= issuedAt ||
      notBefore > expiresAt ||
      expiresAt - issuedAt > this.#maximumTokenTtlMs ||
      expiresAt <= now + this.#minimumRemainingTtlMs
    ) {
      throw authenticationFailure()
    }
    return expiresAt
  }
}
