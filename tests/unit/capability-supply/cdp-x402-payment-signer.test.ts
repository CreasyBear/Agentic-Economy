import { decodePaymentSignatureHeader } from '@x402/core/http'
import { declarePaymentIdentifierExtension, extractPaymentIdentifier } from '@x402/extensions/payment-identifier'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it, vi } from 'vitest'

import {
  type CdpX402PaymentSignerDependencies,
  type CdpX402PaymentSigningIntent,
  type CdpX402RequestFingerprintContext,
} from '@/modules/capability-supply/public'
import {
  BASE_NETWORK,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  BASE_USDC_ADDRESS,
  cdpX402PolicyRulesDigest,
  cdpX402RequestFingerprint,
  createCdpEvmX402PaymentSignature,
  observeCdpX402Treasury,
  readCdpX402PaymentAuthorization,
  replayCdpX402PaymentSigningIntent,
  type X402AeEnvironment,
} from '@/modules/capability-supply/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import type { StableHashValue } from '@/modules/common/stable-hash'

const account = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const otherAccount = privateKeyToAccount(`0x${'22'.repeat(32)}`)
const ACCOUNT_POLICY_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_POLICY_ID = '22222222-2222-4222-8222-222222222222'
const SIGNATURE = `0x${'11'.repeat(65)}`
const ACCOUNT_POLICY_RULES = [{
  action: 'accept',
  operation: 'signEvmTypedData',
  criteria: [{
    type: 'evmTypedDataVerifyingContract',
    addresses: [BASE_SEPOLIA_USDC_ADDRESS],
    operator: 'in',
  }, {
    type: 'evmTypedDataField',
    types: {
      primaryType: 'TransferWithAuthorization',
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
    },
    conditions: [
      {
        path: 'from',
        operator: 'in',
        addresses: [account.address],
      },
      { path: 'value', operator: '<=', value: '10000' },
    ],
  }],
}] as const
const PROJECT_POLICY_RULES = [{
  action: 'reject',
  operation: 'signEvmTypedData',
  criteria: [{
    type: 'evmTypedDataVerifyingContract',
    operator: 'not in',
    addresses: [BASE_SEPOLIA_USDC_ADDRESS],
  }],
}, {
  action: 'reject',
  operation: 'signEvmTypedData',
  criteria: [{
    type: 'evmTypedDataField',
    types: {
      primaryType: 'TransferWithAuthorization',
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
    },
    conditions: [{ path: 'value', operator: '>', value: '10000' }],
  }],
}] as const
const POLICY_RULES_DIGEST = canonicalDigest({
  kind: 'ae.x402.cdp-policy-rules:v1',
  accountPolicy: {
    id: ACCOUNT_POLICY_ID,
    scope: 'account',
    rules: ACCOUNT_POLICY_RULES,
  },
  projectPolicy: {
    id: PROJECT_POLICY_ID,
    scope: 'project',
    rules: PROJECT_POLICY_RULES,
  },
})
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
  toolRef: 'operation:test',
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
  getPolicy?: (id: string) => Readonly<{
    id: string
    scope: 'account' | 'project'
    rules: readonly unknown[]
  }>
  persistedIntent?: CdpX402PaymentSigningIntent
  onUnsignedMaterial?: (intent: CdpX402PaymentSigningIntent) => Promise<void> | void
  environment?: Readonly<Record<string, string | undefined>>
  aeEnvironment?: X402AeEnvironment
}> = {}): Readonly<{
  dependencies: CdpX402PaymentSignerDependencies
  createClient: ReturnType<typeof vi.fn>
  getAccount: ReturnType<typeof vi.fn>
  signTypedData: ReturnType<typeof vi.fn>
}> {
  const getPolicy = options.getPolicy ?? ((id: string) => ({
    id,
    scope: id === ACCOUNT_POLICY_ID ? 'account' as const : 'project' as const,
    rules: id === ACCOUNT_POLICY_ID ? ACCOUNT_POLICY_RULES : PROJECT_POLICY_RULES,
  }))
  const signTypedData = vi.fn(async (_input: SignTypedDataInput) => ({ signature: SIGNATURE }))
  const getAccount = vi.fn(async () => ({
    address: options.accountAddress ?? account.address,
    policies: options.policies ?? [ACCOUNT_POLICY_ID, PROJECT_POLICY_ID],
  }))
  const createClient = vi.fn(() => ({
    policies: {
      getPolicyById: vi.fn(async ({ id }: { id: string }) => getPolicy(id)),
    },
    evm: {
      getAccount,
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
        AE_X402_CDP_POLICY_RULES_DIGEST: POLICY_RULES_DIGEST,
        AE_X402_CDP_CREDENTIAL_GENERATION: '7',
        ...options.environment,
      },
      createClient,
      ...(options.aeEnvironment === undefined ? {} : { aeEnvironment: options.aeEnvironment }),
      ...(options.persistedIntent === undefined ? {} : { persistedIntent: options.persistedIntent }),
      ...(options.onUnsignedMaterial === undefined ? {} : { onUnsignedMaterial: options.onUnsignedMaterial }),
    },
    createClient,
    getAccount,
    signTypedData,
  }
}

describe('CDP x402 custody signer', () => {
  it('reads a bounded USDC treasury observation through the maintained CDP client', async () => {
    const fixture = makeDependencies({ aeEnvironment: 'sandbox' })
    const listTokenBalances = vi.fn(async () => ({
      balances: [{
        token: { contractAddress: BASE_SEPOLIA_USDC_ADDRESS, network: 'base-sepolia' },
        amount: { amount: 12_345_678n, decimals: 6 },
      }, {
        token: { contractAddress: `0x${'33'.repeat(20)}`, network: 'base-sepolia' },
        amount: { amount: 999n, decimals: 18 },
      }],
    }))
    const observation = await observeCdpX402Treasury('sandbox', {
      environment: fixture.dependencies.environment!,
      now: () => 1_800_000_000_000,
      createClient: () => ({
        policies: { getPolicyById: vi.fn() },
        evm: {
          getAccount: async (_input: { name: string }) => ({
            address: account.address,
            policies: [ACCOUNT_POLICY_ID, PROJECT_POLICY_ID],
          }),
          signTypedData: async (_input: SignTypedDataInput) => ({ signature: SIGNATURE }),
          listTokenBalances,
        },
      }),
    })

    expect(observation).toMatchObject({
      environment: 'sandbox',
      custodyGeneration: 7,
      network: BASE_SEPOLIA_NETWORK,
      asset: 'USDC',
      exponent: 6,
      totalUnits: '12345678',
      observedAt: 1_800_000_000_000,
      evidenceRef: expect.stringMatching(/^cdp-balance:[0-9a-f]{64}$/u),
      evidenceDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    })
    expect(listTokenBalances).toHaveBeenCalledWith({
      address: account.address,
      network: 'base-sepolia',
      pageSize: 100,
    })
    expect(JSON.stringify(observation)).not.toContain('key-secret')
    expect(JSON.stringify(observation)).not.toContain('wallet-secret')
  })

  it('digests only bounded exact account and project rule documents', () => {
    const accountPolicy = {
      id: ACCOUNT_POLICY_ID,
      scope: 'account' as const,
      rules: ACCOUNT_POLICY_RULES,
    }
    const projectPolicy = {
      id: PROJECT_POLICY_ID,
      scope: 'project' as const,
      rules: PROJECT_POLICY_RULES,
    }
    expect(cdpX402PolicyRulesDigest(accountPolicy, projectPolicy)).toBe(
      POLICY_RULES_DIGEST,
    )
    expect(cdpX402PolicyRulesDigest(
      { ...accountPolicy, rules: [] },
      projectPolicy,
    )).toBeUndefined()
    expect(cdpX402PolicyRulesDigest(
      { ...accountPolicy, rules: Array.from({ length: 11 }, () => ACCOUNT_POLICY_RULES[0]) },
      projectPolicy,
    )).toBeUndefined()
    expect(cdpX402PolicyRulesDigest(
      { ...accountPolicy, rules: [{ operation: 'signEvmTypedData', invalid: undefined }] },
      projectPolicy,
    )).toBeUndefined()
  })

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
    const omittedTransferMethod = {
      ...requirement,
      extra: { name: 'USDC', version: '2' },
    }
    expect(cdpX402RequestFingerprint({
      ...request,
      selectedRequirement: omittedTransferMethod,
      challenge: { ...request.challenge, accepts: [omittedTransferMethod] },
    }, fingerprintContext)).toBe(fingerprint)
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

  it.each([
    ['sandbox with Base mainnet', 'sandbox', requirement],
    ['sandbox with crossed mainnet asset', 'sandbox', {
      ...requirement,
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_USDC_ADDRESS,
    }],
    ['sandbox over the atomic cap', 'sandbox', {
      ...requirement,
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      amount: '10001',
    }],
    ['production with Base Sepolia', 'production', {
      ...requirement,
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
    }],
  ] as const)('refuses %s before custody account work', async (
    _label,
    aeEnvironment,
    selectedRequirement,
  ) => {
    const fixture = makeDependencies({ aeEnvironment })
    const result = await createCdpEvmX402PaymentSignature({
      ...request,
      selectedRequirement,
      challenge: { ...request.challenge, accepts: [selectedRequirement] },
    }, {
      ...fixture.dependencies,
      requestFingerprintContext: { ...fingerprintContext, aeEnvironment },
    })

    expect(result).toBeUndefined()
    expect(fixture.createClient).not.toHaveBeenCalled()
    expect(fixture.signTypedData).not.toHaveBeenCalled()
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
    fixture.signTypedData.mockImplementation(async (_input: SignTypedDataInput) => {
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
    expect(material.typedData.domain.chainId).toBe(8453)
    expect(material.typedData.message.value).toBe('10000')
    expect(material.typedData.message.validAfter).toEqual(expect.any(String))
    expect(material.typedData.message.validBefore).toEqual(expect.any(String))

    expect(fixture.signTypedData).toHaveBeenCalledTimes(1)
    expect(fixture.signTypedData).toHaveBeenCalledWith(expect.objectContaining({
      address: account.address,
      idempotencyKey: intent?.paymentSigningIdempotencyKey,
      domain: material.typedData.domain,
      message: material.typedData.message,
    }))
    expect(decodePaymentSignatureHeader(header ?? '').payload.signature).toBe(SIGNATURE)
  })

  it('signs a standard challenge when the seller does not advertise the optional payment-identifier extension', async () => {
    const fixture = makeDependencies()
    const { extensions: _extensions, ...challenge } = request.challenge
    const withoutPaymentIdentifier = { ...request, challenge }

    const header = await createCdpEvmX402PaymentSignature(withoutPaymentIdentifier, {
      ...fixture.dependencies,
      requestFingerprintContext: fingerprintContext,
    })

    expect(header).toEqual(expect.any(String))
    expect(fixture.signTypedData).toHaveBeenCalledTimes(1)
    expect(extractPaymentIdentifier(decodePaymentSignatureHeader(header ?? ''))).toBeNull()
    expect(readCdpX402PaymentAuthorization(
      header ?? '',
      withoutPaymentIdentifier,
      fingerprintContext,
    )).toMatchObject({ paymentPayer: account.address.toLowerCase() })
  })

  it('signs the live CDP server extension bundle without inventing a payment identifier', async () => {
    const sandboxRequirement = {
      ...requirement,
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      extra: { name: 'USDC', version: '2' },
    } as const
    const extensions = {
      eip2612GasSponsoring: {},
      erc20ApprovalGasSponsoring: {},
      bazaar: {
        info: {
          input: {
            type: 'http',
            bodyType: 'json',
            body: { text: '  Agentic   Economy  ' },
            method: 'POST',
          },
        },
        schema: { type: 'object' },
      },
      'builder-code': {
        info: { s: ['cdp_sdk_server'] },
        schema: { type: 'object' },
      },
    } as const
    const liveShapedRequest = {
      ...request,
      selectedRequirement: sandboxRequirement,
      challenge: {
        ...request.challenge,
        accepts: [sandboxRequirement],
        extensions,
      },
    }
    const onUnsignedMaterial = vi.fn()
    const fixture = makeDependencies({
      aeEnvironment: 'sandbox',
      onUnsignedMaterial,
    })

    const header = await createCdpEvmX402PaymentSignature(liveShapedRequest, {
      ...fixture.dependencies,
      requestFingerprintContext: {
        method: 'POST',
        toolRef: 'operation:live-shaped-cdp-server',
        aeEnvironment: 'sandbox',
      },
    })

    expect(header).toEqual(expect.any(String))
    expect(onUnsignedMaterial).toHaveBeenCalledTimes(1)
    expect(fixture.signTypedData).toHaveBeenCalledTimes(1)
    expect(fixture.signTypedData).toHaveBeenCalledWith(expect.objectContaining({
      domain: expect.objectContaining({ chainId: 84532 }),
      message: expect.objectContaining({
        value: '10000',
        validAfter: expect.any(String),
        validBefore: expect.any(String),
      }),
    }))
    const payload = decodePaymentSignatureHeader(header ?? '')
    expect(payload.extensions).toEqual(extensions)
    expect(extractPaymentIdentifier(payload)).toBeNull()
  })

  it('rejects a malformed advertised payment-identifier extension before CDP signing', async () => {
    const fixture = makeDependencies()
    const malformed = {
      ...request,
      challenge: {
        ...request.challenge,
        extensions: { 'payment-identifier': { info: {}, schema: {} } },
      },
    }

    await expect(createCdpEvmX402PaymentSignature(malformed, {
      ...fixture.dependencies,
      requestFingerprintContext: fingerprintContext,
    })).resolves.toBeUndefined()
    expect(fixture.signTypedData).not.toHaveBeenCalled()
  })

  it('signs Base Sepolia USDC only for a sandbox-bound request', async () => {
    const sandboxRequirement = {
      ...requirement,
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      extra: { name: 'USDC', version: '2' },
    } as const
    const sandboxRequest = {
      ...request,
      selectedRequirement: sandboxRequirement,
      challenge: { ...request.challenge, accepts: [sandboxRequirement] },
    }
    const fixture = makeDependencies({ aeEnvironment: 'sandbox' })

    const header = await createCdpEvmX402PaymentSignature(sandboxRequest, {
      ...fixture.dependencies,
      requestFingerprintContext: {
        ...fingerprintContext,
        aeEnvironment: 'sandbox',
      },
    })

    expect(header).toEqual(expect.any(String))
    expect(fixture.signTypedData).toHaveBeenCalledWith(expect.objectContaining({
      domain: expect.objectContaining({ chainId: 84532 }),
      message: expect.objectContaining({
        value: '10000',
        validAfter: expect.any(String),
        validBefore: expect.any(String),
      }),
    }))
    expect(decodePaymentSignatureHeader(header ?? '').accepted).toMatchObject({
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      extra: { assetTransferMethod: 'eip3009' },
    })
    expect(readCdpX402PaymentAuthorization(
      header ?? '',
      sandboxRequest,
      { ...fingerprintContext, aeEnvironment: 'sandbox' },
    )).toMatchObject({ paymentPayer: account.address.toLowerCase() })
    expect(readCdpX402PaymentAuthorization(
      header ?? '',
      sandboxRequest,
      { ...fingerprintContext, aeEnvironment: 'production' },
    )).toBeUndefined()
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

  it('forensically replays an old schema-invalid domain without admitting it to normal signing', async () => {
    let persisted: CdpX402PaymentSigningIntent | undefined
    const first = makeDependencies({ onUnsignedMaterial: (intent) => { persisted = intent } })
    await createCdpEvmX402PaymentSignature(request, {
      ...first.dependencies,
      requestFingerprintContext: fingerprintContext,
    })
    if (persisted === undefined) throw new Error('test intent was not persisted')
    const material = JSON.parse(persisted.paymentUnsignedMaterialJson) as {
      typedData: { domain: { chainId: number | string } }
    }
    material.typedData.domain.chainId = String(material.typedData.domain.chainId)
    const staleIntent = {
      ...persisted,
      paymentUnsignedMaterialJson: stableStringify(material as unknown as StableHashValue),
      paymentUnsignedMaterialDigest: canonicalDigest(material),
    }
    const replay = makeDependencies()

    await expect(replayCdpX402PaymentSigningIntent(staleIntent, replay.dependencies))
      .resolves.toBe(SIGNATURE)
    expect(replay.signTypedData).toHaveBeenCalledWith(expect.objectContaining({
      domain: expect.objectContaining({ chainId: '8453' }),
      idempotencyKey: staleIntent.paymentSigningIdempotencyKey,
    }))
    await expect(createCdpEvmX402PaymentSignature(request, {
      ...replay.dependencies,
      persistedIntent: staleIntent,
      requestFingerprintContext: fingerprintContext,
    })).rejects.toThrow('x402_payment_unsigned_identity_conflict')
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
      getPolicy: (id) => ({
        id,
        scope: 'project',
        rules: id === ACCOUNT_POLICY_ID ? ACCOUNT_POLICY_RULES : PROJECT_POLICY_RULES,
      }),
    })
    expect(await createCdpEvmX402PaymentSignature(request, wrongPolicy.dependencies)).toBeUndefined()
    expect(wrongPolicy.signTypedData).not.toHaveBeenCalled()

    const wrongAccount = makeDependencies({ accountAddress: otherAccount.address })
    expect(await createCdpEvmX402PaymentSignature(request, wrongAccount.dependencies)).toBeUndefined()
    expect(wrongAccount.signTypedData).not.toHaveBeenCalled()
  })

  it.each([
    ['broad project accept', (id: string) => ({
      id,
      scope: id === ACCOUNT_POLICY_ID ? 'account' as const : 'project' as const,
      rules: id === ACCOUNT_POLICY_ID
        ? ACCOUNT_POLICY_RULES
        : [{
            action: 'accept',
            operation: 'signEvmTypedData',
            criteria: [{
              type: 'evmTypedDataVerifyingContract',
              operator: 'not in',
              addresses: [],
            }],
          }],
    })],
    ['missing account payer condition', (id: string) => ({
      id,
      scope: id === ACCOUNT_POLICY_ID ? 'account' as const : 'project' as const,
      rules: id === ACCOUNT_POLICY_ID
        ? [{
            ...ACCOUNT_POLICY_RULES[0],
            criteria: [
              ACCOUNT_POLICY_RULES[0].criteria[0],
              {
                ...ACCOUNT_POLICY_RULES[0].criteria[1],
                conditions: [ACCOUNT_POLICY_RULES[0].criteria[1].conditions[1]],
              },
            ],
          }]
        : PROJECT_POLICY_RULES,
    })],
    ['changed account cap', (id: string) => ({
      id,
      scope: id === ACCOUNT_POLICY_ID ? 'account' as const : 'project' as const,
      rules: id === ACCOUNT_POLICY_ID
        ? [{
            ...ACCOUNT_POLICY_RULES[0],
            criteria: [
              ACCOUNT_POLICY_RULES[0].criteria[0],
              {
                ...ACCOUNT_POLICY_RULES[0].criteria[1],
                conditions: [
                  ACCOUNT_POLICY_RULES[0].criteria[1].conditions[0],
                  { path: 'value', operator: '<=', value: '100000' },
                ],
              },
            ],
          }]
        : PROJECT_POLICY_RULES,
    })],
    ['changed verifying contract', (id: string) => ({
      id,
      scope: id === ACCOUNT_POLICY_ID ? 'account' as const : 'project' as const,
      rules: id === ACCOUNT_POLICY_ID
        ? ACCOUNT_POLICY_RULES
        : [{
            ...PROJECT_POLICY_RULES[0],
            criteria: [{
              ...PROJECT_POLICY_RULES[0].criteria[0],
              addresses: [`0x${'33'.repeat(20)}`],
            }],
          }],
    })],
  ] as const)('rejects %s policy drift before account lookup', async (
    _label,
    getPolicy,
  ) => {
    const fixture = makeDependencies({ getPolicy })

    expect(await createCdpEvmX402PaymentSignature(
      request,
      fixture.dependencies,
    )).toBeUndefined()
    expect(fixture.getAccount).not.toHaveBeenCalled()
    expect(fixture.signTypedData).not.toHaveBeenCalled()
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
      expect(JSON.stringify(result)).not.toContain('evmTypedDataField')
      expect(JSON.stringify(result)).not.toContain(POLICY_RULES_DIGEST)
      for (const spy of [error, warn, log]) {
        expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('key-secret'))
        expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('wallet-secret'))
        expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('evmTypedDataField'))
        expect(spy).not.toHaveBeenCalledWith(expect.stringContaining(POLICY_RULES_DIGEST))
      }
    } finally {
      error.mockRestore()
      warn.mockRestore()
      log.mockRestore()
    }
  })
})
