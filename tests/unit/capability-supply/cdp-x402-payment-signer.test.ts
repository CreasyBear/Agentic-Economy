import { decodePaymentSignatureHeader, encodePaymentSignatureHeader } from '@x402/core/http'
import { declarePaymentIdentifierExtension, extractPaymentIdentifier } from '@x402/extensions/payment-identifier'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it, vi } from 'vitest'

import {
  BASE_NETWORK,
  BASE_USDC_ADDRESS,
  cdpX402RequestFingerprint,
  createCdpEvmX402PaymentSignature,
  readCdpX402PaymentAuthorization,
  type CdpX402PaymentSignerDependencies,
  type CdpX402PaymentSigningIntent,
  type CdpX402RequestFingerprintContext,
} from '@/modules/capability-supply/internal/cdp-x402-payment-signer'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import type { StableHashValue } from '@/modules/common/stable-hash'

const account = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const otherAccount = privateKeyToAccount(`0x${'22'.repeat(32)}`)
const ACCOUNT_POLICY_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_POLICY_ID = '22222222-2222-4222-8222-222222222222'
const SIGNATURE = `0x${'11'.repeat(65)}`
const requirement = {
  scheme: 'exact',
  network: BASE_NETWORK,
  amount: '10000',
  asset: BASE_USDC_ADDRESS,
  payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
  maxTimeoutSeconds: 60,
  extra: { assetTransferMethod: 'eip3009', name: 'USDC', version: '2' },
} as const

const request = {
  credential: 'env:AE_X402_PAYMENT_PRIVATE_KEY',
  paymentIdentifier: `external-spend:${'ab'.repeat(32)}`,
  selectedRequirement: requirement,
  challenge: {
    x402Version: 2 as const,
    resource: {
      url: 'https://provider.example/paid',
      description: 'Paid result',
      mimeType: 'application/json',
    },
    accepts: [requirement],
    extensions: { 'payment-identifier': declarePaymentIdentifierExtension(true) },
  },
}

const fingerprintContext: CdpX402RequestFingerprintContext = {
  method: 'GET',
  operationRef: 'operation:test',
}

type SignTypedDataInput = {
  address: string
  domain: Record<string, unknown>
  types: Record<string, unknown>
  primaryType: string
  message: Record<string, unknown>
  idempotencyKey: string
}

function makeDependencies(options: Readonly<{
  accountAddress?: string
  policies?: readonly string[]
  getPolicy?: (id: string) => Readonly<{ id: string; scope: 'account' | 'project' }>
  persistedIntent?: CdpX402PaymentSigningIntent
  onUnsignedMaterial?: (intent: CdpX402PaymentSigningIntent) => Promise<void> | void
  environment?: Readonly<Record<string, string | undefined>>
}> = {}): Readonly<{
  dependencies: CdpX402PaymentSignerDependencies
  createClient: ReturnType<typeof vi.fn>
  signTypedData: ReturnType<typeof vi.fn>
}> {
  const getPolicy = options.getPolicy ?? ((id: string) => ({
    id,
    scope: id === ACCOUNT_POLICY_ID ? 'account' as const : 'project' as const,
  }))
  const signTypedData = vi.fn(async (_input: SignTypedDataInput) => ({ signature: SIGNATURE }))
  const createClient = vi.fn(() => ({
    policies: {
      getPolicyById: vi.fn(async ({ id }: { id: string }) => getPolicy(id)),
    },
    evm: {
      getAccount: vi.fn(async () => ({
        address: options.accountAddress ?? account.address,
        policies: options.policies ?? [ACCOUNT_POLICY_ID, PROJECT_POLICY_ID],
      })),
      signTypedData,
    },
  }))
  return {
    dependencies: {
      environment: {
        AE_X402_CUSTODY_ENABLED: 'true',
        AE_X402_CUSTODY_MAX_ATOMIC: '10000',
        AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '100000',
        CDP_API_KEY_ID: 'key-id',
        CDP_API_KEY_SECRET: 'key-secret',
        CDP_WALLET_SECRET: 'wallet-secret',
        AE_X402_CDP_ACCOUNT_NAME: 'agentic-economy-x402',
        AE_X402_CDP_EXPECTED_EVM_ADDRESS: account.address,
        AE_X402_CDP_ACCOUNT_POLICY_ID: ACCOUNT_POLICY_ID,
        AE_X402_CDP_PROJECT_POLICY_ID: PROJECT_POLICY_ID,
        AE_X402_CDP_CREDENTIAL_GENERATION: '7',
        ...options.environment,
      },
      createClient,
      ...(options.persistedIntent === undefined ? {} : { persistedIntent: options.persistedIntent }),
      ...(options.onUnsignedMaterial === undefined ? {} : { onUnsignedMaterial: options.onUnsignedMaterial }),
    },
    createClient,
    signTypedData,
  }
}

describe('CDP x402 custody signer', () => {
  it('keeps a stable request fingerprint bound to the payment identity', () => {
    const fingerprint = cdpX402RequestFingerprint(request, fingerprintContext)
    expect(fingerprint).toBe(cdpX402RequestFingerprint(structuredClone(request), fingerprintContext))
    expect(cdpX402RequestFingerprint(
      { ...request, selectedRequirement: { ...requirement, amount: '10001' } },
      fingerprintContext,
    )).not.toBe(fingerprint)
    expect(cdpX402RequestFingerprint(
      { ...request, challenge: { ...request.challenge, resource: { ...request.challenge.resource, url: 'https://other.example' } } },
      fingerprintContext,
    )).not.toBe(fingerprint)
    expect(cdpX402RequestFingerprint(request, { ...fingerprintContext, method: 'POST' })).not.toBe(fingerprint)
  })

  it.each([
    ['kill switch', { AE_X402_CUSTODY_ENABLED: 'false' }],
    ['missing config', { CDP_API_KEY_SECRET: undefined }],
    ['wrong chain', { selectedRequirement: { ...requirement, network: 'eip155:84532' as const } }],
    ['wrong asset', { selectedRequirement: { ...requirement, asset: `0x${'22'.repeat(20)}` } }],
    ['over cap', { selectedRequirement: { ...requirement, amount: '10001' } }],
  ] as const)('refuses %s before account work', async (_label, override) => {
    const { dependencies, createClient } = makeDependencies({
      environment: 'selectedRequirement' in override ? {} : override,
    })
    const selectedRequirement = 'selectedRequirement' in override
      ? override.selectedRequirement
      : request.selectedRequirement
    const result = await createCdpEvmX402PaymentSignature(
      {
        ...request,
        selectedRequirement,
        challenge: { ...request.challenge, accepts: [selectedRequirement] },
      },
      dependencies,
    )
    expect(result).toBeUndefined()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('captures official unsigned material, persists it before CDP, and normalizes integers', async () => {
    const order: string[] = []
    let intent: CdpX402PaymentSigningIntent | undefined
    const fixture = makeDependencies({
      onUnsignedMaterial: async (captured) => {
        order.push('persist')
        intent = captured
      },
    })
    fixture.signTypedData.mockImplementation(async (input: SignTypedDataInput) => {
      order.push('cdp')
      return { signature: SIGNATURE }
    })

    const header = await createCdpEvmX402PaymentSignature(request, {
      ...fixture.dependencies,
      requestFingerprintContext: fingerprintContext,
    })

    expect(header).toEqual(expect.any(String))
    expect(order).toEqual(['persist', 'cdp'])
    expect(intent?.paymentSigningIdempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(intent?.paymentUnsignedMaterialDigest).toBe(
      canonicalDigest(JSON.parse(intent?.paymentUnsignedMaterialJson ?? '{}')),
    )
    const material = JSON.parse(intent?.paymentUnsignedMaterialJson ?? '{}') as {
      authorization: Record<string, unknown>
      typedData: { domain: Record<string, unknown>; message: Record<string, unknown> }
    }
    expect(material).not.toHaveProperty('signature')
    expect(JSON.stringify(material)).not.toContain('PAYMENT-SIGNATURE')
    expect(material.authorization.value).toBe('10000')
    expect(material.authorization.validAfter).toEqual(expect.any(String))
    expect(material.authorization.validBefore).toEqual(expect.any(String))
    expect(material.typedData.message.validBefore).toBe(intent?.paymentAuthorizationValidBefore)
    expect(intent?.paymentAuthorizationExpiresAt).toBe(
      Number(BigInt(intent?.paymentAuthorizationValidBefore ?? '0') * 1000n),
    )
    expect(material.typedData.domain.chainId).toBe('8453')
    expect(material.typedData.message.value).toBe('10000')

    expect(fixture.signTypedData).toHaveBeenCalledTimes(1)
    expect(fixture.signTypedData).toHaveBeenCalledWith(expect.objectContaining({
      address: account.address,
      idempotencyKey: intent?.paymentSigningIdempotencyKey,
      domain: material.typedData.domain,
      message: material.typedData.message,
    }))
    expect(decodePaymentSignatureHeader(header ?? '').payload.signature).toBe(SIGNATURE)
  })

  it('retries persisted typed data with the identical UUID and nonce without recapturing', async () => {
    let persisted: CdpX402PaymentSigningIntent | undefined
    const first = makeDependencies({
      onUnsignedMaterial: (intent) => {
        persisted = intent
      },
    })
    const firstHeader = await createCdpEvmX402PaymentSignature(request, {
      ...first.dependencies,
      requestFingerprintContext: fingerprintContext,
    })
    if (persisted === undefined) throw new Error('test intent was not persisted')

    const onRetryCapture = vi.fn()
    const retry = makeDependencies({
      persistedIntent: persisted,
      onUnsignedMaterial: onRetryCapture,
    })
    const secondHeader = await createCdpEvmX402PaymentSignature(request, {
      ...retry.dependencies,
      requestFingerprintContext: fingerprintContext,
    })

    expect(secondHeader).toBe(firstHeader)
    expect(onRetryCapture).not.toHaveBeenCalled()
    expect(retry.signTypedData).toHaveBeenCalledTimes(1)
    expect(retry.signTypedData.mock.calls[0]?.[0]).toEqual(
      first.signTypedData.mock.calls[0]?.[0],
    )
    const firstPayload = decodePaymentSignatureHeader(firstHeader ?? '')
    const secondPayload = decodePaymentSignatureHeader(secondHeader ?? '')
    expect((firstPayload.payload.authorization as { nonce: string }).nonce).toBe(
      (secondPayload.payload.authorization as { nonce: string }).nonce,
    )
    expect(canonicalDigest(firstHeader)).toBe(canonicalDigest(secondHeader))
  })

  it.each([
    ['non-decimal', 'not-decimal', 1_000],
    ['overflow', '9007199254740992', Number.MAX_SAFE_INTEGER],
    ['mismatched milliseconds', '9999999999', 1],
  ] as const)('rejects %s persisted expiry identity', async (_label, validBefore, expiresAt) => {
    let persisted: CdpX402PaymentSigningIntent | undefined
    const first = makeDependencies({
      onUnsignedMaterial: (intent) => {
        persisted = intent
      },
    })
    await createCdpEvmX402PaymentSignature(request, {
      ...first.dependencies,
      requestFingerprintContext: fingerprintContext,
    })
    if (persisted === undefined) throw new Error('test intent was not persisted')

    const material = JSON.parse(persisted.paymentUnsignedMaterialJson) as {
      authorization: { validBefore: string }
      typedData: { message: { validBefore: string } }
    }
    material.authorization.validBefore = validBefore
    material.typedData.message.validBefore = validBefore
    const retry = makeDependencies({
      persistedIntent: {
        ...persisted,
        paymentUnsignedMaterialJson: stableStringify(material as unknown as StableHashValue),
        paymentUnsignedMaterialDigest: canonicalDigest(material),
        paymentAuthorizationValidBefore: validBefore,
        paymentAuthorizationExpiresAt: expiresAt,
      },
    })

    await expect(createCdpEvmX402PaymentSignature(request, {
      ...retry.dependencies,
      requestFingerprintContext: fingerprintContext,
    })).rejects.toThrow('x402_payment_unsigned_identity_conflict')
    expect(retry.signTypedData).not.toHaveBeenCalled()
  })

  it('returns only safe authorization identity when inspecting a transient header', async () => {
    const fixture = makeDependencies()
    const header = await createCdpEvmX402PaymentSignature(request, {
      ...fixture.dependencies,
      requestFingerprintContext: fingerprintContext,
    })
    const identity = readCdpX402PaymentAuthorization(
      header ?? '',
      request,
      fingerprintContext,
      cdpX402RequestFingerprint(request, fingerprintContext),
    )
    expect(identity).toMatchObject({
      paymentSignatureDigest: canonicalDigest(header),
      paymentPayer: account.address.toLowerCase(),
      requestFingerprint: cdpX402RequestFingerprint(request, fingerprintContext),
    })
    expect(identity).not.toHaveProperty('paymentSignature')
    expect(identity).not.toHaveProperty('PAYMENT-SIGNATURE')
  })

  it('rejects mismatched policy and account custody bindings', async () => {
    const wrongPolicy = makeDependencies({
      getPolicy: (id) => ({ id, scope: 'project' }),
    })
    expect(await createCdpEvmX402PaymentSignature(request, wrongPolicy.dependencies)).toBeUndefined()
    expect(wrongPolicy.signTypedData).not.toHaveBeenCalled()

    const wrongAccount = makeDependencies({ accountAddress: otherAccount.address })
    expect(await createCdpEvmX402PaymentSignature(request, wrongAccount.dependencies)).toBeUndefined()
    expect(wrongAccount.signTypedData).not.toHaveBeenCalled()
  })

  it('does not expose custody credentials in returned material or logs', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      const fixture = makeDependencies()
      const result = await createCdpEvmX402PaymentSignature(request, fixture.dependencies)
      expect(JSON.stringify(result)).not.toContain('key-secret')
      expect(JSON.stringify(result)).not.toContain('wallet-secret')
      for (const spy of [error, warn, log]) {
        expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('key-secret'))
        expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('wallet-secret'))
      }
    } finally {
      error.mockRestore()
      warn.mockRestore()
      log.mockRestore()
    }
  })
})

function authorizationHeader(
  overrides: Readonly<{
    accepted?: Readonly<Record<string, unknown>>
    authorization?: Readonly<Record<string, unknown>>
  }> = {},
): string {
  return encodePaymentSignatureHeader({
    x402Version: 2,
    accepted: { ...requirement, ...overrides.accepted },
    payload: {
      authorization: {
        from: account.address,
        to: requirement.payTo,
        value: requirement.amount,
        validAfter: '0',
        validBefore: '9999999999',
        nonce: `0x${'11'.repeat(32)}`,
        ...overrides.authorization,
      },
      signature: SIGNATURE,
    },
  })
}
