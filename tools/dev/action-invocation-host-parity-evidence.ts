import { writeFile } from 'node:fs/promises'

import { buildDevelopmentHostParityEvidence } from '@/modules/capability-supply/development-host-parity-evidence'

const output = process.argv[2]
if (output === undefined) throw new Error('usage: action-invocation-host-parity-evidence <output.json>')
const packet = await buildDevelopmentHostParityEvidence()
await writeFile(output, `${JSON.stringify(packet, null, 2)}\n`, 'utf8')
process.stdout.write(`${packet.verdict} ${packet.packetDigest}\n`)
