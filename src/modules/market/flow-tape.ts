import { BASE_FACILITATOR_ADDRESSES, BASE_FACILITATOR_SET } from '@/modules/market/base-facilitator-set'

export const FLOW_WINDOW_DAYS = 30
export const FLOW_SQL_ROW_CAP = 50_000
export const BASE_USDC_ASSET = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
export const BASE_CHAIN = 'eip155:8453' as const
const USDC_SCALE = 1_000_000n
const RANK_SPAN = 10n ** 78n
const DAY = /^\d{4}-\d{2}-\d{2}$/u
const ADDRESS = /^0x[a-f0-9]{40}$/u
const ATOMIC = /^(0|[1-9][0-9]*)$/u

export type FlowSqlRow = Readonly<{
  recipient: string
  facilitator: string
  amountAtomic: string
  transferCount: number
  uniqueBuyers: number
  latestAt: number
  day: string
}>

export type FlowDayPrint = Readonly<{
  recipient: string
  facilitator: string
  day: string
  amountAtomic: string
  transferCount: number
  uniqueBuyers: number
}>

export type RecipientRollup = Readonly<{
  recipient: string
  amountAtomic: string
  transferCount: number
  uniqueBuyers: number
  toolCount: number
}>

export type FlowRecipientTotals = Readonly<{
  amountAtomic: string
  transferCount: number
  uniqueBuyers: number
}>

export type MarketFlowRecipientView = Readonly<{
  recipient: string
  amountLabel: string
  transferCountLabel: string
  uniqueBuyersLabel: string
  toolCountLabel: string
}>

export type MarketFlowView = Readonly<{
  ready: boolean
  facilitatorSetDigest: string
  recipients: readonly MarketFlowRecipientView[]
  volumeByPayTo: Readonly<Record<string, string>>
}>

export type MarketFlowRankFacts = Readonly<{
  ready: boolean
  facilitatorSetDigest: string
  recipients: readonly Readonly<{
    recipient: string
    amountAtomic: string
    transferCount: number
    uniqueBuyers: number
    toolCount: number
    toolCountCapped: boolean
  }>[]
  volumes: readonly Readonly<{ payTo: string; amountAtomic: string }>[]
}>

export function shiftUtcDay(day: string, delta: number): string {
  if (!DAY.test(day) || !Number.isSafeInteger(delta)) throw new Error('day_invalid')
  const [year, month, date] = day.split('-').map(Number)
  if (year === undefined || month === undefined || date === undefined) throw new Error('day_invalid')
  const utc = Date.UTC(year, month - 1, date)
  if (new Date(utc).toISOString().slice(0, 10) !== day) throw new Error('day_invalid')
  return new Date(utc + delta * 86_400_000).toISOString().slice(0, 10)
}

export function windowNeedsExpiry(windowStart: string | undefined, day: string): boolean {
  return windowStart !== undefined && inclusiveDayCount(windowStart, day) > 30
}

export function chunkRows<T>(rows: readonly T[], size = 40): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size))
  return chunks
}

export function inclusiveDayCount(start: string, end: string): number {
  const span = Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)
  return Math.round(span / 86_400_000) + 1
}

/** Closed UTC days still missing, oldest first, at most one 30-day window. */
export function daysToIngest(lastClosedDay: string | undefined, nowMs: number): string[] {
  const today = new Date(nowMs).toISOString().slice(0, 10)
  const yesterday = shiftUtcDay(today, -1)
  const start = lastClosedDay === undefined ? shiftUtcDay(yesterday, -(FLOW_WINDOW_DAYS - 1)) : shiftUtcDay(lastClosedDay, 1)
  const days: string[] = []
  let cursor = start
  while (cursor <= yesterday && days.length < FLOW_WINDOW_DAYS) {
    days.push(cursor)
    cursor = shiftUtcDay(cursor, 1)
  }
  return days
}

function sqlString(value: string): string {
  if (!/^[-0-9a-zA-Z: ]+$/u.test(value)) throw new Error('sql_literal_rejected')
  return `'${value}'`
}

const PAYEE_LOOKUP_CAP = 48

/** Closed 30-day window ending at the start of the current UTC day. */
export function flowPayeeWindow(nowMs: number): Readonly<{ start: string; end: string }> {
  const today = new Date(nowMs).toISOString().slice(0, 10)
  const yesterday = shiftUtcDay(today, -1)
  return { start: shiftUtcDay(yesterday, -(FLOW_WINDOW_DAYS - 1)), end: today }
}

/**
 * One grouped query for the listed Base payees across the closed 30-day window.
 * The page asks for the tools it is showing, not every recipient in the catalogue.
 */
export function buildFlowPayeeWindowSql(payTos: readonly string[], nowMs: number): string {
  const addresses = [...new Set(payTos.map(address => address.toLowerCase()))]
  if (addresses.length === 0 || addresses.length > PAYEE_LOOKUP_CAP) throw new Error('payee_set_invalid')
  for (const address of addresses) if (!ADDRESS.test(address)) throw new Error('payee_not_address')
  const { start, end } = flowPayeeWindow(nowMs)
  const facilitators = [...BASE_FACILITATOR_ADDRESSES].map(address => sqlString(address)).join(', ')
  const recipients = addresses.map(address => sqlString(address)).join(', ')
  return [
    'SELECT',
    "  lower(toString(parameters['to'])) AS recipient,",
    "  toString(sum(CAST(toString(parameters['value']) AS UInt256))) AS amount_atomic",
    'FROM base.events',
    "WHERE event_signature = 'Transfer(address,address,uint256)'",
    `  AND lower(address) = ${sqlString(BASE_USDC_ASSET)}`,
    `  AND action = ${sqlString('added')}`,
    `  AND block_timestamp >= toDateTime(${sqlString(`${start} 00:00:00`)}, ${sqlString('UTC')})`,
    `  AND block_timestamp < toDateTime(${sqlString(`${end} 00:00:00`)}, ${sqlString('UTC')})`,
    `  AND lower(transaction_from) IN (${facilitators})`,
    `  AND lower(toString(parameters['to'])) IN (${recipients})`,
    'GROUP BY recipient',
  ].join('\n')
}

export function parseFlowPayeeWindow(
  result: unknown,
  requested: ReadonlySet<string>,
): { ok: true; rows: ReadonlyArray<{ recipient: string; amountAtomic: string }> } | { ok: false; reason: string } {
  if (!Array.isArray(result)) return { ok: false, reason: 'result_not_array' }
  if (result.length >= FLOW_SQL_ROW_CAP) return { ok: false, reason: 'result_truncated' }
  const rows: Array<{ recipient: string; amountAtomic: string }> = []
  const seen = new Set<string>()
  for (const raw of result) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, reason: 'row_not_object' }
    const record = raw as Record<string, unknown>
    const recipient = String(record.recipient ?? '').toLowerCase()
    if (!ADDRESS.test(recipient) || !requested.has(recipient)) return { ok: false, reason: 'recipient_not_requested' }
    const amountAtomic = String(record.amount_atomic ?? '')
    if (!ATOMIC.test(amountAtomic)) return { ok: false, reason: 'amount_not_integer' }
    if (seen.has(recipient)) return { ok: false, reason: 'duplicate_group' }
    seen.add(recipient)
    rows.push({ recipient, amountAtomic })
  }
  return { ok: true, rows }
}

/** One grouped Base USDC transfer query for a single closed UTC day. */
export function buildFlowDaySql(day: string): string {
  const next = shiftUtcDay(day, 1)
  const facilitators = [...BASE_FACILITATOR_ADDRESSES].map(address => sqlString(address)).join(', ')
  return [
    'SELECT',
    "  lower(toString(parameters['to'])) AS recipient,",
    '  lower(transaction_from) AS facilitator,',
    "  toString(sum(CAST(toString(parameters['value']) AS UInt256))) AS amount_atomic,",
    '  count() AS transfer_count,',
    "  uniqExact(lower(toString(parameters['from']))) AS unique_buyers,",
    '  toUnixTimestamp(max(block_timestamp)) AS latest_at,',
    '  toString(toDate(min(block_timestamp))) AS day',
    'FROM base.events',
    "WHERE event_signature = 'Transfer(address,address,uint256)'",
    `  AND lower(address) = ${sqlString(BASE_USDC_ASSET)}`,
    `  AND action = ${sqlString('added')}`,
    `  AND block_timestamp >= toDateTime(${sqlString(`${day} 00:00:00`)}, ${sqlString('UTC')})`,
    `  AND block_timestamp < toDateTime(${sqlString(`${next} 00:00:00`)}, ${sqlString('UTC')})`,
    `  AND lower(transaction_from) IN (${facilitators})`,
    'GROUP BY recipient, facilitator',
  ].join('\n')
}

function integerField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value
  if (typeof value === 'string' && ATOMIC.test(value)) {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed)) return parsed
  }
  return undefined
}

export function parseFlowSqlResult(
  result: unknown,
  requestedDay: string,
): { ok: true; rows: FlowSqlRow[] } | { ok: false; reason: string } {
  if (!Array.isArray(result)) return { ok: false, reason: 'result_not_array' }
  if (result.length >= FLOW_SQL_ROW_CAP) return { ok: false, reason: 'result_truncated' }
  const rows: FlowSqlRow[] = []
  const seen = new Set<string>()
  for (const raw of result) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, reason: 'row_not_object' }
    const record = raw as Record<string, unknown>
    const recipient = String(record.recipient ?? '').toLowerCase()
    if (!ADDRESS.test(recipient)) return { ok: false, reason: 'recipient_not_address' }
    const facilitator = String(record.facilitator ?? '').toLowerCase()
    if (!BASE_FACILITATOR_SET.has(facilitator)) return { ok: false, reason: 'facilitator_not_in_set' }
    const amountAtomic = String(record.amount_atomic ?? '')
    if (!ATOMIC.test(amountAtomic)) return { ok: false, reason: 'amount_not_integer' }
    const day = String(record.day ?? '')
    if (day !== requestedDay) return { ok: false, reason: 'day_mismatch' }
    const transferCount = integerField(record.transfer_count)
    const uniqueBuyers = integerField(record.unique_buyers)
    const latestAt = integerField(record.latest_at)
    if (transferCount === undefined) return { ok: false, reason: 'transfer_count_invalid' }
    if (uniqueBuyers === undefined) return { ok: false, reason: 'unique_buyers_invalid' }
    if (latestAt === undefined) return { ok: false, reason: 'latest_at_invalid' }
    const key = `${recipient}:${facilitator}`
    if (seen.has(key)) return { ok: false, reason: 'duplicate_group' }
    seen.add(key)
    rows.push({ recipient, facilitator, amountAtomic, transferCount, uniqueBuyers, latestAt, day })
  }
  return { ok: true, rows }
}

/**
 * Sum a recipient across facilitators and days.
 * uniqueBuyers is summed per facilitator-day, so a buyer who used two facilitators is counted twice.
 * toolCount is attached afterwards: two Tools that pay one address do not add the amount twice.
 */
export function rollupRecipientFlow(
  rows: readonly FlowDayPrint[],
  toolCounts: ReadonlyMap<string, number> = new Map(),
): RecipientRollup[] {
  const byRecipient = new Map<string, { amount: bigint; transfers: number; buyers: number }>()
  for (const row of rows) {
    if (!ATOMIC.test(row.amountAtomic)) throw new Error('amount_not_integer')
    const current = byRecipient.get(row.recipient) ?? { amount: 0n, transfers: 0, buyers: 0 }
    current.amount += BigInt(row.amountAtomic)
    current.transfers += row.transferCount
    current.buyers += row.uniqueBuyers
    byRecipient.set(row.recipient, current)
  }
  return [...byRecipient.entries()]
    .map(([recipient, totals]) => ({
      recipient,
      amountAtomic: totals.amount.toString(),
      transferCount: totals.transfers,
      uniqueBuyers: totals.buyers,
      toolCount: toolCounts.get(recipient) ?? 0,
    }))
    .sort((left, right) => {
      const amount = BigInt(right.amountAtomic) - BigInt(left.amountAtomic)
      if (amount > 0n) return 1
      if (amount < 0n) return -1
      return left.recipient.localeCompare(right.recipient)
    })
}

export function nextRecipientTotals(
  current: FlowRecipientTotals | undefined,
  delta: FlowRecipientTotals,
  direction: 'add' | 'subtract',
): FlowRecipientTotals | 'delete' | 'invalid' {
  if (!ATOMIC.test(delta.amountAtomic)) return 'invalid'
  const sign = direction === 'add' ? 1n : -1n
  const amount = (current === undefined ? 0n : BigInt(current.amountAtomic)) + sign * BigInt(delta.amountAtomic)
  const transferCount = (current?.transferCount ?? 0) + (direction === 'add' ? delta.transferCount : -delta.transferCount)
  const uniqueBuyers = (current?.uniqueBuyers ?? 0) + (direction === 'add' ? delta.uniqueBuyers : -delta.uniqueBuyers)
  if (amount < 0n || transferCount < 0 || uniqueBuyers < 0) return 'invalid'
  if (amount === 0n && transferCount === 0 && uniqueBuyers === 0) return 'delete'
  return { amountAtomic: amount.toString(), transferCount, uniqueBuyers }
}

export function flowRankKey(amountAtomic: string): string {
  if (!ATOMIC.test(amountAtomic)) throw new Error('amount_not_integer')
  const amount = BigInt(amountAtomic)
  if (amount >= RANK_SPAN) throw new Error('flow_amount_out_of_range')
  return (RANK_SPAN - 1n - amount).toString().padStart(78, '0')
}

function groupWhole(whole: bigint): string {
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function formatUsdcAtomic(amountAtomic: string): string | undefined {
  if (!ATOMIC.test(amountAtomic)) return undefined
  const value = BigInt(amountAtomic)
  const whole = value / USDC_SCALE
  const fraction = (value % USDC_SCALE).toString().padStart(6, '0').replace(/0+$/u, '')
  const grouped = groupWhole(whole)
  return fraction.length === 0 ? `${grouped} USDC` : `${grouped}.${fraction} USDC`
}

export function countLabel(value: number): string {
  return value.toLocaleString('en-AU')
}

export function toolCountLabel(count: number, capped: boolean): string {
  const shown = count.toLocaleString('en-AU')
  if (capped) return `${shown}+ Tools`
  return count === 1 ? '1 Tool' : `${shown} Tools`
}

export function projectMarketFlowView(facts: MarketFlowRankFacts): MarketFlowView {
  const volumeByPayTo: Record<string, string> = {}
  for (const volume of facts.volumes) {
    const label = formatUsdcAtomic(volume.amountAtomic)
    if (label !== undefined) volumeByPayTo[volume.payTo] = label
  }
  return {
    ready: facts.ready,
    facilitatorSetDigest: facts.facilitatorSetDigest,
    volumeByPayTo,
    recipients: facts.recipients.flatMap(recipient => {
      const amountLabel = formatUsdcAtomic(recipient.amountAtomic)
      if (amountLabel === undefined) return []
      return [{
        recipient: recipient.recipient,
        amountLabel,
        transferCountLabel: countLabel(recipient.transferCount),
        uniqueBuyersLabel: countLabel(recipient.uniqueBuyers),
        toolCountLabel: toolCountLabel(recipient.toolCount, recipient.toolCountCapped),
      }]
    }),
  }
}
