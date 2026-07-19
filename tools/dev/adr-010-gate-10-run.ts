import { writeFileSync } from 'node:fs'

import { buildGate10DevelopmentEvidence } from '@/modules/capability-supply/gate-10-development-evidence'

const outputPath = process.argv[2]
if (outputPath === undefined) throw new Error('usage: adr-010-gate-10-run <output.json>')
const packet = await buildGate10DevelopmentEvidence()
writeFileSync(outputPath, `${JSON.stringify(packet, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
console.log(JSON.stringify({
  outputPath,
  provenance: packet.provenance,
  disposition: packet.disposition,
  cases: packet.measurement.cases,
  aggregateHumanEffort: packet.measurement.aggregateHumanEffort,
  hostPacketDigest: packet.hostPacketDigest,
  packetDigest: packet.packetDigest,
  claimCeiling: packet.claimCeiling,
}, null, 2))
