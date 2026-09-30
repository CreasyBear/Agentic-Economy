import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type {
  SelectionDecisionKind,
  SelectionDecisionRecord,
} from '../../src/modules/capability-execution/selection-decision-recorder'

type DisagreementOptions = Readonly<{
  limit: number
  agreementRatio: number
}>

type ReviewRow = Readonly<Pick<
  SelectionDecisionRecord,
  'correlationId' | 'kind' | 'offered' | 'pickedToolRef' | 'tier' | 'modelConfidence' | 'fit' | 'latencyMs'
>>

const KINDS: readonly SelectionDecisionKind[] = ['procure', 'registry_rerank', 'directory_rerank']
const TIERS: readonly SelectionDecisionRecord['tier'][] = [
  'jev_system_one',
  'secondary_llm_adapter',
  'deterministic_rule_engine',
  'safe_refusal',
]

function parseOptions(argv: readonly string[]): DisagreementOptions {
  let limit = 200
  let agreementRatio = 0.1
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

    if (name === '--limit') {
      const value = Number(readValue())
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('--limit must be a positive integer')
      limit = value
    } else if (name === '--agreement-ratio') {
      const value = Number(readValue())
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error('--agreement-ratio must be between 0 and 1')
      }
      agreementRatio = value
    } else {
      throw new Error(`unknown option ${name}. Usage: npx tsx tools/eval/selection-disagreements.ts [--limit 200] [--agreement-ratio 0.1]`)
    }
  }
  return { limit, agreementRatio }
}

function readDecisions(limit: number): SelectionDecisionRecord[] {
  let output: string
  try {
    output = execFileSync(
      'npx',
      [
        'convex',
        'run',
        'capabilitySelectionDecisions:recent',
        '--json',
        JSON.stringify({ limit }),
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


function getRankZero(row: SelectionDecisionRecord): SelectionDecisionRecord['offered'][number] {
  const rankZero = row.offered.find((offer) => offer.rank === 0)
  if (rankZero === undefined) throw new Error(`decision ${row.correlationId} has no deterministic rank-0 offer`)
  if (new Set(row.offered.map((offer) => offer.rank)).size !== row.offered.length) {
    throw new Error(`decision ${row.correlationId} contains duplicate offer ranks`)
  }
  if (row.offered.some((offer) => offer.score > rankZero.score)) {
    throw new Error(`decision ${row.correlationId} rank 0 is not the highest-scoring offer`)
  }
  if (row.pickedToolRef !== null && !row.offered.some((offer) => offer.toolRef === row.pickedToolRef)) {
    throw new Error(`decision ${row.correlationId} picked a tool that was not offered`)
  }
  return rankZero
}

function sampleAgreements(
  agreements: readonly SelectionDecisionRecord[],
  sampleCount: number,
): readonly SelectionDecisionRecord[] {
  if (sampleCount === 0) return []
  const sample: SelectionDecisionRecord[] = []
  for (let index = 0; index < sampleCount; index += 1) {
    const agreementIndex = Math.floor((index + 0.5) * agreements.length / sampleCount)
    const agreement = agreements[agreementIndex]
    if (agreement === undefined) throw new Error('agreement sampler selected a missing row')
    sample.push(agreement)
  }
  return sample
}

function run(argv: readonly string[]): void {
  const options = parseOptions(argv)
  const rows = readDecisions(options.limit)
  if (rows.length === 0) throw new Error('no selection decision rows returned; the harness has no data yet')

  const agreements: SelectionDecisionRecord[] = []
  const disagreements: SelectionDecisionRecord[] = []
  for (const row of rows) {
    const rankZero = getRankZero(row)
    if (row.pickedToolRef === rankZero.toolRef) agreements.push(row)
    else disagreements.push(row)
  }

  const agreementSampleCount = Math.min(agreements.length, Math.ceil(rows.length * options.agreementRatio))
  const sampledAgreements = sampleAgreements(agreements, agreementSampleCount)
  const outputRows: ReviewRow[] = [
    ...disagreements,
    ...sampledAgreements,
  ].map((row) => ({
    correlationId: row.correlationId,
    kind: row.kind,
    offered: row.offered,
    pickedToolRef: row.pickedToolRef ?? null,
    tier: row.tier,
    modelConfidence: row.modelConfidence ?? null,
    fit: row.fit,
    latencyMs: row.latencyMs,
  }))

  const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), 'out', 'disagreements.jsonl')
  mkdirSync(dirname(outputPath), { recursive: true })
  const comment = `# Agreement sample included; disagreement-only review overstates the error rate. Sampled ${sampledAgreements.length}/${rows.length} agreements (target ${(options.agreementRatio * 100).toFixed(1)}%, rounded up, capped by available agreements).`
  const lines = [comment, ...outputRows.map((row) => JSON.stringify(row))]
  writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8')
  process.stdout.write(`Wrote ${disagreements.length} disagreements and ${sampledAgreements.length} sampled agreements to ${outputPath}\n`)
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  try {
    run(process.argv.slice(2))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`selection-disagreements: ${message}\n`)
    process.exitCode = 1
  }
}
