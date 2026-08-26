import { describe, expect, it, vi } from 'vitest'

import {
  VercelOidcIdentityTokenProvider,
  type VercelOidcTokenSource,
} from '../../../src/modules/secrets/vercel-oidc'

const NOW = 2_000_000_000_000

function jwt(claims: Readonly<Record<string, unknown>>): string {
  return [
    Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'key-1' })).toString('base64url'),
    Buffer.from(JSON.stringify(claims)).toString('base64url'),
    Buffer.from('signature').toString('base64url'),
  ].join('.')
}

function claims(overrides: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
  const nowSeconds = NOW / 1_000
  return {
    iss: 'https://oidc.vercel.com/acme',
    aud: 'https://vercel.com/acme',
    sub: 'owner:acme:project:agentic-economy:environment:production',
    iat: nowSeconds - 60,
    nbf: nowSeconds - 60,
    exp: nowSeconds + 3_540,
    ...overrides,
  }
}

describe('VercelOidcIdentityTokenProvider', () => {
  it('constructs with the production Vercel token source and safe lifetime defaults', () => {
    expect(new VercelOidcIdentityTokenProvider()).toBeInstanceOf(VercelOidcIdentityTokenProvider)
  })

  it('derives expiry from the actual Vercel JWT and requests a fresh-enough token', async () => {
    const value = jwt(claims())
    const tokenSource: VercelOidcTokenSource = vi.fn(async () => value)
    const provider = new VercelOidcIdentityTokenProvider({
      tokenSource,
      now: () => NOW,
      minimumRemainingTtlMs: 10_000,
    })

    await expect(provider.getIdentityToken(new AbortController().signal)).resolves.toEqual({
      jwt: value,
      expiresAt: NOW + 3_540_000,
    })
    expect(tokenSource).toHaveBeenCalledWith({ expirationBufferMs: 10_000 })
  })

  it.each([
    ['', 'empty'],
    ['only.two', 'two segments'],
    ['a.b.c.d', 'four segments'],
    ['a..c', 'empty segment'],
    ['a.b$.c', 'non-base64url segment'],
    ['a'.repeat(32 * 1_024 + 1), 'oversized token'],
    [`${Buffer.from('{}').toString('base64url')}.%%%.sig`, 'invalid base64url'],
    [`${Buffer.from('{}').toString('base64url')}.${Buffer.from('not-json').toString('base64url')}.sig`, 'invalid JSON'],
    [jwt([] as unknown as Readonly<Record<string, unknown>>), 'array claims'],
    [jwt(claims({ exp: undefined })), 'missing exp'],
    [jwt(claims({ exp: 2_000_000_001.5 })), 'fractional exp'],
    [jwt(claims({ exp: 0 })), 'non-positive exp'],
    [jwt(claims({ iat: undefined })), 'missing iat'],
    [jwt(claims({ nbf: 'soon' })), 'malformed optional nbf'],
    [jwt(claims({ iat: Number.MAX_SAFE_INTEGER - 1, nbf: Number.MAX_SAFE_INTEGER - 1, exp: Number.MAX_SAFE_INTEGER })), 'unsafe millisecond conversion'],
  ])('rejects malformed token claims without echoing token material: %s (%s)', async (value) => {
    const provider = new VercelOidcIdentityTokenProvider({
      tokenSource: async () => value,
      now: () => NOW,
    })

    const failure = await provider.getIdentityToken(new AbortController().signal).catch((error: unknown) => error)
    expect(failure).toMatchObject({ code: 'secret_store_authentication_failed' })
    if (value.length > 0) expect(String(failure)).not.toContain(value)
  })

  it('accepts the production-shaped Vercel claim set when optional nbf is absent', async () => {
    const value = jwt(claims({ nbf: undefined }))
    const provider = new VercelOidcIdentityTokenProvider({
      tokenSource: async () => value,
      now: () => NOW,
    })
    await expect(provider.getIdentityToken(new AbortController().signal)).resolves.toEqual({
      jwt: value,
      expiresAt: NOW + 3_540_000,
    })
  })

  it.each([
    [claims({ exp: NOW / 1_000 }), 'expired'],
    [claims({ exp: NOW / 1_000 + 5 }), 'inside remaining-TTL floor'],
    [claims({ nbf: NOW / 1_000 + 6 }), 'not yet valid'],
    [claims({ iat: NOW / 1_000 + 6, nbf: NOW / 1_000 }), 'issued in the future'],
    [claims({ exp: NOW / 1_000 - 1, iat: NOW / 1_000 }), 'expiry before issue'],
    [claims({ iat: NOW / 1_000 - 1, nbf: NOW / 1_000 + 4, exp: NOW / 1_000 + 3 }), 'not-before after expiry'],
    [claims({ iat: NOW / 1_000 - 61, nbf: NOW / 1_000 - 61, exp: NOW / 1_000 + 3_540 }), 'overlong'],
  ])('rejects %s token timing (%s)', async (tokenClaims) => {
    const provider = new VercelOidcIdentityTokenProvider({
      tokenSource: async () => jwt(tokenClaims),
      now: () => NOW,
      minimumRemainingTtlMs: 5_000,
      maximumTokenTtlMs: 3_600_000,
      clockSkewMs: 5_000,
    })

    await expect(provider.getIdentityToken(new AbortController().signal)).rejects.toMatchObject({
      code: 'secret_store_authentication_failed',
    })
  })

  it('fails closed when token acquisition throws or the caller aborts before or during acquisition', async () => {
    const providerFailure = new VercelOidcIdentityTokenProvider({
      tokenSource: async () => {
        throw new Error('provider canary')
      },
      now: () => NOW,
    })
    await expect(providerFailure.getIdentityToken(new AbortController().signal)).rejects.toMatchObject({
      code: 'secret_store_authentication_failed',
    })

    const alreadyAborted = new AbortController()
    alreadyAborted.abort()
    await expect(providerFailure.getIdentityToken(alreadyAborted.signal)).rejects.toMatchObject({
      code: 'secret_store_authentication_failed',
    })

    const duringAbort = new AbortController()
    const pending = new VercelOidcIdentityTokenProvider({
      tokenSource: async () => await new Promise<string>(() => undefined),
      now: () => NOW,
    }).getIdentityToken(duringAbort.signal)
    duringAbort.abort()
    await expect(pending).rejects.toMatchObject({ code: 'secret_store_authentication_failed' })
  })

  it.each([
    { minimumRemainingTtlMs: -1 },
    { minimumRemainingTtlMs: Number.NaN },
    { maximumTokenTtlMs: 0 },
    { maximumTokenTtlMs: Number.NaN },
    { maximumTokenTtlMs: 3_600_001 },
    { clockSkewMs: Number.NaN },
    { clockSkewMs: -1 },
    { clockSkewMs: 60_001 },
    { minimumRemainingTtlMs: 3_600_000 },
  ])('rejects ambiguous token lifetime configuration: %o', (options) => {
    expect(() => new VercelOidcIdentityTokenProvider(options)).toThrow(TypeError)
  })

  it.each([Number.NaN, -1, NOW + 0.5])('rejects an invalid server clock: %s', async (invalidNow) => {
    const provider = new VercelOidcIdentityTokenProvider({
      tokenSource: async () => jwt(claims()),
      now: () => invalidNow,
    })
    await expect(provider.getIdentityToken(new AbortController().signal)).rejects.toMatchObject({
      code: 'secret_store_authentication_failed',
    })
  })
})
