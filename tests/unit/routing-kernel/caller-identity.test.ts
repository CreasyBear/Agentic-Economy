import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signatureHeaders as signHttpMessage } from 'http-message-sig'
import { jwkToKeyID } from 'web-bot-auth'
import { signerFromJWK } from 'web-bot-auth/crypto'

import { verifyAgentIdentity } from '@/modules/routing-kernel/caller-identity'
import { sourceWriteContentDigestHeader } from '@/modules/security/source-write-admission'

const OPENAI_AGENT = 'https://chatgpt.com'
const GOOGLE_AGENT = 'https://agent.bot.goog'
const EXPECTED_AUTHORITY = 'ae.example'
const FIXED_NOW = new Date('2026-07-04T12:00:00.000Z')
const MAX_SIGNATURE_AGE_MS = 60_000
const CLOCK_SKEW_MS = 30_000

const OPENAI_PRIVATE_JWK: JsonWebKey = {
  key_ops: ['sign'],
  ext: true,
  alg: 'Ed25519',
  crv: 'Ed25519',
  d: 'EcggSYY2cjPzSpEhd7LNoySS6ZjPASLAnt3rSuS6Y1s',
  x: '61RoMQqm5NkQEf1aYek0kCkUSJjwcEhAOGdqg22hojg',
  kty: 'OKP',
}

const OPENAI_PUBLIC_JWK: JsonWebKey = {
  key_ops: ['verify'],
  ext: true,
  alg: 'Ed25519',
  crv: 'Ed25519',
  x: '61RoMQqm5NkQEf1aYek0kCkUSJjwcEhAOGdqg22hojg',
  kty: 'OKP',
}

const OTHER_PRIVATE_JWK: JsonWebKey = {
  key_ops: ['sign'],
  ext: true,
  alg: 'Ed25519',
  crv: 'Ed25519',
  d: 'EuASDv4jYvArrZOp01W-qS-C0X-UL0IlYWFKGAPadGU',
  x: 'B9DoF4v4ZtVTYAWusKFzyPWbHYvQPQk-Ghll6mqYZwY',
  kty: 'OKP',
}

describe('verifyAgentIdentity Web Bot Auth contract', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('treats a request with no signature headers as unsigned so read/list routes can still serve', async () => {
    await expect(verifyAgentIdentity(unsignedRequest(), verificationOptions())).resolves.toEqual({
      kind: 'unsigned',
    })
  })

  it('maps malformed signature syntax to a typed 400 policy error instead of trusting it', async () => {
    const request = unsignedRequest({
      Signature: 'not-a-http-message-signature',
      'Signature-Input': 'sig1=not an inner-list',
      'Signature-Agent': '"https://chatgpt.com"',
    })

    await expect(verifyAgentIdentity(request, verificationOptions())).resolves.toMatchObject({
      kind: 'error',
      code: 'malformed_signature',
      status: 400,
    })
  })

  it.each([
    {
      name: 'wrong Web Bot Auth tag',
      tag: 'not-web-bot-auth',
    },
    {
      name: 'missing Web Bot Auth tag',
      tag: null,
    },
  ])('rejects $name as a typed 400 policy error', async ({ tag }) => {
    const request = await signedRequest({ tag })

    await expect(verifyAgentIdentity(request, verificationOptions())).resolves.toMatchObject({
      kind: 'error',
      code: 'invalid_wba_tag',
      status: 400,
    })
  })

  it('requires @method to be covered by the signature', async () => {
    const request = await signedRequest({ components: ['@authority', '@path', 'signature-agent'] })

    await expect(verifyAgentIdentity(request, verificationOptions())).resolves.toMatchObject({
      kind: 'error',
      code: 'missing_method_coverage',
      status: 400,
    })
  })

  it('requires @authority to be covered by the signature', async () => {
    const request = await signedRequest({ components: ['@method', '@path', 'signature-agent'] })

    await expect(verifyAgentIdentity(request, verificationOptions())).resolves.toMatchObject({
      kind: 'error',
      code: 'missing_authority_coverage',
      status: 400,
    })
  })

  it('requires @path to be covered by the signature', async () => {
    const request = await signedRequest({ components: ['@method', '@authority', 'signature-agent'] })

    await expect(verifyAgentIdentity(request, verificationOptions())).resolves.toMatchObject({
      kind: 'error',
      code: 'missing_path_coverage',
      status: 400,
    })
  })

  it('requires Signature-Agent to be covered whenever the identity header is present', async () => {
    const request = await signedRequest({ components: ['@method', '@authority', '@path'] })

    await expect(verifyAgentIdentity(request, verificationOptions())).resolves.toMatchObject({
      kind: 'error',
      code: 'signature_agent_not_covered',
      status: 400,
    })
  })

  it('requires Content-Digest coverage for bodied requests', async () => {
    const bodyText = JSON.stringify({ tool: 'registry.search', input: { query: 'parramatta' } })
    const request = await signedRequest({
      bodyText,
      components: ['@method', '@authority', '@path', 'signature-agent'],
    })

    await expect(verifyAgentIdentity(request, verificationOptions({ bodyText }))).resolves.toMatchObject({
      kind: 'error',
      code: 'missing_content_digest_coverage',
      status: 400,
    })
  })

  it('rejects a bodied request mutated after signing because Content-Digest no longer matches', async () => {
    const signedBody = JSON.stringify({ tool: 'registry.search', input: { query: 'parramatta' } })
    const actualBody = JSON.stringify({ tool: 'registry.search', input: { query: 'tampered' } })
    const request = await signedRequest({ bodyText: signedBody })

    await expect(verifyAgentIdentity(request, verificationOptions({ bodyText: actualBody }))).resolves.toMatchObject({
      kind: 'error',
      code: 'content_digest_mismatch',
      status: 400,
    })
  })

  it('rejects a signature bound to a different authority before it can be replayed across hosts', async () => {
    const request = await signedRequest({ authority: 'evil.example' })

    await expect(verifyAgentIdentity(request, verificationOptions())).resolves.toMatchObject({
      kind: 'error',
      code: 'authority_mismatch',
      status: 401,
    })
  })

  it.each([
    {
      name: 'expired signature',
      created: secondsBefore(90),
      expires: secondsBefore(1),
      code: 'signature_expired',
    },
    {
      name: 'future created beyond allowed clock skew',
      created: secondsAfter(31),
      expires: secondsAfter(90),
      code: 'signature_created_in_future',
    },
    {
      name: 'stale created outside the replay window even when expires is later',
      created: secondsBefore(61),
      expires: secondsAfter(60),
      code: 'signature_stale',
    },
  ])('rejects $name with a typed 401 identity error', async ({ created, expires, code }) => {
    const request = await signedRequest({ created, expires })

    await expect(verifyAgentIdentity(request, verificationOptions())).resolves.toMatchObject({
      kind: 'error',
      code,
      status: 401,
    })
  })

  it('refuses a legacy-form Signature-Agent that is not in the initial OpenAI-only allowlist', async () => {
    const request = await signedRequest({ signatureAgent: GOOGLE_AGENT })

    await expect(verifyAgentIdentity(request, verificationOptions())).resolves.toMatchObject({
      kind: 'error',
      code: 'untrusted_signature_agent',
      status: 401,
    })
  })

  it('refuses dictionary-form/non-OpenAI agent fixtures until that dialect is intentionally admitted', async () => {
    const request = await signedRequest({ signatureAgentHeader: 'g="https://agent.bot.goog"' })

    await expect(verifyAgentIdentity(request, verificationOptions())).resolves.toMatchObject({
      kind: 'error',
      code: 'unsupported_signature_agent_format',
      status: 400,
    })
  })

  it('refuses a known OpenAI agent when the signed keyid is absent from its directory', async () => {
    const request = await signedRequest({ privateJwk: OTHER_PRIVATE_JWK })

    await expect(verifyAgentIdentity(request, verificationOptions())).resolves.toMatchObject({
      kind: 'error',
      code: 'unknown_key',
      status: 401,
    })
  })

  it('refuses a bad signature even when the keyid and OpenAI-style directory entry are known', async () => {
    const request = await signedRequest({ mutateSignature: true })

    await expect(verifyAgentIdentity(request, verificationOptions())).resolves.toMatchObject({
      kind: 'error',
      code: 'invalid_signature',
      status: 401,
    })
  })

  it('accepts a valid synthetic OpenAI-style identity without granting authority fields', async () => {
    const keyid = await openAiKeyid()
    const request = await signedRequest()

    const result = await verifyAgentIdentity(request, verificationOptions())

    expect(result).toMatchObject({
      kind: 'identity',
      signatureAgent: OPENAI_AGENT,
      keyid,
      verifiedAt: FIXED_NOW.toISOString(),
    })
    expect(result).not.toHaveProperty('allowWrites')
    expect(result).not.toHaveProperty('authorized')
    expect(result).not.toHaveProperty('authority')
  })

  it('accepts OpenAI unsigned JWKS only when the pretrusted_directory_origin policy is explicit', async () => {
    const request = await signedRequest()

    await expect(
      verifyAgentIdentity(request, verificationOptions({ pretrustedDirectoryOrigins: [] }))
    ).resolves.toMatchObject({
      kind: 'error',
      code: 'unsigned_directory_untrusted',
      status: 401,
    })

    await expect(
      verifyAgentIdentity(request, verificationOptions({ pretrustedDirectoryOrigins: [OPENAI_AGENT] }))
    ).resolves.toMatchObject({
      kind: 'identity',
      signatureAgent: OPENAI_AGENT,
      keyid: await openAiKeyid(),
    })
  })

  it('fails closed when deployment policy does not explicitly admit a signature agent', async () => {
    const request = await signedRequest()

    await expect(verifyAgentIdentity(request, {
      expectedAuthority: EXPECTED_AUTHORITY,
      now: FIXED_NOW,
      maxSignatureAgeMs: MAX_SIGNATURE_AGE_MS,
      clockSkewMs: CLOCK_SKEW_MS,
    })).resolves.toMatchObject({
      kind: 'error',
      code: 'untrusted_signature_agent',
      status: 401,
    })
  })
})

function unsignedRequest(headers: HeadersInit = {}): Request {
  return new Request(`https://${EXPECTED_AUTHORITY}/v1/route`, { headers })
}

async function signedRequest(input: {
  authority?: string
  components?: readonly string[]
  created?: Date
  expires?: Date
  privateJwk?: typeof OPENAI_PRIVATE_JWK | typeof OTHER_PRIVATE_JWK
  signatureAgent?: string
  signatureAgentHeader?: string
  tag?: string | null
  mutateSignature?: boolean
  bodyText?: string
} = {}): Promise<Request> {
  const authority = input.authority ?? EXPECTED_AUTHORITY
  const signatureAgent = input.signatureAgent ?? OPENAI_AGENT
  const signatureAgentHeader = input.signatureAgentHeader ?? `"${signatureAgent}"`
  const privateJwk = input.privateJwk ?? OPENAI_PRIVATE_JWK
  const keyid = await keyidFor(privateJwk as JsonWebKey)
  const bodyText = input.bodyText
  const headers = new Headers({
    'Signature-Agent': signatureAgentHeader,
  })
  if (bodyText !== undefined) {
    headers.set('Content-Digest', sourceWriteContentDigestHeader(bodyText))
  }
  const request = new Request(`https://${authority}/v1/route`, {
    method: bodyText === undefined ? 'GET' : 'POST',
    headers,
    ...(bodyText === undefined ? {} : { body: bodyText }),
  })
  const signer = await signerFromJWK(privateJwk as JsonWebKey)
  const signed = await signHttpMessage(request, {
    signer,
    keyid,
    components: [...(input.components ?? defaultComponents(bodyText !== undefined))],
    created: input.created ?? secondsBefore(10),
    expires: input.expires ?? secondsAfter(50),
    ...(input.tag === null ? {} : { tag: input.tag ?? 'web-bot-auth' }),
  })
  const signature = input.mutateSignature === true
    ? signed.Signature.replace(/=:([A-Za-z0-9+/=])/, (_match, first: string) => `=:${first === 'A' ? 'B' : 'A'}`)
    : signed.Signature

  const responseHeaders = new Headers(request.headers)
  responseHeaders.set('Signature', signature)
  responseHeaders.set('Signature-Input', signed['Signature-Input'])
  return new Request(request.url, {
    method: request.method,
    headers: responseHeaders,
    ...(bodyText === undefined ? {} : { body: bodyText }),
  })
}

function defaultComponents(hasBody: boolean): readonly string[] {
  return hasBody
    ? ['@method', '@authority', '@path', 'content-digest', 'signature-agent']
    : ['@method', '@authority', '@path', 'signature-agent']
}

function verificationOptions(overrides: {
  pretrustedDirectoryOrigins?: readonly string[]
  bodyText?: string
} = {}) {
  return {
    expectedAuthority: EXPECTED_AUTHORITY,
    now: FIXED_NOW,
    maxSignatureAgeMs: MAX_SIGNATURE_AGE_MS,
    clockSkewMs: CLOCK_SKEW_MS,
    allowedSignatureAgents: [OPENAI_AGENT],
    pretrustedDirectoryOrigins: overrides.pretrustedDirectoryOrigins ?? [OPENAI_AGENT],
    ...(overrides.bodyText === undefined ? {} : { bodyText: overrides.bodyText }),
    fetchDirectory: async (signatureAgent: string) => {
      if (signatureAgent !== OPENAI_AGENT) {
        throw new Error(`unexpected directory fetch for ${signatureAgent}`)
      }

      return new Response(JSON.stringify({ keys: [await openAiPublicJwkWithKid()] }), {
        status: 200,
        headers: {
          'content-type': 'application/http-message-signatures-directory+json',
          'cache-control': 'max-age=60',
        },
      })
    },
  }
}

async function openAiPublicJwkWithKid() {
  return {
    ...OPENAI_PUBLIC_JWK,
    kid: await openAiKeyid(),
  }
}

function openAiKeyid(): Promise<string> {
  return keyidFor(OPENAI_PUBLIC_JWK as JsonWebKey)
}

function keyidFor(jwk: JsonWebKey): Promise<string> {
  return jwkToKeyID(jwk, crypto.subtle.digest.bind(crypto.subtle, 'SHA-256'), base64UrlNoPadding)
}

function base64UrlNoPadding(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function secondsBefore(seconds: number): Date {
  return new Date(FIXED_NOW.getTime() - seconds * 1000)
}

function secondsAfter(seconds: number): Date {
  return new Date(FIXED_NOW.getTime() + seconds * 1000)
}
