import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from '@x402/core/http'
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from '@x402/core/types'

import { formatExactAmount, type ExactAmount } from '@/modules/money/public'

import { explorerTransactionUrl, type AgentId, type SolanaCluster } from './devnet'
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
  cluster: SolanaCluster
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
  network: SolanaCluster['name']
  caip2: SolanaCluster['caip2']
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
    /** Settlement facts that disagree with the request; recorded, never thrown, because the money already moved. */
    discrepancies: readonly string[]
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

function usdcRequirement(required: PaymentRequired, cluster: SolanaCluster): PaymentRequirements {
  const requirement = required.accepts.find((accept) =>
    accept.scheme === 'exact' && accept.network === cluster.caip2 && accept.asset === cluster.usdcMint)
  if (requirement === undefined) {
    const offered = required.accepts.map((accept) => `${accept.scheme}/${accept.network}/${accept.asset}`).join(', ')
    throw new Error(`${cluster.name}: the Tool offers no exact ${cluster.caip2} USDC payment (offered: ${offered || 'nothing'})`)
  }
  return requirement
}

/**
 * One agent-scoped Solana Call: read the 402 challenge, check the price against the agent's caps,
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
  const requirement = usdcRequirement(required, request.cluster)
  const price = devnetUsdcFromAtomic(requirement.amount)
  const check = checkAgentSpendCap(price, request.spentToday, request.cap)
  const base: ReceiptBase = {
    network: request.cluster.name,
    caip2: request.cluster.caip2,
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

  // Resolve the wallet before signing: after settlement nothing may throw before the receipt exists.
  const payer = await dependencies.payer.address()
  const payload = await dependencies.payer.createPaymentPayload({ ...required, accepts: [requirement] })
  const paid = await dependencies.fetch(request.toolUrl, {
    headers: { 'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(payload) },
  })
  const settlementHeader = paid.headers.get('PAYMENT-RESPONSE')
  if (paid.status !== 200 || settlementHeader === null) {
    throw new Error(`${request.cluster.name}: paid request returned ${paid.status} without a settled PAYMENT-RESPONSE: ${await paid.text()}`)
  }
  const settlement = decodePaymentResponseHeader(settlementHeader)
  if (!settlement.success || settlement.transaction === '') {
    throw new Error(`${request.cluster.name}: settlement did not succeed: ${JSON.stringify(settlement)}`)
  }
  const discrepancies: string[] = []
  if (settlement.network !== request.cluster.caip2) {
    discrepancies.push(`settlement network ${settlement.network} is not ${request.cluster.caip2}`)
  }
  if (settlement.payer !== payer) {
    discrepancies.push(`settlement payer ${settlement.payer ?? 'missing'} is not the agent wallet ${payer}`)
  }
  const body = await paid.text().catch((error: unknown) => `unreadable body: ${String(error)}`)
  let toolResponse: unknown = body
  try {
    toolResponse = JSON.parse(body)
  } catch {
    // Keep the raw text: a non-JSON body is still the Tool's answer.
  }
  return {
    ...base,
    outcome: 'settled',
    signature: settlement.transaction,
    payer,
    explorerUrl: explorerTransactionUrl(settlement.transaction, request.cluster),
    settledAt: dependencies.now().toISOString(),
    toolResponse,
    discrepancies,
  }
}
