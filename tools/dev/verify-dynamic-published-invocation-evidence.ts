import { readFile } from 'node:fs/promises'

import {
  verifyDevelopmentDynamicInvocationEvidence,
  type DevelopmentDynamicInvocationEvidence,
} from '@/modules/capability-supply/development-dynamic-invocation-evidence'

const input = process.argv[2]
if (input === undefined) throw new Error('usage: verify-dynamic-published-invocation-evidence <input.json>')
const packet = JSON.parse(await readFile(input, 'utf8')) as DevelopmentDynamicInvocationEvidence
verifyDevelopmentDynamicInvocationEvidence(packet)
process.stdout.write(`PASS_FOR_DECLARED_CLASS ${packet.packetDigest}\n`)
