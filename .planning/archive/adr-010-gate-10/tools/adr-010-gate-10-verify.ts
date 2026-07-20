import { readFileSync } from 'node:fs'

import type { Gate10DevelopmentEvidence } from '@/modules/capability-supply/gate-10-development-evidence'
import { verifyGate10DevelopmentEvidence } from '@/modules/capability-supply/gate-10-development-verifier'

const inputPath = process.argv[2]
if (inputPath === undefined) throw new Error('usage: adr-010-gate-10-verify <input.json>')
const packet = JSON.parse(readFileSync(inputPath, 'utf8')) as Gate10DevelopmentEvidence
await verifyGate10DevelopmentEvidence(packet)
console.log(JSON.stringify({
  verified: true,
  inputPath,
  evidenceCommit: packet.provenance.evidenceCommit,
  evidenceTree: packet.provenance.evidenceTree,
  disposition: packet.disposition,
  packetDigest: packet.packetDigest,
  claimCeiling: packet.claimCeiling,
}, null, 2))
