import { beforeEach, describe, expect, it, vi } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import type { StableHashValue } from '@/modules/common/stable-hash'

const mocks = vi.hoisted(() => ({
  createCdpEvmX402PaymentSignature: vi.fn(),
  createSandboxEvmX402PaymentSignature: vi.fn(),
  cdpX402RequestFingerprint: vi.fn(),
  cdpX402CustodyConfigurationFromEnvironment: vi.fn(),
  cdpX402CustodyBudgetRef: vi.fn(),
  readCdpX402PaymentAuthorization: vi.fn(),
  credentialFromEnvironment: vi.fn(),
  isPaymentSigningIdempotencyKey: (value: unknown) => typeof value === 'string' && value.length > 0,
}))

vi.mock('@/modules/capability-supply/server', () => ({
  cdpX402RequestFingerprint: mocks.cdpX402RequestFingerprint,
  cdpX402CustodyConfigurationFromEnvironment: mocks.cdpX402CustodyConfigurationFromEnvironment,
  cdpX402CustodyBudgetRef: mocks.cdpX402CustodyBudgetRef,
  createCdpEvmX402PaymentSignature: mocks.createCdpEvmX402PaymentSignature,
  createSandboxEvmX402PaymentSignature: mocks.createSandboxEvmX402PaymentSignature,
  credentialFromEnvironment: mocks.credentialFromEnvironment,
  readCdpX402PaymentAuthorization: mocks.readCdpX402PaymentAuthorization,
  isPaymentSigningIdempotencyKey: mocks.isPaymentSigningIdempotencyKey,
  readX402PaymentPayer: vi.fn(),
  readGuardedX402EvmReceipt: vi.fn(),
  paymentObservationDigest: vi.fn(),
  transportObservationDigest: vi.fn(),
  verifyExactEvmX402Settlement: vi.fn(),
  x402PaymentCredentialRefFromEnvironment: vi.fn(),
  x402SettlementStatusForObservation: vi.fn(),
}))

import { readX402Authorization } from '@/modules/capability-execution/invocation-worker/x402Route'

const CUSTODY_REF = 'custody:attempt-one'
const AUTHORIZATION_DIGEST = 'sha256:authorization-one'
const REQUEST_FINGERPRINT = 'sha256:request-one'
const PAYMENT_IDENTIFIER = 'payment:one'
const DISPATCH_REF = 'invocation:one'
const ATTEMPT_REF = 'attempt:one'
const EFFECT_GENERATION = 1
const CREDENTIAL_REF = 'env:AE_X402_CDP_ACCOUNT_NAME'
const CUSTODY_BUDGET_REF = 'custody-budget:one'
const CUSTODY_GENERATION = 7
const CUSTODY_DAILY_MAXIMUM_UNITS = '100000'
const PAYMENT_PAYER = '0xpayer'
const PAYMENT_SIGNING_KEY = '11111111-1111-4111-8111-111111111111'
const PAYMENT_AUTHORIZATION_VALID_BEFORE = '999'
const PAYMENT_AUTHORIZATION_EXPIRES_AT = 999_000
const UNSIGNED_MATERIAL = {
  x402Version: 2,
  resource: { url: 'https://provider.example/paid' },
  accepted: { scheme: 'exact', network: 'eip155:8453', amount: '1', asset: '0x833589', payTo: '0xrecipient', maxTimeoutSeconds: 60, extra: { assetTransferMethod: 'eip3009' } },
  authorization: { from: PAYMENT_PAYER, to: '0xrecipient', value: '1', validAfter: '0', validBefore: '999', nonce: 'nonce:first' },
  typedData: { domain: { chainId: '8453' }, types: { TransferWithAuthorization: [] }, primaryType: 'TransferWithAuthorization', message: { value: '1', validBefore: PAYMENT_AUTHORIZATION_VALID_BEFORE } },
} as const
const UNSIGNED_MATERIAL_JSON = stableStringify(UNSIGNED_MATERIAL as unknown as StableHashValue)
const UNSIGNED_MATERIAL_DIGEST = canonicalDigest(UNSIGNED_MATERIAL)
const custodyConfiguration = () => ({
  apiKeyId: 'key-id',
  apiKeySecret: 'key-secret',
  walletSecret: 'wallet-secret',
  accountName: 'account:test',
  expectedEvmAddress: '0x0000000000000000000000000000000000000001',
  accountPolicyId: '11111111-1111-4111-8111-111111111111',
  projectPolicyId: '22222222-2222-4222-8222-222222222222',
  credentialGeneration: CUSTODY_GENERATION,
  maxAtomic: 10_000n,
  dailyMaxAtomic: 100_000n,
})

describe('x402 route authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.cdpX402CustodyConfigurationFromEnvironment.mockReturnValue(custodyConfiguration())
    mocks.cdpX402CustodyBudgetRef.mockReturnValue(CUSTODY_BUDGET_REF)
    configureSigner('payment-signature:first')
  })

  it('returns a stored header byte-identically without invoking the signer', async () => {
    const header = '  payment-signature:first\n'
    configureSigner(header)
    const db = new AuthorizationDb(material({
      paymentUnsignedMaterialJson: UNSIGNED_MATERIAL_JSON,
      paymentUnsignedMaterialDigest: UNSIGNED_MATERIAL_DIGEST,
      paymentSigningIdempotencyKey: PAYMENT_SIGNING_KEY,
      paymentSignatureDigest: canonicalDigest(header),
      paymentPayer: PAYMENT_PAYER,
      paymentNonce: 'nonce:first',
      paymentAuthorizationValidBefore: PAYMENT_AUTHORIZATION_VALID_BEFORE,
      paymentAuthorizationExpiresAt: PAYMENT_AUTHORIZATION_EXPIRES_AT,
    }))
    const ctx = db.actionCtx()

    await expect(readX402Authorization(ctx, prepared(), false, expected())).resolves.toBe(header)
    expect(mocks.createCdpEvmX402PaymentSignature).toHaveBeenCalledTimes(1)
    expect(db.queryCalls[0]).toMatchObject({ custodyGeneration: CUSTODY_GENERATION })
  })

  it('converges concurrent first reads on one committed header and one signer call', async () => {
    const header = 'payment-signature:first'
    const db = new AuthorizationDb(material())
    configureSigner(header)

    const [first, second] = await Promise.all([
      readX402Authorization(db.actionCtx(), prepared(), false, expected()),
      readX402Authorization(db.actionCtx(), prepared(), false, expected()),
    ])

    expect(first).toBe(header)
    expect(second).toBe(header)
    expect(first).toBe(second)
    expect(mocks.createCdpEvmX402PaymentSignature).toHaveBeenCalledTimes(2)
    expect(mocks.readCdpX402PaymentAuthorization).toHaveBeenCalledWith(
      header,
      expect.objectContaining({
        credential: CREDENTIAL_REF,
        paymentIdentifier: PAYMENT_IDENTIFIER,
        selectedRequirement: expect.objectContaining({
          network: 'eip155:8453',
          asset: expect.any(String),
          amount: '1',
          payTo: expect.any(String),
        }),
      }),
      { method: 'GET', operationRef: 'operation:one' },
      REQUEST_FINGERPRINT,
    )
    expect(db.current()).toMatchObject({
      paymentUnsignedMaterialJson: UNSIGNED_MATERIAL_JSON,
      paymentUnsignedMaterialDigest: UNSIGNED_MATERIAL_DIGEST,
      paymentSigningIdempotencyKey: PAYMENT_SIGNING_KEY,
      paymentSignatureDigest: canonicalDigest(header),
      paymentPayer: PAYMENT_PAYER,
      paymentNonce: 'nonce:first',
      paymentAuthorizationValidBefore: PAYMENT_AUTHORIZATION_VALID_BEFORE,
      paymentAuthorizationExpiresAt: PAYMENT_AUTHORIZATION_EXPIRES_AT,
      requestFingerprint: REQUEST_FINGERPRINT,
      state: 'prepared',
    })
    expect(db.queryCalls.every((args) => args.custodyGeneration === CUSTODY_GENERATION)).toBe(true)
    expect(db.mutationCalls.filter((args) => args.requestFingerprint !== undefined)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ custodyGeneration: CUSTODY_GENERATION }),
      ]),
    )
    expect(db.mutationCalls.find((args) => args.paymentUnsignedMaterialJson !== undefined)).toMatchObject({
      custodyGeneration: CUSTODY_GENERATION,
    })
  })

  it('returns the same header and nonce on a retry before submission', async () => {
    const header = 'payment-signature:first'
    const db = new AuthorizationDb(material())
    configureSigner(header)

    const first = await readX402Authorization(db.actionCtx(), prepared(), false, expected())
    const nonceAfterFirstAuthorization = db.current().paymentNonce
    const second = await readX402Authorization(db.actionCtx(), prepared(), false, expected())

    expect(first).toBe(header)
    expect(second).toBe(header)
    expect(db.current().paymentNonce).toBe(nonceAfterFirstAuthorization)
    expect(mocks.createCdpEvmX402PaymentSignature).toHaveBeenCalledTimes(2)
  })

  it('does not sign again after submission may have started', async () => {
    const db = new AuthorizationDb(material({
      state: 'possibly_submitted',
      paymentSignatureDigest: canonicalDigest('payment-signature:first'),
      paymentUnsignedMaterialJson: UNSIGNED_MATERIAL_JSON,
      paymentUnsignedMaterialDigest: UNSIGNED_MATERIAL_DIGEST,
      paymentSigningIdempotencyKey: PAYMENT_SIGNING_KEY,
      paymentPayer: PAYMENT_PAYER,
      paymentNonce: 'nonce:first',
      paymentAuthorizationValidBefore: PAYMENT_AUTHORIZATION_VALID_BEFORE,
      paymentAuthorizationExpiresAt: PAYMENT_AUTHORIZATION_EXPIRES_AT,
    }))

    await expect(readX402Authorization(db.actionCtx(), prepared(), false, expected())).resolves.toBeUndefined()
    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
  })

  it('refuses a fingerprint mismatch before invoking the signer', async () => {
    const db = new AuthorizationDb(material({ requestFingerprint: 'sha256:request-two' }))

    await expect(readX402Authorization(
      db.actionCtx(),
      prepared(),
      false,
      expected({ requestFingerprint: REQUEST_FINGERPRINT }),
    )).rejects.toThrow('x402_payment_request_fingerprint_conflict')
    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
  })

  it('returns undefined without signing when the sandbox credential is missing', async () => {
    const db = new AuthorizationDb(material({ credentialRef: 'env:AE_X402_PAYMENT_PRIVATE_KEY' }))
    mocks.credentialFromEnvironment.mockReturnValue(undefined)

    await expect(readX402Authorization(
      db.actionCtx(),
      prepared(),
      false,
      expected({ credentialRef: 'env:AE_X402_PAYMENT_PRIVATE_KEY', useCustodySigner: false }),
    )).resolves.toBeUndefined()
    expect(mocks.createSandboxEvmX402PaymentSignature).not.toHaveBeenCalled()
    expect(mocks.cdpX402CustodyConfigurationFromEnvironment).not.toHaveBeenCalled()
    expect(db.queryCalls[0]).not.toHaveProperty('custodyGeneration')
  })

  it('reuses a stored managed header only with the current generation, cap, and wallet ref', async () => {
    const header = 'payment-signature:current'
    const stored = {
      paymentUnsignedMaterialJson: UNSIGNED_MATERIAL_JSON,
      paymentUnsignedMaterialDigest: UNSIGNED_MATERIAL_DIGEST,
      paymentSigningIdempotencyKey: PAYMENT_SIGNING_KEY,
      paymentSignatureDigest: canonicalDigest(header),
      paymentPayer: PAYMENT_PAYER,
      paymentNonce: 'nonce:first',
      paymentAuthorizationValidBefore: PAYMENT_AUTHORIZATION_VALID_BEFORE,
      paymentAuthorizationExpiresAt: PAYMENT_AUTHORIZATION_EXPIRES_AT,
    }

    const generationDb = new AuthorizationDb(material(stored))
    mocks.cdpX402CustodyConfigurationFromEnvironment.mockReturnValue({
      ...custodyConfiguration(),
      credentialGeneration: CUSTODY_GENERATION + 1,
    })
    await expect(readX402Authorization(generationDb.actionCtx(), prepared(), false, expected())).resolves.toBeUndefined()

    const capDb = new AuthorizationDb(material(stored))
    mocks.cdpX402CustodyConfigurationFromEnvironment.mockReturnValue({
      ...custodyConfiguration(),
      dailyMaxAtomic: 200_000n,
    })
    await expect(readX402Authorization(capDb.actionCtx(), prepared(), false, expected())).resolves.toBeUndefined()

    const walletDb = new AuthorizationDb(material(stored))
    mocks.cdpX402CustodyBudgetRef.mockReturnValue('custody-budget:other-wallet')
    await expect(readX402Authorization(walletDb.actionCtx(), prepared(), false, expected())).resolves.toBeUndefined()

    const missingDb = new AuthorizationDb(material(stored))
    mocks.cdpX402CustodyConfigurationFromEnvironment.mockReturnValue(undefined)
    await expect(readX402Authorization(missingDb.actionCtx(), prepared(), false, expected())).resolves.toBeUndefined()

    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
  })

  it('rejects incomplete persisted managed custody material before reuse', async () => {
    const header = 'payment-signature:incomplete'
    const db = new AuthorizationDb(material({
      paymentUnsignedMaterialJson: UNSIGNED_MATERIAL_JSON,
      paymentUnsignedMaterialDigest: UNSIGNED_MATERIAL_DIGEST,
      paymentSignatureDigest: canonicalDigest(header),
      paymentPayer: PAYMENT_PAYER,
      paymentNonce: 'nonce:incomplete',
      custodyDailyMaximumUnits: undefined,
    }))

    await expect(readX402Authorization(db.actionCtx(), prepared(), false, expected())).resolves.toBeUndefined()
    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
  })

  it('does not record a signed header when custody rotates after signing', async () => {
    const header = 'payment-signature:rotated'
    const db = new AuthorizationDb(material())
    configureSigner(header, 'nonce:rotated')
    let configurationReads = 0
    mocks.cdpX402CustodyConfigurationFromEnvironment.mockImplementation(() => {
      configurationReads += 1
      return configurationReads <= 3
        ? custodyConfiguration()
        : { ...custodyConfiguration(), credentialGeneration: CUSTODY_GENERATION + 1 }
    })

    await expect(readX402Authorization(db.actionCtx(), prepared(), false, expected()))
      .rejects.toThrow('x402_payment_custody_generation_conflict')
    expect(db.mutationCalls.find((args) => args.paymentSignatureDigest !== undefined)).toBeUndefined()
  })
})

type Material = Record<string, unknown> & {
  state: string
  paymentUnsignedMaterialJson?: string
  paymentUnsignedMaterialDigest?: string
  paymentSigningIdempotencyKey?: string
  paymentSignatureDigest?: string
  paymentPayer?: string
  paymentNonce?: string
  paymentAuthorizationValidBefore?: string
  paymentAuthorizationExpiresAt?: number
  paymentSigningClaimedAt?: number
  requestFingerprint?: string
}

function material(overrides: Partial<Material> = {}): Material {
  const challenge = {
    x402Version: 2,
    resource: {
      url: 'https://provider.example/paid',
      description: 'Paid result',
      mimeType: 'application/json',
    },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:8453',
      amount: '1',
      asset: '0x833589fCD6e5BebaC2B0b6B4D8e5cD5B5C3aA123',
      payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
      maxTimeoutSeconds: 60,
      extra: { assetTransferMethod: 'eip3009', name: 'USDC', version: '2' },
    }],
    extensions: {},
  }
  return {
    state: 'prepared',
    credentialRef: CREDENTIAL_REF,
    dispatchRef: DISPATCH_REF,
    attemptRef: ATTEMPT_REF,
    effectGeneration: EFFECT_GENERATION,
    paymentIdentifier: PAYMENT_IDENTIFIER,
    custodyRef: CUSTODY_REF,
    custodyBudgetRef: CUSTODY_BUDGET_REF,
    custodyGeneration: CUSTODY_GENERATION,
    custodyDailyMaximumUnits: CUSTODY_DAILY_MAXIMUM_UNITS,
    authorizationDigest: AUTHORIZATION_DIGEST,
    requestFingerprint: REQUEST_FINGERPRINT,
    challengeJson: JSON.stringify(challenge),
    selectedRequirementJson: JSON.stringify(challenge.accepts[0]),
    challengeDigest: canonicalDigest(challenge),
    ...overrides,
  }
}

function prepared(): { custodyRef: string; authorizationDigest: string } {
  return { custodyRef: CUSTODY_REF, authorizationDigest: AUTHORIZATION_DIGEST }
}

function expected(overrides: Partial<{
  credentialRef: string
  requestFingerprint: string
  useCustodySigner: boolean
  requestFingerprintContext: { method: 'GET' | 'POST'; operationRef: string }
}> = {}): {
  credentialRef: string
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
  paymentIdentifier: string
  useCustodySigner: boolean
  requestFingerprint: string
  requestFingerprintContext: { method: 'GET' | 'POST'; operationRef: string }
} {
  return {
    credentialRef: CREDENTIAL_REF,
    dispatchRef: DISPATCH_REF,
    attemptRef: ATTEMPT_REF,
    effectGeneration: EFFECT_GENERATION,
    paymentIdentifier: PAYMENT_IDENTIFIER,
    useCustodySigner: true,
    requestFingerprint: REQUEST_FINGERPRINT,
    requestFingerprintContext: { method: 'GET', operationRef: 'operation:one' },
    ...overrides,
  }
}

function unsignedIntent(nonce = 'nonce:first'): {
  paymentUnsignedMaterialJson: string
  paymentUnsignedMaterialDigest: string
  paymentSigningIdempotencyKey: string
  paymentPayer: string
  paymentNonce: string
  paymentAuthorizationValidBefore: string
  paymentAuthorizationExpiresAt: number
  requestFingerprint: string
} {
  const material = nonce === 'nonce:first'
    ? UNSIGNED_MATERIAL
    : {
        ...UNSIGNED_MATERIAL,
        authorization: { ...UNSIGNED_MATERIAL.authorization, nonce },
      }
  return {
    paymentUnsignedMaterialJson: stableStringify(material as unknown as StableHashValue),
    paymentUnsignedMaterialDigest: canonicalDigest(material),
    paymentSigningIdempotencyKey: PAYMENT_SIGNING_KEY,
    paymentPayer: PAYMENT_PAYER,
    paymentNonce: nonce,
    paymentAuthorizationValidBefore: PAYMENT_AUTHORIZATION_VALID_BEFORE,
    paymentAuthorizationExpiresAt: PAYMENT_AUTHORIZATION_EXPIRES_AT,
    requestFingerprint: REQUEST_FINGERPRINT,
  }
}

function configureSigner(header: string, nonce = 'nonce:first'): void {
  const intent = unsignedIntent(nonce)
  mocks.createCdpEvmX402PaymentSignature.mockImplementation(async (
    _request: unknown,
    dependencies: { persistedIntent?: unknown; onUnsignedMaterial?: (value: typeof intent) => Promise<void> | void },
  ) => {
    if (dependencies.persistedIntent === undefined) await dependencies.onUnsignedMaterial?.(intent)
    return header
  })
  mocks.readCdpX402PaymentAuthorization.mockReturnValue({
    paymentSignatureDigest: canonicalDigest(header),
    paymentPayer: PAYMENT_PAYER,
    paymentNonce: nonce,
    requestFingerprint: REQUEST_FINGERPRINT,
  })
}

class AuthorizationDb {
  private row: Material
  readonly queryCalls: Array<Record<string, unknown>> = []
  readonly mutationCalls: Array<Record<string, unknown>> = []

  constructor(row: Material) {
    this.row = row
  }

  current(): Material {
    return { ...this.row }
  }

  actionCtx(): Parameters<typeof readX402Authorization>[0] {
    return {
      runQuery: async (_reference, args) => {
        if (args !== undefined) this.queryCalls.push(args as Record<string, unknown>)
        const requestFingerprint = (args as { requestFingerprint?: string }).requestFingerprint
        if (requestFingerprint !== undefined && requestFingerprint !== this.row.requestFingerprint) {
          throw new Error('x402_payment_request_fingerprint_conflict')
        }
        return this.current()
      },
      runMutation: async (_reference, args) => {
        const input = args as Record<string, unknown>
        this.mutationCalls.push(input)
        if (typeof input.paymentUnsignedMaterialJson === 'string') {
          if (
            this.row.paymentUnsignedMaterialJson !== undefined
            && (
              this.row.paymentUnsignedMaterialJson !== input.paymentUnsignedMaterialJson
              || this.row.paymentUnsignedMaterialDigest !== input.paymentUnsignedMaterialDigest
              || this.row.paymentSigningIdempotencyKey !== input.paymentSigningIdempotencyKey
              || this.row.paymentAuthorizationValidBefore !== input.paymentAuthorizationValidBefore
              || this.row.paymentAuthorizationExpiresAt !== input.paymentAuthorizationExpiresAt
            )
          ) throw new Error('x402_payment_unsigned_identity_conflict')
          this.row = {
            ...this.row,
            paymentUnsignedMaterialJson: input.paymentUnsignedMaterialJson,
            paymentUnsignedMaterialDigest: input.paymentUnsignedMaterialDigest as string,
            paymentSigningIdempotencyKey: input.paymentSigningIdempotencyKey as string,
            paymentPayer: input.paymentPayer as string,
            paymentNonce: input.paymentNonce as string,
            paymentAuthorizationValidBefore: input.paymentAuthorizationValidBefore as string,
            paymentAuthorizationExpiresAt: input.paymentAuthorizationExpiresAt as number,
            paymentSigningClaimedAt: this.row.paymentSigningClaimedAt ?? Date.now(),
          }
          return null
        }
        if (typeof input.paymentSignatureDigest === 'string') {
          if (this.row.state !== 'prepared') {
            throw new Error('x402_payment_attempt_reconciliation_required')
          }
          if (
            this.row.paymentSignatureDigest !== undefined
            && this.row.paymentSignatureDigest !== input.paymentSignatureDigest
          ) throw new Error('x402_payment_signature_identity_conflict')
          if (
            input.paymentPayer !== undefined
            && (
              this.row.paymentUnsignedMaterialJson === undefined
              || this.row.paymentPayer !== input.paymentPayer
              || this.row.paymentNonce !== input.paymentNonce
            )
          ) throw new Error('x402_payment_authorization_material_invalid')
          this.row = {
            ...this.row,
            paymentSignatureDigest: input.paymentSignatureDigest,
          }
          return null
        }
        if (typeof input.requestFingerprint === 'string') {
          if (input.requestFingerprint !== this.row.requestFingerprint) {
            throw new Error('x402_payment_request_fingerprint_conflict')
          }
          if (this.row.state !== 'prepared') {
            throw new Error('x402_payment_attempt_reconciliation_required')
          }
          if (
            this.row.paymentUnsignedMaterialJson !== undefined
            && this.row.paymentUnsignedMaterialDigest !== undefined
            && this.row.paymentSigningIdempotencyKey !== undefined
            && this.row.paymentSignatureDigest !== undefined
            && this.row.paymentPayer !== undefined
            && this.row.paymentNonce !== undefined
            && this.row.paymentAuthorizationValidBefore !== undefined
            && this.row.paymentAuthorizationExpiresAt !== undefined
            && this.row.requestFingerprint !== undefined
          ) {
            return {
              kind: 'stored',
              paymentUnsignedMaterialJson: this.row.paymentUnsignedMaterialJson,
              paymentUnsignedMaterialDigest: this.row.paymentUnsignedMaterialDigest,
              paymentSigningIdempotencyKey: this.row.paymentSigningIdempotencyKey,
              paymentSignatureDigest: this.row.paymentSignatureDigest,
              paymentPayer: this.row.paymentPayer,
              paymentNonce: this.row.paymentNonce,
              paymentAuthorizationValidBefore: this.row.paymentAuthorizationValidBefore,
              paymentAuthorizationExpiresAt: this.row.paymentAuthorizationExpiresAt,
              requestFingerprint: this.row.requestFingerprint,
            }
          }
          if (this.row.paymentSigningClaimedAt !== undefined) return { kind: 'pending' }
          this.row = { ...this.row, paymentSigningClaimedAt: Date.now() }
          return { kind: 'claimed' }
        }
        throw new Error('unexpected_x402_mutation')
      },
    } as Parameters<typeof readX402Authorization>[0]
  }
}
