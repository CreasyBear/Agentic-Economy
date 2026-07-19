import { writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

import { buildDevelopmentHostParityEvidence } from '@/modules/capability-supply/development-host-parity-evidence'

const output = process.argv[2]
if (output === undefined) throw new Error('usage: action-invocation-host-parity-evidence <output.json>')
const evidenceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const evidenceTreeDigest = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim()
const packet = await buildDevelopmentHostParityEvidence({
  sourceBaseCommit: 'feda5070296c9a0cbc72e3aeb285f0961ee94ec2',
  evidenceCommit,
  evidenceTreeDigest,
})
await writeFile(output, `${JSON.stringify(packet, null, 2)}\n`, 'utf8')
process.stdout.write(`${packet.verdict} ${packet.packetDigest}\n`)
