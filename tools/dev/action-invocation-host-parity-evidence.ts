import { writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

import {
  buildDevelopmentHostParityEvidence,
  developmentHostParitySourceBaseCommit,
} from '@/modules/capability-supply/development-host-parity-evidence'

const output = process.argv[2]
if (output === undefined) throw new Error('usage: action-invocation-host-parity-evidence <output.json>')
const evidenceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const evidenceTreeDigest = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim()
execFileSync('git', [
  'merge-base', '--is-ancestor', developmentHostParitySourceBaseCommit, evidenceCommit,
])
const packet = await buildDevelopmentHostParityEvidence({
  sourceBaseCommit: developmentHostParitySourceBaseCommit,
  evidenceCommit,
  evidenceTreeDigest,
})
await writeFile(output, `${JSON.stringify(packet, null, 2)}\n`, 'utf8')
process.stdout.write(`${packet.verdict} ${packet.packetDigest}\n`)
