import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server'
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from '@x402/core/http'
import type { PaymentRequirements } from '@x402/core/types'
import { ExactSvmScheme } from '@x402/svm/exact/server'

import { amountFromParts, formatCurrencyAmount, formatExactAmount, parseDecimalExactAmount } from '@/modules/money/public'

import {
  DEVNET_USDC_MINT,
  SELLER_ACCOUNT_NAME,
  SOLANA_DEVNET,
  X402_ORG_FACILITATOR_URL,
  cdpClient,
  readFlag,
} from './devnet'
import { devnetUsdc } from './spend-cap'

const args = process.argv.slice(2)
const port = Number(readFlag(args, 'port') ?? '4021')
const price = devnetUsdc(readFlag(args, 'price') ?? '0.01')
const facilitatorUrl = readFlag(args, 'facilitator') ?? X402_ORG_FACILITATOR_URL
const payTo = readFlag(args, 'pay-to')
  ?? (await cdpClient().solana.getOrCreateAccount({ name: SELLER_ACCOUNT_NAME })).address

const resourceServer = new x402ResourceServer(new HTTPFacilitatorClient({ url: facilitatorUrl }))
  .register(SOLANA_DEVNET, new ExactSvmScheme())
await resourceServer.initialize()

const requirements: PaymentRequirements[] = await resourceServer.buildPaymentRequirements({
  scheme: 'exact',
  network: SOLANA_DEVNET,
  payTo,
  price: { asset: DEVNET_USDC_MINT, amount: price.units },
  maxTimeoutSeconds: 60,
})

type GstBreakdown = Readonly<{
  tool: 'aud-gst-breakdown'
  network: 'solana-devnet'
  inclusiveAud: string
  gstAud: string
  exclusiveAud: string
  basis: string
}>

/** GST is one eleventh of a GST-inclusive price at the 10% rate, rounded to the nearest cent. */
function gstBreakdown(inclusive: string | null): GstBreakdown | undefined {
  const amount = parseDecimalExactAmount('AUD', inclusive, 2)
  if (amount === undefined) return undefined
  const cents = BigInt(amount.units)
  const gstCents = (cents * 2n + 11n) / 22n
  return {
    tool: 'aud-gst-breakdown',
    network: 'solana-devnet',
    inclusiveAud: formatExactAmount(amount) ?? '',
    gstAud: formatExactAmount(amountFromParts('AUD', gstCents.toString(), 2)) ?? '',
    exclusiveAud: formatExactAmount(amountFromParts('AUD', (cents - gstCents).toString(), 2)) ?? '',
    basis: 'A New Tax System (Goods and Services Tax) Act 1999 (Cth), 10% rate; GST = inclusive price / 11',
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'content-type': 'application/json', ...headers })
  response.end(JSON.stringify(body))
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', `http://localhost:${port}`)
  if (request.method !== 'GET' || url.pathname !== '/gst') {
    sendJson(response, 404, { error: 'devnet seller serves GET /gst?amount=<AUD inclusive>' })
    return
  }
  const result = gstBreakdown(url.searchParams.get('amount'))
  if (result === undefined) {
    sendJson(response, 400, { error: 'amount must be an AUD amount with at most 2 decimals, e.g. amount=110.00' })
    return
  }

  const signature = request.headers['payment-signature']
  if (typeof signature !== 'string') {
    const required = await resourceServer.createPaymentRequiredResponse(requirements, {
      url: url.toString(),
      description: 'AUD GST breakdown (devnet demo Tool)',
      mimeType: 'application/json',
    })
    sendJson(response, 402, { error: 'payment required (Solana devnet USDC)' }, {
      'PAYMENT-REQUIRED': encodePaymentRequiredHeader(required),
    })
    console.log(`devnet seller: 402 challenge for ${url.pathname}${url.search}`)
    return
  }

  const payload = decodePaymentSignatureHeader(signature)
  const accepted = resourceServer.findMatchingRequirements(requirements, payload)
  if (accepted === undefined) {
    sendJson(response, 402, { error: 'payment does not match this Tool\'s devnet requirements' })
    return
  }
  const verification = await resourceServer.verifyPayment(payload, accepted)
  if (!verification.isValid) {
    sendJson(response, 402, { error: 'payment verification failed', reason: verification.invalidReason ?? 'unknown' })
    console.log(`devnet seller: verify refused (${verification.invalidReason ?? 'unknown'})`)
    return
  }
  const settlement = await resourceServer.settlePayment(payload, accepted)
  if (!settlement.success) {
    sendJson(response, 402, { error: 'settlement failed', reason: settlement.errorReason ?? 'unknown' })
    console.log(`devnet seller: settle failed (${settlement.errorReason ?? 'unknown'})`)
    return
  }
  sendJson(response, 200, result, { 'PAYMENT-RESPONSE': encodePaymentResponseHeader(settlement) })
  console.log(`devnet seller: settled ${settlement.transaction} from ${settlement.payer ?? 'unknown payer'}`)
}

createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`devnet seller: ${message}`)
    if (!response.headersSent) sendJson(response, 502, { error: message })
  })
}).listen(port, () => {
  console.log(`devnet seller: GET http://localhost:${port}/gst?amount=110.00 costs ${formatCurrencyAmount(price)} on Solana devnet`)
  console.log(`devnet seller: payTo ${payTo}, facilitator ${facilitatorUrl}`)
})
