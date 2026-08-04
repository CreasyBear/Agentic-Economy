import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  buildOperationMarketProofReport,
  operationMarketProofAttemptSchema,
  operationMarketProofManifestSchema,
  type OperationMarketProofReport,
} from '../../src/modules/external-run/public'

export function verifyOperationMarketProof(
  manifestInput: unknown,
  attemptInputs: readonly unknown[],
  generatedAt = Date.now(),
): OperationMarketProofReport {
  const manifest = operationMarketProofManifestSchema.parse(manifestInput)
  const attempts = attemptInputs.map((attempt) => operationMarketProofAttemptSchema.parse(attempt))
  return buildOperationMarketProofReport(manifest, attempts, generatedAt)
}

export async function verifyOperationMarketProofFiles(input: Readonly<{
  manifestPath: string
  humanAttemptPath: string
  agentAttemptPath: string
  outputPath: string
  generatedAt?: number
}>): Promise<OperationMarketProofReport> {
  const [manifestRaw, humanRaw, agentRaw] = await Promise.all([
    readFile(resolve(input.manifestPath), 'utf8'),
    readFile(resolve(input.humanAttemptPath), 'utf8'),
    readFile(resolve(input.agentAttemptPath), 'utf8'),
  ])
  const report = verifyOperationMarketProof(
    JSON.parse(manifestRaw),
    [JSON.parse(humanRaw), JSON.parse(agentRaw)],
    input.generatedAt,
  )
  const outputPath = resolve(input.outputPath)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  if (report.gate.decision !== 'PASS') {
    throw new Error(`operation_market_proof_failed:${report.gate.failures.join(',')}`)
  }
  return report
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const [manifestPath, humanAttemptPath, agentAttemptPath, outputFlag, outputPath, ...extra] = argv
  if (manifestPath === undefined || humanAttemptPath === undefined || agentAttemptPath === undefined
    || outputFlag !== '--output' || outputPath === undefined || extra.length > 0) {
    throw new Error('usage: verify-operation-market-proof <manifest.json> <human-attempt.json> <agent-attempt.json> --output <report.json>')
  }
  const report = await verifyOperationMarketProofFiles({
    manifestPath,
    humanAttemptPath,
    agentAttemptPath,
    outputPath,
  })
  process.stdout.write(`${JSON.stringify({
    kind: 'verified',
    reportDigest: report.digest,
    decision: report.gate.decision,
    outputPath: resolve(outputPath),
  })}\n`)
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) await main()
