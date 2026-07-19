import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

import { runDevelopmentProviderOperationEvidence } from '../../src/modules/provider-operation-fixture/development-provider-operation-evidence'
import { readAndVerifyProviderOperationPacket, writeEvidencePacket } from './action-invocation-evidence-packet'

const revision = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const [command, rawPath] = process.argv.slice(2)
if ((command !== 'run' && command !== 'verify') || rawPath === undefined) {
  throw new Error('usage: npm run evidence:operation:development -- <run|verify> <output-path>')
}
const path = resolve(rawPath)
const gitRevision = revision()
if (command === 'run') {
  const scenario = await runDevelopmentProviderOperationEvidence()
  const envelope = await writeEvidencePacket(path, { gitRevision, ...scenario })
  console.log(JSON.stringify({
    environment: scenario.environment, path, gitRevision, checksum: envelope.checksum,
    gate7: scenario.gate7, claimCeiling: scenario.claimCeiling,
  }, null, 2))
} else {
  console.log(JSON.stringify({
    environment: 'MOCK/DEVELOPMENT ONLY', command: 'verify', path,
    ...(await readAndVerifyProviderOperationPacket(path, gitRevision)),
  }, null, 2))
}
