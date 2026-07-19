import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

import {
  type DevelopmentHostParityEvidence,
} from '@/modules/capability-supply/development-host-parity-evidence'
import {
  verifyDevelopmentHostParityEvidence,
} from '@/modules/capability-supply/development-host-parity-verifier'

const input = process.argv[2]
if (input === undefined) throw new Error('usage: verify-action-invocation-host-parity-evidence <input.json>')
const packet = JSON.parse(await readFile(input, 'utf8')) as DevelopmentHostParityEvidence
verifyDevelopmentHostParityEvidence(packet, {
  evidenceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  evidenceTreeDigest: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
})
process.stdout.write(`PASS_FOR_DECLARED_CLASS ${packet.packetDigest}\n`)
