import type { ExactAmount } from '@/modules/money/public'

import type {
  ProviderConnectionCredentialResolution,
  ProviderConnectionLeaseCredentialResolution,
} from '../provider-connection'
import type { RouteTransportFetch } from './route-transport-http-json'
import type {
  ProviderConnectionAuthorityLookup,
  ProviderConnectionAuthorityValidationResult,
} from './route-transport-invocation'
import type { X402PaymentSignatureRequest } from './x402-challenge'
import type {
  X402PaymentAttemptEvent,
  X402PaymentAuthorizationIdentity,
  X402PreparedAuthorization,
} from './x402-payment-lifecycle'
import type { X402SettlementResponse } from './x402-payment-signer'

export type ProviderConnectionAuthorityReader = (
  input: ProviderConnectionAuthorityLookup,
) =>
  | ProviderConnectionCredentialResolution
  | ProviderConnectionLeaseCredentialResolution
  | Promise<
      | ProviderConnectionCredentialResolution
      | ProviderConnectionLeaseCredentialResolution
    >

export type ProviderConnectionAuthorityValidator = (
  input: ProviderConnectionAuthorityLookup,
) =>
  | ProviderConnectionAuthorityValidationResult
  | Promise<ProviderConnectionAuthorityValidationResult>

export type RouteTransportRuntime = Readonly<{
  send: RouteTransportFetch
  resolveCredential: (
    reference: string,
  ) => string | undefined | Promise<string | undefined>

  readProviderConnectionCredentialRef?: ProviderConnectionAuthorityReader
  readX402PaymentCredentialRef?: () =>
    string | undefined | Promise<string | undefined>
  validateProviderConnectionAuthority?: ProviderConnectionAuthorityValidator
  x402PaymentSigningAvailable?: (
    input: Readonly<{
      credentialRef: string
      network: string
      asset: string
      payTo: string
      maximumSpend: ExactAmount
    }>,
  ) => boolean
  verifyX402Settlement?: (
    input: Readonly<{
      response: X402SettlementResponse
      requirement: X402PaymentSignatureRequest['selectedRequirement']
      paymentSignature: string
      paymentIdentifier: string
      challengeDigest: string
    }>,
  ) => boolean | Promise<boolean>
  prepareX402PaymentAuthorization?: (
    request: X402PaymentSignatureRequest & X402PaymentAuthorizationIdentity & Readonly<{
      authorityExpiresAt: number
    }>,
  ) => Promise<X402PreparedAuthorization | undefined>
  readX402PaymentAuthorization?: (
    prepared: X402PreparedAuthorization,
  ) => Promise<string | undefined>
  /** Restores custody material by the persisted opaque digest after process loss. */
  readX402PaymentAuthorizationByDigest?: (
    prepared: X402PreparedAuthorization,
  ) => Promise<string | undefined>
  markX402PaymentPossiblySubmitted?: (
    event: X402PaymentAttemptEvent,
  ) => Promise<void> | void
  observeX402PaymentAttempt?: (
    event: X402PaymentAttemptEvent &
      Readonly<{
        state: 'settled' | 'not_settled' | 'reconciliation_required'
        evidenceRefs: readonly string[]
      }>,
  ) => Promise<void> | void
}>
