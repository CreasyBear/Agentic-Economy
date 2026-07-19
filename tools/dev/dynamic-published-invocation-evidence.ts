import { writeFile } from 'node:fs/promises'

import { buildDevelopmentDynamicInvocationEvidence } from '@/modules/capability-supply/development-dynamic-invocation-evidence'

const output = process.argv[2]
if (output === undefined) throw new Error('usage: dynamic-published-invocation-evidence <output.json>')
const packet = await buildDevelopmentDynamicInvocationEvidence()
await writeFile(output, `${JSON.stringify(packet, null, 2)}\n`, 'utf8')
process.stdout.write(`${packet.verdict} ${packet.packetDigest}\n`)
