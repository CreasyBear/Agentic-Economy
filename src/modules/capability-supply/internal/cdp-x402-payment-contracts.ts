import type { StringEnvironment } from '@/lib/server/read-trimmed-env'

import type { CdpX402CustodyConfiguration } from './server-credential'
import type { X402AeEnvironment } from './x402-payment-profile'

export const PAYMENT_SIGNING_IDEMPOTENCY_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export type CdpX402PolicyIdentity = Readonly<{
  id: string
  scope: 'account' | 'project'
  rules: readonly unknown[]
}>

export type CdpClientLike = Readonly<{
  policies: Readonly<{
    getPolicyById: (
      options: Readonly<{ id: string }>,
    ) => Promise<CdpX402PolicyIdentity>
  }>
  evm: Readonly<{
    getAccount: (options: Readonly<{ name: string }>) => Promise<Readonly<{
      address: string
      policies?: readonly string[]
    }>>
    signTypedData: (options: Readonly<{
      address: string
      domain: Record<string, unknown>
      types: Record<string, unknown>
      primaryType: string
      message: Record<string, unknown>
      idempotencyKey: string
    }>) => Promise<Readonly<{ signature: string }>>
    listTokenBalances?: (options: Readonly<{
      address: `0x${string}`
      network: 'base' | 'base-sepolia'
      pageSize: number
      pageToken?: string
    }>) => Promise<Readonly<{
      balances: readonly Readonly<{
        token: Readonly<{ contractAddress: string; network: string }>
        amount: Readonly<{ amount: bigint; decimals: number }>
      }>[]
      nextPageToken?: string
    }>>
  }>
}>

export type CdpX402TreasuryObservation = Readonly<{
  environment: X402AeEnvironment
  custodyRef: string
  custodyGeneration: number
  network: string
  asset: 'USDC'
  exponent: 6
  totalUnits: string
  evidenceRef: string
  evidenceDigest: string
  observedAt: number
}>

export type CdpX402TreasuryObserverDependencies = Readonly<{
  environment?: StringEnvironment
  createClient?: (configuration: CdpX402CustodyConfiguration) => CdpClientLike
  now?: () => number
}>

export type CdpX402Resource = Readonly<{
  url: string
  description?: string
  mimeType?: string
}>

export type CdpX402AcceptedRequirement = Readonly<{
  scheme: string
  network: `${string}:${string}`
  amount: string
  asset: string
  payTo: string
  maxTimeoutSeconds: number
  extra: Readonly<Record<string, unknown>>
}>

export type CdpX402Authorization = Readonly<{
  from: string
  to: string
  value: string
  validAfter: string
  validBefore: string
  nonce: string
}>

export type CdpX402TypedData = Readonly<{
  domain: Record<string, unknown>
  types: Record<string, unknown>
  primaryType: string
  message: Record<string, unknown>
}>

export type CdpX402PaymentUnsignedMaterial = Readonly<{
  x402Version: number
  resource: CdpX402Resource
  accepted: CdpX402AcceptedRequirement
  extensions?: Readonly<Record<string, unknown>>
  authorization: CdpX402Authorization
  typedData: CdpX402TypedData
}>

export type CdpX402PaymentSigningIntent = Readonly<{
  paymentUnsignedMaterialJson: string
  paymentUnsignedMaterialDigest: string
  paymentSigningIdempotencyKey: string
  paymentPayer: string
  paymentNonce: string
  paymentAuthorizationValidBefore: string
  paymentAuthorizationExpiresAt: number
  requestFingerprint: string
}>

export type CdpX402PaymentSignerDependencies = Readonly<{
  environment?: StringEnvironment
  aeEnvironment?: X402AeEnvironment
  createClient?: (configuration: CdpX402CustodyConfiguration) => CdpClientLike
  persistedIntent?: CdpX402PaymentSigningIntent
  onUnsignedMaterial?: (intent: CdpX402PaymentSigningIntent) => Promise<void> | void
  requestFingerprintContext?: CdpX402RequestFingerprintContext
  /** Exact admitted Call authority bound, in Unix milliseconds. */
  authorityExpiresAt?: number
}>

export type CdpX402PaymentAuthorization = Readonly<{
  paymentSignatureDigest: string
  paymentPayer: string
  paymentNonce: string
  requestFingerprint: string
}>

export type CdpX402RequestFingerprintContext = Readonly<{
  method: 'GET' | 'POST'
  toolRef: string
  aeEnvironment?: X402AeEnvironment
}>
