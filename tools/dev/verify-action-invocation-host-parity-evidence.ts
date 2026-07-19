import { readFile } from 'node:fs/promises'

import {
  verifyDevelopmentHostParityEvidence,
  type DevelopmentHostParityEvidence,
} from '@/modules/capability-supply/development-host-parity-evidence'

const input = process.argv[2]
if (input === undefined) throw new Error('usage: verify-action-invocation-host-parity-evidence <input.json>')
const packet = JSON.parse(await readFile(input, 'utf8')) as DevelopmentHostParityEvidence
verifyDevelopmentHostParityEvidence(packet)
process.stdout.write(`PASS_FOR_DECLARED_CLASS ${packet.packetDigest}\n`)
