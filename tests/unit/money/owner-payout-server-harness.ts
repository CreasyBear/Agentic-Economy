import { beforeEach, vi } from 'vitest'
import type * as ConvexSourceModule from '@/lib/server/convex-source'
import type * as SourceWriteAdmissionModule from '@/lib/server/source-write-admission'
import type * as StripeMoneyProviderModule from '@/lib/server/stripe-money-provider'
import type * as TanstackReactStartModule from '@tanstack/react-start'
import type { OwnerMoneyServerRuntime } from '@/modules/money/server'

export const sourceMocks = {
  callPublicSourceQuery: vi.fn(),
  callSourceQuery: vi.fn(),
  callSourceMutation: vi.fn(),
  createConvexServerFunctionAssertion: vi.fn(),
  sourceWriteAdmissionFromContext: vi.fn(),
  sourceWriteAdmissionFromRequest: vi.fn(),
}
export const stripeMocks = {
  createStripeMoneyProvider: vi.fn(),
}

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof TanstackReactStartModule>()),
  createServerFn: () => ({
    validator: () => ({ handler: (handler: unknown) => handler }),
    handler: (handler: unknown) => handler,
  }),
}))
vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexSourceModule>()),
  callPublicSourceQuery: sourceMocks.callPublicSourceQuery,
  callSourceQuery: sourceMocks.callSourceQuery,
  callSourceMutation: sourceMocks.callSourceMutation,
  createConvexServerFunctionAssertion:
    sourceMocks.createConvexServerFunctionAssertion,
}))
vi.mock('@/lib/server/stripe-money-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof StripeMoneyProviderModule>()),
  createStripeMoneyProvider: stripeMocks.createStripeMoneyProvider,
}))
vi.mock('@/lib/server/source-write-admission', async (importOriginal) => ({
  ...(await importOriginal<typeof SourceWriteAdmissionModule>()),
  sourceWriteAdmissionFromContext: sourceMocks.sourceWriteAdmissionFromContext,
  sourceWriteAdmissionFromRequest: sourceMocks.sourceWriteAdmissionFromRequest,
}))

export const amount = { currency: 'USD', units: '5000', exponent: 2 }
export const ownerProjection = {
  kind: 'available' as const,
  businessId: 'business-1',
  accounts: [
    {
      currency: 'USD',
      earnings: {
        businessId: 'business-1',
        grossAccrual: amount,
        rake: { currency: 'USD', units: '0', exponent: 2 },
        providerNet: amount,
        paidOut: { currency: 'USD', units: '0', exponent: 2 },
        held: amount,
        recoveryDue: { currency: 'USD', units: '0', exponent: 2 },
        truncated: false,
        evidence: 'source' as const,
      },
      payout: {
        businessId: 'business-1',
        accountState: 'ready' as const,
        payoutState: 'held_threshold' as const,
        payoutRef: 'payout-1',
        providerNet: amount,
        minimumPayout: { currency: 'USD', units: '1000', exponent: 2 },
        evidence: 'source' as const,
      },
    },
  ],
  accountsTruncated: false,
}
export const payoutAccount = {
  businessId: 'business-1',
  currency: 'USD',
  exponent: 2,
  stripeAccountId: 'acct_1',
  state: 'ready' as const,
  detailsSubmitted: true,
  recipientCapabilityActive: true,
}
export const input = {
  businessId: 'business-1',
  currency: 'USD',
  payoutRef: 'payout-1',
  amount,
  idempotencyKey: 'owner-payout:test-1',
}
export const config = {
  secretKey: 'sk_live_test',
  webhookSecret: 'whsec_test',
  publishableKey: 'pk_live_test',
  mode: 'live' as const,
}
export const unavailable = {
  kind: 'refused' as const,
  code: 'payout_outcome_unknown' as const,
  retryable: true,
}
export type Provider = NonNullable<OwnerMoneyServerRuntime['provider']>

export function runtime(
  createOrRecoverTransfer: Provider['createOrRecoverTransfer'],
  now: number,
  readTransfersByIdentity: Provider['readTransfersByIdentity'] = async () =>
    unavailable,
): OwnerMoneyServerRuntime {
  return {
    now,
    config,
    provider: {
      createOrRecoverTransfer,
      createOrRecoverConnectAccount: async () => unavailable,
      createOnboardingLink: async () => unavailable,
      readConnectAccount: async () => unavailable,
      readTransfer: async () => unavailable,
      readTransfersByIdentity,
    },
  }
}
export function connectRuntime(
  createOrRecoverConnectAccount: Provider['createOrRecoverConnectAccount'],
  now = 100,
): OwnerMoneyServerRuntime {
  return {
    now,
    config,
    provider: {
      createOrRecoverConnectAccount,
      createOrRecoverTransfer: async () => unavailable,
      createOnboardingLink: async () => unavailable,
      readConnectAccount: async () => unavailable,
      readTransfer: async () => unavailable,
      readTransfersByIdentity: async () => unavailable,
    },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  sourceMocks.sourceWriteAdmissionFromContext.mockResolvedValue({
    keyId: 'test',
    scope: 'billing',
    operationKey: 'test',
    correlationId: 'test',
    commandDigest: 'sha256:test',
    nonce: 'test',
    issuedAt: 1,
    method: 'POST',
    initiatorOrigin: 'https://ae.test',
    targetOrigin: 'https://ae.test',
    targetPath: '/test',
    targetQuery: '',
    bodyDigest: 'sha256:body',
    signature: 'test',
  })
})
