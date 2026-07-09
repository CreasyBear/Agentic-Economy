import { describe, expect, it } from 'vitest'

import type { ClearanceSigningKeyResolution } from '@/modules/clearance/public'
import {
  agentAuthorityReceiptHeaders,
  buildHarnessQueryAuthorityReceipt,
  HarnessAuthorityBoundaryScheme,
  HarnessQueryAuthorityReceiptVersion,
  harnessQueryAuthorityReceiptHeaders,
  verifyHarnessQueryAuthorityReceipt,
  type HarnessAuthorityReceiptSurface,
  type HarnessQueryAuthorityReceipt,
} from '@/modules/harness/query-authority-receipt'

const RESOLVED_KEY: ClearanceSigningKeyResolution = {
  kind: 'resolved',
  secret: 'test-clearance-secret',
  keyIdentityRef: 'test-key-1',
}

type ResultParts = { toolId: string; status: 'ok'; resultHash: string }

function queryResult(overrides: Partial<ResultParts> = {}): ResultParts {
  return {
    toolId: 'registry.search',
    status: 'ok',
    resultHash: 'hash:registry-search-1',
    ...overrides,
  }
}

function build(
  overrides: {
    result?: Partial<ResultParts>
    surface?: HarnessAuthorityReceiptSurface
    issuedAt?: number
    signing?: ClearanceSigningKeyResolution
  } = {},
): HarnessQueryAuthorityReceipt {
  return buildHarnessQueryAuthorityReceipt({
    result: queryResult(overrides.result),
    surface: overrides.surface ?? 'agentTools',
    issuedAt: overrides.issuedAt ?? 1_000,
    ...(overrides.signing === undefined ? {} : { signing: overrides.signing }),
  })
}

describe('harness query authority receipt', () => {
  it('binds each query run to the kernel all-false authority boundary and its non-claims', () => {
    const receipt = build({ signing: RESOLVED_KEY })

    expect(receipt.version).toBe(HarnessQueryAuthorityReceiptVersion)
    expect(receipt.boundaryScheme).toBe(HarnessAuthorityBoundaryScheme)
    expect(receipt.toolId).toBe('registry.search')

    // The kernel boundary must attest that AE creates no authority / custody /
    // settlement — every field is `false`.
    expect(Object.values(receipt.authorityBoundary).every((value) => value === false)).toBe(true)
    expect(receipt.authorityBoundary.authorityCreated).toBe(false)
    expect(receipt.authorityBoundary.settlementClaimed).toBe(false)
    expect(receipt.authorityBoundary.providerCustodyClaimed).toBe(false)

    // The kernel's required non-claims travel with the receipt.
    expect(receipt.nonClaims).toContain('adapter_sdk_does_not_create_authority')
    expect(receipt.nonClaims).toContain('adapter_sdk_does_not_attempt_mutations')
    expect(receipt.nonClaims.length).toBeGreaterThanOrEqual(9)
  })

  it('content-addresses the receipt reference (replay-safe across time)', () => {
    const early = build({ issuedAt: 1_000, signing: RESOLVED_KEY })
    const late = build({ issuedAt: 9_999_999, signing: RESOLVED_KEY })

    // Same query + result -> same reference regardless of when it ran.
    expect(late.receiptRef).toBe(early.receiptRef)
    // ...but the signed-at timestamp and signature reflect the actual run.
    expect(late.issuedAt).not.toBe(early.issuedAt)
    if (early.signature.posture === 'local_hmac' && late.signature.posture === 'local_hmac') {
      expect(late.signature.signedAt).not.toBe(early.signature.signedAt)
      expect(late.signature.signature).not.toBe(early.signature.signature)
    } else {
      throw new Error('expected signed receipts')
    }
  })

  it('is idempotent: identical inputs reproduce a byte-identical receipt', () => {
    const first = build({ issuedAt: 4_242, signing: RESOLVED_KEY })
    const second = build({ issuedAt: 4_242, signing: RESOLVED_KEY })
    expect(second).toEqual(first)
  })

  it('changes the reference when the underlying result changes', () => {
    const a = build({ result: { resultHash: 'hash:a' }, signing: RESOLVED_KEY })
    const b = build({ result: { resultHash: 'hash:b' }, signing: RESOLVED_KEY })
    expect(b.receiptRef).not.toBe(a.receiptRef)
  })

  it('distinguishes the machine surface in the reference', () => {
    const tools = build({ surface: 'agentTools', signing: RESOLVED_KEY })
    const json = build({ surface: 'agentJson', signing: RESOLVED_KEY })
    expect(json.receiptRef).not.toBe(tools.receiptRef)
  })

  it('signs with local HMAC and verifies against the signing secret', () => {
    const receipt = build({ signing: RESOLVED_KEY })
    expect(receipt.signature.posture).toBe('local_hmac')

    expect(verifyHarnessQueryAuthorityReceipt({ receipt, secret: RESOLVED_KEY.secret })).toEqual({
      kind: 'accepted',
    })
    expect(
      verifyHarnessQueryAuthorityReceipt({ receipt, secret: 'wrong-secret' }),
    ).toEqual({ kind: 'rejected', reason: 'invalid_clearance_signature' })
  })

  it('records an honest proof gap when no signing key is available', () => {
    const unsigned = build()
    expect(unsigned.signature.posture).toBe('proof_gap')

    const missingSecret = build({
      signing: { kind: 'proof_gap', reason: 'missing_clearance_signing_secret', keyIdentityRef: 'k' },
    })
    expect(missingSecret.signature.posture).toBe('proof_gap')
    if (missingSecret.signature.posture === 'proof_gap') {
      expect(missingSecret.signature.reason).toBe('missing_clearance_signing_secret')
    }
    // Reference is still deterministic without a signature.
    expect(missingSecret.receiptRef).toBe(build().receiptRef)
  })

  it('projects machine-only headers with no human-facing capability copy', () => {
    const headers = harnessQueryAuthorityReceiptHeaders(build({ signing: RESOLVED_KEY }))

    expect(headers['x-ae-authority-receipt']).toMatch(/^harness-query-authority-receipt:v1:hash:/)
    expect(headers['x-ae-authority-boundary']).toBe(HarnessAuthorityBoundaryScheme)
    expect(headers['x-ae-authority-signature-posture']).toBe('local_hmac')
    expect(headers['x-ae-authority-signature']).toContain('test-key-1:')

    // Guard against leaking any capability / readiness copy onto the wire.
    const serialized = JSON.stringify(headers).toLowerCase()
    for (const banned of ['book', 'charge', 'dispatch', 'guarantee', 'paid', 'settle']) {
      expect(serialized).not.toContain(banned)
    }
  })

  it('omits the signature header on a proof-gap receipt', () => {
    const headers = harnessQueryAuthorityReceiptHeaders(build())
    expect(headers['x-ae-authority-signature-posture']).toBe('proof_gap')
    expect(headers['x-ae-authority-signature']).toBeUndefined()
    expect(headers['x-ae-authority-signed-at']).toBeUndefined()
  })

  it('resolves signing from an env bag for machine-surface routes', () => {
    const signedHeaders = agentAuthorityReceiptHeaders({
      result: queryResult(),
      surface: 'agentTools',
      issuedAt: 1_000,
      env: {
        AE_CLEARANCE_SIGNING_SECRET: 'env-secret',
        AE_CLEARANCE_SIGNING_KEY_ID: 'env-key',
      },
    })
    expect(signedHeaders['x-ae-authority-signature-posture']).toBe('local_hmac')
    expect(signedHeaders['x-ae-authority-signature']).toContain('env-key:')

    const unsignedHeaders = agentAuthorityReceiptHeaders({
      result: queryResult(),
      surface: 'agentTools',
      issuedAt: 1_000,
      env: {},
    })
    expect(unsignedHeaders['x-ae-authority-signature-posture']).toBe('proof_gap')
    // Same query -> same reference whether or not a signing key was present.
    expect(unsignedHeaders['x-ae-authority-receipt']).toBe(signedHeaders['x-ae-authority-receipt'])
  })
})
