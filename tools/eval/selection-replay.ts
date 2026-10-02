import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import type {
  SelectionDecisionKind,
  SelectionDecisionRecord,
} from '../../src/modules/capability-execution/selection-decision-recorder'

type ReplayOptions = Readonly<{
  kind: SelectionDecisionKind
  limit: number
}>

type RankedOffer = SelectionDecisionRecord['offered'][number]

const KINDS: readonly SelectionDecisionKind[] = ['procure', 'registry_rerank', 'directory_rerank', 'chat_recommend']
const TIERS: readonly SelectionDecisionRecord['tier'][] = [
  'jev_system_one',
  'secondary_llm_adapter',
  'deterministic_rule_engine',
  'safe_refusal',
]
const NOUL_BUCKETS = [
  { label: '0.0-0.2', min: 0, max: 0.2, count: 0, topZero: 0 },
  { label: '0.2-0.4', min: 0.2, max: 0.4, count: 0, topZero: 0 },
  { label: '0.4-0.6', min: 0.4, max: 0.6, count: 0, topZero: 0 },
  { label: '0.6-0.8', min: 0.6, max: 0.8, count: 0, topZero: 0 },
  { label: '0.8-1.0', min: 0.8, max: 1, count: 0, topZero: 0 },
]

function parseOptions(argv: readonly string[]): ReplayOptions {
  let kind: SelectionDecisionKind = 'procure'
  let limit = 200
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? ''
    const [name, inlineValue] = argument.startsWith('--') && argument.includes('=')
      ? [argument.slice(0, argument.indexOf('=')), argument.slice(argument.indexOf('=') + 1)]
      : [argument, undefined]
    const readValue = () => {
      if (inlineValue !== undefined) return inlineValue
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`)
      index += 1
      return value
    }

    if (name === '--kind') {
      const value = readValue()
      if (!KINDS.includes(value as SelectionDecisionKind)) {
        throw new Error(`--kind must be one of: ${KINDS.join(', ')}`)
      }
      kind = value as SelectionDecisionKind
    } else if (name === '--limit') {
      const value = Number(readValue())
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('--limit must be a positive integer')
      limit = value
    } else {
      throw new Error(`unknown option ${name}. Usage: npx tsx tools/eval/selection-replay.ts [--kind procure] [--limit 200]`)
    }
  }
  return { kind, limit }
}

function readDecisions(options: ReplayOptions): SelectionDecisionRecord[] {
  let output: string
  try {
    output = execFileSync(
      'npx',
      [
        'convex',
        'run',
        'capabilitySelectionDecisions:recent',
        '--json',
        JSON.stringify({ kind: options.kind, limit: options.limit }),
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`could not read selection decisions: ${detail}`, { cause: error })
  }

  let value: unknown
  try {
    value = JSON.parse(output)
  } catch (error) {
    throw new Error('capabilitySelectionDecisions:recent returned invalid JSON', { cause: error })
  }
  if (!Array.isArray(value)) throw new Error('capabilitySelectionDecisions:recent must return an array of decision rows')
  return value.map((row, index) => validateDecision(row, index))
}

function validateDecision(value: unknown, index: number): SelectionDecisionRecord {
  if (typeof value !== 'object' || value === null) throw new Error(`decision row ${index} is not an object`)
  const row = value as Partial<SelectionDecisionRecord>
  if (
    typeof row.kind !== 'string'
    || !KINDS.includes(row.kind as SelectionDecisionKind)
    || typeof row.correlationId !== 'string'
    || !Array.isArray(row.offered)
    || !(row.pickedToolRef === undefined || row.pickedToolRef === null || typeof row.pickedToolRef === 'string')
    || !TIERS.includes(row.tier as SelectionDecisionRecord['tier'])
    || !(row.modelConfidence === undefined || row.modelConfidence === null || (typeof row.modelConfidence === 'number' && Number.isFinite(row.modelConfidence)))
    || !Array.isArray(row.fit)
    || typeof row.latencyMs !== 'number'
    || !Number.isFinite(row.latencyMs)
    || !(row.costAud === undefined || row.costAud === null || (typeof row.costAud === 'number' && Number.isFinite(row.costAud)))
    || !(row.shown === undefined || typeof row.shown === 'boolean')
    || !(row.ranToolRef === undefined || typeof row.ranToolRef === 'string')
    || !(row.ranAt === undefined || (typeof row.ranAt === 'number' && Number.isFinite(row.ranAt)))
  ) throw new Error(`decision row ${index} does not match the selection record contract`)

  for (const offer of row.offered) {
    if (
      typeof offer !== 'object'
      || offer === null
      || typeof offer.toolRef !== 'string'
      || !Number.isSafeInteger(offer.rank)
      || offer.rank < 0
      || typeof offer.score !== 'number'
      || !Number.isFinite(offer.score)
    ) throw new Error(`decision row ${index} contains an invalid offered rank`)
  }
  for (const measurement of row.fit) {
    if (
      typeof measurement !== 'object'
      || measurement === null
      || typeof measurement.toolRef !== 'string'
      || !(measurement.noul === undefined || measurement.noul === null || (typeof measurement.noul === 'number' && Number.isFinite(measurement.noul)))
      || !(measurement.score === undefined || measurement.score === null || (typeof measurement.score === 'number' && Number.isFinite(measurement.score)))
    ) throw new Error(`decision row ${index} contains an invalid fit measurement`)
  }
  return {
    ...row,
    pickedToolRef: row.pickedToolRef ?? null,
    modelConfidence: row.modelConfidence ?? null,
    costAud: row.costAud ?? null,
    fit: row.fit.map((measurement) => ({
      toolRef: measurement.toolRef,
      noul: measurement.noul ?? null,
      score: measurement.score ?? null,
    })),
  } as SelectionDecisionRecord
}


function getRankedOffers(record: SelectionDecisionRecord): readonly RankedOffer[] {
  const ranked = [...record.offered].sort((left, right) => left.rank - right.rank)
  const rankZero = ranked.find((offer) => offer.rank === 0)
  if (rankZero === undefined) throw new Error(`decision ${record.correlationId} has no deterministic rank-0 offer`)
  if (new Set(ranked.map((offer) => offer.rank)).size !== ranked.length) {
    throw new Error(`decision ${record.correlationId} contains duplicate offer ranks`)
  }
  if (ranked.some((offer) => offer.score > rankZero.score)) {
    throw new Error(`decision ${record.correlationId} rank 0 is not the highest-scoring offer`)
  }
  return ranked
}

function formatPercent(value: number, total: number): string {
  return `${(value / total * 100).toFixed(1)}%`
}

function quantile90(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * 0.9) - 1] ?? 0
}

function run(argv: readonly string[]): void {
  const options = parseOptions(argv)
  const rows = readDecisions(options)
  if (rows.length === 0) throw new Error('no selection decision rows returned; the harness has no data yet')
  if (options.kind === 'chat_recommend') {
    const shown = rows.filter((row) => row.kind === 'chat_recommend' && row.shown === true)
    if (shown.length === 0) {
      throw new Error('no chat_recommend decisions shown; the harness has no eligible data yet')
    }
    const ran = shown.filter((row) => row.ranToolRef !== undefined)
    const accepted = ran.filter((row) => row.ranToolRef === row.pickedToolRef).length
    const meanLatency = shown.reduce((sum, row) => sum + row.latencyMs, 0) / shown.length
    process.stdout.write('Selection replay (chat_recommend)\n')
    process.stdout.write('Metric             Result\n')
    process.stdout.write(`shown              ${shown.length}\n`)
    process.stdout.write(`ran                ${ran.length}\n`)
    process.stdout.write(`accepted           ${accepted}\n`)
    process.stdout.write(`overridden         ${ran.length - accepted}\n`)
    process.stdout.write(`acceptance         ${ran.length === 0 ? 'n/a' : `${accepted}/${ran.length} (${formatPercent(accepted, ran.length)})`}\n`)
    process.stdout.write(`mean latency (ms)  ${meanLatency.toFixed(1)}\n`)
    return
  }


  const decisions = rows.filter((row) => row.kind === options.kind && row.pickedToolRef !== null)
  if (decisions.length === 0) {
    throw new Error(`no ${options.kind} decisions with a picked tool; the harness has no eligible data yet`)
  }

  let agreements = 0
  let topThree = 0
  let nonUniqueTopPick = 0
  let missingNoul = 0
  const regrets: number[] = []
  const tierStats: Record<SelectionDecisionRecord['tier'], { count: number; latency: number }> = {
    jev_system_one: { count: 0, latency: 0 },
    secondary_llm_adapter: { count: 0, latency: 0 },
    deterministic_rule_engine: { count: 0, latency: 0 },
    safe_refusal: { count: 0, latency: 0 },
  }

  for (const decision of decisions) {
    const ranked = getRankedOffers(decision)
    const rankZero = ranked.find((offer) => offer.rank === 0)
    if (rankZero === undefined) throw new Error(`decision ${decision.correlationId} has no rank-0 offer`)
    const picked = ranked.find((offer) => offer.toolRef === decision.pickedToolRef)
    if (picked === undefined) throw new Error(`decision ${decision.correlationId} picked a tool that was not offered`)

    if (picked.toolRef === rankZero.toolRef) agreements += 1
    if (ranked.slice(0, 3).some((offer) => offer.toolRef === picked.toolRef)) topThree += 1
    const topScoreOffers = ranked.filter((offer) => offer.score === rankZero.score)
    if (topScoreOffers.length !== 1 || picked.toolRef !== rankZero.toolRef) nonUniqueTopPick += 1
    regrets.push(rankZero.score - picked.score)

    const tierStat = tierStats[decision.tier]
    tierStat.count += 1
    tierStat.latency += decision.latencyMs

    const noul = decision.fit.find((measurement) => measurement.toolRef === picked.toolRef)?.noul ?? null
    if (noul === null) {
      missingNoul += 1
      continue
    }
    if (!Number.isFinite(noul) || noul < 0 || noul > 1) {
      throw new Error(`decision ${decision.correlationId} has picked-tool noul outside 0.0-1.0`)
    }
    const bucket = NOUL_BUCKETS.find((candidate) =>
      noul >= candidate.min && (noul < candidate.max || (candidate.max === 1 && noul <= 1)),
    )
    if (bucket === undefined) throw new Error(`decision ${decision.correlationId} has unbucketed picked-tool noul`)
    bucket.count += 1
    if (picked.toolRef === rankZero.toolRef) bucket.topZero += 1
  }

  const meanRegret = regrets.reduce((sum, value) => sum + value, 0) / regrets.length
  process.stdout.write(`Selection replay (${options.kind}; ${decisions.length} decisions)\n`)
  process.stdout.write('Metric                         Result\n')
  process.stdout.write(`Agreement (model = rank 0)     ${agreements}/${decisions.length} (${formatPercent(agreements, decisions.length)})\n`)
  process.stdout.write(`Top-3 recall                   ${topThree}/${decisions.length} (${formatPercent(topThree, decisions.length)})\n`)
  process.stdout.write(`Regret (rank-0 score - pick)   mean ${meanRegret.toFixed(4)}; p90 ${quantile90(regrets).toFixed(4)}\n`)
  process.stdout.write(`Tie rate (pick not unique)   ${nonUniqueTopPick}/${decisions.length} (${formatPercent(nonUniqueTopPick, decisions.length)})\n`)
  process.stdout.write('\nNoul bucket   Decisions   Deterministic top-0\n')
  for (const bucket of NOUL_BUCKETS) {
    const hitRate = bucket.count === 0 ? 'n/a' : formatPercent(bucket.topZero, bucket.count)
    process.stdout.write(`${bucket.label.padEnd(13)} ${String(bucket.count).padEnd(11)} ${bucket.topZero}/${bucket.count} (${hitRate})\n`)
  }
  process.stdout.write(`missing/null  ${missingNoul} (not bucketed)\n`)
  process.stdout.write('\nTier                       Decisions   Mean latency (ms)\n')
  for (const tier of TIERS) {
    const stats = tierStats[tier]
    const meanLatency = stats.count === 0 ? 'n/a' : (stats.latency / stats.count).toFixed(1)
    process.stdout.write(`${tier.padEnd(27)} ${String(stats.count).padEnd(11)} ${meanLatency}\n`)
  }

  process.stdout.write(`Verdict — agreement: ${formatPercent(agreements, decisions.length)} matched deterministic rank-0.\n`)
  process.stdout.write(`Verdict — top-3: ${formatPercent(topThree, decisions.length)} of model picks were in the deterministic top three.\n`)
  process.stdout.write(`Verdict — regret: mean ${meanRegret.toFixed(4)}, p90 ${quantile90(regrets).toFixed(4)} score points.\n`)
  process.stdout.write(`Verdict — ties: ${formatPercent(nonUniqueTopPick, decisions.length)} of picks were not the unique rank-0 offer by score.\n`)
  process.stdout.write(`Verdict — noul: bucket hit rates show model-picked noul against deterministic rank-0; ${missingNoul} picks lacked noul.\n`)
  const tierLatencyVerdict = TIERS
    .map((tier) => {
      const stats = tierStats[tier]
      return stats.count === 0 ? `${tier}=n/a` : `${tier}=${(stats.latency / stats.count).toFixed(1)}ms`
    })
    .join(', ')
  process.stdout.write(`Verdict — tiers: mean latency by tier: ${tierLatencyVerdict}.\n`)
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  try {
    run(process.argv.slice(2))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`selection-replay: ${message}\n`)
    process.exitCode = 1
  }
}
