import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { parseArgs } from '../ae/lib/args'

import { runDevelopmentProviderOperationEvidence } from './fixtures/provider-operation/development-provider-operation-evidence'
import { readAndVerifyProviderOperationPacket, writeEvidencePacket } from './action-invocation-evidence-packet'
import {
  captureOfficialEvidenceProvenance,
  verifyOfficialEvidenceProvenance,
} from './evidence-provenance'

const { command, positionals } = parseArgs(process.argv.slice(2))
const [rawPath, expectedRevision] = positionals
if (
  (command !== 'run' && command !== 'verify')
  || rawPath === undefined
  || expectedRevision === undefined
) {
  throw new Error('usage: npm run evidence:operation:development -- <run|verify> <output-path> <revision>')
}
const path = resolve(rawPath)
const commandIdentity = `development-provider-operation-evidence run ${path} ${expectedRevision}`
const officialClaimCeiling =
  'Labelled local development evidence only. No customer reachability, hosted behavior, real provider fulfilment, production safety, cold-agent usability, or customer value.'
if (command === 'run') {
  const provenance = captureOfficialEvidenceProvenance({
    expectedRevision,
    command: commandIdentity,
    claimCeiling: officialClaimCeiling,
  })
  const scenario = await runDevelopmentProviderOperationEvidence()
  const envelope = await writeEvidencePacket(
    path,
    { gitRevision: provenance.sourceRevision, ...scenario },
    provenance,
  )
  console.log(JSON.stringify({
    environment: scenario.environment, path, gitRevision: provenance.sourceRevision, checksum: envelope.checksum,
    gate7: scenario.gate7, claimCeiling: scenario.claimCeiling,
  }, null, 2))
} else {
  const verified = await readAndVerifyProviderOperationPacket(path, expectedRevision)
  const envelope = JSON.parse(await readFile(path, 'utf8')) as {
    provenance?: Parameters<typeof verifyOfficialEvidenceProvenance>[0]
  }
  if (envelope.provenance === undefined) throw new Error('packet_provenance_required')
  verifyOfficialEvidenceProvenance(envelope.provenance, {
    expectedRevision,
    command: commandIdentity,
  })
  if (envelope.provenance.claimCeiling !== officialClaimCeiling) {
    throw new Error('packet_claim_ceiling_refused')
  }
  console.log(JSON.stringify({
    environment: 'MOCK/DEVELOPMENT ONLY', command: 'verify', path,
    ...verified,
  }, null, 2))
}
