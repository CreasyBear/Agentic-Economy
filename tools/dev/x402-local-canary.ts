import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

import { x402Client } from '@x402/core/client'
import { x402ResourceServer } from '@x402/core/server'
import { x402HTTPClient, x402HTTPResourceServer, type FacilitatorClient } from '@x402/core/http'
import {
  invokePreparedRouteTransport,
  prepareRegisteredRouteTransportInvocation,
  type RouteTransportFetch,
  type RouteTransportInvocation,
  type RouteTransportObservation,
  type X402RouteTransportRuntime,
  type X402PaymentAuthorizationIdentity,
  type X402PaymentSignatureRequest,
} from '../../src/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import type { StableHashValue } from '../../src/modules/common/stable-hash'
import { evaluateLiveMoneyGate } from '../../src/modules/money/public'

import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from '@x402/core/types'
import { validatePaymentPayload, validatePaymentRequired } from '@x402/core/schemas'
import { registerExactEvmScheme as registerExactEvmClient } from '@x402/evm/exact/client'
import { registerExactEvmScheme as registerExactEvmServer } from '@x402/evm/exact/server'
import {
  appendPaymentIdentifierToExtensions,
  declarePaymentIdentifierExtension,
  extractAndValidatePaymentIdentifier,
  generatePaymentId,
  PAYMENT_IDENTIFIER,
  paymentIdentifierResourceServerExtension,
} from '@x402/extensions/payment-identifier'
import { privateKeyToAccount } from 'viem/accounts'
import { z } from 'zod'


export const BASE_SEPOLIA_NETWORK = 'eip155:84532' as const
export const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const
export const BASE_SEPOLIA_USDC_DECIMALS = 6 as const
export const LOCAL_X402_ROUTE_PREFIX = '/dev/x402/quote/'
export const LOCAL_X402_ROUTE_PATTERN = 'GET /dev/x402/quote/:symbol'
export const LOCAL_X402_PAY_TO = '0x000000000000000000000000000000000000dead' as const
export const LOCAL_X402_PAYMENT_AMOUNT = '10000' as const
export const LOCAL_X402_EVIDENCE_CEILING =
  'Protocol/wire evidence only: local HTTP provider and fake facilitator. No blockchain settlement, provider earnings, AE credit debit, AE rake, hosted certification, production proof, or Cluster C observed-listing admission.'
export const LOCAL_X402_TESTNET_ENVIRONMENT = [
  'AE_X402_CANARY_PROVIDER_URL',
  'AE_X402_PAYMENT_PRIVATE_KEY',
] as const

const LOCAL_X402_PRIVATE_KEY = `0x${'11'.repeat(32)}` as `0x${string}`
const LOCAL_X402_SYMBOLS = ['BTC', 'ETH'] as const
const LOCAL_X402_QUOTES = ['USD', 'EUR'] as const
const LOCAL_X402_PRICES = {
  BTC: { USD: '60000.00', EUR: '55000.00' },
  ETH: { USD: '3000.00', EUR: '2750.00' },
} as const

export const localX402QuoteInputSchema = z.strictObject({
  symbol: z.enum(LOCAL_X402_SYMBOLS),
  quote: z.enum(LOCAL_X402_QUOTES),
})
export type LocalX402QuoteInput = z.infer<typeof localX402QuoteInputSchema>

export const localX402QuoteOutputSchema = z.strictObject({
  schemaVersion: z.literal('development-x402-quote.v1'),
  operation: z.literal('spot_quote'),
  symbol: z.enum(LOCAL_X402_SYMBOLS),
  quote: z.enum(LOCAL_X402_QUOTES),
  price: z.string().regex(/^\d+\.\d{2}$/),
  providerRef: z.literal('development-local-x402-provider'),
})
export type LocalX402QuoteOutput = z.infer<typeof localX402QuoteOutputSchema>

type Environment = Readonly<Record<string, string | undefined>>
type LocalX402CanaryInput = Readonly<{
  mode?: 'local' | 'testnet'
  input?: LocalX402QuoteInput
  environment?: Environment
}>

type LocalX402CanaryRefusal = Readonly<{
  kind: 'refused'
  mode: 'testnet'
  code: string
  prerequisite: string
  requiredEnvironment: readonly string[]
  evidenceCeiling: string
}>
type LocalX402TestnetResult = Readonly<{
  kind: 'testnet'
  mode: 'opt-in-base-sepolia-testnet'
  providerOutput: LocalX402QuoteOutput
  paymentResponse: SettleResponse
  evidenceCeiling: string
}>

export type LocalX402CanaryResult =
  | Readonly<{
      kind: 'ok'
      mode: 'development-local-protocol-wire-emulator'
      request: Readonly<{
        method: 'GET'
        path: string
        input: LocalX402QuoteInput
      }>
      challenge: PaymentRequired
      payment: Readonly<{
        identifier: string
        payload: PaymentPayload
      }>
      providerOutput: LocalX402QuoteOutput
      settlement: Readonly<{
        source: 'development-fake-facilitator'
        blockchainSettlement: false
        response: SettleResponse
      }>
      routeObservation: RouteTransportObservation
      authority: Readonly<{
        providerRef: 'development-local-x402-provider'
        facilitatorRef: 'development-fake-facilitator'
      }>
      economicEffects: Readonly<{
        aeCreditDebit: false
        providerEarningsAccrual: false
        aeRake: false
      }>
      evidenceCeiling: string
      prerequisites: readonly string[]
    }>
  | LocalX402CanaryRefusal
  | LocalX402TestnetResult

const LOCAL_PREREQUISITES = [
  'Node 22',
  'No environment variables are needed for the default local protocol/wire emulator.',
] as const

export async function runDevelopmentX402Canary(
  options: LocalX402CanaryInput = {},
): Promise<LocalX402CanaryResult> {
  if ((options.mode ?? 'local') === 'testnet') {
    return runDevelopmentX402TestnetCanary(options.environment ?? process.env)
  }
  return runDevelopmentX402LocalCanary(options.input ?? { symbol: 'BTC', quote: 'USD' })
}

export async function runDevelopmentX402LocalCanary(
  input: LocalX402QuoteInput,
): Promise<Extract<LocalX402CanaryResult, { kind: 'ok' }>> {
  const parsedInput = localX402QuoteInputSchema.safeParse(input)
  if (!parsedInput.success) throw new Error('development_x402_input_contract_invalid')

  const fakeFacilitator = createDevelopmentFakeFacilitator()
  const resourceServer = registerExactEvmServer(
    new x402ResourceServer(fakeFacilitator),
    { networks: [BASE_SEPOLIA_NETWORK] },
  )
  resourceServer.registerExtension(paymentIdentifierResourceServerExtension)
  const httpResourceServer = new x402HTTPResourceServer(resourceServer, {
    [LOCAL_X402_ROUTE_PATTERN]: {
      accepts: {
        scheme: 'exact',
        network: BASE_SEPOLIA_NETWORK,
        payTo: LOCAL_X402_PAY_TO,
        price: {
          amount: LOCAL_X402_PAYMENT_AMOUNT,
          asset: BASE_SEPOLIA_USDC,
          extra: { name: 'USDC', version: '2' },
        },
        maxTimeoutSeconds: 60,
      },
      description: 'Development-only dynamic x402 quote operation.',
      mimeType: 'application/json',
      serviceName: 'development-local-x402-provider',
      extensions: {
        [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true),
      },
    },
  })
  await httpResourceServer.initialize()

  const localServer = await startDevelopmentProviderServer(httpResourceServer, fakeFacilitator)
  const requestPath = `${LOCAL_X402_ROUTE_PREFIX}${input.symbol}?quote=${input.quote}`
  const requestUrl = `${localServer.baseUrl}${requestPath}`
  try {
    const client = createDevelopmentX402Client()
    const unpaidResponse = await fetch(requestUrl, { headers: { accept: 'application/json' } })
    const unpaid = await client.processResponse(unpaidResponse)
    if (unpaid.status !== 402 || unpaid.paymentStatus !== 'payment_required' || unpaid.header === undefined) {
      throw new Error('development_x402_payment_challenge_missing')
    }
    if (!('accepts' in unpaid.header)) throw new Error('development_x402_payment_challenge_invalid')
    const challenge = unpaid.header
    validatePaymentRequired(challenge)
    if (challenge.x402Version !== 2) throw new Error('development_x402_payment_version_unsupported')
    const requirement = challenge.accepts[0]
    if (requirement === undefined) throw new Error('development_x402_payment_requirement_missing')
    assertBaseSepoliaUsdcRequirement(requirement)

    const paymentIdentifier = `dev_x402_${input.symbol.toLowerCase()}_${input.quote.toLowerCase()}_v1`
    const paymentRequiredWithIdentifier = withPaymentIdentifier(challenge, paymentIdentifier)
    const paymentPayload = await client.createPaymentPayload(paymentRequiredWithIdentifier)
    validatePaymentPayload(paymentPayload)
    const identifier = extractAndValidatePaymentIdentifier(paymentPayload)
    if (!identifier.validation.valid || identifier.id !== paymentIdentifier) {
      throw new Error('development_x402_payment_identifier_missing')
    }

    const paidResponse = await fetch(requestUrl, {
      headers: {
        accept: 'application/json',
        ...client.encodePaymentSignatureHeader(paymentPayload),
      },
    })
    const paid = await client.processResponse(paidResponse)
    if (paid.status !== 200 || paid.paymentStatus !== 'settled' || paid.header === undefined || !('success' in paid.header) || !paid.header.success) {
      throw new Error('development_x402_payment_response_invalid')
    }
    const providerOutput = localX402QuoteOutputSchema.parse(paid.body)
    const settlementResponse = paid.header
    if (settlementResponse.transaction !== `local-facilitator:${paymentIdentifier}`) {
      throw new Error('development_x402_fake_settlement_source_invalid')
    }
    const routeObservation = await runDevelopmentX402RouteRuntimeCanary(localServer, input)
    if (
      routeObservation.disposition !== 'succeeded'
      || routeObservation.outputJson === undefined
      || localX402QuoteOutputSchema.safeParse(JSON.parse(routeObservation.outputJson)).success === false
    ) {
      throw new Error('development_x402_route_runtime_observation_invalid')
    }

    return {
      kind: 'ok',
      mode: 'development-local-protocol-wire-emulator',
      request: { method: 'GET', path: requestPath, input },
      challenge,
      payment: { identifier: paymentIdentifier, payload: paymentPayload },
      providerOutput,
      settlement: {
        source: 'development-fake-facilitator',
        blockchainSettlement: false,
        response: settlementResponse,
      },
      routeObservation,
      authority: {
        providerRef: 'development-local-x402-provider',
        facilitatorRef: 'development-fake-facilitator',
      },
      economicEffects: {
        aeCreditDebit: false,
        providerEarningsAccrual: false,
        aeRake: false,

      },
      evidenceCeiling: LOCAL_X402_EVIDENCE_CEILING,
      prerequisites: LOCAL_PREREQUISITES,
    }
  } finally {
    await localServer.close()
  }
}
async function runDevelopmentX402RouteRuntimeCanary(
  server: Readonly<{ baseUrl: string; advertisedBaseUrl: string }>,
  input: LocalX402QuoteInput,
): Promise<RouteTransportObservation> {
  const connectionRef = 'connection:development-x402-local'
  const providerRef = 'provider:development-x402-local'
  const adapterId = 'x402-fetch:v2'
  const authorityGeneration = 1
  const configuration = {
    method: 'GET' as const,
    query: [{ inputPointer: '/quote', parameter: 'quote', required: true }],
    requestTimeoutMs: 5_000,
    scheme: 'exact' as const,
    network: BASE_SEPOLIA_NETWORK,
    currency: 'USD',
    routeAmountExponent: 2,
    assetAmountExponent: BASE_SEPOLIA_USDC_DECIMALS,
    asset: BASE_SEPOLIA_USDC,
    payTo: LOCAL_X402_PAY_TO,
  }
  const authorityDigest = canonicalDigest({
    kind: 'development-x402-provider-authority',
    connectionRef,
    providerRef,
    adapterId,
    authorityGeneration,
    ...configuration,
  })
  const configJson = JSON.stringify(configuration)
  const operationKeyDigest = canonicalDigest({
    kind: 'development-x402-operation',
    providerRef,
    input,
  })
  const preparedRequests = new Map<string, Readonly<{
    request: X402PaymentSignatureRequest & X402PaymentAuthorizationIdentity
    credential: `0x${string}`
  }>>()
  const resolveCredential = (reference: string): `0x${string}` | undefined =>
    reference === 'env:AE_X402_PAYMENT_PRIVATE_KEY' ? LOCAL_X402_PRIVATE_KEY : undefined
  const readAuthorization = async (prepared: Readonly<{ custodyRef: string }>): Promise<string | undefined> => {
    const pending = preparedRequests.get(prepared.custodyRef)
    if (pending === undefined) return undefined
    const client = createDevelopmentX402Client(pending.credential)
    const challenge = paymentRequiredFromX402Challenge(pending.request.challenge)
    const paymentIdentifier = `ae_${pending.request.paymentIdentifier.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 128).padEnd(16, '_')
    const paymentRequired = withPaymentIdentifier(challenge, paymentIdentifier)
    const payload = await client.createPaymentPayload(paymentRequired)
    validatePaymentPayload(payload)
    return client.encodePaymentSignatureHeader(payload)['PAYMENT-SIGNATURE']
  }
  const runtime: X402RouteTransportRuntime = {
    send: createDevelopmentRouteTransportFetch(server.baseUrl),
    resolveCredential,
    readX402PaymentCredentialRef: () => 'env:AE_X402_PAYMENT_PRIVATE_KEY',
    x402PaymentSigningAvailable: (payment) =>
      payment.network === BASE_SEPOLIA_NETWORK
      && payment.asset.toLowerCase() === BASE_SEPOLIA_USDC.toLowerCase()
      && payment.payTo.toLowerCase() === LOCAL_X402_PAY_TO.toLowerCase(),
    verifyX402Settlement: ({ response, requirement, paymentIdentifier }) => {
      const identifier = `ae_${paymentIdentifier.replace(/[^A-Za-z0-9_-]/g, '_')}`
        .slice(0, 128)
        .padEnd(16, '_')
      return response.success
        && response.transaction === `local-facilitator:${identifier}`
        && response.network === requirement.network
        && response.amount === requirement.amount
    },
    validateProviderConnectionAuthority: (authority) =>
      authority.connectionRef === connectionRef
      && authority.providerRef === providerRef
      && authority.adapterId === adapterId
      && authority.authorityGeneration === authorityGeneration
      && authority.authorityDigest === authorityDigest
        ? { kind: 'valid' as const }
        : { kind: 'unavailable' as const, reason: 'digest_mismatch' as const },
    prepareX402PaymentAuthorization: async (request) => {
      const credential = resolveCredential(request.credential)
      if (credential === undefined) return undefined
      const custodyRef = `development:x402:custody:${request.attemptRef}`
      preparedRequests.set(custodyRef, { request, credential })
      return {
        custodyRef,
        authorizationDigest: canonicalDigest({
          kind: 'development-x402-authorization',
          paymentIdentifier: request.paymentIdentifier,
          challengeDigest: request.challengeDigest,
          attemptRef: request.attemptRef,
          effectGeneration: request.effectGeneration,
          paymentAmount: request.paymentAmount,
        }),
      }
    },
    readX402PaymentAuthorization: readAuthorization,
    readX402PaymentAuthorizationByDigest: readAuthorization,
    markX402PaymentPossiblySubmitted: () => undefined,
    observeX402PaymentAttempt: () => undefined,
  }
  const invocation: RouteTransportInvocation = {
    binding: {
      adapterId,
      endpointUrl: `${server.advertisedBaseUrl}${LOCAL_X402_ROUTE_PREFIX}${input.symbol}`,
      authority: { kind: 'provider_connection', connectionRef, providerRef },
      configJson,
      configDigest: canonicalDigest(configuration as StableHashValue),
    },
    authority: {
      attemptRef: 'attempt:development-x402-local',
      effectGeneration: 1,
      operationKeyDigest,
      mandateDigest: canonicalDigest({ kind: 'development-x402-mandate' }),
      grantDigest: canonicalDigest({ kind: 'development-x402-grant' }),
      capabilityContractDigest: canonicalDigest({ kind: 'development-x402-contract' }),
      maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
      expiresAt: Date.now() + 120_000,
      callIdentity: { keyId: 'development-x402-call', signature: 'development-x402-call' },
      authorityGeneration,
      authorityDigest,
    },
    inputJson: JSON.stringify(input),
  }
  const preparation = prepareRegisteredRouteTransportInvocation(
    invocation,
    runtime.x402PaymentSigningAvailable,
  )
  return preparation.kind === 'refused'
    ? preparation.observation
    : invokePreparedRouteTransport(preparation.prepared, runtime)
}

async function runDevelopmentX402TestnetCanary(environment: Environment): Promise<LocalX402CanaryRefusal | LocalX402TestnetResult> {
  const gate = evaluateLiveMoneyGate()
  if (gate.kind === 'refused') {
    return {
      kind: 'refused',
      mode: 'testnet',
      code: 'x402_testnet_live_money_gate_required',
      prerequisite: `Existing live-money policy/consent gate must be accepted before a testnet payment attempt. Current gate: ${gate.code}.`,
      requiredEnvironment: LOCAL_X402_TESTNET_ENVIRONMENT,
      evidenceCeiling: LOCAL_X402_EVIDENCE_CEILING,
    }
  }
  const missing = LOCAL_X402_TESTNET_ENVIRONMENT.filter((name) => typeof environment[name] !== 'string' || environment[name]!.trim() === '')
  if (missing.length > 0) {
    return {
      kind: 'refused',
      mode: 'testnet',
      code: 'x402_testnet_prerequisite_missing',
      prerequisite: `Set these server-only environment variables before opt-in testnet execution: ${missing.join(', ')}.`,
      requiredEnvironment: LOCAL_X402_TESTNET_ENVIRONMENT,
      evidenceCeiling: LOCAL_X402_EVIDENCE_CEILING,
    }
  }
  const providerUrl = parseTestnetProviderUrl(environment.AE_X402_CANARY_PROVIDER_URL!)
  if (providerUrl.kind === 'refused') return providerUrl.value
  if (!/^0x[0-9a-fA-F]{64}$/.test(environment.AE_X402_PAYMENT_PRIVATE_KEY!)) {
    return {
      kind: 'refused',
      mode: 'testnet',
      code: 'x402_testnet_private_key_invalid',
      prerequisite: 'AE_X402_PAYMENT_PRIVATE_KEY must be a 32-byte 0x-prefixed private key held only by the server process.',
      requiredEnvironment: LOCAL_X402_TESTNET_ENVIRONMENT,
      evidenceCeiling: LOCAL_X402_EVIDENCE_CEILING,
    }
  }

  const account = privateKeyToAccount(environment.AE_X402_PAYMENT_PRIVATE_KEY! as `0x${string}`)
  const clientCore = new x402Client()
  registerExactEvmClient(clientCore, { signer: account, networks: [BASE_SEPOLIA_NETWORK] })
  const client = new x402HTTPClient(clientCore)
  const unpaidResponse = await fetch(providerUrl.value.toString(), { headers: { accept: 'application/json' } })
  const unpaid = await client.processResponse(unpaidResponse)
  if (unpaid.status !== 402 || unpaid.paymentStatus !== 'payment_required' || unpaid.header === undefined) {
    throw new Error('x402_testnet_payment_challenge_missing')
  }
  if (!('accepts' in unpaid.header)) throw new Error('x402_testnet_payment_challenge_invalid')
  const challenge = unpaid.header
  validatePaymentRequired(challenge)
  if (challenge.x402Version !== 2) throw new Error('x402_testnet_payment_version_unsupported')
  const requirement = challenge.accepts[0]
  if (requirement === undefined) throw new Error('x402_testnet_payment_requirement_missing')
  assertBaseSepoliaUsdcRequirement(requirement)
  if (challenge.extensions?.[PAYMENT_IDENTIFIER] === undefined) {
    throw new Error('x402_testnet_payment_identifier_extension_required')
  }
  const paymentRequiredWithIdentifier = withPaymentIdentifier(challenge, generatePaymentId('ae_testnet_'))
  const paymentPayload = await client.createPaymentPayload(paymentRequiredWithIdentifier)
  validatePaymentPayload(paymentPayload)
  const paidResponse = await fetch(providerUrl.value.toString(), {
    headers: {
      accept: 'application/json',
      ...client.encodePaymentSignatureHeader(paymentPayload),
    },
  })
  const paid = await client.processResponse(paidResponse)
  if (paid.status !== 200 || paid.paymentStatus !== 'settled' || paid.header === undefined || !('success' in paid.header) || !paid.header.success) {
    throw new Error('x402_testnet_payment_response_invalid')
  }
  return {
    kind: 'testnet',
    mode: 'opt-in-base-sepolia-testnet',
    providerOutput: localX402QuoteOutputSchema.parse(paid.body),
    paymentResponse: paid.header,
    evidenceCeiling: 'Explicit Base Sepolia testnet provider response only. This is not hosted certification, production proof, AE earnings, AE credit settlement, or a blockchain claim beyond the provider response header.',
  }
}
function createDevelopmentX402Client(
  privateKey: `0x${string}` = LOCAL_X402_PRIVATE_KEY,
): x402HTTPClient {
  const core = new x402Client()
  registerExactEvmClient(core, {
    signer: privateKeyToAccount(privateKey),
    networks: [BASE_SEPOLIA_NETWORK],
  })
  return new x402HTTPClient(core)
}

function paymentRequiredFromX402Challenge(
  challenge: X402PaymentSignatureRequest['challenge'],
): PaymentRequired {
  return {
    x402Version: challenge.x402Version,
    resource: { ...challenge.resource },
    accepts: challenge.accepts.map((requirement) => ({
      ...requirement,
      extra: { ...requirement.extra },
    })),
    ...(challenge.extensions === undefined
      ? {}
      : { extensions: structuredClone(challenge.extensions) }),
  }
}

function withPaymentIdentifier(challenge: PaymentRequired, paymentIdentifier: string): PaymentRequired {
  const extensions = structuredClone(challenge.extensions ?? {})
  appendPaymentIdentifierToExtensions(extensions, paymentIdentifier)
  return { ...challenge, extensions }
}
function createDevelopmentRouteTransportFetch(localBaseUrl: string): RouteTransportFetch {
  return async (input, init) => {
    const target = new URL(localBaseUrl)
    target.pathname = input.pathname
    target.search = input.search
    return fetch(target, {
      ...(init === undefined ? {} : init),
      headers: {
        ...(init?.headers ?? {}),
        'x-forwarded-proto': 'https',
        'x-forwarded-host': input.host,
      },
    })
  }
}


function assertBaseSepoliaUsdcRequirement(requirement: PaymentRequirements): void {
  if (
    requirement.scheme !== 'exact'
    || requirement.network !== BASE_SEPOLIA_NETWORK
    || requirement.asset.toLowerCase() !== BASE_SEPOLIA_USDC.toLowerCase()
    || requirement.amount !== LOCAL_X402_PAYMENT_AMOUNT
    || requirement.extra.name !== 'USDC'
    || requirement.extra.version !== '2'
  ) {
    throw new Error('x402_base_sepolia_usdc_requirement_invalid')
  }
}

function createDevelopmentFakeFacilitator(): FacilitatorClient & { readonly verificationCount: () => number; readonly settlementCount: () => number } {
  const verified = new Map<string, string>()
  let verificationCount = 0
  let settlementCount = 0
  return {
    getSupported: async (): Promise<SupportedResponse> => ({
      kinds: [{ x402Version: 2, scheme: 'exact', network: BASE_SEPOLIA_NETWORK }],
      extensions: [PAYMENT_IDENTIFIER],
      signers: { [BASE_SEPOLIA_NETWORK]: ['development-fake-facilitator'] },
    }),
    verify: async (paymentPayload, paymentRequirements): Promise<VerifyResponse> => {
      verificationCount += 1
      try {
        validatePaymentPayload(paymentPayload)
        const parsed = paymentPayload
        const identifier = extractAndValidatePaymentIdentifier(parsed)
        const authorization = parsed.payload.authorization
        if (!identifier.validation.valid || identifier.id === null || typeof authorization !== 'object' || authorization === null) {
          return { isValid: false, invalidReason: 'payment_identifier_or_authorization_invalid' }
        }
        const authorizationRecord = authorization as Record<string, unknown>
        if (
          parsed.accepted.network !== BASE_SEPOLIA_NETWORK
          || parsed.accepted.asset.toLowerCase() !== BASE_SEPOLIA_USDC.toLowerCase()
          || parsed.accepted.amount !== LOCAL_X402_PAYMENT_AMOUNT
          || parsed.accepted.payTo.toLowerCase() !== paymentRequirements.payTo.toLowerCase()
          || typeof authorizationRecord.from !== 'string'
          || typeof authorizationRecord.to !== 'string'
          || authorizationRecord.to.toLowerCase() !== paymentRequirements.payTo.toLowerCase()
          || authorizationRecord.value !== LOCAL_X402_PAYMENT_AMOUNT
          || typeof parsed.payload.signature !== 'string'
        ) {
          return { isValid: false, invalidReason: 'payment_requirements_mismatch' }
        }
        verified.set(identifier.id, authorizationRecord.from)
        return { isValid: true, payer: authorizationRecord.from }
      } catch {
        return { isValid: false, invalidReason: 'payment_payload_schema_invalid' }
      }
    },
    settle: async (paymentPayload): Promise<SettleResponse> => {
      settlementCount += 1
      validatePaymentPayload(paymentPayload)
      const parsed = paymentPayload
      const identifier = extractAndValidatePaymentIdentifier(parsed)
      const payer = identifier.id === null ? undefined : verified.get(identifier.id)
      if (identifier.id === null || payer === undefined) {
        return {
          success: false,
          errorReason: 'payment_not_verified_by_development_authority',
          transaction: '',
          network: BASE_SEPOLIA_NETWORK,
        }
      }
      return {
        success: true,
        payer,
        transaction: `local-facilitator:${identifier.id}`,
        amount: LOCAL_X402_PAYMENT_AMOUNT,
        network: BASE_SEPOLIA_NETWORK,
      }
    },
    verificationCount: () => verificationCount,
    settlementCount: () => settlementCount,
  }
}

async function startDevelopmentProviderServer(
  httpResourceServer: x402HTTPResourceServer,
  fakeFacilitator: FacilitatorClient & { readonly verificationCount: () => number; readonly settlementCount: () => number },
): Promise<Readonly<{ baseUrl: string; advertisedBaseUrl: string; close: () => Promise<void> }>> {
  const server = createServer((request, response) => {
    void handleDevelopmentProviderRequest(httpResourceServer, fakeFacilitator, request, response).catch((error: unknown) => {
      if (!response.headersSent) writeJson(response, 500, { error: error instanceof Error ? error.message : 'development_provider_error' })
      response.destroy()
    })
  })
  await listen(server)
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('development_x402_server_address_missing')
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    advertisedBaseUrl: `https://development-x402.example:${address.port}`,
    close: () => closeServer(server),
  }
}

async function handleDevelopmentProviderRequest(
  httpResourceServer: x402HTTPResourceServer,
  _fakeFacilitator: FacilitatorClient & { readonly verificationCount: () => number; readonly settlementCount: () => number },
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const forwardedProtocol = request.headers['x-forwarded-proto']
  const protocol = (Array.isArray(forwardedProtocol) ? forwardedProtocol[0] : forwardedProtocol) === 'https'
    ? 'https'
    : 'http'
  const forwardedHost = request.headers['x-forwarded-host']
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost
  const url = new URL(request.url ?? '/', `${protocol}://${host ?? request.headers.host ?? '127.0.0.1'}`)
  const adapter = {
    getHeader: (name: string): string | undefined => {
      const value = request.headers[name.toLowerCase()]
      return Array.isArray(value) ? value[0] : value
    },
    getMethod: () => request.method ?? 'GET',
    getPath: () => url.pathname,
    getUrl: () => url.toString(),
    getAcceptHeader: () => typeof request.headers.accept === 'string' ? request.headers.accept : '',
    getUserAgent: () => typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : '',
    getQueryParams: () => Object.fromEntries(url.searchParams.entries()),
  }
  const transportContext = { request: { adapter, path: url.pathname, method: request.method ?? 'GET' } }
  const processed = await httpResourceServer.processHTTPRequest({ adapter, path: url.pathname, method: request.method ?? 'GET' })
  if (processed.type === 'payment-error') {
    writeJson(response, processed.response.status, processed.response.body ?? {}, processed.response.headers)
    return
  }
  const providerResult = readDevelopmentProviderQuote(url)
  if (providerResult.kind === 'refused') {
    if (processed.type === 'payment-verified') await processed.cancellationDispatcher.cancel({ reason: 'handler_failed', responseStatus: 400 })
    writeJson(response, 400, { error: providerResult.code })
    return
  }
  if (processed.type === 'no-payment-required') {
    writeJson(response, 200, providerResult.output)
    return
  }
  const settlement = await httpResourceServer.processSettlement(
    processed.paymentPayload,
    processed.paymentRequirements,
    processed.declaredExtensions,
    { request: transportContext.request },
  )
  if (!settlement.success) {
    writeJson(response, settlement.response.status, settlement.response.body ?? {}, settlement.response.headers)
    return
  }
  writeJson(response, 200, providerResult.output, settlement.headers)
}

function readDevelopmentProviderQuote(url: URL):
  | Readonly<{ kind: 'ok'; output: LocalX402QuoteOutput }>
  | Readonly<{ kind: 'refused'; code: string }> {
  if (!url.pathname.startsWith(LOCAL_X402_ROUTE_PREFIX) || url.searchParams.size !== 1 || url.searchParams.getAll('quote').length !== 1) {
    return { kind: 'refused', code: 'development_x402_request_shape_invalid' }
  }
  const symbol = url.pathname.slice(LOCAL_X402_ROUTE_PREFIX.length)
  const input = localX402QuoteInputSchema.safeParse({ symbol, quote: url.searchParams.get('quote') })
  if (!input.success) return { kind: 'refused', code: 'development_x402_input_invalid' }
  const output = localX402QuoteOutputSchema.parse({
    schemaVersion: 'development-x402-quote.v1',
    operation: 'spot_quote',
    symbol: input.data.symbol,
    quote: input.data.quote,
    price: LOCAL_X402_PRICES[input.data.symbol][input.data.quote],
    providerRef: 'development-local-x402-provider',
  })
  return { kind: 'ok', output }
}

function parseTestnetProviderUrl(value: string):
  | Readonly<{ kind: 'ok'; value: URL }>
  | Readonly<{ kind: 'refused'; value: LocalX402CanaryRefusal }> {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') throw new Error('https_required')
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]') throw new Error('remote_provider_required')
    return { kind: 'ok', value: url }
  } catch {
    return {
      kind: 'refused',
      value: {
        kind: 'refused',
        mode: 'testnet',
        code: 'x402_testnet_provider_url_invalid',
        prerequisite: 'AE_X402_CANARY_PROVIDER_URL must be a remote HTTPS URL for the Base Sepolia x402 resource; local wire proof uses the default emulator instead.',
        requiredEnvironment: LOCAL_X402_TESTNET_ENVIRONMENT,
        evidenceCeiling: LOCAL_X402_EVIDENCE_CEILING,
      },
    }
  }
}

function writeJson(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'content-type': 'application/json', ...headers })
  response.end(JSON.stringify(body))
}

function listen(server: Server): Promise<void> {
  return new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolveListen()
    })
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => error === undefined ? resolveClose() : reject(error))
  })
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string', default: 'local' },
      symbol: { type: 'string', default: 'BTC' },
      quote: { type: 'string', default: 'USD' },
    },
    strict: true,
  })
  if (values.mode !== 'local' && values.mode !== 'testnet') throw new Error('mode_must_be_local_or_testnet')
  const input = localX402QuoteInputSchema.parse({ symbol: values.symbol, quote: values.quote })
  const result = await runDevelopmentX402Canary({ mode: values.mode, input })
  console.log(JSON.stringify(result, null, 2))
  if (result.kind === 'refused') process.exitCode = 1
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(resolve(entrypoint)).href) await main()
