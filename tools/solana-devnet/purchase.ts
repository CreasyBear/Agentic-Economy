import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from '@x402/core/http'
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from '@x402/core/types'

import { formatExactAmount, type ExactAmount } from '@/modules/money/public'

import { DEVNET_USDC_MINT, SOLANA_DEVNET, explorerTransactionUrl, type AgentId } from './devnet'
import { checkAgentSpendCap, devnetUsdcFromAtomic, type AgentSpendCap, type CapCheck } from './spend-cap'

export type DevnetPayer = Readonly<{
  /** Resolves the custody address lazily so a refused Call never provisions or touches the wallet. */
  address: () => Promise<string>
  createPaymentPayload: (required: PaymentRequired) => Promise<PaymentPayload>
}>

export type PurchaseDependencies = Readonly<{
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  payer: DevnetPayer
  now: () => Date
}>

export type PurchaseRequest = Readonly<{
  agentId: AgentId
  toolUrl: string
  cap: AgentSpendCap
  spentToday: ExactAmount
}>

type ReceiptCapCheck = Readonly<{
  outcome: CapCheck['outcome']
  reason?: Extract<CapCheck, { outcome: 'refused' }>['reason']
  perCallCapUsdc: string
  dailyCapUsdc: string
  spentTodayUsdc: string
}>

type ReceiptBase = Readonly<{
  network: 'solana-devnet'
  caip2: typeof SOLANA_DEVNET
  agentId: AgentId
  toolUrl: string
  priceUsdc: string
  priceAtomic: string
  asset: string
  payTo: string
  capCheck: ReceiptCapCheck
  requestedAt: string
  capCheckedAt: string
}>

export type DevnetReceipt =
  | (ReceiptBase & Readonly<{ outcome: 'refused' }>)
  | (ReceiptBase & Readonly<{
    outcome: 'settled'
    signature: string
    payer: string
    explorerUrl: string
    settledAt: string
    toolResponse: unknown
  }>)

function usdcText(amount: ExactAmount): string {
  return formatExactAmount(amount) ?? amount.units
}

function receiptCapCheck(check: CapCheck): ReceiptCapCheck {
  return {
    outcome: check.outcome,
    ...(check.outcome === 'refused' ? { reason: check.reason } : {}),
    perCallCapUsdc: usdcText(check.cap.perCall),
    dailyCapUsdc: usdcText(check.cap.daily),
    spentTodayUsdc: usdcText(check.spentToday),
  }
}

function devnetUsdcRequirement(required: PaymentRequired): PaymentRequirements {
  const requirement = required.accepts.find((accept) =>
    accept.scheme === 'exact' && accept.network === SOLANA_DEVNET && accept.asset === DEVNET_USDC_MINT)
  if (requirement === undefined) {
    const offered = required.accepts.map((accept) => `${accept.scheme}/${accept.network}/${accept.asset}`).join(', ')
    throw new Error(`devnet: the Tool offers no exact devnet USDC payment (offered: ${offered || 'nothing'})`)
  }
  return requirement
}

/**
 * One agent-scoped devnet Call: read the 402 challenge, check the price against the agent's caps,
 * and only then sign, pay and confirm settlement from PAYMENT-RESPONSE.
 */
export async function purchaseOnDevnet(
  request: PurchaseRequest,
  dependencies: PurchaseDependencies,
): Promise<DevnetReceipt> {
  const requestedAt = dependencies.now().toISOString()
  const challenge = await dependencies.fetch(request.toolUrl)
  const challengeHeader = challenge.headers.get('PAYMENT-REQUIRED')
  if (challenge.status !== 402 || challengeHeader === null) {
    throw new Error(`devnet: expected HTTP 402 with PAYMENT-REQUIRED from ${request.toolUrl}, got ${challenge.status}`)
  }
  const required = decodePaymentRequiredHeader(challengeHeader)
  const requirement = devnetUsdcRequirement(required)
  const price = devnetUsdcFromAtomic(requirement.amount)
  const check = checkAgentSpendCap(price, request.spentToday, request.cap)
  const base: ReceiptBase = {
    network: 'solana-devnet',
    caip2: SOLANA_DEVNET,
    agentId: request.agentId,
    toolUrl: request.toolUrl,
    priceUsdc: usdcText(price),
    priceAtomic: requirement.amount,
    asset: requirement.asset,
    payTo: requirement.payTo,
    capCheck: receiptCapCheck(check),
    requestedAt,
    capCheckedAt: dependencies.now().toISOString(),
  }
  if (check.outcome === 'refused') return { ...base, outcome: 'refused' }

  const payload = await dependencies.payer.createPaymentPayload({ ...required, accepts: [requirement] })
  const paid = await dependencies.fetch(request.toolUrl, {
    headers: { 'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(payload) },
  })
  const settlementHeader = paid.headers.get('PAYMENT-RESPONSE')
  if (paid.status !== 200 || settlementHeader === null) {
    throw new Error(`devnet: paid request returned ${paid.status} without a settled PAYMENT-RESPONSE: ${await paid.text()}`)
  }
  const settlement = decodePaymentResponseHeader(settlementHeader)
  const payer = await dependencies.payer.address()
  if (!settlement.success || settlement.transaction === '' || settlement.network !== SOLANA_DEVNET) {
    throw new Error(`devnet: settlement did not succeed on devnet: ${JSON.stringify(settlement)}`)
  }
  if (settlement.payer !== payer) {
    throw new Error(`devnet: settlement payer ${settlement.payer ?? 'missing'} is not the agent wallet ${payer}`)
  }
  return {
    ...base,
    outcome: 'settled',
    signature: settlement.transaction,
    payer,
    explorerUrl: explorerTransactionUrl(settlement.transaction),
    settledAt: dependencies.now().toISOString(),
    toolResponse: await paid.json(),
  }
}
