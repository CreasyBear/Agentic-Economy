import type { MoneyRefusal } from './public'
import {
  beginCreditTopup as beginTopup,
  setAutoRecharge as updateAutoRecharge,
  type AutoRechargeSettings,
  type BeginTopupResult,
  type CreditTopupConfig,
  type TopupState,
} from './public'
import type { LedgerState } from './internal/ledger'
import type { CreditPaymentPort, ConnectAccountPort } from './internal/ports'
import { transitionPayoutAccount, type PayoutAccountTransitionInput } from './internal/payout-policy'

export async function beginCreditTopup(input: Readonly<{
  principalId: string
  accountRef: string
  currency: string
  amountMinor: number
  idempotencyKey: string
  inputDigest: string
  commandRef: string
  successReturnRef: string
  now: number
  config: CreditTopupConfig
  state: TopupState
  ledgerState: LedgerState
  paymentPort: CreditPaymentPort
}>): Promise<BeginTopupResult> {
  if (!input.principalId.startsWith('clerk_api_key:')) {
    return { state: input.state, ledgerState: input.ledgerState, result: refusal('billing_identity_missing', false) }
  }
  return await beginTopup({ ...input, port: input.paymentPort })
}

export function setAutoRecharge(input: Readonly<{ state: TopupState; accountRef: string; settings: AutoRechargeSettings; config: CreditTopupConfig; currency: string }>): Readonly<{ state: TopupState; result: AutoRechargeSettings | MoneyRefusal }> {
  return updateAutoRecharge(input)
}

export async function startPayoutOnboarding(input: Readonly<{
  account: PayoutAccountTransitionInput
  ports: ConnectAccountPort
  idempotencyKey: string
}>): Promise<Readonly<{ kind: 'accepted'; account: PayoutAccountTransitionInput['current']; stripeAccountId: string; onboardingUrl?: string } | MoneyRefusal>> {
  const created = await input.ports.createConnectAccount({ businessId: input.account.businessId, currency: input.account.currency, idempotencyKey: input.idempotencyKey, configuration: 'accounts_v2' })
  if (isMoneyRefusal(created)) return created
  const updated = transitionPayoutAccount({ ...input.account, stripeAccountId: created.stripeAccountId, event: { kind: 'onboarding_started', observedAt: Date.now() } })
  if (updated.kind === 'refused') return updated
  const onboarding = await input.ports.createOnboardingLink({ businessId: input.account.businessId, stripeAccountId: created.stripeAccountId, refreshRef: `payout-refresh:${input.account.businessId}`, returnRef: `payout-return:${input.account.businessId}`, idempotencyKey: input.idempotencyKey })
  if (isMoneyRefusal(onboarding)) return onboarding
  return { kind: 'accepted', account: updated.value, stripeAccountId: created.stripeAccountId, onboardingUrl: onboarding.url }
}

function refusal(code: MoneyRefusal['code'], retryable: boolean): MoneyRefusal {
  return { kind: 'refused', code, retryable }
}
function isMoneyRefusal(value: Readonly<{ kind: 'refused'; code: MoneyRefusal['code']; retryable: boolean }> | Readonly<{ stripeAccountId: string; provider: 'stripe'; evidenceRef: string }> | Readonly<{ provider: 'stripe'; url: string; evidenceRef: string }>): value is MoneyRefusal {
  return 'kind' in value && value.kind === 'refused'
}
