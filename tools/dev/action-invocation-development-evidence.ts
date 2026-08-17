import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { parseArgs } from '../ae/lib/args'

import { runDevelopmentEvidenceScenario } from './fixtures/capability-supply/development-evidence-scenario'
import {
  readAndVerifyEvidencePacket,
  writeEvidencePacket,
} from './action-invocation-evidence-packet'

function revision() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

async function main() {
  const { command, positionals } = parseArgs(process.argv.slice(2))
  const [rawPath] = positionals
  if ((command !== 'run' && command !== 'verify') || rawPath === undefined) {
    throw new Error('usage: npm run evidence:action-invocation:development -- <run|verify> <output-path>')
  }
  const path = resolve(rawPath)
  const gitRevision = revision()
  if (command === 'run') {
    const scenario = await runDevelopmentEvidenceScenario()
    const envelope = await writeEvidencePacket(path, { gitRevision, ...scenario })
    console.log(JSON.stringify({
      environment: 'MOCK/DEVELOPMENT ONLY',
      command: 'run',
      path,
      gitRevision,
      checksum: envelope.checksum,
      origins: scenario.origins,
      recovery: scenario.recovery,
      transferVerdict: scenario.transfer.recommendation,
      claimCeiling: scenario.claimCeiling,
    }, null, 2))
    return
  }
  const verified = await readAndVerifyEvidencePacket(path, gitRevision)
  console.log(JSON.stringify({
    environment: 'MOCK/DEVELOPMENT ONLY',
    command: 'verify',
    path,
    ...verified,
  }, null, 2))
}

await main()
