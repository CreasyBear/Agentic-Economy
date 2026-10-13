"use node"

import { Agent, fetch as guardedFetch } from 'undici'
import { encodeFunctionData, erc20Abi, toEventSelector, type Address } from 'viem'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isBoundedJsonValue, type JsonValue } from '@/modules/common/bounded-json'
import { isRecord } from '@/modules/common/is-record'
import { configuredX402RpcUrls } from '@/modules/capability-execution/call-runtime'
import { x402PaymentProfileForEnvironment } from '@/modules/capability-supply/convex'
import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'
import { TREASURY_FINALIZED_BLOCK_MAX_AGE_MS, type TreasuryChainCheckpoint, type TreasuryChainObservation, type TreasuryTransfer } from '@/modules/money/treasury'
export type { TreasuryChainCheckpoint, TreasuryChainObservation, TreasuryTransfer } from '@/modules/money/treasury'

const HASH = /^0x[0-9a-fA-F]{64}$/u
const ADDRESS = /^0x[0-9a-fA-F]{40}$/u
const QUANTITY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/u
const DECIMAL = /^(?:0|[1-9]\d{0,77})$/u
const TRANSFER_TOPIC = toEventSelector('Transfer(address,address,uint256)')
export const TREASURY_CHAIN_RANGE_BLOCKS = 2_000n
export const TREASURY_CHAIN_TRANSFER_LIMIT = 100

export type TreasuryRpc = (target: URL, method: string, params: readonly unknown[]) => Promise<JsonValue>
type Block = Readonly<{ number: bigint; hash: string; timestamp: number }>
type Unavailable = Readonly<{ kind: 'unavailable'; code: string }>

/**
 * Requires the configured deployment profile and a retained canonical checkpoint.
 * Ensures all configured RPCs agree on chain, finalized block, balance and exact
 * Transfer identities. Balance conservation rejects missing net movement;
 * completeness also relies on the independent RPCs returning all matching logs. A range is bounded; only its accepted successor can advance it.
 * Invariant: latest/safe heads, discrepancies and missing logs never prove a deposit.
 * On violation: unavailable with no writes; the caller retains its cursor.
 * Finalized tags: ethereum.org/developers/docs/apis/json-rpc/.
 * Hash-bound balance reads: eips.ethereum.org/EIPS/eip-1898.
 */
export async function readTreasuryChainObservation(
  input: Readonly<{
    environment: 'sandbox' | 'production'
    address: string
    checkpoint?: TreasuryChainCheckpoint
    now?: number
    signal?: AbortSignal
  }>,
  dependencies: Readonly<{ rpc?: TreasuryRpc; targets?: readonly URL[] }> = {},
): Promise<TreasuryChainObservation | Unavailable> {
  const profile = x402PaymentProfileForEnvironment(input.environment)
  const targets = dependencies.targets ?? (profile === undefined ? []
    : configuredX402RpcUrls(profile.network, input.environment))
  const now = input.now ?? Date.now()
  if (profile === undefined || !ADDRESS.test(input.address)
    || !Number.isSafeInteger(now) || now < 0
    || targets.length < (input.environment === 'production' ? 2 : 1) || targets.length > 2
    || targets.some(target => target.protocol !== 'https:' || target.username !== '' || target.password !== '')
    || new Set(targets.map(target => target.hostname.toLowerCase().replace(/\.$/u, ''))).size !== targets.length
    || (input.checkpoint !== undefined && (!DECIMAL.test(input.checkpoint.blockNumber)
      || !HASH.test(input.checkpoint.blockHash) || !safeUnits(input.checkpoint.balanceUnits)))) {
    return unavailable('treasury_chain_configuration_invalid')
  }
  const dispatcher = dependencies.rpc === undefined
    ? new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } }) : undefined
  const rpc: TreasuryRpc = dependencies.rpc ?? (async (target, method, params) => {
    if (dispatcher === undefined) throw new Error('treasury_rpc_target_invalid')
    // The same deadline covers DNS preflight, connection and body. Keep the
    // preflight: native sockets can bypass the guarded lookup for IP literals.
    const signal = input.signal === undefined ? AbortSignal.timeout(5_000) : AbortSignal.any([input.signal, AbortSignal.timeout(5_000)])
    signal.throwIfAborted()
    let onAbort = () => {}
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      if (!await Promise.race([isPublicHttpTarget(target, defaultDnsResolver), aborted])) {
        throw new Error('treasury_rpc_target_invalid')
      }
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
    // A DNS response arriving after expiry must never initiate HTTP.
    signal.throwIfAborted()
    const response = await guardedFetch(target, {
      method: 'POST', dispatcher, redirect: 'error',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal,
    })
    if (!response.ok) throw new Error('treasury_rpc_unavailable')
    const bounded = await readBoundedRequestText(response, 256 * 1024, signal)
    if (!bounded.ok) throw new Error('treasury_rpc_response_too_large')
    const value: unknown = JSON.parse(bounded.text)
    if (!isRecord(value) || value.jsonrpc !== '2.0' || value.id !== 1
      || 'error' in value || !isBoundedJsonValue(value.result)) throw new Error('treasury_rpc_response_invalid')
    return value.result
  })
  try {
    const heads = await Promise.all(targets.map(async target => {
      const [chainId, rawBlock] = await Promise.all([
        rpc(target, 'eth_chainId', []), rpc(target, 'eth_getBlockByNumber', ['finalized', false]),
      ])
      if (typeof chainId !== 'string' || !QUANTITY.test(chainId)
        || BigInt(chainId) !== BigInt(profile.network.split(':')[1] ?? '0')) return undefined
      return parseBlock(rawBlock, now)
    }))
    if (heads.some(head => head === undefined)) return unavailable('treasury_finalized_head_unavailable')
    const validHeads = heads.filter((head): head is Block => head !== undefined)
    const finalized = validHeads.reduce((lowest, head) => head.number < lowest ? head.number : lowest,
      validHeads[0]?.number ?? 0n)
    const previous = input.checkpoint
    if (previous !== undefined && finalized < BigInt(previous.blockNumber)) {
      return unavailable('treasury_finalized_head_regressed')
    }
    const last = previous === undefined ? finalized
      : minimum(finalized, BigInt(previous.blockNumber) + TREASURY_CHAIN_RANGE_BLOCKS)
    const from = previous === undefined ? last : BigInt(previous.blockNumber) + 1n
    const observations = await Promise.all(targets.map(async target => {
      const block = parseBlock(await rpc(target, 'eth_getBlockByNumber', [hex(last), false]), now, false)
      if (block === undefined || block.number !== last) return undefined
      if (previous !== undefined) {
        const old = parseBlock(await rpc(target, 'eth_getBlockByNumber', [hex(BigInt(previous.blockNumber)), false]), now, false)
        if (old === undefined || old.number !== BigInt(previous.blockNumber)
          || old.hash !== previous.blockHash.toLowerCase()) return undefined
      }
      const address = input.address.toLowerCase()
      const addressTopic = `0x${address.slice(2).padStart(64, '0')}`
      const rawBalance = await rpc(target, 'eth_call', [{
        to: profile.asset,
        data: encodeFunctionData({ abi: erc20Abi, functionName: 'balanceOf', args: [address as Address] }),
      }, { blockHash: block.hash, requireCanonical: true }])
      if (typeof rawBalance !== 'string' || !HASH.test(rawBalance)) return undefined
      const balanceUnits = BigInt(rawBalance).toString()
      if (!safeUnits(balanceUnits)) return undefined
      const rawLogs = previous === undefined || from > last ? [[], []] : await Promise.all([
        rpc(target, 'eth_getLogs', [{ address: profile.asset, fromBlock: hex(from), toBlock: hex(last),
          topics: [TRANSFER_TOPIC, null, addressTopic] }]),
        rpc(target, 'eth_getLogs', [{ address: profile.asset, fromBlock: hex(from), toBlock: hex(last),
          topics: [TRANSFER_TOPIC, addressTopic] }]),
      ])
      if (rawLogs.some(logs => !Array.isArray(logs) || logs.length > TREASURY_CHAIN_TRANSFER_LIMIT)) return undefined
      const transfers = new Map<string, TreasuryTransfer>()
      for (const raw of rawLogs.flat()) {
        const transfer = parseTransfer(raw, { network: profile.network, asset: profile.asset, address, from, last })
        if (transfer === undefined) return undefined
        const key = `${transfer.transactionHash}:${transfer.logIndex}`
        const existing = transfers.get(key)
        if (existing !== undefined && canonicalDigest(existing) !== canonicalDigest(transfer)) return undefined
        transfers.set(key, transfer)
      }
      if (transfers.size > TREASURY_CHAIN_TRANSFER_LIMIT) return undefined
      // A matching range-end balance does not establish a log's provenance.
      // Verify each distinct event block against the same canonical chain.
      const eventBlocks = [...new Set([...transfers.values()].map(transfer => transfer.blockNumber))]
      const canonicalHashes = new Map<string, string>([[last.toString(), block.hash]])
      for (let offset = 0; offset < eventBlocks.length; offset += 8) {
        const blocks = await Promise.all(eventBlocks.slice(offset, offset + 8).map(async number => {
          if (number === last.toString()) return { number, hash: block.hash }
          const canonical = parseBlock(await rpc(target, 'eth_getBlockByNumber', [hex(BigInt(number)), false]), now, false)
          return canonical?.number === BigInt(number) ? { number, hash: canonical.hash } : undefined
        }))
        if (blocks.some(value => value === undefined)) return undefined
        for (const value of blocks) if (value !== undefined) canonicalHashes.set(value.number, value.hash)
      }
      if ([...transfers.values()].some(transfer => canonicalHashes.get(transfer.blockNumber) !== transfer.blockHash)) return undefined
      const ordered = [...transfers.values()].sort((a, b) => BigInt(a.blockNumber) < BigInt(b.blockNumber) ? -1
        : BigInt(a.blockNumber) > BigInt(b.blockNumber) ? 1 : a.logIndex - b.logIndex)
      if (previous !== undefined) {
        const expectedBalance = ordered.reduce((balance, transfer) => balance
          + (transfer.recipient === address ? BigInt(transfer.amountUnits) : 0n)
          - (transfer.payer === address ? BigInt(transfer.amountUnits) : 0n), BigInt(previous.balanceUnits))
        if (expectedBalance !== BigInt(balanceUnits)) return undefined
      }
      // Re-read the end block after logs to reject a changed canonical view.
      const after = parseBlock(await rpc(target, 'eth_getBlockByNumber', [hex(last), false]), now, false)
      if (after?.hash !== block.hash) return undefined
      return { checkpoint: { blockNumber: last.toString(), blockHash: block.hash, balanceUnits },
        blockTimestamp: block.timestamp, transfers: ordered }
    }))
    const first = observations[0]
    if (first === undefined || observations.some(observation => observation === undefined
      || canonicalDigest(observation) !== canonicalDigest(first))) {
      return unavailable('treasury_chain_evidence_conflict')
    }
    return { kind: 'observed', environment: input.environment, network: profile.network,
      asset: profile.asset.toLowerCase(), address: input.address.toLowerCase(), fromBlock: from.toString(),
      ...first, caughtUp: last === finalized, observedAt: now }
  } catch {
    return unavailable('treasury_chain_unavailable')
  } finally {
    if (dispatcher !== undefined) await dispatcher.destroy()
  }
}

function parseBlock(value: unknown, now: number, requireFresh = true): Block | undefined {
  if (!isRecord(value) || typeof value.number !== 'string' || !QUANTITY.test(value.number)
    || typeof value.hash !== 'string' || !HASH.test(value.hash)
    || typeof value.timestamp !== 'string' || !QUANTITY.test(value.timestamp)) return undefined
  const timestamp = Number(BigInt(value.timestamp) * 1_000n)
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > now + 30_000
    || (requireFresh && now - timestamp >= TREASURY_FINALIZED_BLOCK_MAX_AGE_MS)) return undefined
  return { number: BigInt(value.number), hash: value.hash.toLowerCase(), timestamp }
}

function parseTransfer(value: unknown, scope: Readonly<{
  network: string; asset: string; address: string; from: bigint; last: bigint
}>): TreasuryTransfer | undefined {
  if (!isRecord(value) || value.removed !== false
    || typeof value.address !== 'string' || value.address.toLowerCase() !== scope.asset.toLowerCase()
    || typeof value.transactionHash !== 'string' || !HASH.test(value.transactionHash)
    || typeof value.blockHash !== 'string' || !HASH.test(value.blockHash)
    || typeof value.blockNumber !== 'string' || !QUANTITY.test(value.blockNumber)
    || typeof value.logIndex !== 'string' || !QUANTITY.test(value.logIndex)
    || typeof value.data !== 'string' || !HASH.test(value.data)
    || !Array.isArray(value.topics) || value.topics.length !== 3
    || value.topics[0] !== TRANSFER_TOPIC
    || value.topics.slice(1).some(topic => typeof topic !== 'string'
      || !/^0x0{24}[0-9a-fA-F]{40}$/u.test(topic))) return undefined
  const blockNumber = BigInt(value.blockNumber)
  const logIndex = Number(BigInt(value.logIndex))
  const payer = `0x${String(value.topics[1]).slice(-40)}`.toLowerCase()
  const recipient = `0x${String(value.topics[2]).slice(-40)}`.toLowerCase()
  const amountUnits = BigInt(value.data).toString()
  if (blockNumber < scope.from || blockNumber > scope.last || !Number.isSafeInteger(logIndex) || logIndex < 0
    || !safeUnits(amountUnits) || (payer !== scope.address && recipient !== scope.address)) return undefined
  const transfer = { transactionHash: value.transactionHash.toLowerCase(), logIndex,
    blockNumber: blockNumber.toString(), blockHash: value.blockHash.toLowerCase(), payer, recipient, amountUnits }
  return { ...transfer, evidenceDigest: canonicalDigest({ kind: 'ae.treasury-transfer:v1',
    network: scope.network, asset: scope.asset.toLowerCase(), ...transfer }) }
}

function safeUnits(value: string): boolean {
  return DECIMAL.test(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER)
}
function hex(value: bigint): string { return `0x${value.toString(16)}` }
function minimum(a: bigint, b: bigint): bigint { return a < b ? a : b }
function unavailable(code: string): Unavailable { return { kind: 'unavailable', code } }
