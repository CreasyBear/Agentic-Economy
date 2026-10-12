import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { CdpX402Client } from '@coinbase/cdp-sdk/x402'

import { addExactAmounts, formatCurrencyAmount, type ExactAmount } from '@/modules/money/public'

import { agentAccountName, parseAgentId, parseCluster, readFlag, requireCdpCredentials, type AgentId } from './devnet'
import { purchaseOnDevnet, type DevnetPayer, type DevnetReceipt } from './purchase'
import { devnetUsdc, devnetUsdcFromAtomic } from './spend-cap'

const args = process.argv.slice(2)
const cluster = parseCluster(readFlag(args, 'network') ?? 'devnet')
const agentId = parseAgentId(readFlag(args, 'agent') ?? 'demo')
const toolUrl = readFlag(args, 'url') ?? 'http://localhost:4021/gst?amount=110.00'
const cap = {
  perCall: devnetUsdc(readFlag(args, 'per-call') ?? '0.05'),
  daily: devnetUsdc(readFlag(args, 'daily') ?? '0.20'),
}
const receiptDir = path.join(cluster.receiptDir, agentId)

/** Today's spend is the sum of this agent's settled receipts on the chosen network on this machine for the current UTC day. */
async function spentTodayFromReceipts(agent: AgentId, now: Date): Promise<ExactAmount> {
  const day = now.toISOString().slice(0, 10)
  const names = await readdir(receiptDir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  let total = devnetUsdc('0')
  for (const name of names.filter((file) => file.endsWith('.json'))) {
    const receipt = JSON.parse(await readFile(path.join(receiptDir, name), 'utf8')) as DevnetReceipt
    if (receipt.agentId === agent && receipt.outcome === 'settled' && receipt.requestedAt.startsWith(day)) {
      const next = addExactAmounts(total, devnetUsdcFromAtomic(receipt.priceAtomic))
      if (next === undefined) throw new Error(`devnet: receipt ${name} has an unreadable price`)
      total = next
    }
  }
  return total
}

let client: CdpX402Client | undefined
function cdpX402Client(): CdpX402Client {
  requireCdpCredentials()
  client ??= new CdpX402Client({
    walletConfig: { type: 'eoa', accountName: agentAccountName(agentId) },
    environment: 'development',
    networkSchemes: [{ network: cluster.name, scheme: { exact: true } }],
  })
  return client
}

const payer: DevnetPayer = {
  address: async () => (await cdpX402Client().getAddresses()).svmAddress,
  createPaymentPayload: (required) => cdpX402Client().createPaymentPayload(required),
}

const receipt = await purchaseOnDevnet(
  { cluster, agentId, toolUrl, cap, spentToday: await spentTodayFromReceipts(agentId, new Date()) },
  {
    fetch: (url, init) => fetch(url, init).catch((error: unknown) => {
      throw new Error(`devnet: cannot reach ${url}. Is \`npm run devnet:seller\` running?`, { cause: error })
    }),
    payer,
    now: () => new Date(),
  },
)

await mkdir(receiptDir, { recursive: true })
const receiptPath = path.join(receiptDir, `${receipt.requestedAt.replaceAll(':', '-')}-${receipt.outcome}.json`)
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)

const capLine = `cap ${formatCurrencyAmount(cap.perCall)}/Call, ${formatCurrencyAmount(cap.daily)}/day, spent today ${receipt.capCheck.spentTodayUsdc} USDC`
console.log(`${cluster.name}: agent ${agentId} asked ${toolUrl}`)
console.log(`${cluster.name}: price ${receipt.priceUsdc} USDC to ${receipt.payTo}; ${capLine}`)
if (receipt.outcome === 'refused') {
  console.log(`${cluster.name}: REFUSED before signing (${receipt.capCheck.reason}). No payment was signed or sent.`)
} else {
  console.log(`${cluster.name}: PAID ${receipt.priceUsdc} USDC from ${receipt.payer}`)
  console.log(`${cluster.name}: signature ${receipt.signature}`)
  console.log(`${cluster.name}: explorer ${receipt.explorerUrl}`)
  console.log(`${cluster.name}: Tool response ${JSON.stringify(receipt.toolResponse)}`)
  for (const discrepancy of receipt.discrepancies) console.log(`${cluster.name}: DISCREPANCY ${discrepancy}`)
}
console.log(`${cluster.name}: receipt ${receiptPath}`)
