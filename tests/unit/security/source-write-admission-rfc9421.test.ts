import { verify, type RequestLike } from 'http-message-sig'
import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha2'
import { describe, expect, it, vi } from 'vitest'

import { base64Codec } from '@/modules/common/base64-codec'
import {
  createSourceWriteAdmission,
  SOURCE_WRITE_CLOCK_SKEW_MS,
  SOURCE_WRITE_MAX_AGE_MS,
  SOURCE_WRITE_NO_BODY_DIGEST,
  sourceWriteBodyDigest,
  sourceWriteCommandDigest,
  verifySourceWriteAdmission,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'

const RFC_SHARED_SECRET = base64Codec.fromBase64(
  'uzvJfB4u3N0Jy4T7NZ75MDVcr8zSTInedJtkgcu46YW4XByzNJjxBdtjUkdJPBtbmHhIDi6pcl8jsasjlTMtDQ==',
)
const RFC_SIGNATURE_BASE = [
  '"date": Tue, 20 Apr 2021 02:07:55 GMT',
  '"@authority": example.com',
  '"content-type": application/json',
  '"@signature-params": ("date" "@authority" "content-type");created=1618884473;keyid="test-shared-secret"',
].join('\n')
const RFC_SIGNATURE = 'pxcQw6G3AjtMBQjwo8XzkZf/bws5LelbaMk5rGIGtE8='
const SOURCE_WRITE_SECRET = 'source-write-test-secret-32-byte-key-material'
const ISSUED_AT = Date.now()

const RFC_REQUEST: RequestLike = {
  method: 'POST',
  url: 'https://example.com/foo?param=Value&Pet=dog',
  headers: {
    date: 'Tue, 20 Apr 2021 02:07:55 GMT',
    'content-type': 'application/json',
  },
}

describe('source-write RFC 9421 signing', () => {
  it('verifies the RFC 9421 Appendix B.2.5 HMAC request vector', async () => {
    const verified = await verify(
      {
        ...RFC_REQUEST,
        headers: {
          ...RFC_REQUEST.headers,
          'Signature-Input': 'sig-b25=("date" "@authority" "content-type");created=1618884473;keyid="test-shared-secret"',
          Signature: `sig-b25=:${RFC_SIGNATURE}:`,
        },
      },
      (data, signature) => {
        expect(data).toBe(RFC_SIGNATURE_BASE)
        return base64Codec.toBase64(hmac(sha256, RFC_SHARED_SECRET, new TextEncoder().encode(data))) === base64Codec.toBase64(signature)
      },
    )
    expect(verified).toBe(true)
  })

  it('uses the exact Unicode body digest and preserves target query in the RFC components', async () => {
    expect(sourceWriteBodyDigest('☃ body bytes')).toBe('VQn8-Ol1L9bcQKycy8cfQQuklBCgc_2nfAo2y5N3fOo')
    const command = { operationKey: 'op:unicode', correlationId: 'corr:unicode', value: '☃' }
    const request = requestFor('POST', '?q=two%20words&x=1', sourceWriteBodyDigest('☃ body bytes'))
    const admission = await createSourceWriteAdmission({
      env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
      request,
      scope: 'billing',
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      commandDigest: sourceWriteCommandDigest(command),
      now: ISSUED_AT,
      nonce: 'nonce-unicode',
    })

    expect(admission.version).toBe('source-write:v2')
    expect(admission.signatureInput).toContain('"@scheme" "@authority" "@method" "@path" "@query"')
    expect(admission.signatureInput).toContain('"x-ae-method"')
    expect(admission.signatureInput).toContain('"x-ae-command-digest"')
    await expect(verifySourceWriteAdmission({
      admission,
      env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
      now: ISSUED_AT,
      expected: {
        scope: 'billing',
        operationKey: command.operationKey,
        correlationId: command.correlationId,
        commandDigest: sourceWriteCommandDigest(command),
        request,
      },
    })).resolves.toMatchObject({ kind: 'accepted' })
  })

  it.each([
    ['method case', { method: 'post' }, 'source_write_method_mismatch'],
    ['initiator origin', { initiatorOrigin: 'https://evil.example' }, 'source_write_origin_mismatch'],
    ['target origin', { targetOrigin: 'https://other.example' }, 'source_write_target_origin_mismatch'],
    ['path', { targetPath: '/v1/other' }, 'source_write_path_mismatch'],
    ['query', { targetQuery: '?q=tampered' }, 'source_write_query_mismatch'],
    ['body', { bodyDigest: sourceWriteBodyDigest('tampered') }, 'source_write_body_mismatch'],
  ] as const)('rejects a signed request with a mismatched %s binding', async (_label, override, reason) => {
    const command = { operationKey: 'op:binding', correlationId: 'corr:binding', value: 'one' }
    const request = requestFor('POST', '?q=one', sourceWriteBodyDigest('body'))
    const admission = await createSourceWriteAdmission({
      env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
      request,
      scope: 'billing',
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      commandDigest: sourceWriteCommandDigest(command),
      now: ISSUED_AT,
      nonce: `nonce-${_label}`,
    })
    await expect(verifySourceWriteAdmission({
      admission,
      env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
      now: ISSUED_AT,
      expected: {
        scope: 'billing',
        operationKey: command.operationKey,
        correlationId: command.correlationId,
        commandDigest: sourceWriteCommandDigest(command),
        request: { ...request, ...override },
      },
    })).resolves.toMatchObject({ kind: 'rejected', reason })
  })

  it('rejects malformed body digests without hashing the marker', async () => {
    const command = { operationKey: 'op:digest', correlationId: 'corr:digest' }
    const request = requestFor('POST', '', sourceWriteBodyDigest('body'))
    const admission = await createSourceWriteAdmission({
      env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
      request,
      scope: 'billing',
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      commandDigest: sourceWriteCommandDigest(command),
      now: ISSUED_AT,
      nonce: 'nonce-digest',
    })
    await expect(verifySourceWriteAdmission({
      admission: { ...admission, bodyDigest: 'not-a-digest' },
      env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
      now: ISSUED_AT,
      expected: {
        scope: 'billing',
        operationKey: command.operationKey,
        correlationId: command.correlationId,
        commandDigest: sourceWriteCommandDigest(command),
        request,
      },
    })).resolves.toEqual({ kind: 'rejected', reason: 'invalid_source_write_body_digest' })

    const readAdmission = await createSourceWriteAdmission({
      env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
      request: requestFor('GET', '', SOURCE_WRITE_NO_BODY_DIGEST),
      scope: 'billing',
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      commandDigest: sourceWriteCommandDigest(command),
      now: ISSUED_AT,
      nonce: 'nonce-read-no-body',
      allowNoBody: true,
    })
    await expect(verifySourceWriteAdmission({
      admission: readAdmission,
      env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
      now: ISSUED_AT,
      expected: { scope: 'billing', operationKey: command.operationKey, correlationId: command.correlationId },
    })).resolves.toMatchObject({ kind: 'accepted' })
    await expect(verifySourceWriteAdmission({
      admission: { ...readAdmission, commandDigest: 'malformed' },
      env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
      now: ISSUED_AT,
      expected: { scope: 'billing', operationKey: command.operationKey, correlationId: command.correlationId },
    })).resolves.toEqual({ kind: 'rejected', reason: 'source_write_command_mismatch' })
  })

  it('rejects weak key material and unsafe key ids', async () => {
    const command = { operationKey: 'op:key', correlationId: 'corr:key' }
    const request = requestFor('POST', '', sourceWriteBodyDigest('body'))
    await expect(createSourceWriteAdmission({
      env: { AE_SOURCE_WRITE_SECRET: 'too-short' },
      request,
      scope: 'billing',
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      commandDigest: sourceWriteCommandDigest(command),
    })).rejects.toMatchObject({ code: 'missing_source_write_secret' })
    await expect(createSourceWriteAdmission({
      env: { AE_SOURCE_WRITE_KEY_BILLING: `unsafe/id:${SOURCE_WRITE_SECRET}` },
      request,
      scope: 'billing',
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      commandDigest: sourceWriteCommandDigest(command),
    })).rejects.toMatchObject({ code: 'invalid_source_write_key_id' })
  })

  it('applies explicit asymmetric skew and maximum age boundaries', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(ISSUED_AT)
    try {
      const command = { operationKey: 'op:time', correlationId: 'corr:time' }
      const request = requestFor('POST', '', sourceWriteBodyDigest('body'))
      const admission = await createSourceWriteAdmission({
        env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
        request,
        scope: 'billing',
        operationKey: command.operationKey,
        correlationId: command.correlationId,
        commandDigest: sourceWriteCommandDigest(command),
        now: ISSUED_AT,
        nonce: 'nonce-time',
      })
      const expected = {
        scope: 'billing' as const,
        operationKey: command.operationKey,
        correlationId: command.correlationId,
        commandDigest: sourceWriteCommandDigest(command),
        request,
      }
      const env = { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET }
      vi.setSystemTime(ISSUED_AT - SOURCE_WRITE_CLOCK_SKEW_MS)
      await expect(verifySourceWriteAdmission({ admission, env, now: ISSUED_AT - SOURCE_WRITE_CLOCK_SKEW_MS, expected })).resolves.toMatchObject({ kind: 'accepted' })
      vi.setSystemTime(ISSUED_AT - SOURCE_WRITE_CLOCK_SKEW_MS - 1)
      await expect(verifySourceWriteAdmission({ admission, env, now: ISSUED_AT - SOURCE_WRITE_CLOCK_SKEW_MS - 1, expected })).resolves.toMatchObject({ kind: 'rejected', reason: 'stale_source_write_admission' })
      vi.setSystemTime(ISSUED_AT + SOURCE_WRITE_MAX_AGE_MS)
      await expect(verifySourceWriteAdmission({ admission, env, now: ISSUED_AT + SOURCE_WRITE_MAX_AGE_MS, expected })).resolves.toMatchObject({ kind: 'accepted' })
      vi.setSystemTime(ISSUED_AT + SOURCE_WRITE_MAX_AGE_MS + 1)
      await expect(verifySourceWriteAdmission({ admission, env, now: ISSUED_AT + SOURCE_WRITE_MAX_AGE_MS + 1, expected })).resolves.toMatchObject({ kind: 'rejected', reason: 'stale_source_write_admission' })
    } finally {
      vi.useRealTimers()
    }
  })
})

function requestFor(method: string, targetQuery: string, bodyDigest: string): SourceWriteAdmissionRequest {
  return {
    method,
    initiatorOrigin: 'https://app.example',
    targetOrigin: 'https://ae.example',
    targetPath: '/v1/source-write',
    targetQuery,
    bodyDigest,
  }
}
