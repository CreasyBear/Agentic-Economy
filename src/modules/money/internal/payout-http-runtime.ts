import {
  callSourceQuery,
  sourceQuery,
} from '@/lib/server/convex-source'
import { isRecord } from '@/modules/common/is-record'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
import {
  sourceWriteRequestFromAdmission,
  SourceWriteAdmissionError,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'
import {
  isMoneyRefusal,
  type MoneyRefusal,
  type PayoutStatusView,
  type ProviderEarningsView,
} from '../public'
import type { ConnectAccountPort, PayoutTransferPort } from './ports'
import {
  createStripeMoneyProvider,
  readStripeMoneyProviderConfig,
  type StripeMoneyClient,
  type StripeMoneyMode,
  type StripeMoneyProviderConfig,
} from '@/lib/server/stripe-money-provider'

export type Environment = Readonly<Record<string, string | undefined>>

export type OwnerMoneyServerRuntime = Readonly<{
  env?: Environment
  mode?: StripeMoneyMode
  config?: StripeMoneyProviderConfig
  client?: StripeMoneyClient
  provider?: ConnectAccountPort & PayoutTransferPort
  now?: number
}>

export type SourceWriteBoundArgs = Readonly<{
  sourceWrite: SourceWriteAdmission
  sourceWriteRequest: SourceWriteAdmissionRequest
}>

export type OwnerBusinessProjection = Readonly<
  | {
      kind: 'available'
      businessId: string
      accounts: readonly OwnerBusinessCurrencyProjection[]
    }
  | { kind: 'not_found' }
  | { kind: 'error'; code: 'unauthenticated' | 'source_unavailable' }
>

export type OwnerBusinessCurrencyProjection = Readonly<{
  currency: string
  earnings: ProviderEarningsView
  payout: PayoutStatusView
}>

type OwnerProviderEarningsReadback = Readonly<
  | { kind: 'error'; code: 'unauthenticated' | 'source_unavailable' }
  | { kind: 'not_found' }
  | {
      kind: 'available'
      businessId: string
      accounts: readonly Readonly<{
        currency: string
        earnings: Readonly<{ kind: 'ok' } & ProviderEarningsView>
        payout: Readonly<{ kind: 'ok' } & PayoutStatusView>
      }>[]
      accountsTruncated: boolean
    }
>

export const ownerBusinessQuery = sourceQuery<
  Record<string, never>,
  OwnerProviderEarningsReadback
>('moneyLedger:readOwnerProviderEarnings')

export function payoutProvider(
  runtime: OwnerMoneyServerRuntime,
):
  | Readonly<{ provider: ConnectAccountPort & PayoutTransferPort }>
  | MoneyRefusal {
  const config =
    runtime.config ??
    readStripeMoneyProviderConfig(runtime.env ?? process.env, runtime.mode)
  if (isMoneyRefusal(config)) return config
  if (runtime.mode !== undefined && config.mode !== runtime.mode)
    return { kind: 'refused', code: 'stripe_setup_required', retryable: false }
  return {
    provider:
      runtime.provider ??
      createStripeMoneyProvider({
        config,
        ...(runtime.client === undefined ? {} : { client: runtime.client }),
      }),
  }
}

export async function sourceWriteOrRefusal(
  context: unknown,
  command: unknown,
  operationKey: string,
  correlationId: string,
): Promise<SourceWriteBoundArgs | MoneyRefusal> {
  try {
    const sourceWrite = await sourceWriteAdmissionFromContext({
      context,
      command,
      scope: 'billing',
      operationKey,
      correlationId,
    })
    return {
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
    }
  } catch (error) {
    if (
      error instanceof SourceWriteAdmissionError &&
      error.code === 'missing_source_write_request'
    ) {
      return { kind: 'refused', code: 'billing_identity_missing', retryable: false }
    }
    throw error
  }
}

export async function ownerBusiness(
  businessId: string,
  _context?: unknown,
): Promise<
  | Readonly<{
      kind: 'accepted'
      value: Extract<OwnerBusinessProjection, { kind: 'available' }>
    }>
  | MoneyRefusal
> {
  try {
    const result = await callSourceQuery(ownerBusinessQuery, {})
    if (result.kind === 'error')
      return {
        kind: 'refused',
        code:
          result.code === 'unauthenticated'
            ? 'billing_identity_missing'
            : 'payout_not_ready',
        retryable: result.code !== 'unauthenticated',
      }
    if (result.kind !== 'available' || result.businessId !== businessId)
      return { kind: 'refused', code: 'payout_not_ready', retryable: false }
    return {
      kind: 'accepted',
      value: {
        kind: 'available',
        businessId: result.businessId,
        accounts: result.accounts.map(({ currency, earnings, payout }) => ({
          currency,
          earnings,
          payout,
        })),
      },
    }
  } catch {
    return { kind: 'refused', code: 'payout_not_ready', retryable: true }
  }
}

export function ownerCurrency(
  owner: Extract<OwnerBusinessProjection, { kind: 'available' }>,
  currency: string,
): OwnerBusinessCurrencyProjection | undefined {
  return owner.accounts.find((account) => account.currency === currency)
}

export function readOptionalString(value: unknown, key: string): string | undefined {
  if (
    !isRecord(value) ||
    typeof value[key] !== 'string' ||
    value[key].trim().length === 0
  )
    return undefined
  return value[key]
}
export function readOptionalNumber(value: unknown, key: string): number | undefined {
  return !isRecord(value) ||
    typeof value[key] !== 'number' ||
    !Number.isFinite(value[key])
    ? undefined
    : value[key]
}
export function readOptionalBoolean(value: unknown, key: string): boolean | undefined {
  return !isRecord(value) || typeof value[key] !== 'boolean'
    ? undefined
    : value[key]
}
export function optionalProperty<T>(
  key: string,
  value: T | undefined,
): Readonly<Record<string, T>> {
  return value === undefined ? {} : { [key]: value }
}
